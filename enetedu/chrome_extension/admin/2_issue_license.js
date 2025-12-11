const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 读取私钥
const privateKeyPath = path.join(__dirname, 'private_key.pem');
if (!fs.existsSync(privateKeyPath)) {
    console.error('错误：找不到私钥文件 private_key.pem，请先运行 1_generate_keys.js');
    process.exit(1);
}
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

// === 配置区域 ===
// 设置授权给谁（可选备注）
const userNote = 'test_user';
// 设置过期时间 (YYYY-MM-DD)
const deadline = '2025-12-31';
// ================

const licenseData = JSON.stringify({
    deadline: deadline,
    user: userNote
});

// 使用 SHA256 签名
const sign = crypto.sign("sha256", Buffer.from(licenseData), privateKey);
const signature = sign.toString('base64');
const dataB64 = Buffer.from(licenseData).toString('base64');

// 生成最终授权码 (格式: 数据.签名)
const licenseKey = `${dataB64}.${signature}`;

console.log('=== 授权码生成成功 ===');
console.log(`有效期至: ${deadline}`);
console.log('----------------------------------------');
console.log(licenseKey);
console.log('----------------------------------------');
console.log('请将上方字符串发送给用户。');

