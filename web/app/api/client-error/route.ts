import { NextResponse } from 'next/server';
import { clientIp, createRateLimiter, readTextCapped, requestOriginAllowed } from '../../../lib/requestGuards';
import { routeOf, scrubStack, scrubText } from '../../../lib/errorScrub';

// Receives browser errors from lib/errorReporting.ts. Public and unauthenticated
// on purpose (the visitor may be signed out, or the error may BE the sign-in), so
// it is guarded instead:
//   - own-origin only (Origin, else Referer, must be this site or localhost)
//   - body capped at 6 KB, per-IP limit of 20 reports a minute
//   - every field re-scrubbed here: no emails, ids or query strings reach the log
//   - one structured log line per DISTINCT error (same kind + message + top
//     stack frame + release), so the logs stay searchable instead of repeating
//     for every affected visitor; an error that keeps happening is logged again,
//     with its running count, at most once an hour
//   - optional Slack/Discord-style webhook (CLIENT_ERROR_WEBHOOK_URL), throttled
//     to one post a minute per server instance.
// Dedup and throttling live in memory, so they are per serverless instance: a busy
// deployment can log a distinct error once per warm instance.

const MAX_BODY_BYTES = 6 * 1024;
const MAX_TRACKED_ERRORS = 500;
const RELOG_AFTER_MS = 60 * 60 * 1000;
const WEBHOOK_MIN_INTERVAL_MS = 60 * 1000;
const KINDS = new Set(['error', 'unhandledrejection', 'boundary', 'global-boundary']);

const limiter = createRateLimiter(20, 60_000);
const known = new Map<string, { count: number; loggedAt: number }>();
let lastWebhookAt = 0;
let webhookSkipped = 0;

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function notifyWebhook(entry: { fp: string; kind: string; message: string; route: string; release: string }): Promise<void> {
  const url = process.env.CLIENT_ERROR_WEBHOOK_URL?.trim();
  if (!url || !/^https:\/\//i.test(url)) return;
  const now = Date.now();
  if (now - lastWebhookAt < WEBHOOK_MIN_INTERVAL_MS) {
    webhookSkipped += 1;
    return;
  }
  lastWebhookAt = now;
  const skipped = webhookSkipped;
  webhookSkipped = 0;
  const summary =
    `GoDoggyDate client error (${entry.kind}) on ${entry.route || '/'}: ${entry.message}` +
    ` [release ${entry.release}, id ${entry.fp}]` +
    (skipped ? ` (${skipped} more not sent: throttled)` : '');
  try {
    // "text" is read by Slack, "content" by Discord.
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary, content: summary }),
      signal: AbortSignal.timeout(2500),
    });
  } catch (error) {
    console.warn('[client-error] webhook failed', String(error).slice(0, 120));
  }
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (limiter.hit(clientIp(request))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const raw = await readTextCapped(request, MAX_BODY_BYTES);
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 });

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw);
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'bad report' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : 'error';
  const message = scrubText(body.message, 300) || 'Unknown error';
  const stack = scrubStack(body.stack, 1500);
  const release = scrubText(body.release, 40) || 'unknown';
  const topFrame = stack.split('\n').find((line) => /^\s*at\s|@/.test(line))?.trim().slice(0, 160) ?? '';
  const fp = hash(`${kind}|${message}|${topFrame}|${release}`);

  const now = Date.now();
  const prior = known.get(fp);
  if (prior) {
    prior.count += 1;
    if (now - prior.loggedAt < RELOG_AFTER_MS) return new NextResponse(null, { status: 204 });
    prior.loggedAt = now;
  } else {
    if (known.size >= MAX_TRACKED_ERRORS) known.delete(known.keys().next().value as string);
    known.set(fp, { count: 1, loggedAt: now });
  }

  const entry = {
    fp,
    kind,
    message,
    name: scrubText(body.name, 60) || undefined,
    digest: scrubText(body.digest, 40) || undefined,
    route: routeOf(body.route),
    release,
    ua: scrubText(body.ua, 160),
    count: known.get(fp)?.count ?? 1,
    stack: stack || undefined,
  };
  console.error(`[client-error] ${JSON.stringify(entry)}`);
  if (!prior) await notifyWebhook(entry);

  return new NextResponse(null, { status: 204 });
}
