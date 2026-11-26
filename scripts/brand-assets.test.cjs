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

test('logo copied', () => {
  const dest = 'web/public/brand/godoggydate-logo.webp';
  assert.ok(fs.existsSync(at(dest)), `${dest} missing`);
  const src = fs.readFileSync(at('docs/superpowers/specs/assets/2026-11-25-godoggydate-logo-final.webp'));
  assert.ok(src.equals(fs.readFileSync(at(dest))), 'logo is not byte-identical to the supplied art');
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
