// shared/progress.ts
// Cross-device progress for the playful features that used to live only on one
// device: Snoot Boop counts (and the stickers/milestones derived from them),
// Compat Explorer invite keys, the Adventure Passport, Barkle, and the Human
// Review's 90-day wait.
//
// One Firestore document per user, users/{uid}/private/progress, with a field
// per feature. Local storage (localStorage on web, AsyncStorage on iPhone) stays
// the instant source for every screen; a sync merges local and remote and writes
// the result to both.
//
// Every merge here is commutative, associative and idempotent, so two devices
// that sync in any order, any number of times, end up with the same progress:
//   • boops         max all-time count; today's count from the later day (max on a tie)
//   • unlocks       union of invited match codes
//   • dogtypes      per Dogtype code, earliest discovery wins (with its dog); seen/own OR-ed
//   • dogtypeDogs   per matched dog, the first Dogtype we saw it as (earliest wins)
//   • dogtypeRevealed  OR: the owner has watched their own dog's reveal
//   • adventures    per quest, the mark with more stamp/unstamp toggles wins;
//                   on a tie the earliest time wins (two devices stamping the
//                   same quest keep the first stamp)
//   • barkle        per puzzle, a solved game beats an unsolved one, fewer
//                   guesses beats more among solved, more beats fewer among
//                   unsolved; capped at the latest 365 puzzles
//   • humanReview   the latest review wins
//
// No imports on purpose: `node --test` runs this file directly, and both apps
// import it without a file extension.

export const PROGRESS_DOC_VERSION = 1;
/** Barkle history kept per user, newest puzzles first. Keeps the doc small. */
export const BARKLE_HISTORY_LIMIT = 365;
/** Mirrors MAX_TRIES in shared/barkle.ts (not imported, see above). */
export const BARKLE_MAX_GUESSES = 6;

const MAX_UNLOCK_CODES = 64;
const MAX_ADVENTURES = 200;
const MAX_COUNT = 1_000_000_000;
const MAX_TIMESTAMP = 100_000_000_000_000; // year ~5138 — rejects garbage, not clocks
const MAX_TOGGLES = 1_000_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface BoopsProgress {
  allTime: number;
  /** Local YYYY-MM-DD that todayCount belongs to, or '' when unknown. */
  todayDate: string;
  todayCount: number;
}

/**
 * One Adventure Passport quest. `n` counts stamp/unstamp toggles, so an odd
 * `n` means stamped. `at` is when the current state began (the stamp time
 * while stamped).
 */
export interface AdventureMark {
  n: number;
  at: number;
}
export type AdventureLedger = Record<string, AdventureMark>;

export interface BarkleRecord {
  /** Canonical breed names, in the order played. */
  guesses: string[];
  solved: boolean;
}
/** Keyed by puzzle number as a string. */
export type BarkleHistory = Record<string, BarkleRecord>;

/** Structurally the HumanReview type in web/lib and mobile/lib humanReview.ts. */
export interface HumanReviewContent {
  stars: number;
  headline: string;
  pros: string[];
  improvements: string[];
  verdict: string;
  dogName: string;
  model?: string;
  promptVersion?: string;
}
export interface HumanReviewProgress {
  review: HumanReviewContent;
  generatedAtMs: number;
}

/** The users/{uid}/private/progress document (minus `v`). Absent = nothing yet. */
export interface ProgressDoc {
  boops?: BoopsProgress;
  unlocks?: string[];
  dogtypes?: DogtypeLedger;
  /** The owner has watched their own dog's Dogtype reveal once. */
  dogtypeRevealed?: boolean;
  /** The Dogtype each matched dog had the first time we saw it (a later profile edit never re-discovers). */
  dogtypeDogs?: DogtypeDogMap;
  adventures?: AdventureLedger;
  barkle?: BarkleHistory;
  humanReview?: HumanReviewProgress;
}

/**
 * Local storage keys. Everything a signed-in person earns is keyed by their
 * uid (it always was), so a second account on the same device never sees, or
 * syncs, the first account's progress. The one device-wide key is Barkle's
 * signed-out game, which carries `adoptedBy` once a signed-in uid takes it.
 */
export const progressKeys = {
  boops: (uid: string) => `godoggydate.boops.${uid}`,
  unlocks: (uid: string) => `godoggydate.revealUnlocks.${uid}`,
  dogtypes: (uid: string) => `godoggydate.dogtypes.${uid}`,
  dogtypeRevealed: (uid: string) => `godoggydate.dogtypes.revealed.${uid}`,
  dogtypeDogs: (uid: string) => `godoggydate.dogtypes.dogs.${uid}`,
  adventures: (uid: string) => `godoggydate.adventures.${uid}`,
  barkleHistory: (uid: string) => `godoggydate.barkle.history.${uid}`,
  humanReview: (uid: string) => `gdd:humanReview:${uid}`,
  /** Signed-out Barkle game on this device: { puzzleNumber, guessNames, adoptedBy? }. */
  barkleDevice: 'godoggydate.barkle.v1',
  /** Web only: the uid that last signed in here, so /barkle knows whether to load auth. */
  lastUid: 'godoggydate.progress.lastUid',
};

