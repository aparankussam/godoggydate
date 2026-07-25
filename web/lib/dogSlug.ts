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

/** Extracts the uid from a slug. Returns null if the slug is malformed. */
export function parseDogSlugToUid(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed.includes('-')) return null;
  const uid = trimmed.slice(trimmed.lastIndexOf('-') + 1);
  // Firebase Auth UIDs are non-empty alphanumeric strings (no hyphens).
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return null;
  return uid;
}
