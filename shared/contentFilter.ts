// shared/contentFilter.ts
// A small, conservative filter for text people post to each other: chat
// messages, dog profile text and Pack Day events. Apple guideline 1.2 asks
// apps with user-generated content to filter objectionable material, and the
// same rule applies on web so both apps behave alike.
//
// It blocks three things only: slurs, sexual solicitation, and threats or
// self-harm taunts. It deliberately allows ordinary dog words that look rude
// out of context (bitch, stud, breeding, humping, cocker, coonhound, anal
// glands…) and everyday swearing. Matching is whole-word after normalising
// Unicode (NFKC, zero-width characters, accents, look-alike letters from other
// alphabets), case, l33tspeak, stretched letters ("niiice") and spaced-out
// letters ("f a g"), so words that merely contain a bad word stay allowed.
//
// No imports, so web, mobile and Cloud Functions can all use it. Clients
// check before sending so people get a friendly message; the server checks
// again, because a modified client can skip the first check.

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
  'cunt', 'dyke', 'chink', 'coon', 'slut', 'nazi',
];

// Not "xxx" on its own: "see you soon xxx" is a kiss, and plenty of people end
// a message that way. Porn use of it is caught as a phrase below.
const SEXUAL_WORDS = [
  'porn', 'porno', 'pornhub', 'onlyfans', 'blowjob', 'handjob', 'rimjob',
  'cumshot', 'cum', 'dickpic', 'nudes', 'sexting', 'horny', 'milf', 'dildo',
  'threesome', 'boobs',
  // "n00dz" and friends: digits can't stand for the missing letters, so the
  // l33t spellings are listed. They are not English words.
  'nuds', 'nudz', 'nudez', 'noodz',
];

const THREAT_WORDS = ['kys', 'rape', 'raped', 'rapist', 'raping'];

// Phrases are matched on the normalised word sequence.
const SEXUAL_PHRASES = [
  'send nudes', 'send me nudes', 'dick pic', 'dick pics', 'suck my',
  'wanna fuck', 'want to fuck', 'lets fuck', 'fuck me',
  'xxx video', 'xxx videos', 'xxx pic', 'xxx pics', 'xxx photo', 'xxx photos',
  'xxx content', 'xxx chat', 'xxx movie', 'xxx movies',
];

const THREAT_PHRASES = [
  'kill yourself', 'kill urself', 'kill your self', 'kill ur self',
  'kill yourselves', 'kill your selves',
  'go die', 'hope you die', 'hope u die',
  'hope your dog dies', 'i will kill you', 'ill kill you', 'im going to kill you',
  'i am going to kill you', 'im gonna kill you', 'i will hurt you',
  'i will find you', 'i know where you live',
];

// Ordinary uses of a listed word. Removed from the text before matching, and
// only these exact phrases: "Maine Coon", the coonhound breeds written as two
// words, a city and a surname, and "a chink in the fence".
const ALLOWED_PHRASES: RegExp[] = [
  /\bmaine coons?\b/g,
  /\bcoon ?hounds?\b/g,
  /\bcoon dogs?\b/g,
  /\bcoon rapids\b/g,
  /\bchinks? in (?:the|my|our|his|her|its|their|a)\b/g,
  /\bvan dyke\b/g,
];

// What a digit or symbol may stand for. Several letters where a digit is
// genuinely ambiguous ("n00dz": the zeros are u's). '*' is a censor mark, so it
// may be any vowel ("n*gger", "c*nt").
const LEET: Record<string, string[]> = {
  '0': ['o', 'u'], '1': ['i', 'l'], '3': ['e'], '4': ['a'], '5': ['s'],
  '7': ['t'], '8': ['b'], '9': ['g'], '@': ['a'], '$': ['s'],
  '*': ['a', 'e', 'i', 'o', 'u'],
};

