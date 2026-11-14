// Иконки приложения из собственного рисунка: node scripts/gen-icons.mjs
import sharp from 'sharp';
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#fff6e6"/>
<g transform="translate(256 262) scale(${pad})">
<path d="M-150,-20 L0,-150 L150,-20 Z" fill="#ff8a73" stroke="#5a4a5c" stroke-width="14" stroke-linejoin="round"/>
<rect x="-118" y="-22" width="236" height="170" rx="22" fill="#fff" stroke="#5a4a5c" stroke-width="14"/>
<rect x="-34" y="46" width="68" height="102" rx="14" fill="#7fd1b9" stroke="#5a4a5c" stroke-width="12"/>
<rect x="-94" y="14" width="46" height="46" rx="10" fill="#8fc3f2" stroke="#5a4a5c" stroke-width="10"/>
<rect x="48" y="14" width="46" height="46" rx="10" fill="#8fc3f2" stroke="#5a4a5c" stroke-width="10"/>
<path d="M0,-118 l10,22 l24,3 l-18,16 l5,24 l-21,-12 l-21,12 l5,-24 l-18,-16 l24,-3z" fill="#ffd166" stroke="#5a4a5c" stroke-width="8" stroke-linejoin="round"/>
</g></svg>`;
for (const [name, size, pad] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.78], ['apple-touch-icon.png', 180, 0.92], ['favicon.png', 48, 1]])
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
console.log('icons ok');
