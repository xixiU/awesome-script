const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 生成 2048 位 RSA 密钥对
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// 保存到文件
fs.writeFileSync(path.join(__dirname, 'private_key.pem'), privateKey);
fs.writeFileSync(path.join(__dirname, 'public_key.pem'), publicKey);
fs.writeFileSync(path.join(__dirname, '../extension/public_key.js'), `const PUBLIC_KEY_PEM = \`${publicKey}\`;`);

console.log('密钥对已生成！');
console.log('私钥 (private_key.pem): 请妥善保管，用于签发授权码。');
console.log('公钥 (../extension/public_key.js): 已自动写入插件目录。');

