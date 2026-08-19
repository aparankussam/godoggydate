import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { isProActive, type Entitlements } from '../../../../../shared/pro';

// "Pet Twin" — a daily, personality-grounded card written in the dog's voice.
//
// THE RULE THAT KEEPS THIS FROM BECOMING DAY-30 SLOP (the whole reason the
// feature survived review): every card is GROUNDED in a real datum that already
// accrues with zero manual logging — a reminder due or just completed, a real
// on-time streak, the dog's Dogtype/energy, the Founding Pack number, or the
// day/season — and that grounding is shown to the user as a visible source
// chip. A timer-driven reroll of the static profile would violate the app's
// no-personality-that-changes-on-reload rule; grounding in changing real state
// is what makes the card provably react to something true.
//
// Cadence is server-enforced: free = one card per week, Pro = one per day.
// Cards are written ONLY here (Admin SDK) to dogs/{uid}/moments — the client is
// read-only (firestore.rules), exactly like the guarded Vibe Check .ai field.
//
// Model + pipeline clone web/app/api/ai/vibe-check/route.ts: Gemini Flash, ID-
// token auth, responseSchema, sanitizer, banned-slop list, merge-safe writes.

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
const PROMPT_VERSION = 'v1';

const PRO_INTERVAL_MS = 20 * 60 * 60 * 1000;      // ~daily for Pro
const FREE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // ~weekly for free
// Short generation lock — separate from the cadence interval. It exists only to
// stop a concurrent burst from all passing the cadence check and each calling
// Gemini (cost/DoS) and each writing a moment. It auto-expires, so a failed
// generation never locks the user out for a whole cadence interval.
const GEN_LOCK_MS = 90 * 1000;

