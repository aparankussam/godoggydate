import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { resolveBreed } from '../../../../../shared/types/breeds';
import type { DogSize, DogVibeCheck, PlayStyle } from '../../../../../shared/types';

// "Vibe Check" onboarding: 1-3 photos in, a finished profile out. This is the
// single highest-leverage AI feature in the Phase 0 build — it converts the
// app's biggest drop-off (a 15-field form before any payoff) into a moment
// that delivers real value at N=1, with zero other users required. See the
// research notes captured 2026-07-25 for the full rationale.
//
// Model choice is deliberate: Opus-grade or nothing. Haiku-tier personality
// copy is exactly the failure mode that makes this read as slop instead of
// delight — see the banned-phrase list and stop_reason handling below.
const VIBE_CHECK_MODEL = 'claude-opus-5';
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

const VIBE_CHECK_TOOL: Anthropic.Tool = {
  name: 'submit_vibe_check',
  description: "Submit the generated dog profile content based on the uploaded photos.",
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['breedGuess', 'bio', 'archetype', 'basis'],
    properties: {
      breedGuess: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'confidence'],
        properties: {
          name: { type: 'string', description: 'Your best single breed or mix guess, e.g. "Labrador Retriever" or "Goldendoodle".' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
      sizeEstimate: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
      energyEstimate: { type: 'integer', minimum: 0, maximum: 100, description: 'Guessed energy level from body language/build, 0=couch potato, 100=zoomies machine.' },
      playStyleGuesses: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string', enum: VALID_PLAY_STYLES },
      },
      temperamentGuesses: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
      },
      bio: {
        type: 'string',
        description: 'A 1-3 sentence bio written IN THE DOG\'S VOICE (first person, as the dog). Specific and a little funny. Grounded in what you can actually see. Never generic pet-copy phrasing.',
      },
      archetype: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'code', 'description'],
        properties: {
          name: { type: 'string', description: 'A punchy 2-3 word named archetype, e.g. "Chaos Gremlin" or "Velvet Couch Potato". Specific to this dog, not generic.' },
          code: { type: 'string', description: 'A 4-letter code across energy/sociability/boldness/focus axes, e.g. "ESBF" style but with real letters you choose per axis.' },
          description: { type: 'string', description: 'One sentence explaining why this archetype fits THIS dog specifically, citing something visible in the photos.' },
        },
      },
      heroPhotoIndex: { type: 'integer', minimum: 0, description: 'Index (0-based) of the best photo for a swipe-card hero image — clearest face, good lighting, dog is the clear subject.' },
      basis: {
        type: 'string',
        description: 'Internal only, never shown to the user: 1 sentence on what in the photos/input you actually reasoned from, for prompt QA.',
      },
    },
  },
};

const SYSTEM_PROMPT = `You are generating a dog's profile for GoDoggyDate, a playdate-matching app. You will be shown 1-3 real photos of a real dog and must call the submit_vibe_check tool with your best read.

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('vibe-check: ANTHROPIC_API_KEY not configured');
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

  const imageBlocks: Anthropic.ImageBlockParam[] = [];
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
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64Data },
    });
  }

  const anthropic = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: VIBE_CHECK_MODEL,
      // On Opus 5 thinking is ON by default (omitting `thinking` runs adaptive)
      // and max_tokens caps thinking PLUS output together. The old 1024 was
      // sized for the tool payload alone, so with three full-res photos and a
      // forced tool_choice it truncated before the tool_use block closed —
      // which surfaced as the generic "no tool_use block" 502 below.
      //
      // Thinking stays on: with it disabled, Opus 5 can emit a tool call as
      // plain text instead of a tool_use block, which is exactly the one shape
      // this route cannot recover from. `effort: 'low'` keeps the thinking
      // budget small — this is a bounded extraction, not a reasoning task.
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [VIBE_CHECK_TOOL],
      tool_choice: { type: 'tool', name: 'submit_vibe_check' },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: body.name
                ? `This dog's name is ${body.name}. Generate the vibe check.`
                : 'Generate the vibe check.',
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('vibe-check: Anthropic API call failed', error);
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  // Opus can return a 200 with stop_reason 'refusal' and no usable tool_use
  // block — never blindly index content[0] here.
  if (response.stop_reason === 'refusal') {
    return NextResponse.json({ error: 'Could not read these photos — try different ones' }, { status: 422 });
  }

  // Distinct from the no-tool_use case below: this one means the response was
  // cut off at max_tokens, so the fix is the cap, not the prompt. Without this
  // branch both failures log identically.
  if (response.stop_reason === 'max_tokens') {
    console.error('vibe-check: response truncated at max_tokens', JSON.stringify(response.usage));
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'submit_vibe_check',
  );
  if (!toolUseBlock) {
    console.error('vibe-check: no tool_use block in response', JSON.stringify(response.content));
    return NextResponse.json({ error: 'Vibe Check failed — try again' }, { status: 502 });
  }

  const vibeCheck = sanitizeVibeCheck(toolUseBlock.input, photos.length);
  if (!vibeCheck) {
    console.error('vibe-check: model output failed sanitization', JSON.stringify(toolUseBlock.input));
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
    model: VIBE_CHECK_MODEL,
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