// ── Small helpers ────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toCount(v: unknown, max = MAX_COUNT): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.min(max, Math.floor(v));
}

function toTimestamp(v: unknown): number | null {
  return toCount(v, MAX_TIMESTAMP);
}

/** Trimmed, code-point-safe truncation (never splits an emoji). '' → null. */
function toText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const points = Array.from(t);
  return points.length > max ? points.slice(0, max).join('').trim() : t;
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

const QUEST_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUZZLE_RE = /^\d{1,7}$/;

/** Key-order-independent JSON, for equality checks and deterministic tie-breaks. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// ── Boops ────────────────────────────────────────────────────────────────────

/** Counts from a stored BoopState (or a remote field), zero counts included. */
export function readBoopCounts(raw: unknown): BoopsProgress | undefined {
  if (!isRecord(raw)) return undefined;
  const allTime = toCount(raw.allTime);
  if (allTime === null) return undefined;
  const todayDate = typeof raw.todayDate === 'string' && DATE_RE.test(raw.todayDate) ? raw.todayDate : '';
  const todayCount = todayDate ? Math.min(allTime, toCount(raw.todayCount) ?? 0) : 0;
  return { allTime, todayDate, todayCount };
}

/** Same, but nothing booped yet reads as "no boops progress". */
export function normalizeBoops(raw: unknown): BoopsProgress | undefined {
  const counts = readBoopCounts(raw);
  return counts && counts.allTime > 0 ? counts : undefined;
}

export function mergeBoops(a?: BoopsProgress, b?: BoopsProgress): BoopsProgress | undefined {
  if (!a || !b) return a ?? b;
  const today =
    a.todayDate === b.todayDate
      ? a.todayCount >= b.todayCount ? a : b
      : a.todayDate > b.todayDate ? a : b;
  return { allTime: Math.max(a.allTime, b.allTime), todayDate: today.todayDate, todayCount: today.todayCount };
}

/**
 * What a Snoot Boop screen's save should leave in storage.
 *
 * The screen holds its count in memory and saves the whole state. If a sync
 * raised the stored count after the screen loaded, overwriting would throw the
 * synced boops away, so instead we add the taps the screen made since `base`
 * (the count it last loaded or saved) on top of what's stored now. Never goes
 * down, and never counts a tap twice: taps are measured against the writer's
 * own previous value, and a negative difference adds nothing.
 */
export function applyBoopWrite(
  stored: BoopsProgress | undefined,
  written: BoopsProgress,
  base: number | undefined,
): BoopsProgress {
  const s = stored ?? { allTime: 0, todayDate: '', todayCount: 0 };
  const taps = Math.max(0, written.allTime - (base ?? s.allTime));
  const allTime = Math.max(written.allTime, s.allTime + taps);
  let todayDate = s.todayDate;
  let todayCount = s.todayCount;
  if (written.todayDate === s.todayDate) {
    todayCount = Math.max(written.todayCount, s.todayCount + Math.min(taps, written.todayCount));
  } else if (written.todayDate > s.todayDate) {
    todayDate = written.todayDate;
    todayCount = written.todayCount;
  }
  return { allTime, todayDate, todayCount: Math.min(todayCount, allTime) };
}

/** Merged boop counts written back over a stored BoopState, keeping its energy. */
export function boopsToLocal(value: BoopsProgress, existing: unknown): Record<string, unknown> {
  return { ...(isRecord(existing) ? existing : {}), ...value };
}

// ── Unlock keys ──────────────────────────────────────────────────────────────

export function normalizeUnlocks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const codes = uniqSorted(
    raw.map((c) => toText(c, 40)).filter((c): c is string => c !== null),
  ).slice(0, MAX_UNLOCK_CODES);
  return codes.length ? codes : undefined;
}

export function mergeUnlocks(a?: string[], b?: string[]): string[] | undefined {
  if (!a || !b) return a ?? b;
  return uniqSorted([...a, ...b]).slice(0, MAX_UNLOCK_CODES);
}

export function unlocksFromLocal(raw: unknown): string[] | undefined {
  return isRecord(raw) ? normalizeUnlocks(raw.invitedCodes) : undefined;
}

export function unlocksToLocal(codes: string[], existing: unknown): Record<string, unknown> {
  return { ...(isRecord(existing) ? existing : {}), invitedCodes: codes };
}

// ── Dogtype discoveries ──────────────────────────────────────────────────────

export interface DogtypeDiscovery {
  at: number;
  dogId: string | null;
  dogName: string | null;
  seen: boolean;
  own?: boolean;
}
export type DogtypeLedger = Record<string, DogtypeDiscovery>;
export const DOGTYPE_CODE_RE = /^[EZ][RG][OS][BM]$/;
const MAX_DOGTYPES = 16;

