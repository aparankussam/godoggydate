import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { resolveBreed } from '../../../../../shared/types/breeds';
import type { DogSize, DogVibeCheck, PlayStyle } from '../../../../../shared/types';

// "Vibe Check" onboarding: 1-3 photos in, a finished profile out. This is the
// single highest-leverage AI feature in the Phase 0 build — it converts the
// app's biggest drop-off (a 15-field form before any payoff) into a moment
// that delivers real value at N=1, with zero other users required. See the
// research notes captured 2026-07-25 for the full rationale.
//
// Model: Google Gemini Flash. Chosen deliberately for the pre-seed stage —
// it has a genuine no-card free tier that comfortably covers soft-launch
// volume, and its vision + JSON-schema output is well suited to this bounded
// extraction (photo in → structured profile out). The quality bar this
// feature must clear is enforced downstream by sanitizeVibeCheck + the
// banned-phrase list, not by the model tier, so a Flash-class model is the
// right cost/quality point here. Revisit if this becomes a paid, high-volume
// surface.
//
// The exact model id is env-overridable so the free-tier model can be swapped
// (or bumped to a newer Flash) without a code change — set GEMINI_MODEL in the
// host env to override the default.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
const PROMPT_VERSION = 'v1';

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB per photo, pre-base64
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const VALID_PLAY_STYLES: PlayStyle[] = [
  'loves fetch 🎾',
  'wrestling 🤼',
  'gentle play 🐾',
  'high-energy runner ⚡',
  'calm 🧘',
  'explorer 👃',
];

const VALID_SIZES: DogSize[] = ['S', 'M', 'L', 'XL'];

// Gen Z/Alpha antipattern from the research: advertising the AI, and
// content-farm phrasing ("furry friend", "pawsome", "whether you're X or Y")
// read as slop and are worse than the plain form they replace.
const BANNED_PHRASES = [
  'furry friend',
  'pawsome',
  'fur baby',
  'best friend forever',
  'tail-wagging',
  "whether you're",
  'unleash',
  'paw-some',
];

interface VibeCheckRequestPhoto {
  dataUri: string; // "data:image/jpeg;base64,...."
}

interface VibeCheckRequestBody {
  photos: VibeCheckRequestPhoto[];
  name?: string;
}

// Gemini responseSchema (OpenAPI subset). Deliberately shape-only: it pins the
// keys, types, and nesting but pushes value bounds (0-100 energy, max array
// lengths) into descriptions rather than schema constraints, because Gemini's
// schema support for numeric/array constraints is partial and an unsupported
// keyword can 400 the whole request. sanitizeVibeCheck below is the real
// enforcement layer — it clamps, filters, and rejects — so the schema only has
// to guarantee the model returns the right *shape*. `enum` on the simple
// string fields is well-supported and worth keeping for output quality.
const VIBE_CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    breedGuess: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Your best single breed or mix guess, e.g. "Labrador Retriever" or "Goldendoodle".' },
        confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      },
      required: ['name', 'confidence'],
    },
    sizeEstimate: { type: 'STRING', enum: ['S', 'M', 'L', 'XL'] },
    energyEstimate: { type: 'INTEGER', description: 'Guessed energy level from body language/build, 0=couch potato, 100=zoomies machine.' },
    playStyleGuesses: {
      type: 'ARRAY',
      description: 'Up to 3 play styles.',
      items: { type: 'STRING', enum: VALID_PLAY_STYLES },
    },
    temperamentGuesses: {
      type: 'ARRAY',
      description: 'Up to 4 short temperament words.',
      items: { type: 'STRING' },
    },
    bio: {
      type: 'STRING',
      description: "A 1-3 sentence bio written IN THE DOG'S VOICE (first person, as the dog). Specific and a little funny. Grounded in what you can actually see. Never generic pet-copy phrasing.",
    },
    archetype: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'A punchy 2-3 word named archetype, e.g. "Chaos Gremlin" or "Velvet Couch Potato". Specific to this dog, not generic.' },
        code: { type: 'STRING', description: 'A 4-letter code across energy/sociability/boldness/focus axes, e.g. "ESBF" style but with real letters you choose per axis.' },
        description: { type: 'STRING', description: 'One sentence explaining why this archetype fits THIS dog specifically, citing something visible in the photos.' },
      },
      required: ['name', 'code', 'description'],
    },
    heroPhotoIndex: { type: 'INTEGER', description: 'Index (0-based) of the best photo for a swipe-card hero image — clearest face, good lighting, dog is the clear subject.' },
    basis: {
      type: 'STRING',
      description: 'Internal only, never shown to the user: 1 sentence on what in the photos/input you actually reasoned from, for prompt QA.',
    },
  },
  required: ['breedGuess', 'bio', 'archetype', 'basis'],
};

