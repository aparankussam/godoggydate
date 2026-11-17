// firebase/functions/src/contentFilter.ts
// MIRROR of shared/contentFilter.ts. Do not edit this copy by hand.
//
// The functions deploy uploads only firebase/functions (tsconfig rootDir is
// src), so this package can't import ../../shared at runtime. Everything
// below this header is byte-identical to shared/contentFilter.ts from the
// `export type ContentFilterReason` line down, and
// shared/contentFilterMirror.test.ts fails if the two drift. To change the
// word lists or matching, edit shared/contentFilter.ts, then copy its body
// here.
//
// The server runs it again after the clients, because a modified client can
// skip the client-side check (Apple guideline 1.2).

export type ContentFilterReason = 'slur' | 'sexual' | 'threat';

export type ContentFilterResult =
  | { ok: true }
  | { ok: false; reason: ContentFilterReason };

/** What to show when text is refused. */
export const CONTENT_FILTER_MESSAGE =
  'That includes words we don’t allow on GoDoggyDate. Please rephrase it.';

// Whole words. Each also matches with a trailing "s" and with any letter
// stretched ("faaag"), but never with fewer letters than written here, so
// "nigger" does not match "Niger".
const SLURS = [
  'nigger', 'nigga', 'niggah', 'faggot', 'fag', 'kike', 'spic', 'wetback',
  'gook', 'tranny', 'trannie', 'retard', 'retarded', 'towelhead', 'raghead',
  'sandnigger', 'paki', 'beaner',
];

const SEXUAL_WORDS = [
  'porn', 'porno', 'pornhub', 'onlyfans', 'blowjob', 'handjob', 'rimjob',
  'cumshot', 'cum', 'dickpic', 'nudes', 'sexting', 'horny', 'milf', 'dildo',
  'threesome', 'boobs', 'xxx',
];

const THREAT_WORDS = ['kys', 'rape', 'raped', 'rapist', 'raping'];

// Phrases are matched on the normalised word sequence.
const SEXUAL_PHRASES = [
  'send nudes', 'send me nudes', 'dick pic', 'dick pics', 'suck my',
  'wanna fuck', 'want to fuck', 'lets fuck', 'fuck me',
];

const THREAT_PHRASES = [
  'kill yourself', 'kill urself', 'go die', 'hope you die', 'hope u die',
  'hope your dog dies', 'i will kill you', 'ill kill you', 'im going to kill you',
  'i am going to kill you', 'im gonna kill you', 'i will hurt you',
  'i will find you', 'i know where you live',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
};

function wordPattern(word: string): RegExp {
  // "faggot" -> /^f{1,}a{1,}g{2,}o{1,}t{1,}s?$/
  let source = '';
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    let run = 1;
    while (word[i + run] === ch) run += 1;
    source += `${ch}{${run},}`;
    i += run;
  }
  return new RegExp(`^${source}s?$`);
}

const WORD_RULES: Array<{ pattern: RegExp; reason: ContentFilterReason }> = [
  ...SLURS.map((w) => ({ pattern: wordPattern(w), reason: 'slur' as const })),
  ...SEXUAL_WORDS.map((w) => ({ pattern: wordPattern(w), reason: 'sexual' as const })),
  ...THREAT_WORDS.map((w) => ({ pattern: wordPattern(w), reason: 'threat' as const })),
];

const PHRASE_RULES: Array<{ phrase: string; reason: ContentFilterReason }> = [
  ...SEXUAL_PHRASES.map((phrase) => ({ phrase, reason: 'sexual' as const })),
  ...THREAT_PHRASES.map((phrase) => ({ phrase, reason: 'threat' as const })),
];

/** Lowercase words with accents, l33tspeak and apostrophes removed. */
export function contentFilterWords(text: string): string[] {
  const plain = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0134579@$]/g, (c) => LEET[c] ?? c)
    .replace(/['’]/g, '');
  return plain.split(/[^a-z]+/).filter(Boolean);
}

/** Checks text people are about to post. Empty text is fine. */
export function checkContent(text: string | null | undefined): ContentFilterResult {
  if (!text || !text.trim()) return { ok: true };
  const words = contentFilterWords(text);

  // Spaced-out letters ("f a g g o t") also count as one word.
  const candidates = [...words];
  let run: string[] = [];
  for (const word of [...words, '']) {
    if (word.length === 1) {
      run.push(word);
      continue;
    }
    if (run.length >= 3) candidates.push(run.join(''));
    run = [];
  }

  for (const candidate of candidates) {
    for (const rule of WORD_RULES) {
      if (rule.pattern.test(candidate)) return { ok: false, reason: rule.reason };
    }
  }

  const sentence = ` ${words.join(' ')} `;
  for (const rule of PHRASE_RULES) {
    if (sentence.includes(` ${rule.phrase} `)) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}

/** Checks several fields at once, e.g. a whole profile or event. */
export function checkContentFields(
  fields: Array<string | null | undefined>,
): ContentFilterResult {
  for (const field of fields) {
    const result = checkContent(field);
    if (!result.ok) return result;
  }
  return { ok: true };
}