function normalizeDiscovery(raw: unknown): DogtypeDiscovery | null {
  if (!isRecord(raw)) return null;
  const at = toTimestamp(raw.at);
  if (at === null) return null;
  const out: DogtypeDiscovery = {
    at,
    dogId: toText(raw.dogId, 128),
    dogName: toText(raw.dogName, 60),
    seen: raw.seen === true,
  };
  if (raw.own === true) out.own = true;
  return out;
}

export function normalizeDogtypes(raw: unknown): DogtypeLedger | undefined {
  if (!isRecord(raw)) return undefined;
  const out: DogtypeLedger = {};
  let kept = 0;
  for (const code of Object.keys(raw).sort()) {
    if (kept >= MAX_DOGTYPES) break;
    if (!DOGTYPE_CODE_RE.test(code)) continue;
    const d = normalizeDiscovery(raw[code]);
    if (!d) continue;
    out[code] = d;
    kept += 1;
  }
  return kept ? out : undefined;
}

function mergeDiscovery(a: DogtypeDiscovery, b: DogtypeDiscovery): DogtypeDiscovery {
  const withDog = [a, b]
    .filter((d) => d.dogId !== null)
    .sort(
      (x, y) =>
        x.at - y.at ||
        String(x.dogId).localeCompare(String(y.dogId)) ||
        String(x.dogName).localeCompare(String(y.dogName)),
    )[0];
  const out: DogtypeDiscovery = {
    at: Math.min(a.at, b.at),
    dogId: withDog ? withDog.dogId : null,
    dogName: withDog ? withDog.dogName : null,
    seen: a.seen || b.seen,
  };
  if (a.own || b.own) out.own = true;
  return out;
}

export function mergeDogtypes(a?: DogtypeLedger, b?: DogtypeLedger): DogtypeLedger | undefined {
  if (!a || !b) return a ?? b;
  const out: DogtypeLedger = {};
  for (const code of uniqSorted([...Object.keys(a), ...Object.keys(b)]).slice(0, MAX_DOGTYPES)) {
    const x = a[code];
    const y = b[code];
    out[code] = x && y ? mergeDiscovery(x, y) : (x ?? y);
  }
  return out;
}

export function addDiscovery(
  ledger: DogtypeLedger | undefined,
  code: string,
  d: { at: number; dogId: string | null; dogName: string | null; seen?: boolean; own?: boolean },
): DogtypeLedger {
  const entry: DogtypeDiscovery = { at: d.at, dogId: d.dogId, dogName: d.dogName, seen: d.seen === true };
  if (d.own) entry.own = true;
  return mergeDogtypes(ledger, { [code]: entry }) ?? {};
}

/** Records the dog's current own type. Old own entries stay (merges would bring them back); readers filter. */
export function setOwnType(ledger: DogtypeLedger | undefined, code: string, at: number): DogtypeLedger {
  return addDiscovery(ledger, code, { at, dogId: null, dogName: null, seen: true, own: true });
}

export function markSeen(ledger: DogtypeLedger | undefined, code: string): DogtypeLedger {
  const cur = ledger?.[code];
  if (!ledger || !cur || cur.seen) return ledger ?? {};
  return { ...ledger, [code]: { ...cur, seen: true } };
}

/** How many types count as found: your own only once you've watched your reveal. */
export function discoveredCount(ledger: DogtypeLedger | undefined, ownCode: string, ownRevealed: boolean): number {
  return discoveredOrder(ledger, ownCode).filter((c) => c !== ownCode || ownRevealed).length;
}

/** Your current own type first (always counted, stored or not), then types met via a dog, oldest first. */
export function discoveredOrder(ledger: DogtypeLedger | undefined, ownCode?: string): string[] {
  const met = Object.keys(ledger ?? {})
    .filter((c) => c !== ownCode && ledger![c].dogId !== null)
    .sort((a, b) => ledger![a].at - ledger![b].at || a.localeCompare(b));
  return ownCode ? [ownCode, ...met] : met;
}

// ── Per-dog type snapshots + the reveal flag ────────────────────────────────

export type DogtypeDogMap = Record<string, { code: string; at: number }>;
const MAX_DOGTYPE_DOGS = 200;

export function normalizeDogtypeDogs(raw: unknown): DogtypeDogMap | undefined {
  if (!isRecord(raw)) return undefined;
  const out: DogtypeDogMap = {};
  let kept = 0;
  for (const id of Object.keys(raw).sort()) {
    if (kept >= MAX_DOGTYPE_DOGS) break;
    const v = raw[id];
    if (!isRecord(v) || typeof v.code !== 'string' || !DOGTYPE_CODE_RE.test(v.code)) continue;
    const at = toTimestamp(v.at);
    const dogId = toText(id, 128);
    if (at === null || dogId === null) continue;
    out[dogId] = { code: v.code, at };
    kept += 1;
  }
  return kept ? out : undefined;
}

export function mergeDogtypeDogs(a?: DogtypeDogMap, b?: DogtypeDogMap): DogtypeDogMap | undefined {
  if (!a || !b) return a ?? b;
  const out: DogtypeDogMap = {};
  for (const id of uniqSorted([...Object.keys(a), ...Object.keys(b)]).slice(0, MAX_DOGTYPE_DOGS)) {
    const x = a[id];
    const y = b[id];
    if (x && y) out[id] = x.at < y.at || (x.at === y.at && x.code <= y.code) ? x : y;
    else out[id] = (x ?? y) as { code: string; at: number };
  }
  return out;
}

