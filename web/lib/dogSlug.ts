// web/lib/dogSlug.ts
// Public dog page slugs, e.g. "kaju-bJ08ja5xqkZUo3QpIUoYsmHIUXE3". Readable
// name prefix for shareability, trailing Firebase Auth UID for lookup —
// Firebase Auth UIDs never contain hyphens, so splitting on the LAST hyphen
// always isolates it correctly regardless of how many words are in the name.
// No slug->uid index collection needed; this is pure and reversible.

function kebabName(name: string): string {
  const kebab = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return kebab || 'dog';
}

export function toDogSlug(name: string, uid: string): string {
  return `${kebabName(name)}-${uid}`;
}

// Real Firebase Auth UIDs are 28 characters; generous upper bound to allow
// for future format changes without accepting arbitrary-length input.
const MAX_UID_LENGTH = 64;

/** Extracts the uid from a slug. Returns null if the slug is malformed. */
export function parseDogSlugToUid(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed.includes('-')) return null;
  const uid = trimmed.slice(trimmed.lastIndexOf('-') + 1);
  // Firebase Auth UIDs are non-empty alphanumeric strings (no hyphens).
  // The length cap matters, not just the shape: without it, an arbitrarily
  // long "uid-shaped" segment (adversarial or scanner traffic) reaches
  // Firestore as a doc-ID lookup — doc IDs over ~1500 bytes are invalid and
  // the Admin SDK throws rather than returning "not found", which would
  // surface as an uncaught 500 instead of a clean 404.
  if (!uid || uid.length > MAX_UID_LENGTH || !/^[A-Za-z0-9]+$/.test(uid)) return null;
  return uid;
}
