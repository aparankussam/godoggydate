// Pins the brand icon/logo files: sizes, presence, and that every config path resolves.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const at = (p) => path.join(root, p);

function pngSize(file) {
  const buf = fs.readFileSync(at(file));
  assert.strictEqual(buf.toString('ascii', 12, 16), 'IHDR', `${file} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const PNG_SIZES = {
  'web/public/icons/icon-192.png': 192,
  'web/public/icons/icon-512.png': 512,
  'web/public/icons/icon-maskable-512.png': 512,
  'web/public/icons/apple-touch-icon.png': 180,
  'web/public/icons/favicon-32.png': 32,
  'mobile/assets/icon.png': 1024,
  'mobile/assets/adaptive-icon.png': 1024,
  'mobile/assets/splash.png': 1024,
  'mobile/assets/favicon.png': 48,
};

test('png sizes', () => {
  for (const [file, s] of Object.entries(PNG_SIZES)) {
    assert.ok(fs.existsSync(at(file)), `${file} missing`);
    assert.deepStrictEqual(pngSize(file), [s, s], file);
  }
});

test('cut-out logo has transparency and the art size', () => {
  // Owner approved removing the flat sky blue so the logo sits on the page's gingham.
  const file = 'web/public/brand/godoggydate-logo-cutout.webp';
  const b = fs.readFileSync(at(file));
  assert.strictEqual(b.toString('ascii', 12, 16), 'VP8X', 'expected extended webp');
  assert.ok(b[20] & 0x10, 'cut-out logo has no alpha channel');
  assert.deepStrictEqual(webpSize(file), [1774, 887]);
});

test('every brand file the site ships is used, and every used one exists', () => {
  const dir = at('web/public/brand');
  const code = ['web/components/BrandLogo.tsx', 'web/components/AnimatedLogo.tsx', 'web/components/ShareLogo.tsx', 'web/lib/ogLogo.tsx']
    .map((f) => fs.readFileSync(at(f), 'utf8')).join('\n');
  for (const f of fs.readdirSync(dir)) assert.ok(code.includes(`/brand/${f}`), `unused brand file: ${f}`);
  for (const [, f] of code.matchAll(/\/brand\/([\w.-]+)/g)) assert.ok(fs.existsSync(path.join(dir, f)), `missing /brand/${f}`);
});

test('manifest', () => {
  const m = JSON.parse(fs.readFileSync(at('web/public/manifest.json'), 'utf8'));
  for (const icon of m.icons) {
    assert.ok(!icon.src.endsWith('.svg'), `svg icon still listed: ${icon.src}`);
    assert.ok(fs.existsSync(at(path.join('web/public', icon.src))), `missing ${icon.src}`);
  }
  assert.strictEqual(m.theme_color, '#8FC9F2');
});

test('layout', () => {
  const src = fs.readFileSync(at('web/app/layout.tsx'), 'utf8');
  assert.ok(!src.includes('icon.svg'), 'layout still references icon.svg');
  const urls = [...src.matchAll(/['"](\/icons\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(urls.length > 0, 'no /icons/ urls found in layout');
  for (const u of urls) assert.ok(fs.existsSync(at(path.join('web/public', u))), `missing ${u}`);
});

test('expo', () => {
  const src = fs.readFileSync(at('mobile/app.config.js'), 'utf8');
  const paths = [...src.matchAll(/['"](\.\/assets\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(paths.length >= 4, 'expected icon, splash, adaptive icon and favicon paths');
  for (const p of paths) assert.ok(fs.existsSync(at(path.join('mobile', p))), `missing ${p}`);
});

// WebP canvas size: VP8X (extended), VP8L (lossless) or VP8 (lossy).
function webpSize(file) {
  const b = fs.readFileSync(at(file));
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${file}: unknown webp chunk ${kind}`);
}

test('icon source is full resolution', () => {
  // Every icon is resized from this file; a thumbnail here ships blurry icons.
  assert.deepStrictEqual(webpSize('docs/superpowers/specs/assets/2026-11-25-godoggydate-app-icon-final.webp'), [1254, 1254]);
});

