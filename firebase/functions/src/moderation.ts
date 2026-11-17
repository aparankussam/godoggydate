// firebase/functions/src/moderation.ts
// Server-side content filter decisions for chat messages and dog profiles
// (Apple guideline 1.2). Both apps check text before sending, but a modified
// client can skip that, so the triggers in index.ts run these again on every
// write. Pure functions with no Firestore access, so they can be reasoned
// about (and tested) on their own; index.ts does the reads and writes.

import { checkContent, checkContentFields } from './contentFilter';
import type { ContentFilterReason } from './contentFilter';

/** Replaces the text of a chat message the filter refused. */
export const MODERATED_MESSAGE_TEXT =
  'This message was removed because it broke the community rules.';

interface MessageLike {
  text?: unknown;
  playdate?: unknown;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Checks everything in a message that the other person will see: the text,
 * plus the date, time and place of a playdate card, which the apps render from
 * `playdate` rather than from `text`.
 */
export function checkMessageContent(message: MessageLike): { ok: true } | { ok: false; reason: ContentFilterReason } {
  const playdate = (message.playdate && typeof message.playdate === 'object'
    ? message.playdate
    : {}) as Record<string, unknown>;
  return checkContentFields([
    asText(message.text),
    asText(playdate.date),
    asText(playdate.time),
    asText(playdate.place),
  ]);
}

// Owner-typed text on dogs/{uid}. Not the `ai` fields (Vibe Check output is
// written by the server) and not server-only fields like householdMemberNames.
// The chip lists are fixed choices in both apps, but they're stored as plain
// strings any client can write, and they show on cards, so they're checked too.
export const DOG_TEXT_FIELDS = ['name', 'breed', 'location', 'city', 'state', 'bio', 'healthNotes'] as const;
export const DOG_TEXT_LIST_FIELDS = [
  'temperament', 'playStyles', 'notGoodWith', 'behaviorFlags',
  'goodWith', 'boundaries', 'allergies', 'specialNeeds',
] as const;

export interface DogContentProblem {
  field: string;
  reason: ContentFilterReason;
}

export interface DogContentFixes {
  /** Field updates that clear only the offending text. Empty when nothing failed. */
  updates: Record<string, unknown>;
  problems: DogContentProblem[];
  /** The refused values, for the admin-only moderation log. */
  original: Record<string, unknown>;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * What to clear on a dog profile. Only fields whose value changed since
 * `before` are checked, so a profile that already passed (or that this
 * function already cleaned) never triggers another write: clearing a field
 * changes it to '' or to a shorter list, which passes, so the trigger that
 * fires for that write finds nothing to do.
 *
 * - Text fields that fail become ''.
 * - List fields lose just the entries that fail.
 * - Prompt entries whose question or answer fails are dropped.
 */
export function dogProfileContentFixes(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): DogContentFixes {
  const fixes: DogContentFixes = { updates: {}, problems: [], original: {} };
  const changed = (field: string) => !sameValue(before?.[field], after[field]);

  for (const field of DOG_TEXT_FIELDS) {
    const value = after[field];
    if (typeof value !== 'string' || !changed(field)) continue;
    const result = checkContent(value);
    if (result.ok) continue;
    fixes.updates[field] = '';
    fixes.problems.push({ field, reason: result.reason });
    fixes.original[field] = value;
  }

  for (const field of DOG_TEXT_LIST_FIELDS) {
    const value = after[field];
    if (!Array.isArray(value) || !changed(field)) continue;
    const { kept, reason } = dropFailing(value, (item) =>
      typeof item === 'string' ? checkContent(item) : { ok: true });
    if (!reason) continue;
    fixes.updates[field] = kept;
    fixes.problems.push({ field, reason });
    fixes.original[field] = value;
  }

  const prompts = after.prompts;
  if (Array.isArray(prompts) && changed('prompts')) {
    const { kept, reason } = dropFailing(prompts, (entry) => {
      if (!entry || typeof entry !== 'object') return { ok: true };
      const { prompt, answer } = entry as { prompt?: unknown; answer?: unknown };
      return checkContentFields([asText(prompt), asText(answer)]);
    });
    if (reason) {
      fixes.updates.prompts = kept;
      fixes.problems.push({ field: 'prompts', reason });
      fixes.original.prompts = prompts;
    }
  }

  return fixes;
}

// ── Owner notice ───────────────────────────────────────────────────────────────
// users/{uid}/private/moderationNotice tells the owner which profile text the
// server cleared, so a blank field isn't a mystery. Owner-only (private/), not
// on the dog doc, which every signed-in user can read. The apps show it and
// delete it when dismissed.
//
// `fields` uses the keys the editors show: the dog field names, except that
// city and state are one "location" input in both apps.

const NOTICE_FIELD_KEY: Record<string, string> = { city: 'location', state: 'location' };

/** Every key that can appear in moderationNotice.fields. */
export const MODERATION_NOTICE_FIELDS: readonly string[] = [
  ...new Set([...DOG_TEXT_FIELDS, ...DOG_TEXT_LIST_FIELDS, 'prompts'].map((f) => NOTICE_FIELD_KEY[f] ?? f)),
];

// One reason per notice. When fields failed for different reasons, name the
// most serious.
const REASONS_MOST_SERIOUS_FIRST: readonly ContentFilterReason[] = ['threat', 'slur', 'sexual'];

export interface ModerationNotice {
  fields: string[];
  reason: ContentFilterReason;
}

/**
 * The notice to write for `problems`, merged with the one already waiting (if
 * the owner hasn't dismissed it yet): the field lists are combined. `existing`
 * is owner-writable, so only known keys and reasons are carried over.
 */
export function moderationNoticeFor(
  problems: DogContentProblem[],
  existing?: Record<string, unknown>,
): ModerationNotice {
  const previous = Array.isArray(existing?.fields) ? existing.fields : [];
  const fields = [...new Set([
    ...previous.filter((f): f is string => typeof f === 'string' && MODERATION_NOTICE_FIELDS.includes(f)),
    ...problems.map((p) => NOTICE_FIELD_KEY[p.field] ?? p.field),
  ])];
  const reasons: unknown[] = [...problems.map((p) => p.reason), existing?.reason];
  const reason = REASONS_MOST_SERIOUS_FIRST.find((r) => reasons.includes(r)) ?? 'slur';
  return { fields, reason };
}

function dropFailing(
  items: unknown[],
  check: (item: unknown) => { ok: true } | { ok: false; reason: ContentFilterReason },
): { kept: unknown[]; reason: ContentFilterReason | null } {
  const kept: unknown[] = [];
  let reason: ContentFilterReason | null = null;
  for (const item of items) {
    const result = check(item);
    if (result.ok) {
      kept.push(item);
    } else if (reason === null) {
      reason = result.reason;
    }
  }
  return { kept, reason };
}

/** Firestore document ids the server reads from client-written report fields. */
export function isSafeDocId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
}