/** Records the code a matched dog had the first time we saw it; later calls never change it. */
export function snapshotDog(map: DogtypeDogMap | undefined, dogId: string, code: string, at: number): DogtypeDogMap {
  if (map?.[dogId] || !DOGTYPE_CODE_RE.test(code)) return map ?? {};
  return mergeDogtypeDogs(map, { [dogId]: { code, at } }) ?? {};
}

export function matchedDogsOfType(map: DogtypeDogMap | undefined, code: string): string[] {
  return Object.keys(map ?? {}).filter((id) => map![id].code === code);
}

export function normalizeRevealed(raw: unknown): boolean | undefined {
  return raw === true ? true : undefined;
}

export function mergeRevealed(a?: boolean, b?: boolean): boolean | undefined {
  return a || b ? true : undefined;
}

/** Consecutive solved Barkle days. Today not being played yet never breaks a run that ends yesterday. */
export function barkleStreak(
  history: Record<string, { solved: boolean }> | undefined,
  todayPuzzle: number,
): { current: number; best: number; yesterdaySolved: boolean | null } {
  const solved = new Set<number>();
  for (const [k, v] of Object.entries(history ?? {})) if (v && v.solved && PUZZLE_RE.test(k)) solved.add(Number(k));
  let best = 0;
  let run = 0;
  const sorted = [...solved].sort((x, y) => x - y);
  sorted.forEach((n, i) => {
    run = i > 0 && sorted[i - 1] === n - 1 ? run + 1 : 1;
    if (run > best) best = run;
  });
  let cursor = solved.has(todayPuzzle) ? todayPuzzle : todayPuzzle - 1;
  let current = 0;
  while (solved.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  const y = history?.[String(todayPuzzle - 1)];
  return { current, best, yesterdaySolved: y ? y.solved === true : null };
}

// ── Adventure Passport ───────────────────────────────────────────────────────

function normalizeMark(raw: unknown): AdventureMark | null {
  if (!isRecord(raw)) return null;
  const n = toCount(raw.n, MAX_TOGGLES);
  const at = toTimestamp(raw.at);
  if (!n || at === null) return null;
  return { n, at };
}

export function normalizeAdventures(raw: unknown): AdventureLedger | undefined {
  if (!isRecord(raw)) return undefined;
  const out: AdventureLedger = {};
  let kept = 0;
  for (const id of Object.keys(raw).sort()) {
    if (kept >= MAX_ADVENTURES) break;
    if (!QUEST_ID_RE.test(id)) continue;
    const mark = normalizeMark(raw[id]);
    if (!mark) continue;
    out[id] = mark;
    kept += 1;
  }
  return kept ? out : undefined;
}

function betterMark(a: AdventureMark, b: AdventureMark): AdventureMark {
  if (a.n !== b.n) return a.n > b.n ? a : b;
  return a.at <= b.at ? a : b;
}

export function mergeAdventures(a?: AdventureLedger, b?: AdventureLedger): AdventureLedger | undefined {
  if (!a || !b) return a ?? b;
  const out: AdventureLedger = {};
  for (const id of uniqSorted([...Object.keys(a), ...Object.keys(b)]).slice(0, MAX_ADVENTURES)) {
    const x = a[id];
    const y = b[id];
    out[id] = x && y ? betterMark(x, y) : (x ?? y);
  }
  return out;
}

export function isMarkStamped(mark: AdventureMark | undefined): boolean {
  return !!mark && mark.n % 2 === 1;
}

/** The questId → stampedAt map the passport screens render. */
export function completedFromLedger(ledger: AdventureLedger | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ledger) return out;
  for (const [id, mark] of Object.entries(ledger)) {
    if (isMarkStamped(mark)) out[id] = Math.max(1, mark.at);
  }
  return out;
}

/**
 * Apply the quests a screen toggled between `before` and `after` to the ledger.
 * Only quests whose state differs between the two maps count as toggles, so a
 * screen holding a stale map can't undo a stamp that arrived by sync. A toggle
 * the ledger already reflects is a no-op (idempotent).
 */
export function applyCompletedChange(
  ledger: AdventureLedger | undefined,
  before: Record<string, number>,
  after: Record<string, number>,
  nowMs: number,
): AdventureLedger | undefined {
  const next: AdventureLedger = { ...(ledger ?? {}) };
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const wasDone = (before[id] ?? 0) > 0;
    const isDone = (after[id] ?? 0) > 0;
    if (wasDone === isDone || !QUEST_ID_RE.test(id)) continue;
    const mark = next[id];
    if (isMarkStamped(mark) === isDone) continue;
    const at = isDone ? toTimestamp(after[id]) ?? nowMs : nowMs;
    next[id] = { n: (mark?.n ?? 0) + 1, at };
  }
  return normalizeAdventures(next);
}

