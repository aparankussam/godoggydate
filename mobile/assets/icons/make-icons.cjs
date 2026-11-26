// Run from the repo root: node mobile/assets/icons/make-icons.cjs firebase/functions/node_modules/sharp mobile/assets/icons /dev/null
// The same paths live in web/components/icons.tsx; change both together.
// Draws the siren and gear once, writes SVG paths for the web and white PNGs (1x/2x/3x) for the app.
const sharp = require(require("path").resolve(process.argv[2]));
const fs = require('fs');
const out = process.argv[3];
function gear(n, ro, ri, top, base, hole) {
  const c = 12, r = d => d * Math.PI / 180, f = v => +v.toFixed(2);
  const pt = (a, R) => `${f(c + R * Math.cos(r(a)))} ${f(c + R * Math.sin(r(a)))}`;
  const step = 360 / n; let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * step - 90;
    d += (i === 0 ? `M${pt(a - base, ri)}` : '') + `L${pt(a - top, ro)}A${ro} ${ro} 0 0 1 ${pt(a + top, ro)}L${pt(a + base, ri)}A${ri} ${ri} 0 0 1 ${pt(a + step - base, ri)}`;
  }
  return d + `ZM${c + hole} ${c}a${hole} ${hole} 0 1 0 ${-2 * hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0Z`;
}
const SIREN_BODY = 'M5.7 18h12.6a1.7 1.7 0 0 1 0 3.4H5.7a1.7 1.7 0 0 1 0-3.4ZM6.8 18V12.6a5.2 5.2 0 0 1 10.4 0V18ZM10.3 11.2a1.1 1.1 0 0 1 1.1 1.1v2.4a1.1 1.1 0 0 1-2.2 0v-2.4a1.1 1.1 0 0 1 1.1-1.1Z';
const SIREN_RAYS = 'M12 2.2v2.2M4.6 5.2l1.6 1.6M19.4 5.2l-1.6 1.6';
const GEAR = gear(8, 10, 7.6, 10, 15, 3.9);
const siren = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${SIREN_BODY}" fill="#fff" fill-rule="evenodd"/><path d="${SIREN_RAYS}" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`;
// Gear viewBox padded by the 1.3 stroke so rounded tooth corners aren't clipped.
const gearSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.7 -0.7 25.4 25.4"><path d="${GEAR}" fill="#fff" stroke="#fff" stroke-width="1.3" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
(async () => {
  for (const [name, svg, pt] of [['siren', siren, 23], ['gear', gearSvg, 26]]) {
    for (const k of [1, 2, 3]) {
      await sharp(Buffer.from(svg), { density: 72 * k * pt / 24 * 4 }).resize(pt * k, pt * k).png().toFile(`${out}/${name}${k > 1 ? '@' + k + 'x' : ''}.png`);
    }
  }
  fs.writeFileSync(process.argv[4], JSON.stringify({ SIREN_BODY, SIREN_RAYS, GEAR }, null, 1));
})();
