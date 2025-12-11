const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 检查路径
const srcPath = path.join(__dirname, 'extension', 'content.src.js');
const distPath = path.join(__dirname, 'extension', 'content.js');

if (!fs.existsSync(srcPath)) {
    console.error(`错误：找不到源码文件 ${srcPath}`);
    console.error('请确保你已经将原来的 content.js 重命名为 content.src.js');
    process.exit(1);
}

console.log('正在读取源码:', srcPath);
const code = fs.readFileSync(srcPath, 'utf8');

console.log('正在进行混淆保护...');
try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        splitStrings: true,
        stringArrayThreshold: 0.75,
        // debugProtection: true, // 建议发布前开启测试，可能会导致部分环境报错
        selfDefending: true,
        // 排除某些不需要混淆的字符串（如果需要）
        // stringArrayExcludedNodes: [] 
    });

    console.log('写入混淆代码:', distPath);
    fs.writeFileSync(distPath, obfuscationResult.getObfuscatedCode());

    console.log('✅ 构建完成！');
    console.log('请在 Chrome 扩展管理页点击"刷新"按钮加载新代码。');
} catch (e) {
    console.error('❌ 混淆过程出错:', e);
}