/**
 * Reads the stored passport: the v2 ledger, or a v1 questId → doneAt map from
 * before sync (each v1 entry becomes a single stamp).
 */
export function adventuresFromLocal(raw: unknown): AdventureLedger | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.v === 2) return normalizeAdventures(raw.marks);
  const marks: Record<string, AdventureMark> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v === 'number' && v > 0) marks[id] = { n: 1, at: v };
  }
  return normalizeAdventures(marks);
}

export function adventuresToLocal(ledger: AdventureLedger): Record<string, unknown> {
  return { v: 2, marks: ledger };
}

// ── Barkle ───────────────────────────────────────────────────────────────────

/** A normalized record, or null when there are no guesses. */
export function barkleRecord(guesses: unknown, solved: boolean): BarkleRecord | null {
  if (!Array.isArray(guesses)) return null;
  const names = guesses
    .map((g) => toText(g, 60))
    .filter((g): g is string => g !== null)
    .slice(0, BARKLE_MAX_GUESSES);
  return names.length ? { guesses: names, solved } : null;
}

/** > 0 when `a` is the better result for the same puzzle. */
export function compareBarkle(a: BarkleRecord, b: BarkleRecord): number {
  if (a.solved !== b.solved) return a.solved ? 1 : -1;
  if (a.guesses.length !== b.guesses.length) {
    // Solved: fewer guesses is better. Unsolved: more guesses is further along.
    return a.solved ? b.guesses.length - a.guesses.length : a.guesses.length - b.guesses.length;
  }
  const ak = a.guesses.join('\n');
  const bk = b.guesses.join('\n');
  if (ak === bk) return 0;
  return ak < bk ? 1 : -1; // arbitrary but deterministic
}

export function betterBarkleRecord(a?: BarkleRecord, b?: BarkleRecord): BarkleRecord | undefined {
  if (!a || !b) return a ?? b;
  return compareBarkle(a, b) >= 0 ? a : b;
}

function capBarkle(history: BarkleHistory): BarkleHistory | undefined {
  const keys = Object.keys(history)
    .sort((x, y) => Number(y) - Number(x))
    .slice(0, BARKLE_HISTORY_LIMIT);
  if (!keys.length) return undefined;
  const out: BarkleHistory = {};
  for (const k of keys) out[k] = history[k];
  return out;
}

export function normalizeBarkle(raw: unknown): BarkleHistory | undefined {
  if (!isRecord(raw)) return undefined;
  const out: BarkleHistory = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PUZZLE_RE.test(key) || !isRecord(value)) continue;
    const rec = barkleRecord(value.guesses, value.solved === true);
    if (!rec) continue;
    const k = String(Number(key));
    out[k] = betterBarkleRecord(out[k], rec) as BarkleRecord;
  }
  return capBarkle(out);
}

export function mergeBarkle(a?: BarkleHistory, b?: BarkleHistory): BarkleHistory | undefined {
  if (!a || !b) return a ?? b;
  const out: BarkleHistory = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[k] = betterBarkleRecord(a[k], b[k]) as BarkleRecord;
  }
  return capBarkle(out);
}

/** History with one puzzle's result folded in (keeps the better one, then caps). */
export function addBarkleRecord(
  history: BarkleHistory | undefined,
  puzzleNumber: number,
  record: BarkleRecord,
): BarkleHistory {
  return mergeBarkle(history, { [String(Math.floor(puzzleNumber))]: record }) ?? {};
}

export interface BarkleDeviceSave {
  puzzleNumber: number;
  guessNames: string[];
  /** Set once a signed-in uid has taken this signed-out game into its history. */
  adoptedBy?: string;
}

export function parseBarkleDevice(raw: unknown): BarkleDeviceSave | null {
  if (!isRecord(raw) || typeof raw.puzzleNumber !== 'number' || !Array.isArray(raw.guessNames)) return null;
  const save: BarkleDeviceSave = {
    puzzleNumber: raw.puzzleNumber,
    guessNames: raw.guessNames.filter((n): n is string => typeof n === 'string'),
  };
  if (typeof raw.adoptedBy === 'string' && raw.adoptedBy) save.adoptedBy = raw.adoptedBy;
  return save;
}

/**
 * Which guesses a Barkle screen should show for today's puzzle.
 * Signed out: this device's game. Signed in: the better of the account's saved
 * game and this device's signed-out game, unless another account already took
 * that one. `adopt` is set when the device game should now be folded into the
 * account (the caller writes it and marks the device save `adoptedBy`).
 */
export function resolveBarkleLoad(input: {
  history: BarkleHistory | undefined;
  device: BarkleDeviceSave | null;
  puzzleNumber: number;
  /** Today's breed name, to tell whether a device game was solved. */
  answer: string;
  uid: string | null;
}): { guesses: string[]; adopt: BarkleRecord | null } {
  const { device, puzzleNumber, uid } = input;
  const today = device && device.puzzleNumber === puzzleNumber ? device : null;
  if (!uid) return { guesses: today ? today.guessNames : [], adopt: null };
  const saved = input.history?.[String(puzzleNumber)];
  if (!today || (today.adoptedBy && today.adoptedBy !== uid)) {
    return { guesses: saved?.guesses ?? [], adopt: null };
  }
  const fromDevice = barkleRecord(today.guessNames, today.guessNames.includes(input.answer));
  const best = betterBarkleRecord(saved, fromDevice ?? undefined);
  return { guesses: best?.guesses ?? [], adopt: today.adoptedBy ? null : fromDevice };
}