test('adaptive icon is inset for the Android safe zone', () => {
  // Launchers mask to roughly the middle 66%, so the full tile would lose letters.
  const icon = fs.readFileSync(at('mobile/assets/icon.png'));
  const adaptive = fs.readFileSync(at('mobile/assets/adaptive-icon.png'));
  assert.ok(!icon.equals(adaptive), 'adaptive-icon.png is the uninset full tile');
});

test('header logo box shows all of the art', () => {
  // Measured: the logo art (1774x887) has content in rows 176..616.
  const src = fs.readFileSync(at('web/components/BrandLogo.tsx'), 'utf8');
  const ratio = Number(src.match(/const RATIO = ([\d.]+)/)[1]);
  const posY = Number(src.match(/const POS_Y = (\d+)/)[1]) / 100;
  const visible = 1774 / ratio;
  const top = (887 - visible) * posY;
  assert.ok(top <= 176 && top + visible >= 616, `shows rows ${Math.round(top)}..${Math.round(top + visible)}`);
});

test('no page still shows the old paw-and-text logo', () => {
  // The old mark was a PawCoin/PawIcon badge next to "GoDoggyDate" in the display font.
  const OLD = [/<PawCoin[^>]*\/>\s*GoDoggyDate/, /font-display text-\[(21|26)px\] leading-none[^"]*">GoDoggyDate</];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : []);
  for (const f of [...walk(at('web/app')), ...walk(at('web/components'))]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of OLD) assert.ok(!re.test(src), `old logo in ${path.relative(root, f)}`);
  }
});

test('favicon.ico is the new icon', () => {
  // Browsers fetch /favicon.ico on their own; the old file was the paw.
  const b = fs.readFileSync(at('web/app/favicon.ico'));
  assert.strictEqual(b.readUInt16LE(2), 1, 'not an .ico file');
  assert.strictEqual(b[6], 48, 'expected a 48px icon');
  const sha = require('node:crypto').createHash('sha256').update(b).digest('hex');
  assert.notStrictEqual(sha, 'adb4e4ccd7c1a1615cd335f30257ce0b751a6ac034afa2d7148b2bf1b6f17b95', 'favicon.ico is still the old paw');
});

const walkTsx = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkTsx(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : []);

test('share logo is a trimmed PNG with transparency', () => {
  // Link previews (satori) can't read WebP, and html2canvas ignores object-fit, so both use this file.
  const file = 'web/public/brand/godoggydate-logo-share.png';
  assert.deepStrictEqual(pngSize(file), [900, 234]);
  assert.strictEqual(fs.readFileSync(at(file))[25], 6, 'expected RGBA (colour type 6)');
});

test('share cards show the logo, not the brand name as text', () => {
  const OLD = />\s*GoDoggyDate( · godoggydate\.com)?\s*<\/(p|span)>/;
  for (const f of [...walkTsx(at('web/app')), ...walkTsx(at('web/components'))]) {
    assert.ok(!OLD.test(fs.readFileSync(f, 'utf8')), `text brand in ${path.relative(root, f)}`);
  }
});

test('every link preview image uses the logo', () => {
  const files = walkTsx(at('web/app')).filter((f) => f.endsWith('opengraph-image.tsx'));
  assert.ok(files.length >= 7, `found ${files.length} opengraph images`);
  // public/ isn't in the server functions; without this the dynamic previews can't read the logo.
  assert.ok(/outputFileTracingIncludes[^}]*godoggydate-logo-share\.png/.test(fs.readFileSync(at('web/next.config.js'), 'utf8')), 'logo not traced into preview routes');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(src.includes('ogLogo'), `no logo in ${path.relative(root, f)}`);
    assert.ok(!/🐾 GoDoggyDate|>\s*GoDoggyDate\s*</.test(src), `text brand in ${path.relative(root, f)}`);
  }
});
