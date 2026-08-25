import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { computeDogtype } from '../../../../../shared/dogtype';
import { computeMilestones, type Milestone } from '../../../../../shared/milestones';

// "The Gotcha Day Letter" — a warm, ~150-word keepsake letter written FROM the
// dog to its human, for a real occasion the owner actually entered: a Gotcha
// Day (adoption anniversary) or a birthday. It is openly AI-written, in the
// dog's voice, and it NEVER invents events — it riffs only on the real facts
// stored on the profile (breed, temperament, play style, the number of years
// since the dog came home / its age). There is no "remember that trip to the
// lake" because there is no lake in the data; manufacturing a specific memory
// is exactly the fabrication the brand forbids.
//
// Pipeline is a near-clone of web/app/api/ai/apology/route.ts: Gemini Flash,
// ID-token auth, responseSchema, sanitizer, banned-slop list, a short per-uid
// anti-burst lock AND a rolling-24h volume cap, and a hard per-request call
// ceiling. What's different: a keepsake letter for a given occasion should be
// STABLE (a letter that rerolls every visit is neither a keepsake nor on-brand),
// so the result is CACHED per occasion — the first request for this year's
// Gotcha Day generates it, every later request returns the same letter with no
// Gemini call and no cap consumption. Next year's occasion is a new cache key.

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
const PROMPT_VERSION = 'v1';

// Short per-uid anti-burst lock — stops a rapid double-tap (or scripted burst)
// from each passing straight to Gemini. Expires fast; a failed generation
// releases it immediately so a retry after a failure isn't a dead tap.
const GEN_LOCK_MS = 6 * 1000;

// Per-uid VOLUME cap (separate from the anti-burst lock): the lock only stops
// parallel double-taps, it does NOT bound serial cost. Caching means a normal
// owner spends at most one generation per real occasion, so this cap only ever
// bites an account deliberately churning distinct occasions to burn credits.
const DAILY_CAP = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// Hard ceiling on paid Gemini calls per single HTTP request, so a request whose
// output reliably fails safety/sanitize can't fan out across the whole
// model x schema matrix (each cell is a paid call).
const MAX_GEMINI_CALLS = 3;

// How near (in days) a birthday / Gotcha Day has to be for a letter to be
// offered. Kept in sync with the client gate in web/lib/letter.ts so the
// section only shows the button when the server will actually honour it.
const LETTER_WINDOW_DAYS = 30;

const BANNED_PHRASES = [
  'furry friend', 'pawsome', 'fur baby', 'best friend forever',
  'tail-wagging', "whether you're", 'unleash', 'paw-some', 'furbaby',
];

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

// ── Gemini plumbing (text-only) ──────────────────────────────────────────────

const LETTER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    salutation: { type: 'STRING', description: "A warm one-line opening addressed to the dog's human/family, in the FIRST PERSON as the dog, e.g. \"Dear my favorite human,\". No name is known for the human, so keep it affectionate and general." },
    body: { type: 'STRING', description: 'The letter body in the FIRST PERSON as the dog, warm and heartfelt for its Gotcha Day or birthday. About 150 words (about 80 if the supplied facts are sparse). Grounded ONLY in the real facts supplied — the years together, the dog\'s breed/temperament/play style. NEVER invents specific events, outings, memories, or people that are not in the facts.' },
    signOff: { type: 'STRING', description: 'A short closing line in the dog\'s voice ending with a paw print, e.g. "With all my love, Rex 🐾".' },
  },
  required: ['salutation', 'body', 'signOff'],
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

interface LetterContent {
  salutation: string;
  body: string;
  signOff: string;
}

function ensurePaw(value: string, dogName: string): string {
  const trimmed = value.trim().slice(0, 90);
  if (!trimmed) return `— ${dogName} 🐾`;
  return /🐾/.test(trimmed) ? trimmed : `${trimmed} 🐾`;
}

function sanitizeLetter(raw: unknown, dogName: string): LetterContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const salutationRaw = typeof r.salutation === 'string' ? r.salutation.trim().slice(0, 120) : '';
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 1400) : '';
  const signOffRaw = typeof r.signOff === 'string' ? r.signOff : '';
  if (!body) return null;
  const salutation = salutationRaw || `Dear my human,`;
  const hay = `${salutation}\n${body}`.toLowerCase();
  if (BANNED_PHRASES.some((p) => hay.includes(p))) return null;
  // Backstop the prompt: a gotcha-day keepsake must never dramatize the dog's
  // pre-adoption trauma or its mortality. Specific terms only, so an adoption-
  // positive letter ("the day I came home") is never falsely rejected.
  const BANNED_TOPICS = [
    'shelter', 'abandon', 'abuse', 'trauma', 'neglect', 'stray', 'kennel',
    'surrender', 'euthan', 'cancer', 'tumor', 'surgery', 'dying',
    'passed away', 'rainbow bridge', 'illness', 'disease',
  ];
  // Word-boundary — "stray" must not match "strayed"/"astray", "dying" must not
  // match "undying", etc., or a heartfelt letter fails sanitize ("could not write").
  const bannedRe = new RegExp(`\\b(${BANNED_TOPICS.join('|')})\\b`, 'i');
  if (bannedRe.test(hay)) return null;
  return { salutation, body, signOff: ensurePaw(signOffRaw, dogName) };
}