const BANNED_PHRASES = [
  'furry friend', 'pawsome', 'fur baby', 'best friend forever',
  'tail-wagging', "whether you're", 'unleash', 'paw-some', 'furbaby',
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function seasonFor(monthIndex: number): string {
  if (monthIndex <= 1 || monthIndex === 11) return 'winter';
  if (monthIndex <= 4) return 'spring';
  if (monthIndex <= 7) return 'summer';
  return 'autumn';
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function parseEntitlements(data: unknown): Entitlements {
  if (!data || typeof data !== 'object') return { lifetimeChatUnlocks: false, pro: null };
  const d = data as Record<string, unknown>;
  const proRaw = d.pro as Record<string, unknown> | undefined;
  return {
    lifetimeChatUnlocks: Boolean(d.lifetimeChatUnlocks),
    pro: proRaw
      ? {
          active: proRaw.active === true,
          currentPeriodEndMs:
            typeof proRaw.currentPeriodEndMs === 'number' ? proRaw.currentPeriodEndMs : undefined,
        }
      : null,
  };
}

// ── Grounding: pick a REAL datum this card must react to ─────────────────────

interface Grounding {
  kind: string;
  /** Shown to the user verbatim as the source chip. Must be literally true. */
  label: string;
  /** Fed to the model as the thing to react to. */
  detail: string;
}

interface ReminderLite {
  label?: string;
  dueDate?: number;
  currentStreak?: number;
  lastCompletedAt?: number;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function chooseGrounding(
  dog: Record<string, unknown>,
  reminders: ReminderLite[],
  nowMs: number,
): Grounding {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = startOfLocalDay(nowMs);

  // 1) A reminder due today or tomorrow — the most "today" thing there is.
  const dueSoon = reminders
    .filter((r) => typeof r.dueDate === 'number')
    .map((r) => ({ r, days: Math.round((startOfLocalDay(r.dueDate as number) - today) / dayMs) }))
    .filter((x) => x.days >= 0 && x.days <= 1)
    .sort((a, b) => a.days - b.days)[0];
  if (dueSoon?.r.label) {
    const when = dueSoon.days === 0 ? 'due today' : 'due tomorrow';
    return { kind: 'reminder_due', label: `${dueSoon.r.label} is ${when}`, detail: `Your care reminder "${dueSoon.r.label}" is ${when}.` };
  }

  // 2) A real on-time streak worth being proud of.
  const streaked = reminders
    .filter((r) => typeof r.currentStreak === 'number' && (r.currentStreak as number) >= 2)
    .sort((a, b) => (b.currentStreak as number) - (a.currentStreak as number))[0];
  if (streaked?.label) {
    return { kind: 'streak', label: `${streaked.currentStreak} in a row on ${streaked.label}`, detail: `You're on a ${streaked.currentStreak}-in-a-row streak keeping up "${streaked.label}".` };
  }

  // 3) The dog's own Dogtype/archetype from Vibe Check.
  const ai = dog.ai as { vibeCheck?: { archetype?: { name?: string } } } | undefined;
  const archetype = ai?.vibeCheck?.archetype?.name;
  if (archetype) {
    return { kind: 'archetype', label: `your ${archetype} energy`, detail: `Your owner-known personality: a "${archetype}".` };
  }

  // 4) Energy + a play style.
  const energy = typeof dog.energyLevel === 'number' ? dog.energyLevel : undefined;
  const playStyles = Array.isArray(dog.playStyles) ? (dog.playStyles as string[]) : [];
  if (energy !== undefined) {
    const play = playStyles[0] ? `, into ${playStyles[0]}` : '';
    return { kind: 'personality', label: `${energy}/100 energy${play}`, detail: `Your energy is ${energy} out of 100${play}.` };
  }

  // 5) Founding Pack number.
  if (typeof dog.foundingPackNumber === 'number') {
    return { kind: 'founding', label: `Founding Pack #${dog.foundingPackNumber}`, detail: `You're Founding Pack #${dog.foundingPackNumber} — one of the very first dogs here.` };
  }

  // 6) Absolute fallback: the day itself (still real).
  const day = DAYS[new Date(nowMs).getDay()];
  return { kind: 'day', label: `it's ${day}`, detail: `Today is ${day}.` };
}

// ── Gemini plumbing (text-only) ──────────────────────────────────────────────

const TWIN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    thought: { type: 'STRING', description: "1-2 sentences in the dog's own voice (first person), reacting to the provided real fact. Specific, warm, a little funny. Never generic pet-copy." },
    mood: { type: 'STRING', description: 'One or two words for the mood, e.g. "cautiously optimistic".' },
    moodEmoji: { type: 'STRING', description: 'A single emoji for the mood.' },
  },
  required: ['thought', 'mood', 'moodEmoji'],
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

interface TwinContent {
  thought: string;
  mood: string;
  moodEmoji: string;
}

function firstEmoji(value: string): string {
  const chars = Array.from(value.trim());
  return chars[0] ?? '🐾';
}

function sanitizeTwin(raw: unknown): TwinContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const thought = typeof r.thought === 'string' ? r.thought.trim().slice(0, 300) : '';
  const mood = typeof r.mood === 'string' ? r.mood.trim().slice(0, 40) : '';
  const moodEmoji = typeof r.moodEmoji === 'string' ? firstEmoji(r.moodEmoji) : '🐾';
  if (!thought || !mood) return null;
  if (BANNED_PHRASES.some((p) => thought.toLowerCase().includes(p))) return null;
  return { thought, mood, moodEmoji };
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
    console.error('pet-twin auth failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('pet-twin: GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'Pet Twin is not configured yet' }, { status: 503 });
  }

  const db = getAdminDb();
  const nowMs = Date.now();

  // Load the dog, its entitlements, and reminders in parallel.
  let dogSnap, entSnap, remindersSnap;
  try {
    [dogSnap, entSnap, remindersSnap] = await Promise.all([
      db.doc(`dogs/${uid}`).get(),
      db.doc(`users/${uid}/private/entitlements`).get(),
      db.collection(`dogs/${uid}/reminders`).get(),
    ]);
  } catch (error) {
    console.error('pet-twin: failed to load dog data', error);
    return NextResponse.json({ error: 'Could not load your dog just now — try again.' }, { status: 503 });
  }

  if (!dogSnap.exists) {
    return NextResponse.json({ error: 'Create your dog profile first' }, { status: 404 });
  }
  const dog = dogSnap.data() as Record<string, unknown>;
  const dogName = typeof dog.name === 'string' ? dog.name : 'your dog';

  const isPro = isProActive(parseEntitlements(entSnap.exists ? entSnap.data() : null), nowMs);
  const interval = isPro ? PRO_INTERVAL_MS : FREE_INTERVAL_MS;

  // Cadence gate — return the current card rather than regenerating.
  const latestSnap = await db
    .collection(`dogs/${uid}/moments`)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  const latest = latestSnap.docs[0];
  const latestCreatedAt = latest?.get('createdAt');
  const latestMs = typeof latestCreatedAt === 'number' ? latestCreatedAt : 0;
  const throttledPayload = latest
    ? { moment: { id: latest.id, ...latest.data() }, throttled: true, isPro, nextAllowedMs: latestMs + interval }
    : { moment: null, throttled: true, isPro, nextAllowedMs: nowMs + interval };

  if (latest && nowMs - latestMs < interval) {
    return NextResponse.json(throttledPayload);
  }

  // Atomically claim a short generation slot so a concurrent burst can't all
  // pass the cadence check above and each fire Gemini + write a moment. Only the
  // winner generates; the rest get the current card (or an "in progress" null
  // the client's realtime listener resolves once the winner's card lands).
  const lockRef = db.doc(`dogs/${uid}/petTwinState/state`);
  const wonSlot = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const lastReserved = snap.exists && typeof snap.get('lastReservedAtMs') === 'number'
      ? (snap.get('lastReservedAtMs') as number)
      : 0;
    if (nowMs - lastReserved < GEN_LOCK_MS) return false;
    tx.set(lockRef, { lastReservedAtMs: nowMs }, { merge: true });
    return true;
  });
  if (!wonSlot) {
    return NextResponse.json(throttledPayload);
  }

  const reminders = remindersSnap.docs.map((d) => d.data() as ReminderLite);
  const grounding = chooseGrounding(dog, reminders, nowMs);
  const now = new Date(nowMs);
  const day = DAYS[now.getDay()];
  const season = seasonFor(now.getMonth());

  const systemPrompt = `You write a short daily "what I'm thinking today" note in a specific dog's own voice for GoDoggyDate. It is openly imaginative — an affectionate guess at the dog's inner monologue, never a factual claim about the dog's mind.
Rules:
- Write in the FIRST PERSON as the dog. 1-2 sentences. Warm, specific, a little funny.
- You MUST react to the one REAL FACT provided. Do not invent events, outings, or feelings that aren't implied by that fact plus the dog's known traits.
- Never diagnose health, never call the dog aggressive/dangerous, never give medical advice.
- No generic pet-copy. Banned phrases (never use, any form): ${BANNED_PHRASES.join(', ')}.`;

  const userPrompt = `Dog: ${dogName}${dog.breed ? `, a ${dog.breed}` : ''}${dog.size ? `, size ${dog.size}` : ''}.
Real fact to react to: ${grounding.detail}
Ambient: it's ${day}, ${season}.
Write ${dogName}'s note now.`;

  // Release the generation slot so a retry after a failure isn't a silent 90s
  // no-op (the lock only exists to serialize concurrent bursts, not to punish
  // a failed attempt — without this, a user tapping again just sees nothing).
  const releaseLock = async () => {
    try { await lockRef.set({ lastReservedAtMs: 0 }, { merge: true }); } catch { /* best effort */ }
  };

  // Try the configured model, then known-good fallbacks — a wrong/unavailable
  // GEMINI_MODEL is the most common prod cause and shouldn't kill the feature.
  // Ordered newest→older; 'gemini-flash-latest' is an alias that always resolves
  // to the current flash model, so it survives Google retiring specific versions
  // (1.5 is already retired as of 2025).
  const modelCandidates = Array.from(new Set([
    GEMINI_MODEL,
    'gemini-3.6-flash',      // current as of 2026-08 (older flash versions are retired)
    'gemini-flash-latest',   // alias — survives future version bumps
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
            ...(useSchema ? { responseSchema: TWIN_SCHEMA } : {}),
            maxOutputTokens: 512,
            temperature: 1.1,
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const modelMissing = res.status === 404 || /not found|not supported/i.test(body);
      return { ok: false as const, status: res.status, body, modelMissing };
    }
    return { ok: true as const, data: (await res.json()) as GeminiResponse };
  };

  let content: TwinContent | null = null;
  let usedModel = GEMINI_MODEL;
  let lastStatus = 0;
  let lastDetail = '';

  for (const model of modelCandidates) {
    if (content) break;
    // First attempt with the strict schema; a second without it recovers from a
    // model that returns valid-but-unschematized JSON.
    for (const useSchema of [true, false]) {
      let attempt;
      try {
        attempt = await requestGemini(model, useSchema);
      } catch (error) {
        lastDetail = `network: ${String(error).slice(0, 120)}`;
        console.error('pet-twin: Gemini call threw', model, error);
        continue;
      }
      if (!attempt.ok) {
        lastStatus = attempt.status;
        lastDetail = attempt.body.slice(0, 200);
        console.error('pet-twin: Gemini API error', model, attempt.status, lastDetail);
        // A rejected key / permission / bad request is not fixable by retrying a
        // different model — surface it clearly and stop.
        if ([400, 401, 403].includes(attempt.status)) {
          await releaseLock();
          return NextResponse.json(
            { error: "Pet Twin's AI isn't set up correctly yet — please try again later. (Admin: GEMINI_API_KEY was rejected.)" },
            { status: 502 },
          );
        }
        if (attempt.status === 429) {
          await releaseLock();
          return NextResponse.json(
            { error: "Pet Twin is taking a quick nap — this one's on us. Try again in a bit." },
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
      const c = sanitizeTwin(parsed);
      if (c) { content = c; usedModel = model; break; }
      lastDetail = 'sanitize-failed';
    }
  }

  if (!content) {
    await releaseLock();
    console.error('pet-twin: generation failed after all models', lastStatus, lastDetail);
    return NextResponse.json({ error: 'Could not write today\'s card — try again in a moment.' }, { status: 502 });
  }

  const moment = {
    thought: content.thought,
    mood: content.mood,
    moodEmoji: content.moodEmoji,
    sourceKind: grounding.kind,
    sourceLabel: grounding.label,
    createdAt: nowMs,
    model: usedModel,
    promptVersion: PROMPT_VERSION,
  };

  try {
    const ref = await db.collection(`dogs/${uid}/moments`).add({
      ...moment,
      serverCreatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ moment: { id: ref.id, ...moment }, throttled: false, isPro });
  } catch (error) {
    await releaseLock();
    console.error('pet-twin: failed to persist moment', error);
    return NextResponse.json({ error: 'Wrote the card but could not save it — try again' }, { status: 500 });
  }
}