const SYSTEM_PROMPT = `You are generating a dog's profile for GoDoggyDate, a playdate-matching app. You will be shown 1-3 real photos of a real dog and must return JSON matching the required schema with your best read.

Ground rules:
- Only describe what is visibly true in the photos. Never invent facts you can't see.
- Never diagnose a health condition, never call a dog "aggressive," "dangerous," or "reactive" — describe observable posture/body language only if directly relevant, and default to warm/neutral framing.
- Never use generic pet-copy phrasing. Banned phrases (do not use, in any form): ${BANNED_PHRASES.join(', ')}.
- The bio and archetype are the highlight — make them specific, a little funny, and grounded in real details from the photo (coloring, ear shape, expression, pose), not generic dog-owner cliché.
- If the photos are unclear, low quality, or don't clearly show a dog, still do your best with lower confidence values rather than refusing.
- Breed guessing is a trust-sensitive area for owners of mixes and rescues — always frame it as a guess (the confidence field exists for this reason), never as certain fact.`;

function sanitizeVibeCheck(raw: unknown, photoCount: number): DogVibeCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const breedGuessRaw = r.breedGuess as Record<string, unknown> | undefined;
  const breedName = typeof breedGuessRaw?.name === 'string' ? breedGuessRaw.name.trim() : '';
  const confidence = breedGuessRaw?.confidence;
  const breedConfidence: 'low' | 'medium' | 'high' =
    confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : 'low';

  const bio = typeof r.bio === 'string' ? r.bio.trim().slice(0, 400) : '';

  const archetypeRaw = r.archetype as Record<string, unknown> | undefined;
  const archetypeName = typeof archetypeRaw?.name === 'string' ? archetypeRaw.name.trim().slice(0, 40) : '';
  const archetypeCode = typeof archetypeRaw?.code === 'string' ? archetypeRaw.code.trim().slice(0, 8) : '';
  const archetypeDescription =
    typeof archetypeRaw?.description === 'string' ? archetypeRaw.description.trim().slice(0, 240) : '';

  // Required fields — if any of these are missing, the whole generation is
  // unusable and the caller should fall back to the plain manual form.
  if (!breedName || !bio || !archetypeName || !archetypeCode || !archetypeDescription) {
    return null;
  }

  const lowerBio = bio.toLowerCase();
  if (BANNED_PHRASES.some((p) => lowerBio.includes(p))) {
    return null; // Force a retry/fallback rather than shipping known-slop copy.
  }

  const sizeEstimate = VALID_SIZES.includes(r.sizeEstimate as DogSize) ? (r.sizeEstimate as DogSize) : undefined;

  const energyRaw = typeof r.energyEstimate === 'number' ? r.energyEstimate : undefined;
  const energyEstimate =
    energyRaw !== undefined ? Math.max(0, Math.min(100, Math.round(energyRaw))) : undefined;

  const playStyleGuesses = Array.isArray(r.playStyleGuesses)
    ? (r.playStyleGuesses as unknown[]).filter((s): s is PlayStyle => VALID_PLAY_STYLES.includes(s as PlayStyle)).slice(0, 3)
    : undefined;

  const temperamentGuesses = Array.isArray(r.temperamentGuesses)
    ? (r.temperamentGuesses as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim().slice(0, 30)).slice(0, 4)
    : undefined;

  const heroPhotoIndexRaw = typeof r.heroPhotoIndex === 'number' ? Math.round(r.heroPhotoIndex) : undefined;
  const heroPhotoIndex =
    heroPhotoIndexRaw !== undefined && heroPhotoIndexRaw >= 0 && heroPhotoIndexRaw < photoCount
      ? heroPhotoIndexRaw
      : undefined;

  const basis = typeof r.basis === 'string' ? r.basis.trim().slice(0, 200) : '';

  return {
    breedGuess: { name: breedName, confidence: breedConfidence },
    sizeEstimate,
    energyEstimate,
    playStyleGuesses,
    temperamentGuesses,
    bio,
    archetype: { name: archetypeName, code: archetypeCode, description: archetypeDescription },
    heroPhotoIndex,
    basis,
  };
}

