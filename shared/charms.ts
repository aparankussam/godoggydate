// shared/charms.ts
// Every Playroom toy you open is tracked as "tried". The Today card uses this
// to feature one untried toy a day, in the dog's voice, instead of a 15-slot
// checklist. A charm marks only that you opened the toy, nothing about the dog.

export interface CharmInfo {
  id: string;
  emoji: string;
  /** `{name}` is replaced with the dog's name. */
  label: string;
  /** The dog's own one-line pitch for the toy. `{name}` is replaced too. */
  voiceLine: string;
}

// Order is the order a sequential "next up" suggests them in: quick toys first.
export const CHARM_LIST: readonly CharmInfo[] = [
  { id: 'barkle', emoji: '🧩', label: 'Barkle', voiceLine: 'Guess my breed in six tries. I dare you.' },
  { id: 'snoot', emoji: '👃', label: 'Snoot Boop', voiceLine: 'Boop my snoot. I dare you.' },
  { id: 'sticker-studio', emoji: '🎨', label: 'Sticker Studio', voiceLine: 'Stick some stickers on my best photo.' },
  { id: 'roast', emoji: '🔥', label: 'Roast {name}', voiceLine: "I've been saving some material about you." },
  { id: 'wanted', emoji: '🤠', label: 'Wanted Poster', voiceLine: "Turn me into a wanted dog. I'm already guilty of being cute." },
  { id: 'texts', emoji: '💬', label: 'Texts from {name}', voiceLine: "Read the texts I'd send you, if dogs could type." },
  { id: 'card', emoji: '🃏', label: 'Trading card', voiceLine: 'Make my trading card. Rare pull, obviously.' },
  { id: 'apology', emoji: '🙏', label: 'Notes-App Apology', voiceLine: "Here's the apology I'd type. It's not very sorry." },
  { id: 'adventures', emoji: '🗺️', label: 'Adventure Passport', voiceLine: 'Stamp another real-world adventure with me.' },
  { id: 'review', emoji: '⭐', label: 'My Human Review', voiceLine: 'I wrote you a review. Five stars, mostly.' },
  { id: 'excuse', emoji: '📝', label: 'Excuse Note', voiceLine: 'Need an excuse? I ate your homework. Allegedly.' },
  { id: 'quiz', emoji: '❓', label: 'Dog quiz', voiceLine: 'Quiz your friends. See who really knows me.' },
  { id: 'plaque', emoji: '🏅', label: 'Employee of the Month', voiceLine: 'Give me a plaque. I earned employee of the month.' },
  { id: 'letter', emoji: '💌', label: 'A letter from {name}', voiceLine: 'I wrote you a letter for the next big day.' },
  { id: 'lifestage', emoji: '🎂', label: 'Life stage', voiceLine: 'See where I am in life, and what I need now.' },
];

export const charmLabel = (charm: CharmInfo, dogName: string) => charm.label.replace('{name}', dogName);
export const charmVoiceLine = (charm: CharmInfo, dogName: string) => charm.voiceLine.replace('{name}', dogName);

/** The first charm not yet tried, skipping the toy you're in. Used for the
 *  sequential hand-off at the bottom of a toy screen (mobile's NextToy). */
export function nextCharm<T extends CharmInfo>(list: readonly T[], earned: readonly string[], skip?: string): T | null {
  return list.find((c) => c.id !== skip && !earned.includes(c.id)) ?? null;
}

/** One untried charm, featured for the whole day and the same for every
 *  viewer: rotates through the untried ones by the UTC day, so it changes
 *  daily without needing a server. Returns null once everything in `exclude`
 *  aside is tried. */
export function pickOfDay<T extends CharmInfo>(list: readonly T[], earned: readonly string[], exclude: readonly string[] = []): T | null {
  const untried = list.filter((c) => !earned.includes(c.id) && !exclude.includes(c.id));
  if (untried.length === 0) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  return untried[day % untried.length];
}
