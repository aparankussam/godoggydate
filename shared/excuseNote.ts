// shared/excuseNote.ts
// The "Official Dog Excuse Note" — the cheapest, no-signup, top-of-funnel toy.
// A formal-but-absurd note "issued" by your dog explaining why you can't make
// it to a thing. It is DETERMINISTIC and it is a JOKE by construction:
//
//   • Every note is built from a fixed bank of ~15 preset "reasons" plus a
//     fill-in-the-blank grammar over the four things the user types
//     (dog name, owner name, the event being cancelled, the chosen reason).
//     The SAME four inputs always produce the SAME note — no LLM, no reroll.
//   • The letterhead, the department, the signer's "title" and the reference
//     number are all seeded off the dog's name, so a given dog always runs the
//     same fictional office. That stability is the tell that it's a template,
//     not a document.
//
// HONESTY RULE: this must be UNMISTAKABLY a bit. It never imitates a real
// medical, legal, or employer document — the office is "The Office of Biscuit,
// Doctor of Naps," the signer is the dog, the seal is a paw print, and the note
// says so. It makes no medical claim about a human and asserts nothing that
// isn't obviously silly. Presentational honesty (the "this is a joke" framing,
// the paw seal, the footer) is enforced again in web/components/ExcuseNoteCard.
//
// Pure module: no React, no browser, no I/O. Safe to import anywhere.

export interface ExcuseInput {
  /** The dog "issuing" the note. */
  dogName?: string;
  /** The human being excused. */
  ownerName?: string;
  /** What's being cancelled, e.g. "the 9am standup" or "brunch". */
  event?: string;
  /** Chosen reason id (see EXCUSE_REASONS). Falls back to a deterministic pick. */
  reasonId?: string;
}

export interface ExcuseReason {
  id: string;
  /** Short label for the picker UI. */
  label: string;
  emoji: string;
  /** The formal-but-absurd body sentence. Receives the resolved names so the
   *  reason can weave the dog and owner in. Always one honest-joke sentence. */
  body: (ctx: { dog: string; owner: string; event: string }) => string;
}

export interface ExcuseNote {
  /** Fictional letterhead, e.g. "The Office of Biscuit, Doctor of Naps". */
  office: string;
  /** Sub-line under the office, e.g. "Department of Belly Rubs & Snack Policy". */
  department: string;
  /** Faux reference number — obviously not a real form number. */
  refNo: string;
  /** Formal salutation. */
  salutation: string;
  /** The main body sentence (from the chosen reason). */
  body: string;
  /** A second, always-absurd supporting line. */
  supporting: string;
  /** The formal-sounding closing line. */
  closing: string;
  /** How the note signs off, e.g. "Respectfully submitted,". */
  signoff: string;
  /** The signer — the dog — and its invented title. */
  signerName: string;
  signerTitle: string;
  /** The reason chosen, echoed back for the UI. */
  reason: ExcuseReason;
  /** A one-line disclaimer that keeps the whole thing honest. */
  disclaimer: string;
}

