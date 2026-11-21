// shared/fileName.ts
// Safe file names for the share cards a visitor saves. Dog names go straight into
// them ("José 🏳️‍🌈-roast.png"), and browsers drop or mangle anything outside
// ASCII — Chromium saves such a download as an extension-less "download" — so
// keep letters and digits only, transliterating accents. Pure: no browser APIs.

const FALLBACK_BASE = 'godoggydate-card';

export function safeCardFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const rawExt = dot >= 0 ? fileName.slice(dot).replace(/[^A-Za-z0-9.]/g, '') : '';
  const ext = rawExt.length > 1 ? rawExt : '.png';
  const base = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${base || FALLBACK_BASE}${ext}`;
}