// Pick the milestone a letter should celebrate: a birthday or Gotcha Day that is
// active now, or coming up within the window. Prefers the caller's requested
// kind when it maps to a real, near occasion; otherwise the soonest one. Returns
// null when nothing real is near — the letter is never offered for a made-up date.
function pickLetterMilestone(
  input: Parameters<typeof computeMilestones>[0],
  requestedKind: string | null,
  nowMs: number,
): Milestone | null {
  const { active, next } = computeMilestones(input, nowMs);
  const list: Milestone[] = [...active];
  if (next) list.push(next);
  const candidates = list.filter(
    (m) => (m.kind === 'gotcha' || m.kind === 'birthday') &&
      (m.isActive || m.daysUntil <= LETTER_WINDOW_DAYS),
  );
  if (candidates.length === 0) return null;
  const ranked = candidates.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.daysUntil - b.daysUntil;
  });
  if (requestedKind === 'gotcha' || requestedKind === 'birthday') {
    const wanted = ranked.find((m) => m.kind === requestedKind);
    if (wanted) return wanted;
  }
  return ranked[0];
}

function cacheKeyFor(m: Milestone): string {
  return `${m.kind}-${new Date(m.date).getFullYear()}`;
}

export async function POST(request: Request) {
  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ error: 'Missing Firebase ID token' }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(bearerToken)).uid;
  } catch (error) {
    console.error('letter auth failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('letter: GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'The letter writer is not configured yet' }, { status: 503 });
  }

  // The only client input: which occasion (optional) the owner tapped. It is
  // validated against the real milestones computed below — never trusted to
  // conjure a date the stored profile doesn't support.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const requestedKind = typeof (body as Record<string, unknown>)?.kind === 'string'
    ? ((body as Record<string, unknown>).kind as string).trim()
    : null;

  const db = getAdminDb();
  const nowMs = Date.now();

  // Load the dog for its name/breed/dates/Dogtype. Wrapped in try/catch like apology.
  let dogSnap;
  try {
    dogSnap = await db.doc(`dogs/${uid}`).get();
  } catch (error) {
    console.error('letter: failed to load dog data', error);
    return NextResponse.json({ error: 'Could not load your dog just now — try again.' }, { status: 503 });
  }
  if (!dogSnap.exists) {
    return NextResponse.json({ error: 'Create your dog profile first' }, { status: 404 });
  }
  const dog = dogSnap.data() as Record<string, unknown>;
  const dogName = typeof dog.name === 'string' && dog.name.trim() ? dog.name.trim() : 'Your dog';
  const breed = typeof dog.breed === 'string' ? dog.breed.trim() : '';
  const temperament = Array.isArray(dog.temperament)
    ? (dog.temperament as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 6)
    : [];
  const playStyles = Array.isArray(dog.playStyles)
    ? (dog.playStyles as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 6)
    : [];
  const dogtype = computeDogtype(dog as Parameters<typeof computeDogtype>[0]);

  // Which real occasion are we writing for? Server recomputes from stored dates
  // so a client can't ask for a letter dated to nothing.
  const milestone = pickLetterMilestone(
    {
      name: dogName,
      birthYear: typeof dog.birthYear === 'number' ? dog.birthYear : undefined,
      birthMonth: typeof dog.birthMonth === 'number' ? dog.birthMonth : undefined,
      adoptionDate: typeof dog.adoptionDate === 'string' ? dog.adoptionDate : null,
      createdAt: typeof dog.createdAt === 'number' ? dog.createdAt : undefined,
    },
    requestedKind,
    nowMs,
  );
  if (!milestone) {
    return NextResponse.json(
      { error: `No Gotcha Day or birthday is coming up for ${dogName} yet — add the date on your profile.` },
      { status: 400 },
    );
  }
  const cacheKey = cacheKeyFor(milestone);
  const occasion = milestone.title;
  const occasionSubtitle = milestone.subtitle;

  const stateRef = db.doc(`dogs/${uid}/letterState/state`);

  // ── Cache hit: this occasion's letter already exists. Return it verbatim,
  // no Gemini call, no cap consumption. This is what makes the letter a stable
  // keepsake rather than a slot machine. ──
  try {
    const existing = await stateRef.get();
    const cache = existing.exists ? existing.get('cache') : null;
    if (cache && typeof cache === 'object' && (cache as Record<string, unknown>).key === cacheKey) {
      const c = cache as Record<string, unknown>;
      const cached = sanitizeLetter(c, dogName);
      if (cached) {
        return NextResponse.json({
          ...cached,
          dogName,
          occasion: typeof c.occasion === 'string' ? c.occasion : occasion,
          occasionSubtitle: typeof c.occasionSubtitle === 'string' ? c.occasionSubtitle : occasionSubtitle,
          kind: milestone.kind,
          sparse: c.sparse === true,
          cached: true,
          model: typeof c.model === 'string' ? c.model : undefined,
          promptVersion: typeof c.promptVersion === 'string' ? c.promptVersion : PROMPT_VERSION,
        });
      }
    }
  } catch (error) {
    // A failed cache read shouldn't block generation — worst case is one extra
    // Gemini call that then repopulates the cache.
    console.error('letter: cache read failed', error);
  }

  // Atomically claim a short generation slot AND enforce the rolling-24h volume
  // cap — identical shape to apology's lock transaction.
  let gate: 'ok' | 'burst' | 'capped' = 'ok';
  try {
    gate = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      const lastReserved = snap.exists && typeof snap.get('lastReservedAtMs') === 'number'
        ? (snap.get('lastReservedAtMs') as number) : 0;
      if (nowMs - lastReserved < GEN_LOCK_MS) return 'burst' as const;

      const windowStart = snap.exists && typeof snap.get('windowStartMs') === 'number'
        ? (snap.get('windowStartMs') as number) : 0;
      const priorCount = snap.exists && typeof snap.get('count') === 'number'
        ? (snap.get('count') as number) : 0;
      const inWindow = nowMs - windowStart < DAY_MS;
      const count = inWindow ? priorCount : 0;
      if (count >= DAILY_CAP) return 'capped' as const;

      tx.set(stateRef, {
        lastReservedAtMs: nowMs,
        windowStartMs: inWindow ? windowStart : nowMs,
        count: count + 1,
      }, { merge: true });
      return 'ok' as const;
    });
  } catch (error) {
    console.error('letter: lock transaction failed', error);
    gate = 'ok';
  }
  if (gate === 'burst') {
    return NextResponse.json(
      { error: `${dogName} is still choosing the right words — try again in a moment.` },
      { status: 429 },
    );
  }
  if (gate === 'capped') {
    return NextResponse.json(
      { error: `${dogName} has written enough letters for one day — try again tomorrow.` },
      { status: 429 },
    );
  }

  // Release the generation slot so a retry after a failure isn't a silent no-op.
  const releaseLock = async () => {
    try { await stateRef.set({ lastReservedAtMs: 0 }, { merge: true }); } catch { /* best effort */ }
  };

  // Sparse = almost nothing to ground on beyond the occasion itself. The letter
  // then stays SHORTER and honest rather than padding with invented colour.
  const sparse = !breed && temperament.length === 0 && playStyles.length === 0;

  const facts: string[] = [];
  if (breed) facts.push(`Breed: ${breed}.`);
  if (typeof milestone.years === 'number') {
    if (milestone.kind === 'gotcha') facts.push(`Years since ${dogName} came home: ${milestone.years}.`);
    else facts.push(`Age ${dogName} is turning: ${milestone.years}.`);
  }
  if (temperament.length) facts.push(`Temperament words the owner chose: ${temperament.join(', ')}.`);
  if (playStyles.length) facts.push(`How ${dogName} plays: ${playStyles.join(', ')}.`);
  if (dogtype) facts.push(`Playful "Dogtype": ${dogtype.name} — ${dogtype.tagline}.`);
  const factBlock = facts.length ? facts.join('\n') : '(No extra profile details were provided.)';

  const targetWords = sparse ? 'about 80 words' : 'about 150 words';

  const systemPrompt = `You write a warm, heartfelt keepsake LETTER for GoDoggyDate, in the FIRST PERSON as the family dog, addressed to its human. The occasion is a real one the owner entered: a Gotcha Day (adoption anniversary) or a birthday. It is openly AI-written but it must feel sincere and personal.
Rules:
- Write ${targetWords} in the body, plus a short salutation and a sign-off. Warm, loving, a little playful — the voice of a devoted dog, not greeting-card mush.
- Ground EVERYTHING in the real facts supplied below. You may speak generally about love, home, belonging, naps, walks, and being together, because those are universal to a dog's life — but you must NEVER invent SPECIFIC events, trips, names, places, gifts, or memories that are not in the facts. If you don't know a detail, don't make one up.
- This is a celebration of the occasion. Keep it entirely positive and gentle.
- NEVER mention or joke about the dog's weight, body, or appearance. NEVER reference, dramatize, or make light of a rescue dog's past — trauma, abuse, abandonment, or shelter history. For a Gotcha Day you may lovingly mark "the day I came home" / "the day we found each other," but do NOT describe or invent what came before it.
- NEVER mention health, illness, injury, aging as decline, or the dog's mortality. No medical content. Keep it light and alive.
- No profanity. Stay unmistakably in a sweet dog's voice.
- End the "signOff" with a paw-print signature in the dog's voice.
- No generic pet-copy. Banned phrases (never use, any form): ${BANNED_PHRASES.join(', ')}.`;

  const userPrompt = `Occasion: ${occasion} — ${occasionSubtitle}.
Dog's name: ${dogName}.
Real facts to ground the letter (use only these; invent nothing beyond them):
${factBlock}

Write ${dogName}'s ${milestone.kind === 'gotcha' ? 'Gotcha Day' : 'birthday'} letter now — a salutation, ${targetWords} of body, and a sign-off.`;

  const modelCandidates = Array.from(new Set([
    GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
  ]));

  const requestGemini = async (model: string, useSchema: boolean) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(useSchema ? { responseSchema: LETTER_SCHEMA } : {}),
            // Flash models spend part of maxOutputTokens "thinking" before
            // writing the answer; this letter doesn't need that reasoning,
            // and without it the real JSON was getting truncated mid-string
            // (silent generation failures in prod, 2026-08-25). Disable it.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 896,
            temperature: 0.9,
          },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const modelMissing = res.status === 404 || /not found|not supported/i.test(errBody);
      return { ok: false as const, status: res.status, body: errBody, modelMissing };
    }
    return { ok: true as const, data: (await res.json()) as GeminiResponse };
  };

  let content: LetterContent | null = null;
  let usedModel = GEMINI_MODEL;
  let lastStatus = 0;
  let lastDetail = '';
  let calls = 0;

  for (const model of modelCandidates) {
    if (content) break;
    for (const useSchema of [true, false]) {
      if (calls >= MAX_GEMINI_CALLS) break;
      calls++;
      let attempt;
      try {
        attempt = await requestGemini(model, useSchema);
      } catch (error) {
        lastDetail = `network: ${String(error).slice(0, 120)}`;
        console.error('letter: Gemini call threw', model, error);
        continue;
      }
      if (!attempt.ok) {
        lastStatus = attempt.status;
        lastDetail = attempt.body.slice(0, 200);
        console.error('letter: Gemini API error', model, attempt.status, lastDetail);
        if ([400, 401, 403].includes(attempt.status)) {
          await releaseLock();
          return NextResponse.json(
            { error: "The letter writer isn't set up correctly yet — please try again later. (Admin: GEMINI_API_KEY was rejected.)" },
            { status: 502 },
          );
        }
        if (attempt.status === 429) {
          await releaseLock();
          return NextResponse.json(
            { error: `${dogName} is taking a quick nap — try again in a bit.` },
            { status: 503 },
          );
        }
        if (attempt.modelMissing) break; // this model doesn't exist — try the next one
        continue;
      }
      const data = attempt.data;
      if (data.promptFeedback?.blockReason) { lastDetail = `blocked: ${data.promptFeedback.blockReason}`; continue; }
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason && BLOCKED_FINISH.has(candidate.finishReason)) { lastDetail = `finish: ${candidate.finishReason}`; continue; }
      const rawText = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      let parsed: unknown;
      try { parsed = JSON.parse(rawText); } catch { lastDetail = `non-json: ${rawText.slice(0, 80)}`; continue; }
      const c = sanitizeLetter(parsed, dogName);
      if (c) { content = c; usedModel = model; break; }
      lastDetail = 'sanitize-failed';
    }
  }

  await releaseLock();

  if (!content) {
    console.error('letter: generation failed after all models', lastStatus, lastDetail);
    return NextResponse.json({ error: 'Could not write the letter — try again in a moment.' }, { status: 502 });
  }

  // Persist to the per-occasion cache so every later visit returns THIS letter.
  try {
    await stateRef.set({
      cache: {
        key: cacheKey,
        salutation: content.salutation,
        body: content.body,
        signOff: content.signOff,
        occasion,
        occasionSubtitle,
        kind: milestone.kind,
        sparse,
        model: usedModel,
        promptVersion: PROMPT_VERSION,
        createdAtMs: nowMs,
      },
    }, { merge: true });
  } catch (error) {
    // Non-fatal: the owner still gets this letter now; a later visit just
    // regenerates (and tries to cache again) instead of hitting the cache.
    console.error('letter: cache write failed', error);
  }

  return NextResponse.json({
    salutation: content.salutation,
    body: content.body,
    signOff: content.signOff,
    dogName,
    occasion,
    occasionSubtitle,
    kind: milestone.kind,
    sparse,
    cached: false,
    model: usedModel,
    promptVersion: PROMPT_VERSION,
  });
}