// ── Human Review ─────────────────────────────────────────────────────────────

function textList(raw: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((s) => toText(s, maxLen))
    .filter((s): s is string => s !== null)
    .slice(0, maxItems);
}

export function normalizeHumanReview(raw: unknown): HumanReviewProgress | undefined {
  if (!isRecord(raw) || !isRecord(raw.review)) return undefined;
  const generatedAtMs = toTimestamp(raw.generatedAtMs);
  const r = raw.review;
  const headline = toText(r.headline, 200);
  const verdict = toText(r.verdict, 600);
  const pros = textList(r.pros, 6, 300);
  const improvements = textList(r.improvements, 6, 300);
  if (!generatedAtMs || typeof r.stars !== 'number' || !Number.isFinite(r.stars)) return undefined;
  if (!headline || !verdict || !pros || !improvements) return undefined;
  const review: HumanReviewContent = {
    stars: Math.max(0, Math.min(5, r.stars)),
    headline,
    pros,
    improvements,
    verdict,
    dogName: toText(r.dogName, 80) ?? '',
  };
  const model = toText(r.model, 80);
  const promptVersion = toText(r.promptVersion, 40);
  if (model) review.model = model;
  if (promptVersion) review.promptVersion = promptVersion;
  return { review, generatedAtMs };
}

