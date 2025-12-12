const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver'); // 引入 archiver

// 检查路径
const srcPath = path.join(__dirname, 'extension', 'content.src.js');
const distPath = path.join(__dirname, 'extension', 'content.js');
const zipPath = path.join(__dirname, 'eneteduPro.zip'); // 目标 zip 文件路径

if (!fs.existsSync(srcPath)) {
    console.error(`错误：找不到源码文件 ${srcPath}`);
    console.error('请确保你已经将原来的 content.js 重命名为 content.src.js');
    process.exit(1);
}

// 1. 代码混淆
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
        selfDefending: true,
    });

    console.log('写入混淆代码:', distPath);
    fs.writeFileSync(distPath, obfuscationResult.getObfuscatedCode());
    console.log('✅ 代码混淆完成！');

    // 2. 打包 ZIP
    console.log('正在打包插件:', zipPath);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩率
    });

    output.on('close', function() {
        console.log(`📦 打包完成！文件大小: ${(archive.pointer() / 1024).toFixed(2)} KB`);
        console.log(`文件路径: ${zipPath}`);
    });

    archive.on('error', function(err) {
        throw err;
    });

    archive.pipe(output);

    // 将 extension 目录下的内容添加到 zip 中
    // glob: false 表示不使用 glob 模式匹配，直接添加目录内容
    // 但我们需要排除 content.src.js (源码)
    
    // 手动添加文件，确保不包含源码
    const extensionDir = path.join(__dirname, 'extension');
    const files = fs.readdirSync(extensionDir);
    
    files.forEach(file => {
        // 排除 content.src.js
        if (file === 'content.src.js') return;
        
        const filePath = path.join(extensionDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
            archive.directory(filePath, file);
        } else {
            archive.file(filePath, { name: file });
        }
    });

    archive.finalize();

} catch (e) {
    console.error('❌ 构建过程出错:', e);
}