// Letters from other alphabets that are drawn like a Latin letter, plus Latin
// letters NFKD leaves alone. Only used to read a word, never to rewrite what
// people see. (Accented Latin letters and fullwidth or circled forms are
// already handled by Unicode normalisation.)
const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic
  '\u0430': 'a', '\u0432': 'b', '\u0435': 'e', '\u0451': 'e', '\u043A': 'k', '\u043C': 'm',
  '\u043D': 'h', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c', '\u0442': 't', '\u0443': 'y',
  '\u0445': 'x', '\u0456': 'i', '\u0457': 'i', '\u0458': 'j', '\u0455': 's', '\u0501': 'd',
  '\u04BB': 'h', '\u04CF': 'i', '\u0475': 'v', '\u051B': 'q', '\u051D': 'w', '\u04AF': 'y',
  // Greek
  '\u03B1': 'a', '\u03B2': 'b', '\u03B3': 'y', '\u03B5': 'e', '\u03B9': 'i', '\u03BA': 'k',
  '\u03BD': 'v', '\u03BF': 'o', '\u03C1': 'p', '\u03C4': 't', '\u03C5': 'u', '\u03C7': 'x',
  '\u03C9': 'w', '\u03C2': 's',
  // Latin look-alikes
  '\u0131': 'i', '\u0269': 'i', '\u00F8': 'o', '\u0142': 'l', '\u0111': 'd', '\u0127': 'h',
  '\u0167': 't', '\u0251': 'a', '\u0261': 'g', '\u0192': 'f', '\u00DF': 'ss',
  // Latin small capitals
  '\u1D00': 'a', '\u0299': 'b', '\u1D04': 'c', '\u1D05': 'd', '\u1D07': 'e', '\uA730': 'f',
  '\u0262': 'g', '\u029C': 'h', '\u026A': 'i', '\u1D0A': 'j', '\u1D0B': 'k', '\u029F': 'l',
  '\u1D0D': 'm', '\u0274': 'n', '\u1D0F': 'o', '\u1D18': 'p', '\uA7AF': 'q', '\u0280': 'r',
  '\uA731': 's', '\u1D1B': 't', '\u1D1C': 'u', '\u1D20': 'v', '\u1D21': 'w', '\u028F': 'y',
  '\u1D22': 'z',
};

// Zero-width and other invisible characters, soft hyphen, bidi controls and
// variation selectors: they can sit inside a word without showing.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
// Combining marks (accents, and the strike-through or underline some people
// lay over every letter).
const COMBINING = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

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

/**
 * Lowercase text with the tricks that hide a word from a reader-less filter
 * undone: compatibility forms (fullwidth, circled, mathematical) folded to
 * plain letters, invisible characters and combining marks removed, look-alike
 * letters from Cyrillic and Greek read as Latin, apostrophes dropped. Digits
 * and symbols are left for the caller (they are ambiguous).
 */
function normalizeText(text: string): string {
  let value = text;
  if (typeof value.normalize === 'function') value = value.normalize('NFKC');
  value = value.replace(INVISIBLE, '').toLowerCase();
  if (typeof value.normalize === 'function') value = value.normalize('NFKD');
  value = value.replace(COMBINING, '');
  let out = '';
  for (const ch of value) out += HOMOGLYPHS[ch] ?? ch;
  return out
    .replace(/['\u2019\u02BC`\u00B4]/g, '')
    // "n!gger": a "!" between two letters is an "i".
    .replace(/([a-z])!(?=[a-z])/g, '$1i');
}

const MAX_VARIANTS = 24;

/** Every reading of a token whose digits and symbols may stand for letters. */
function tokenVariants(token: string): string[] {
  let variants = [''];
  for (const ch of token) {
    const options = LEET[ch] ?? [ch];
    if (options.length === 1) {
      variants = variants.map((v) => v + options[0]);
    } else if (variants.length * options.length > MAX_VARIANTS) {
      // Too many digits to try every combination: read each by its first letter.
      variants = variants.map((v) => v + (ch === '*' ? '' : options[0]));
    } else {
      variants = variants.flatMap((v) => options.map((o) => v + o));
    }
  }
  return variants;
}

// A token is a run of letters, digits and the symbols that can stand in for
// letters; everything else (spaces, punctuation, emoji, other alphabets) ends it.
const TOKEN_SPLIT = /[^a-z0-9@$*]+/;

/** Lowercase words with accents, look-alike letters, l33tspeak and apostrophes removed. */
export function contentFilterWords(text: string): string[] {
  return tokensOf(text).flatMap((variants) => variants[0].split(/[^a-z]+/)).filter(Boolean);
}

function allowedRemoved(plain: string): string {
  let value = plain;
  for (const phrase of ALLOWED_PHRASES) value = value.replace(phrase, ' ');
  return value;
}

/** Each token of the text, as every reading of its digits and symbols. */
function tokensOf(text: string): string[][] {
  return allowedRemoved(normalizeText(text))
    .split(TOKEN_SPLIT)
    .filter(Boolean)
    .map((token) => tokenVariants(token));
}

/** Checks text people are about to post. Empty text is fine. */
export function checkContent(text: string | null | undefined): ContentFilterResult {
  if (!text || !text.trim()) return { ok: true };
  const tokens = tokensOf(text);

  // The primary reading of each token (first letter for every digit), used for
  // phrases and for spaced-out letters.
  const words = tokens.flatMap((variants) => variants[0].split(/[^a-z]+/)).filter(Boolean);

  const candidates = new Set<string>();
  for (const variants of tokens) {
    for (const variant of variants) {
      // A digit with no letter meaning ("ab2cd") still separates words.
      for (const piece of variant.split(/[^a-z]+/)) if (piece) candidates.add(piece);
    }
  }

  // Spaced-out letters ("f a g g o t") also count as one word.
  let run: string[] = [];
  for (const word of [...words, '']) {
    if (word.length === 1) {
      run.push(word);
      continue;
    }
    if (run.length >= 3) candidates.add(run.join(''));
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
