// ==================== Tab 切换 ====================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
    });
});

// ==================== AI 配置 ====================
function updateAIProviderUI(provider) {
    document.getElementById('section-openai').style.display = provider === 'openai' ? '' : 'none';
    document.getElementById('section-dify').style.display = provider === 'dify' ? '' : 'none';
    document.getElementById('section-gemini').style.display = provider === 'chrome-gemini' ? '' : 'none';
}

document.getElementById('aiProvider').addEventListener('change', function () {
    updateAIProviderUI(this.value);
});

function showSuccess(id) {
    const el = document.getElementById(id);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

// 加载已保存的 AI 配置
chrome.storage.local.get([
    'aiProvider', 'difyApiUrl', 'difyApiKey',
    'openaiBaseUrl', 'openaiModel', 'openaiApiKey'
], (result) => {
    const provider = result.aiProvider || 'openai';
    document.getElementById('aiProvider').value = provider;
    updateAIProviderUI(provider);

    document.getElementById('difyApiUrl').value = result.difyApiUrl || 'https://api.dify.ai/v1/workflows/run';
    document.getElementById('difyApiKey').value = result.difyApiKey || '';
    document.getElementById('openaiBaseUrl').value = result.openaiBaseUrl || 'https://api.openai.com/v1';
    document.getElementById('openaiModel').value = result.openaiModel || 'gpt-3.5-turbo';
    document.getElementById('openaiApiKey').value = result.openaiApiKey || '';
});

document.getElementById('saveAiConfig').addEventListener('click', () => {
    const data = {
        aiProvider: document.getElementById('aiProvider').value,
        difyApiUrl: document.getElementById('difyApiUrl').value.trim(),
        difyApiKey: document.getElementById('difyApiKey').value.trim(),
        openaiBaseUrl: document.getElementById('openaiBaseUrl').value.trim(),
        openaiModel: document.getElementById('openaiModel').value.trim(),
        openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    };
    chrome.storage.local.set(data, () => showSuccess('aiSaveSuccess'));
});

// ==================== 功能开关 ====================
chrome.storage.local.get(['enableMetadata', 'enableExport', 'enableFactCheck'], (result) => {
    document.getElementById('enableMetadata').checked = result.enableMetadata !== false;
    document.getElementById('enableExport').checked = result.enableExport !== false;
    document.getElementById('enableFactCheck').checked = !!result.enableFactCheck;
});

document.getElementById('saveFeatures').addEventListener('click', () => {
    const data = {
        enableMetadata: document.getElementById('enableMetadata').checked,
        enableExport: document.getElementById('enableExport').checked,
        enableFactCheck: document.getElementById('enableFactCheck').checked,
    };
    chrome.storage.local.set(data, () => showSuccess('featuresSaveSuccess'));
});

// ==================== Prompt 类别管理 ====================
const PRESET_IDS = ['default', 'news', 'tech-blog', 'product', 'academic', 'forum'];

const PRESET_NAMES = {
    default: '通用（默认）',
    news: '新闻资讯',
    'tech-blog': '技术博客',
    product: '电商商品',
    academic: '学术论文',
    forum: '论坛讨论'
};

let customCategories = [];
let editingIndex = -1;

function renderCategorySelect(customs) {
    const select = document.getElementById('activeCategoryId');
    select.innerHTML = '';

    PRESET_IDS.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = PRESET_NAMES[id];
        select.appendChild(opt);
    });

    customs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

function renderPresetList() {
    const list = document.getElementById('presetList');
    list.innerHTML = '';
    PRESET_IDS.forEach(id => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `<span class="name">${PRESET_NAMES[id]}</span>`;
        list.appendChild(item);
    });
}

function renderCustomList() {
    const list = document.getElementById('customList');
    list.innerHTML = '';
    if (customCategories.length === 0) {
        list.innerHTML = '<p style="color:#9ca3af;font-size:13px;">暂无自定义类别</p>';
        return;
    }
    customCategories.forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <span class="name">${c.name}</span>
            <div class="actions-btns">
                <button class="btn btn-edit" data-index="${i}">编辑</button>
                <button class="btn btn-danger" data-index="${i}">删除</button>
            </div>
        `;
        list.appendChild(item);
    });

    list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditor(parseInt(btn.dataset.index)));
    });

    list.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', () => deleteCustom(parseInt(btn.dataset.index)));
    });
}

function openEditor(index = -1) {
    editingIndex = index;
    const editor = document.getElementById('customEditor');
    const title = document.getElementById('editorTitle');

    if (index === -1) {
        title.textContent = '新增自定义类别';
        document.getElementById('customName').value = '';
        document.getElementById('customPrompt').value = '';
    } else {
        title.textContent = '编辑自定义类别';
        document.getElementById('customName').value = customCategories[index].name;
        document.getElementById('customPrompt').value = customCategories[index].prompt;
    }

    editor.style.display = '';
    editor.scrollIntoView({ behavior: 'smooth' });
}

function deleteCustom(index) {
    customCategories.splice(index, 1);
    saveCustomAndRefresh();
}

function saveCustomAndRefresh() {
    chrome.storage.local.set({ customCategories }, () => {
        renderCustomList();
        renderCategorySelect(customCategories);
        // 恢复已选中的 activeCategoryId
        chrome.storage.local.get('activeCategoryId', r => {
            document.getElementById('activeCategoryId').value = r.activeCategoryId || 'default';
        });
    });
}

document.getElementById('addCustomCategory').addEventListener('click', () => openEditor(-1));

document.getElementById('saveCustomCategory').addEventListener('click', () => {
    const name = document.getElementById('customName').value.trim();
    const prompt = document.getElementById('customPrompt').value.trim();

    if (!name || !prompt) {
        alert('类别名称和 Prompt 不能为空');
        return;
    }

    if (editingIndex === -1) {
        customCategories.push({ id: `custom-${Date.now()}`, name, prompt });
    } else {
        customCategories[editingIndex].name = name;
        customCategories[editingIndex].prompt = prompt;
    }

    document.getElementById('customEditor').style.display = 'none';
    saveCustomAndRefresh();
});

document.getElementById('cancelCustomCategory').addEventListener('click', () => {
    document.getElementById('customEditor').style.display = 'none';
});

document.getElementById('saveActiveCategory').addEventListener('click', () => {
    const id = document.getElementById('activeCategoryId').value;
    chrome.storage.local.set({ activeCategoryId: id }, () => showSuccess('categorySaveSuccess'));
});

// 初始化加载
chrome.storage.local.get(['activeCategoryId', 'customCategories'], (result) => {
    customCategories = result.customCategories || [];
    renderPresetList();
    renderCategorySelect(customCategories);
    renderCustomList();
    document.getElementById('activeCategoryId').value = result.activeCategoryId || 'default';
});
