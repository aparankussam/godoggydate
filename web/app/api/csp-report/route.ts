import { NextResponse } from 'next/server';
import {
  clientIp,
  createRateLimiter,
  originOnly,
  pathOnly,
  readTextCapped,
  requestOriginAllowed,
} from '../../../lib/requestGuards';
import { routeOf } from '../../../lib/errorScrub';

// Collects Content-Security-Policy violation reports while the policy runs in
// REPORT-ONLY mode (see next.config.js), so it can be tightened from real data
// before it is enforced. Browsers post either the legacy `application/csp-report`
// shape ({"csp-report": {...}}) or the Reporting API shape (an array of
// {type: "csp-violation", body: {...}}); both are accepted.
//   - own-origin only, body capped at 16 KB, per-IP limit of 60 reports a minute
//   - ONE log line per report: `[csp-report] {...}`, searchable in Vercel logs
//   - nothing identifying is logged: document and script URLs are reduced to a
//     path (ids collapsed to [id]) or an origin, with no query strings or hashes,
//     and the code `sample` is dropped.

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;
const limiter = createRateLimiter(60, 60_000);

type Raw = Record<string, unknown>;

function pick(report: Raw, camel: string, dashed: string): unknown {
  return report[camel] ?? report[dashed];
}

function line(report: Raw): Record<string, unknown> {
  const directive = String(pick(report, 'effectiveDirective', 'effective-directive') ?? pick(report, 'violatedDirective', 'violated-directive') ?? '').slice(0, 40);
  const source = pick(report, 'sourceFile', 'source-file');
  return {
    directive,
    blocked: originOnly(pick(report, 'blockedURL', 'blocked-uri')),
    doc: routeOf(pathOnly(pick(report, 'documentURL', 'document-uri'))),
    source: originOnly(source),
    line: typeof pick(report, 'lineNumber', 'line-number') === 'number' ? pick(report, 'lineNumber', 'line-number') : undefined,
    disposition: String(report.disposition ?? '').slice(0, 10) || undefined,
  };
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad report' }, { status: 400 });
  }

  const reports: Raw[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const entry = item as Raw;
      if (entry && entry.type === 'csp-violation' && entry.body && typeof entry.body === 'object') reports.push(entry.body as Raw);
    }
  } else if (parsed && typeof parsed === 'object') {
    const legacy = (parsed as Raw)['csp-report'];
    if (legacy && typeof legacy === 'object') reports.push(legacy as Raw);
  }

  for (const report of reports.slice(0, MAX_REPORTS_PER_REQUEST)) {
    console.warn(`[csp-report] ${JSON.stringify(line(report))}`);
  }
  return new NextResponse(null, { status: 204 });
}
