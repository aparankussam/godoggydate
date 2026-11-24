#!/usr/bin/env node
// mobile/scripts/make-boop-sounds.cjs
// Writes the Snoot Boop sounds to mobile/assets/sounds/. Run it from anywhere:
//
//   node mobile/scripts/make-boop-sounds.cjs
//
// The website synthesises its boop live with WebAudio (web/lib/feedback.ts):
// a sine that glides down to 85% of its pitch over 120 ms, with an 8 ms attack
// and an exponential decay. The pitch is 400 Hz + 28 Hz per step of the tap
// streak (0 to 12), so a fast run of boops climbs. The app can't synthesise
// on the fly, so this renders the same envelope to small WAV files:
//
//   boop-1.wav … boop-5.wav  the boop at streak 0, 3, 6, 9 and 12
//                            (400, 484, 568, 652 and 736 Hz)
//   milestone.wav            web's three-note success chime (C5, E5, G5),
//                            played when a boop crosses a milestone
//
// 22.05 kHz, 16-bit mono PCM; every file is under 20 KB. The output is
// deterministic, so re-running it leaves the committed files unchanged.

const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 22050;
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'sounds');

// Web plays these at a WebAudio gain of 0.14–0.16. A phone speaker is weak
// around 400 Hz, so the files are rendered louder (same shape, higher level).
const LEVEL = 0.42 / 0.15;

// The boop pitches: web's 400 + streak * 28 Hz, sampled every third step.
const BOOP_STEPS = [0, 3, 6, 9, 12].map((streak) => 400 + streak * 28);

/** WebAudio's exponentialRampToValueAtTime, evaluated at time t. */
function expRamp(from, to, t0, t1, t) {
  if (t <= t0) return from;
  if (t >= t1) return to;
  return from * Math.pow(to / from, (t - t0) / (t1 - t0));
}

/** The envelope web uses: 0.0001 → peak in 8 ms, then → 0.0001 at `duration`. */
function envelope(t, duration, peak) {
  if (t < 0) return 0;
  if (t < 0.008) return expRamp(0.0001, peak, 0, 0.008, t);
  if (t < duration) return expRamp(peak, 0.0001, 0.008, duration, t);
  return 0;
}

function sine(phase) {
  return Math.sin(2 * Math.PI * phase);
}

function triangle(phase) {
  const p = phase - Math.floor(phase);
  return 1 - 4 * Math.abs(p - 0.5);
}

/**
 * Renders one tone into `out`, starting at `startAt` seconds. Mirrors
 * playTone() in web/lib/feedback.ts: optional exponential pitch glide, quick
 * attack, exponential decay, and 20 ms of tail after the decay.
 */
function renderTone(out, { freq, toFreq = freq, duration, type = 'sine', gain }, startAt) {
  const wave = type === 'triangle' ? triangle : sine;
  const first = Math.round(startAt * SAMPLE_RATE);
  const count = Math.round((duration + 0.02) * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < count && first + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const f = expRamp(freq, toFreq, 0, duration, t);
    out[first + i] += wave(phase) * envelope(t, duration, gain * LEVEL);
    phase += f / SAMPLE_RATE;
  }
}

/** Mirrors playCue(): each tone starts 60% of the way through the previous one. */
function renderCue(tones) {
  let cursor = 0;
  let end = 0;
  const starts = tones.map((tone) => {
    const at = cursor;
    end = Math.max(end, at + tone.duration + 0.02);
    cursor += tone.duration * 0.6;
    return at;
  });
  const out = new Float64Array(Math.ceil(end * SAMPLE_RATE));
  tones.forEach((tone, i) => renderTone(out, tone, starts[i]));
  return out;
}

function toWav(samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function write(name, samples) {
  const file = path.join(OUT_DIR, name);
  const wav = toWav(samples);
  if (wav.length >= 40 * 1024) throw new Error(`${name} is ${wav.length} bytes; keep it under 40 KB`);
  fs.writeFileSync(file, wav);
  console.log(`${path.relative(process.cwd(), file)}  ${wav.length} bytes`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

BOOP_STEPS.forEach((freq, i) => {
  // feedback.boop(pitch) on web.
  write(`boop-${i + 1}.wav`, renderCue([{ freq, toFreq: freq * 0.85, duration: 0.12, type: 'sine', gain: 0.15 }]));
});

// feedback.success() on web.
write(
  'milestone.wav',
  renderCue([
    { freq: 523.25, duration: 0.12, type: 'triangle', gain: 0.14 },
    { freq: 659.25, duration: 0.12, type: 'triangle', gain: 0.14 },
    { freq: 783.99, duration: 0.2, type: 'triangle', gain: 0.14 },
  ]),
);

// ── Extra Snoot Boop sounds, unlocked by charms (app/fun/snoot.tsx) ──────────
// Each is one file; the app raises the playback rate as the tap streak climbs.

/** A tone whose pitch follows `freqAt(t)`, shaped by `amp(t)`. */
function glide(duration, freqAt, amp) {
  const out = new Float64Array(Math.round(duration * SAMPLE_RATE));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = sine(phase) * amp(t) * 0.5;
    phase += freqAt(t) / SAMPLE_RATE;
  }
  return out;
}
const fade = (t, d) => Math.min(1, t / 0.01) * Math.min(1, (d - t) / 0.04);

// pop: a quick low-to-lower blip, like a bubble bursting.
write('pop.wav', glide(0.09, (t) => 700 - 4500 * t, (t) => fade(t, 0.09) * Math.exp(-t * 28)));
// squeak: a fast upward chirp with a wobble, like a squeaky toy.
write('squeak.wav', glide(0.22, (t) => 900 + 3200 * t + 90 * Math.sin(t * 90), (t) => fade(t, 0.22) * (1 - t / 0.3)));
// bubble: a rising blip that bends back down.
write('bubble.wav', glide(0.2, (t) => 420 + 2600 * t - 9000 * t * t, (t) => fade(t, 0.2) * Math.exp(-t * 9)));
// howl: a long rise and fall, with a slow vibrato.
write('howl.wav', glide(0.6, (t) => 330 + 420 * Math.sin((Math.PI * t) / 0.6) + 12 * Math.sin(t * 38), (t) => fade(t, 0.6) * 0.9));