export function mergeHumanReview(a?: HumanReviewProgress, b?: HumanReviewProgress): HumanReviewProgress | undefined {
  if (!a || !b) return a ?? b;
  if (a.generatedAtMs !== b.generatedAtMs) return a.generatedAtMs > b.generatedAtMs ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

/** A synced review written over the local cache (the components re-derive the date label). */
export function humanReviewToLocal(value: HumanReviewProgress, existing: unknown): Record<string, unknown> {
  const keepLabel =
    isRecord(existing) && existing.generatedAtMs === value.generatedAtMs && typeof existing.dateLabel === 'string';
  return {
    review: value.review,
    dateLabel: keepLabel ? (existing as Record<string, unknown>).dateLabel : '',
    generatedAtMs: value.generatedAtMs,
  };
}

// ── The whole document ───────────────────────────────────────────────────────

function compact(doc: ProgressDoc): ProgressDoc {
  const out: ProgressDoc = {};
  if (doc.boops) out.boops = doc.boops;
  if (doc.unlocks) out.unlocks = doc.unlocks;
  if (doc.dogtypes) out.dogtypes = doc.dogtypes;
  if (doc.dogtypeRevealed) out.dogtypeRevealed = doc.dogtypeRevealed;
  if (doc.dogtypeDogs) out.dogtypeDogs = doc.dogtypeDogs;
  if (doc.adventures) out.adventures = doc.adventures;
  if (doc.barkle) out.barkle = doc.barkle;
  if (doc.humanReview) out.humanReview = doc.humanReview;
  return out;
}

/** Validates an untrusted document (remote data, old local data). Never throws. */
export function normalizeProgress(raw: unknown): ProgressDoc {
  if (!isRecord(raw)) return {};
  return compact({
    boops: normalizeBoops(raw.boops),
    unlocks: normalizeUnlocks(raw.unlocks),
    dogtypes: normalizeDogtypes(raw.dogtypes),
    dogtypeRevealed: normalizeRevealed(raw.dogtypeRevealed),
    dogtypeDogs: normalizeDogtypeDogs(raw.dogtypeDogs),
    adventures: normalizeAdventures(raw.adventures),
    barkle: normalizeBarkle(raw.barkle),
    humanReview: normalizeHumanReview(raw.humanReview),
  });
}

/** Commutative, associative and idempotent merge of two normalized documents. */
export function mergeProgress(a: ProgressDoc, b: ProgressDoc): ProgressDoc {
  return compact({
    boops: mergeBoops(a.boops, b.boops),
    unlocks: mergeUnlocks(a.unlocks, b.unlocks),
    dogtypes: mergeDogtypes(a.dogtypes, b.dogtypes),
    dogtypeRevealed: mergeRevealed(a.dogtypeRevealed, b.dogtypeRevealed),
    dogtypeDogs: mergeDogtypeDogs(a.dogtypeDogs, b.dogtypeDogs),
    adventures: mergeAdventures(a.adventures, b.adventures),
    barkle: mergeBarkle(a.barkle, b.barkle),
    humanReview: mergeHumanReview(a.humanReview, b.humanReview),
  });
}

export function progressEquals(a: ProgressDoc, b: ProgressDoc): boolean {
  return sameValue(compact(a), compact(b));
}

export function isProgressEmpty(doc: ProgressDoc): boolean {
  return Object.keys(compact(doc)).length === 0;
}

/**
 * What to write to Firestore after merging, or null when the remote document
 * already says it all. Uses `mergeFields` so each feature field is replaced
 * whole (a capped Barkle map really drops old puzzles) while fields a newer app
 * version may add are left alone.
 */
export function progressRemoteWrite(
  merged: ProgressDoc,
  remote: ProgressDoc,
  remoteExists: boolean,
): { data: Record<string, unknown>; mergeFields: string[] } | null {
  if (remoteExists ? progressEquals(merged, remote) : isProgressEmpty(merged)) return null;
  const data: Record<string, unknown> = { v: PROGRESS_DOC_VERSION, ...compact(merged) };
  return { data, mergeFields: Object.keys(data) };
}

// ── Local storage ⇄ document ─────────────────────────────────────────────────

/** Minimal storage the sync needs. `update` must be an atomic read-modify-write. */
export interface ProgressStore {
  /** Parsed JSON at `key`, or null. */
  read(key: string): unknown | Promise<unknown>;
  /** Writes fn(current); returning undefined leaves the key untouched. */
  update(key: string, fn: (raw: unknown) => unknown): void | Promise<void>;
}

/** This uid's progress as stored on this device. */
export async function readLocalProgress(store: ProgressStore, uid: string): Promise<ProgressDoc> {
  const [boops, unlocks, dogtypes, dogtypeRevealed, dogtypeDogs, adventures, barkle, humanReview] = await Promise.all([
    store.read(progressKeys.boops(uid)),
    store.read(progressKeys.unlocks(uid)),
    store.read(progressKeys.dogtypes(uid)),
    store.read(progressKeys.dogtypeRevealed(uid)),
    store.read(progressKeys.dogtypeDogs(uid)),
    store.read(progressKeys.adventures(uid)),
    store.read(progressKeys.barkleHistory(uid)),
    store.read(progressKeys.humanReview(uid)),
  ]);
  return compact({
    boops: normalizeBoops(boops),
    unlocks: unlocksFromLocal(unlocks),
    dogtypes: normalizeDogtypes(dogtypes),
    dogtypeRevealed: normalizeRevealed(dogtypeRevealed),
    dogtypeDogs: normalizeDogtypeDogs(dogtypeDogs),
    adventures: adventuresFromLocal(adventures),
    barkle: normalizeBarkle(barkle),
    humanReview: normalizeHumanReview(humanReview),
  });
}

async function mergeFeature<T>(
  store: ProgressStore,
  key: string,
  incoming: T | undefined,
  fromLocal: (raw: unknown) => T | undefined,
  merge: (a?: T, b?: T) => T | undefined,
  toLocal: (value: T, existing: unknown) => unknown,
): Promise<{ value: T | undefined; changed: boolean }> {
  let value: T | undefined;
  let changed = false;
  await store.update(key, (raw) => {
    const current = fromLocal(raw);
    const next = merge(current, incoming);
    value = next;
    if (next === undefined || sameValue(current, next)) return undefined;
    changed = true;
    return toLocal(next, raw);
  });
  return { value, changed };
}

/**
 * Folds `incoming` into this uid's local storage, re-reading each key so
 * anything saved locally while the network call was out is kept. Returns what
 * local now holds and whether anything changed.
 */
export async function mergeIntoLocalProgress(
  store: ProgressStore,
  uid: string,
  incoming: ProgressDoc,
): Promise<{ doc: ProgressDoc; changed: boolean }> {
  const results = await Promise.all([
    mergeFeature(store, progressKeys.boops(uid), incoming.boops, normalizeBoops, mergeBoops, boopsToLocal),
    mergeFeature(store, progressKeys.unlocks(uid), incoming.unlocks, unlocksFromLocal, mergeUnlocks, unlocksToLocal),
    mergeFeature(store, progressKeys.dogtypes(uid), incoming.dogtypes, normalizeDogtypes, mergeDogtypes, (v) => v),
    mergeFeature(store, progressKeys.dogtypeRevealed(uid), incoming.dogtypeRevealed, normalizeRevealed, mergeRevealed, (v) => v),
    mergeFeature(store, progressKeys.dogtypeDogs(uid), incoming.dogtypeDogs, normalizeDogtypeDogs, mergeDogtypeDogs, (v) => v),
    mergeFeature(
      store,
      progressKeys.adventures(uid),
      incoming.adventures,
      adventuresFromLocal,
      mergeAdventures,
      adventuresToLocal,
    ),
    mergeFeature(store, progressKeys.barkleHistory(uid), incoming.barkle, normalizeBarkle, mergeBarkle, (v) => v),
    mergeFeature(
      store,
      progressKeys.humanReview(uid),
      incoming.humanReview,
      normalizeHumanReview,
      mergeHumanReview,
      humanReviewToLocal,
    ),
  ]);
  const [boops, unlocks, dogtypes, dogtypeRevealed, dogtypeDogs, adventures, barkle, humanReview] = results;
  return {
    doc: compact({
      boops: boops.value,
      unlocks: unlocks.value,
      dogtypes: dogtypes.value,
      dogtypeRevealed: dogtypeRevealed.value,
      dogtypeDogs: dogtypeDogs.value,
      adventures: adventures.value,
      barkle: barkle.value,
      humanReview: humanReview.value,
    }),
    changed: results.some((r) => r.changed),
  };
}

// ── Sync engine ──────────────────────────────────────────────────────────────

export interface ProgressSyncAdapter extends ProgressStore {
  /**
   * Read the remote doc, merge `local` into it, write it if it changed, and
   * return the merged doc. Should run as a transaction.
   */
  syncRemote(uid: string, local: ProgressDoc): Promise<ProgressDoc>;
  /** Offline, permission and other failures land here. They never throw out. */
  onError?(error: unknown): void;
}

export interface ProgressSyncOptions {
  /** Quiet period after the last local change before pushing. */
  debounceMs?: number;
  /** A steady stream of changes (a boop marathon) still pushes this often. */
  maxWaitMs?: number;
  now?: () => number;
}

export type ProgressListener = (uid: string | null) => void;

export interface ProgressSync {
  /** Sign-in or app start with a user: pull, merge, push. No-op for the same uid. */
  start(uid: string): void;
  /** Sign-out. Local progress stays under its uid's keys. */
  stop(): void;
  /** A feature saved locally; push after the debounce. Ignored for other uids. */
  markDirty(uid: string): void;
  syncNow(): Promise<void>;
  /** Sync if the last sync is older than maxAgeMs (app foreground, tab focus). */
  refreshIfStale(maxAgeMs: number): Promise<void>;
  activeUid(): string | null;
  /** Called when the signed-in uid changes and when a sync changed local data. */
  subscribe(listener: ProgressListener): () => void;
}

/**
 * The platform-neutral sync loop. Each app supplies storage and the Firestore
 * transaction. Failures are reported to `onError` and otherwise ignored: the
 * next local change, foreground or sign-in tries again, and local progress is
 * never lost because the merge is a pure union.
 */
export function createProgressSync(adapter: ProgressSyncAdapter, options: ProgressSyncOptions = {}): ProgressSync {
  const debounceMs = options.debounceMs ?? 2000;
  const maxWaitMs = options.maxWaitMs ?? 15000;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<ProgressListener>();

  let uid: string | null = null;
  let epoch = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0;
  let inFlight: Promise<void> | null = null;
  let rerun = false;
  let lastSyncAt = 0;
  // Guards against a write loop if local and remote ever disagreed forever.
  let mismatchStreak = 0;

  function emit() {
    for (const listener of Array.from(listeners)) {
      try {
        listener(uid);
      } catch {
        /* a broken screen must not break sync */
      }
    }
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (!uid) return;
    const t = now();
    if (!firstDirtyAt) firstDirtyAt = t;
    clearTimer();
    const wait = Math.max(0, Math.min(debounceMs, firstDirtyAt + maxWaitMs - t));
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, wait);
  }

  function run(): Promise<void> {
    if (!uid) return Promise.resolve();
    clearTimer();
    firstDirtyAt = 0;
    if (inFlight) {
      rerun = true;
      return inFlight;
    }
    const myUid = uid;
    const myEpoch = epoch;
    const flight = (async () => {
      try {
        const local = await readLocalProgress(adapter, myUid);
        if (myEpoch !== epoch) return;
        const merged = await adapter.syncRemote(myUid, local);
        if (myEpoch !== epoch) return;
        const result = await mergeIntoLocalProgress(adapter, myUid, merged);
        lastSyncAt = now();
        if (myEpoch !== epoch) return;
        if (result.changed) emit();
        if (progressEquals(result.doc, merged)) {
          mismatchStreak = 0;
        } else if (++mismatchStreak <= 3) {
          // Something was saved locally while we were on the network.
          rerun = true;
        }
      } catch (error) {
        try {
          adapter.onError?.(error);
        } catch {
          /* ignore */
        }
      }
    })();
    inFlight = flight.finally(() => {
      inFlight = null;
      if (rerun && uid) {
        rerun = false;
        schedule();
      }
    });
    return inFlight;
  }

  return {
    start(nextUid) {
      if (!nextUid || nextUid === uid) return;
      epoch += 1;
      clearTimer();
      firstDirtyAt = 0;
      rerun = false;
      mismatchStreak = 0;
      lastSyncAt = 0;
      uid = nextUid;
      emit();
      void run();
    },
    stop() {
      if (!uid) return;
      epoch += 1;
      clearTimer();
      firstDirtyAt = 0;
      rerun = false;
      uid = null;
      emit();
    },
    markDirty(forUid) {
      if (!uid || forUid !== uid) return;
      if (inFlight) {
        rerun = true;
        return;
      }
      schedule();
    },
    syncNow() {
      return run();
    },
    refreshIfStale(maxAgeMs) {
      if (!uid || now() - lastSyncAt < maxAgeMs) return Promise.resolve();
      return run();
    },
    activeUid() {
      return uid;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
