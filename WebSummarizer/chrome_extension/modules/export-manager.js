(function () {
    class ExportManager {
        exportJSON(data) {
            const payload = {
                exportedAt: new Date().toISOString(),
                url: data.url || window.location.href,
                metadata: data.metadata || {},
                content: data.content || '',
                summary: data.summary || '',
                category: data.category || 'default'
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            this._download(blob, `web-summary-${Date.now()}.json`);
        }

        exportMarkdown(data) {
            const title = data.metadata?.title || document.title || '网页总结';
            const url = data.url || window.location.href;
            const lines = [
                `# ${title}`,
                ``,
                `> 来源：${url}`,
                `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
                ``,
            ];

            if (data.metadata) {
                const m = data.metadata;
                if (m.author) lines.push(`**作者：** ${m.author}  `);
                if (m.publishedTime) lines.push(`**发布时间：** ${m.publishedTime}  `);
                if (m.siteName) lines.push(`**来源站点：** ${m.siteName}  `);
                if (m.tags?.length) lines.push(`**标签：** ${m.tags.join('、')}  `);
                lines.push('');
            }

            if (data.summary) {
                lines.push('## AI 总结', '', data.summary, '');
            }

            if (data.content) {
                lines.push('---', '', '## 原文内容', '', data.content, '');
            }

            const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
            this._download(blob, `web-summary-${Date.now()}.md`);
        }

        _download(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    window.ExportManager = ExportManager;
})();