// ── Deterministic seed ───────────────────────────────────────────────────────
// Tiny stable string hash (djb2). Used only to pick fictional-office flavor so
// the same dog name always runs the same "office" — the consistency is the tell
// that this is a template, not a real document.
function seedFrom(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function pick<T>(arr: readonly T[], seed: number, salt: number): T {
  return arr[(seed + salt * 2654435761) % arr.length];
}

// ── Fictional-office flavor banks ────────────────────────────────────────────
// All obviously silly. Seeded by dog name so they're stable per dog.
const TITLES = [
  'Doctor of Naps',
  'Professor of Belly Rubs',
  'Chief Snack Officer',
  'Certified Good Boy',
  'Certified Good Girl',
  'Director of Zoomies',
  'Supreme Court of Snacks',
  'Minister of Wags',
  'Doctor of Cuddle Medicine',
  'Head of Household Security (Squirrels)',
  'Ambassador of Naps',
  'Licensed Lap Warmer',
] as const;

const DEPARTMENTS = [
  'Department of Belly Rubs & Snack Policy',
  'Bureau of Zoomies & Naptime Affairs',
  'Office of Emotional Support & Fetch',
  'Ministry of Treats, Naps, and Loyalty',
  'Council on Walkies & Window Watching',
  'Division of Cuddles and Home Defense',
  'Committee for Very Important Napping',
] as const;

const REF_PREFIX = ['WOOF', 'BARK', 'BORK', 'PAW', 'BSCT', 'SNIF'] as const;

// ── The reason bank (~15 presets) ────────────────────────────────────────────
// Each body() is one formal-but-absurd sentence. They all reference the dog and
// often the owner and event, so the note reads as tailored while staying a
// template. Nothing here is a claim about a real illness or obligation.
export const EXCUSE_REASONS: readonly ExcuseReason[] = [
  {
    id: 'lap',
    label: 'Load-bearing lap',
    emoji: '🛋️',
    body: ({ dog, owner, event }) =>
      `${owner} is currently serving as ${dog}'s primary lap and cannot report to ${event}. This is a load-bearing lap; its removal would cause immediate structural collapse of the nap.`,
  },
  {
    id: 'nap',
    label: 'Mid-nap, cannot be disturbed',
    emoji: '😴',
    body: ({ dog, owner, event }) =>
      `${dog} has entered a scheduled, doctor-approved nap directly on top of ${owner}, and by long-standing household law a sleeping dog may not be moved. ${owner} therefore cannot attend ${event}.`,
  },
  {
    id: 'walk',
    label: 'Overdue for a walk',
    emoji: '🦮',
    body: ({ dog, owner, event }) =>
      `${dog} has determined that ${event} conflicts with a walk of the highest urgency. As the sole holder of the leash, ${owner} is required on site and cannot attend.`,
  },
  {
    id: 'guard',
    label: 'Guarding against squirrels',
    emoji: '🐿️',
    body: ({ dog, owner, event }) =>
      `A credible squirrel threat has been detected in the yard. ${dog} has raised the household to high alert and requires ${owner} as backup, making ${event} impossible today.`,
  },
  {
    id: 'sad-eyes',
    label: 'The sad eyes',
    emoji: '🥺',
    body: ({ dog, owner, event }) =>
      `${dog} deployed the sad eyes the moment ${owner} reached for the door. Under established precedent, the sad eyes are legally binding, so ${owner} will not be attending ${event}.`,
  },
  {
    id: 'belly',
    label: 'Belly rub in progress',
    emoji: '🐾',
    body: ({ dog, owner, event }) =>
      `${owner} is mid-belly-rub and cannot stop, as ${dog} has not yet signalled that the belly rub is complete. Interrupting a belly rub before completion voids the whole day, including ${event}.`,
  },
  {
    id: 'fetch',
    label: 'Unfinished game of fetch',
    emoji: '🎾',
    body: ({ dog, owner, event }) =>
      `A game of fetch initiated by ${dog} remains unfinished, and fetch, once begun, must be seen through. ${owner} is contractually obligated to keep throwing and cannot make ${event}.`,
  },
  {
    id: 'weather',
    label: 'Weather too perfect to leave',
    emoji: '☀️',
    body: ({ dog, owner, event }) =>
      `${dog} has assessed the current sunbeam on the floor as "perfect" and requires ${owner} to remain within petting distance. Vacating the sunbeam for ${event} is not authorized.`,
  },
  {
    id: 'snack',
    label: 'Snack negotiations ongoing',
    emoji: '🦴',
    body: ({ dog, owner, event }) =>
      `${dog} and ${owner} are locked in delicate snack negotiations that cannot be paused. Until terms are reached, ${owner} must remain at the table and cannot attend ${event}.`,
  },
  {
    id: 'velcro',
    label: 'Physically attached',
    emoji: '🧲',
    body: ({ dog, owner, event }) =>
      `${dog} has attached to ${owner}'s side and refuses to detach. As no known force can separate a velcro dog from its human, ${owner} regrets to miss ${event}.`,
  },
  {
    id: 'zoomies',
    label: 'Post-zoomies recovery',
    emoji: '🌪️',
    body: ({ dog, owner, event }) =>
      `Following a severe outbreak of the zoomies, ${dog} has collapsed dramatically across the doorway and ${owner}'s only feet. Recovery must be supervised, so ${event} is off.`,
  },
  {
    id: 'cuddle',
    label: 'Prescribed cuddle therapy',
    emoji: '💛',
    body: ({ dog, owner, event }) =>
      `${dog} has prescribed a full course of cuddle therapy, to be administered immediately and without interruption. ${owner} must complete the treatment and cannot attend ${event}.`,
  },
  {
    id: 'window',
    label: 'On window-watch duty',
    emoji: '🪟',
    body: ({ dog, owner, event }) =>
      `${dog} has assigned ${owner} to co-monitor the front window, where important things (a leaf, a bird, nothing) keep happening. This post cannot be abandoned for ${event}.`,
  },
  {
    id: 'treats',
    label: 'Ran out of treats — emergency',
    emoji: '🚨',
    body: ({ dog, owner, event }) =>
      `A treats emergency has been declared: supplies are critically low and ${dog} requires ${owner} to resolve the shortage at once. All other obligations, including ${event}, are suspended.`,
  },
  {
    id: 'raining',
    label: 'It might rain on the dog',
    emoji: '🌧️',
    body: ({ dog, owner, event }) =>
      `Conditions outside are deemed unacceptable for ${dog} (it looked slightly damp), and ${owner} must remain indoors on comfort detail. Attendance at ${event} is therefore not possible.`,
  },
] as const;

const DEFAULT_REASON = EXCUSE_REASONS[0];

/** Look up a reason by id; falls back to null. */
export function excuseReasonById(id: string | null | undefined): ExcuseReason | null {
  if (!id) return null;
  return EXCUSE_REASONS.find((r) => r.id === id) ?? null;
}

// ── Small helpers ────────────────────────────────────────────────────────────
function clean(s: string | undefined, fallback: string, max = 60): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max).trim() : t;
}