// ── Gemini response shapes (only the fields we read) ────────────────────────
interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

// finishReason values that mean the model declined / was filtered rather than
// produced a usable answer — surfaced to the user as "try different photos".
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Firebase ID token' }, { status: 401 });
  }
  const idToken = authHeader.slice('Bearer '.length).trim();

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (error) {
    console.error('vibe-check auth failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('vibe-check: GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'Vibe Check is not configured yet' }, { status: 503 });
  }

  let body: VibeCheckRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const photos = Array.isArray(body?.photos) ? body.photos : [];
  if (photos.length === 0 || photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Send 1-${MAX_PHOTOS} photos` }, { status: 400 });
  }

  const imageParts: GeminiPart[] = [];
  for (const photo of photos) {
    const dataUri = photo?.dataUri;
    const match = typeof dataUri === 'string' ? dataUri.match(/^data:([^;]+);base64,(.+)$/) : null;
    if (!match) {
      return NextResponse.json({ error: 'Each photo must be a base64 data URI' }, { status: 400 });
    }
    const [, mimeType, base64Data] = match;
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json({ error: `Unsupported photo type: ${mimeType}` }, { status: 400 });
    }
    // Rough size check without decoding: base64 is ~4/3 the byte size.
    if (base64Data.length * 0.75 > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'Photo too large (max 5MB each)' }, { status: 400 });
    }
    // Gemini inline image part.
    (imageParts as Array<Record<string, unknown>>).push({
      inline_data: { mime_type: mimeType, data: base64Data },
    });
  }

  const promptText = body.name
    ? `This dog's name is ${body.name}. Generate the vibe check.`
    : 'Generate the vibe check.';

  let data: GeminiResponse;
  try {
    // API key goes in the x-goog-api-key header, never the URL — a query-string
    // secret can leak into access logs and proxies.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [...imageParts, { text: promptText }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: VIBE_CHECK_SCHEMA,
            maxOutputTokens: 2048,
            temperature: 1,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('vibe-check: Gemini API error', res.status, errText.slice(0, 500));
      return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
    }

    data = (await res.json()) as GeminiResponse;
  } catch (error) {
    console.error('vibe-check: Gemini API call failed', error);
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  // Prompt-level block (whole request refused before generation).
  if (data.promptFeedback?.blockReason) {
    console.warn('vibe-check: prompt blocked', data.promptFeedback.blockReason);
    return NextResponse.json({ error: 'Could not read these photos — try different ones' }, { status: 422 });
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;

  // Safety/filter decline — the equivalent of Claude's refusal stop reason.
  if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
    console.warn('vibe-check: candidate blocked', finishReason);
    return NextResponse.json({ error: 'Could not read these photos — try different ones' }, { status: 422 });
  }

  // Truncated before the JSON closed — the response is unparseable, and the fix
  // is maxOutputTokens, not the prompt. Logged distinctly so the two failure
  // modes don't blur together.
  if (finishReason === 'MAX_TOKENS') {
    console.error('vibe-check: response truncated at maxOutputTokens');
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  const rawText = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!rawText) {
    console.error('vibe-check: empty Gemini response', JSON.stringify(candidate));
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error('vibe-check: Gemini output was not valid JSON', error, rawText.slice(0, 300));
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  const vibeCheck = sanitizeVibeCheck(parsed, photos.length);
  if (!vibeCheck) {
    console.error('vibe-check: model output failed sanitization', JSON.stringify(parsed));
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  // Confirm the breed guess resolves to something real in the matching
  // catalogue — this doesn't change what's stored (the guess is shown
  // as-is) but catches totally malformed output before it ships.
  const resolved = resolveBreed(vibeCheck.breedGuess.name);
  if (!resolved) {
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  const aiProfile = {
    vibeCheck,
    model: GEMINI_MODEL,
    promptVersion: PROMPT_VERSION,
    generatedAt: Date.now(),
  };

  try {
    // merge:true is load-bearing — a plain set() here would silently wipe
    // every other field on the dog doc, exactly like the bug already found
    // and fixed in web/lib/auth.ts and mobile/lib/profile.ts this same week.
    await getAdminDb().doc(`dogs/${uid}`).set({ ai: aiProfile }, { merge: true });
  } catch (error) {
    console.error('vibe-check: failed to persist', error);
    return NextResponse.json({ error: 'Vibe Check generated but failed to save — try again' }, { status: 500 });
  }

  return NextResponse.json({ ai: aiProfile });
}
