// 在飞书文档页面的浏览器控制台中执行此命令
// 帮助诊断文档 HTML 结构

(function() {
    const selectors = [
        '.doc-content', '[data-testid="doc-content"]', '.suite-editor-content',
        '.lark-doc-content', '.editor-content', 'article', '[role="article"]',
        '.document-content', 'main'
    ];

    console.log('=== 飞书文档结构诊断 ===');

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
            console.log(`✓ 找到内容选择器: ${sel}`);
            console.log(`  子元素数量: ${el.children.length}`);
            console.log(`  前3个子元素标签:`, [...el.children].slice(0, 3).map(c => `${c.tagName}.${c.className.slice(0, 30)}`));
            console.log(`  HTML 预览 (前500字符):\n`, el.innerHTML.slice(0, 500));
            break;
        }
    }

    // 如果都找不到
    const bodyChildren = [...document.body.children].map(c => `${c.tagName}#${c.id}.${c.className.slice(0, 20)}`);
    console.log('body 直接子元素:', bodyChildren);
})();
