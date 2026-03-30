const PROVIDER_NAMES = {
    'openai': 'OpenAI 兼容 API',
    'dify': 'Dify 工作流',
    'chrome-gemini': 'Chrome Gemini'
};

const CATEGORY_NAMES = {
    'default': '通用（默认）',
    'news': '新闻资讯',
    'tech-blog': '技术博客',
    'product': '电商商品',
    'academic': '学术论文',
    'forum': '论坛讨论'
};

// 加载状态信息
chrome.storage.local.get([
    'aiProvider', 'activeCategoryId', 'customCategories',
    'enableMetadata', 'enableExport', 'enableFactCheck'
], (result) => {
    // AI 提供商
    const provider = result.aiProvider || 'openai';
    document.getElementById('providerName').textContent = PROVIDER_NAMES[provider] || provider;

    // 激活类别
    const categoryId = result.activeCategoryId || 'default';
    const customs = result.customCategories || [];
    const customMatch = customs.find(c => c.id === categoryId);
    const categoryName = customMatch ? customMatch.name : (CATEGORY_NAMES[categoryId] || categoryId);
    document.getElementById('categoryName').textContent = categoryName;

    // 功能徽章
    const badges = document.getElementById('featureBadges');
    const features = [
        { key: 'enableMetadata', label: '📊 元数据', default: true },
        { key: 'enableExport', label: '⬇️ 导出', default: true },
        { key: 'enableFactCheck', label: '🔍 纠偏', default: false },
    ];

    features.forEach(f => {
        const enabled = f.key in result ? result[f.key] : f.default;
        const badge = document.createElement('span');
        badge.className = `badge${enabled ? ' active' : ''}`;
        badge.textContent = `${f.label} ${enabled ? '开' : '关'}`;
        badges.appendChild(badge);
    });
});

// 触发总结
document.getElementById('btnSummarize').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SUMMARIZE' }, (response) => {
        // 忽略响应错误（content script 可能还未就绪）
    });
    window.close();
});

// 打开设置页
document.getElementById('btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
});