// A rotating set of always-absurd supporting lines, seeded so it's stable.
const SUPPORTING = [
  'This absence has been reviewed and approved at the highest level (the couch).',
  'A second opinion was sought from the other dog on the street, who concurred.',
  'The matter is time-sensitive and cannot be rescheduled around treats.',
  'All relevant snacks have been consulted in reaching this decision.',
  'This determination is final and comes with a complimentary tail wag.',
  'The household has voted; the vote was one bark, unanimous.',
] as const;

const CLOSINGS = [
  'Your understanding in this urgent matter is appreciated. Good human.',
  'We trust this clears things up. Please direct any appeals to the treat jar.',
  'Thank you for accommodating this entirely reasonable request.',
  'We thank you for your cooperation and remind you that this dog is very good.',
] as const;

const SIGNOFFS = [
  'Respectfully submitted,',
  'With formal woofs,',
  'Sincerely and with much drool,',
  'By order of the household,',
] as const;

/**
 * Build a complete, deterministic excuse note from the four user inputs.
 * Never throws — missing fields fall back to friendly placeholders so a live
 * preview always renders. Same inputs → same note.
 */
export function buildExcuseNote(input: ExcuseInput): ExcuseNote {
  const dog = clean(input.dogName, 'Your Dog', 40);
  const owner = clean(input.ownerName, 'my human', 40);
  const event = clean(input.event, 'today’s plans', 70);

  const reason = excuseReasonById(input.reasonId) ?? DEFAULT_REASON;

  const seed = seedFrom(dog.toLowerCase() + '|' + reason.id);
  const title = pick(TITLES, seed, 1);
  const department = pick(DEPARTMENTS, seed, 2);
  const prefix = pick(REF_PREFIX, seed, 3);
  const supporting = pick(SUPPORTING, seed, 4);
  const closing = pick(CLOSINGS, seed, 5);
  const signoff = pick(SIGNOFFS, seed, 6);
  const refNo = `${prefix}-${(seed % 9000) + 1000}-${reason.id.toUpperCase().slice(0, 3)}`;

  return {
    office: `The Office of ${dog}, ${title}`,
    department,
    refNo,
    salutation: 'To Whom It May Concern,',
    body: reason.body({ dog, owner, event }),
    supporting,
    closing,
    signoff,
    signerName: dog,
    signerTitle: title,
    reason,
    disclaimer:
      'This is a novelty note issued by a dog, for fun. It is not a real medical, legal, or employer document and should fool no one.',
  };
}
