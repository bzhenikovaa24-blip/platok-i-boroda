const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'client');
const dst = path.join(__dirname, 'app');

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const name of fs.readdirSync(src)) {
  if (name === 'sw.js' || name === 'manifest.webmanifest') continue;
  fs.copyFileSync(path.join(src, name), path.join(dst, name));
}
fs.copyFileSync(path.join(__dirname, '..', 'icon.ico'), path.join(dst, 'icon.ico'));
console.log('Файлы игры скопированы в desktop/app');
