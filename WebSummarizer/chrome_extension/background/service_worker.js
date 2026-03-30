// Service Worker - 统一处理 AI API 调用
// Chrome Extension Manifest V3

async function getConfig() {
    return new Promise(resolve => {
        chrome.storage.local.get([
            'aiProvider',
            'difyApiUrl',
            'difyApiKey',
            'openaiBaseUrl',
            'openaiModel',
            'openaiApiKey'
        ], resolve);
    });
}

async function callDify(prompt, config) {
    if (!config.difyApiKey) {
        throw new Error('请先配置 Dify API Key！请在插件设置页中配置。');
    }
    if (!config.difyApiUrl) {
        throw new Error('请先配置 Dify API 地址！请在插件设置页中配置。');
    }

    const response = await fetch(config.difyApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.difyApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputs: {
                newsUrl: '',
                newsContent: prompt
            },
            response_mode: 'blocking',
            user: 'chrome-extension'
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Dify API 请求失败: ${response.status} ${response.statusText}\n${text}`);
    }

    const data = await response.json();
    return data.data?.outputs?.text
        || data.data?.outputs?.result
        || data.answer
        || JSON.stringify(data, null, 2);
}

async function callOpenAI(prompt, config) {
    if (!config.openaiApiKey) {
        throw new Error('请先配置 OpenAI API Key！请在插件设置页中配置。');
    }

    const baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiUrl = `${baseUrl}/chat/completions`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.openaiModel || 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API 请求失败: ${response.status} ${response.statusText}\n${text}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

async function handleSummarize(payload) {
    const config = await getConfig();
    const provider = config.aiProvider || 'openai';
    const { prompt } = payload;

    if (provider === 'chrome-gemini') {
        // Chrome Gemini (window.ai) 只能在 content script 中调用
        // 返回特殊标记，由 content.js 自行处理
        return { useLocalGemini: true, prompt };
    } else if (provider === 'dify') {
        const result = await callDify(prompt, config);
        return { result };
    } else {
        const result = await callOpenAI(prompt, config);
        return { result };
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SUMMARIZE') {
        handleSummarize(message.payload)
            .then(sendResponse)
            .catch(err => sendResponse({ error: err.message }));
        // 返回 true 保持消息通道开放（异步响应必须）
        return true;
    }
});
