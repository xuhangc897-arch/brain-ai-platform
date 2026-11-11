const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'spanish-picture-bank.json'), 'utf8'));
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const sections = [0, 1, 2, 3, 4].map(round => {
  const items = bank.items.filter(item => item.round === round);
  const cards = items.map(item => `<figure><img src="../${escapeHtml(item.pictureAsset)}?v=${escapeHtml(bank.version)}" alt="${escapeHtml(item.meaningZh)}" width="640" height="640" loading="lazy" decoding="async"><figcaption><strong>${escapeHtml(item.word)}</strong><br>${escapeHtml(item.meaningZh)} · ${escapeHtml(item.id)}</figcaption></figure>`).join('\n');
  return `<section><h2>${round === 0 ? '练习' : `第 ${round} 轮`} · ${items.length} 张</h2><div class="grid">${cards}</div></section>`;
}).join('\n');

const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>西班牙语—图片题库预览</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:32px auto;max-width:1200px;padding:0 20px;color:#202329;background:#f6f7f8}h1{font-size:28px}h2{margin-top:36px}p{color:#535a60}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}figure{margin:0;padding:10px;background:white;border:1px solid #e0e3e7;border-radius:14px}img{display:block;width:100%;aspect-ratio:1;object-fit:contain}figcaption{padding:8px 4px 2px;text-align:center}strong{font-size:18px}</style><h1>西班牙语—图片题库</h1><p>研究者预览 · ${escapeHtml(bank.version)} · 图片尚需人工审查与学生预试</p>${sections}</html>`;
fs.writeFileSync(path.join(root, 'docs', 'spanish-picture-bank-gallery.html'), html);
console.log(`Generated gallery for ${bank.items.length} picture cards.`);
