(function () {
    const PRESET_CATEGORIES = [
        {
            id: 'default',
            name: '通用（默认）',
            prompt: `你是一个专业的内容总结助手。请对以下网页内容进行智能总结，提取关键信息，用简洁清晰的语言输出。
无论原文使用何种语言，都使用中文总结，输出 Markdown 格式。

输出格式：
## 核心摘要
（2-3句话概括）

## 主要内容
（3-5个要点）

## 关键信息
（重要数据、结论或观点）

## 建议与预测
（基于文章观点给出相关建议或预测）`
        },
        {
            id: 'news',
            name: '新闻资讯',
            prompt: `你是一个专业的新闻分析助手。请按新闻报道的要素对以下内容进行总结，使用中文输出 Markdown 格式。

输出格式：
## 新闻摘要
## 时间地点人物
## 事件经过
## 影响与意义`
        },
        {
            id: 'tech-blog',
            name: '技术博客',
            prompt: `你是一个技术专家助手。请从技术视角对以下内容进行总结，使用中文输出 Markdown 格式。

输出格式：
## 核心技术点
## 实现思路与方案
## 适用场景
## 注意事项与局限性`
        },
        {
            id: 'product',
            name: '电商商品',
            prompt: `你是一个购物分析助手。请对以下商品信息进行总结分析，使用中文输出 Markdown 格式。

输出格式：
## 商品概述
## 核心参数
## 优点
## 缺点与不足
## 适合人群`
        },
        {
            id: 'academic',
            name: '学术论文',
            prompt: `你是一个学术研究助手。请对以下学术内容进行总结，使用中文输出 Markdown 格式。

输出格式：
## 研究问题
## 研究方法
## 主要发现与结论
## 局限性与未来方向`
        },
        {
            id: 'forum',
            name: '论坛讨论',
            prompt: `你是一个社区讨论分析助手。请对以下讨论内容进行总结，使用中文输出 Markdown 格式。

输出格式：
## 讨论主题
## 主要观点（正方）
## 主要观点（反方）
## 共识与分歧`
        }
    ];

    const FACT_CHECK_PROMPT = `

---
## 观点核验（请额外完成以下分析）
基于你的知识，对上文中的数据、观点进行交叉核验：
1. **可疑数据**：列出文中可能不准确或夸大的数据（若无则注明"未发现"）
2. **立场偏差**：识别文章明显的立场倾向或单方面表述（若无则注明"未发现"）
3. **中立补充**：提供更客观平衡的视角补充`;

    class PromptManager {
        constructor() {
            this._presets = PRESET_CATEGORIES;
        }

        async getActiveCategory() {
            return new Promise(resolve => {
                chrome.storage.local.get(['activeCategoryId', 'customCategories'], (result) => {
                    const id = result.activeCategoryId || 'default';
                    const customs = result.customCategories || [];
                    const all = [...this._presets, ...customs];
                    resolve(all.find(c => c.id === id) || this._presets[0]);
                });
            });
        }

        async buildPrompt(url, content, metadataStr, options = {}) {
            const category = await this.getActiveCategory();
            const metaPart = metadataStr ? `\n\n【页面信息】\n${metadataStr}` : '';

            let prompt = `${category.prompt}\n\n【页面地址】\n${url}${metaPart}\n\n【页面内容】\n${content}`;

            if (options.factCheck) {
                prompt += FACT_CHECK_PROMPT;
            }

            return prompt;
        }

        getPresets() {
            return this._presets;
        }

        async getAllCategories() {
            return new Promise(resolve => {
                chrome.storage.local.get('customCategories', r => {
                    resolve([...this._presets, ...(r.customCategories || [])]);
                });
            });
        }

        async getCustomCategories() {
            return new Promise(resolve => {
                chrome.storage.local.get('customCategories', r => resolve(r.customCategories || []));
            });
        }

        async saveCustomCategories(categories) {
            return new Promise(resolve => {
                chrome.storage.local.set({ customCategories: categories }, resolve);
            });
        }
    }

    window.PromptManager = PromptManager;
    window.PRESET_CATEGORIES = PRESET_CATEGORIES;
})();
