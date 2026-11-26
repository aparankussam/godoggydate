// shared/cityFeed.ts
// City feed — one feed per city mixing Pack Days, structured board posts and
// lost-dog alerts. Posts use TEMPLATES (no open forum) and expire on their own.
// No imports: firebase/functions/src/cityFeedRules.ts keeps a byte-identical
// copy (checked by serverMirrors.test.ts), so the server and the apps agree.

export type PostTemplate = 'ask' | 'recommend' | 'free_lend' | 'walk_buddy' | 'found_dog' | 'heads_up' | 'sitter_swap';

export const POST_TEMPLATES: Record<
  PostTemplate,
  { label: string; emoji: string; prompt: string; placeRequired: boolean; expiryHours: number }
> = {
  ask: { label: 'Ask the Pack', emoji: '💬', prompt: 'What do you want to ask the neighbors?', placeRequired: false, expiryHours: 72 },
  recommend: { label: 'Recommend', emoji: '⭐', prompt: 'What should neighbors try, and why?', placeRequired: false, expiryHours: 14 * 24 },
  free_lend: { label: 'Up for Grabs', emoji: '🎁', prompt: 'What are you giving away or lending?', placeRequired: false, expiryHours: 7 * 24 },
  walk_buddy: { label: 'Walkies Wanted', emoji: '🦮', prompt: 'When and where are you walking?', placeRequired: true, expiryHours: 24 },
  found_dog: { label: 'Found a Pup', emoji: '🔎', prompt: 'Where did you find a dog? Describe them.', placeRequired: true, expiryHours: 72 },
  heads_up: { label: 'Heads Up', emoji: '⚠️', prompt: 'What should dog owners nearby watch out for? A coyote, a loose dog, algae, glass or poison bait.', placeRequired: true, expiryHours: 48 },
  sitter_swap: { label: 'Sitter Swap', emoji: '🤝', prompt: 'Need a sitter, or can you help? Neighbors trade dog-sitting, no money. Say when.', placeRequired: false, expiryHours: 7 * 24 },
};

export const POST_TEMPLATE_KEYS = Object.keys(POST_TEMPLATES) as PostTemplate[];

export const CITY_FEED_LIMITS = {
  maxTextLength: 280,
  maxPlaceLength: 80,
  /** New posts one member may have live at once. */
  maxLivePerAuthor: 3,
  /** How long past expiry the cleanup function waits before deleting. */
  cleanupGraceHours: 24,
  /** Account must be at least this old to post, unless they attended a Pack Day. */
  minAccountAgeDays: 3,
} as const;

/** When a post stops showing: the template's lifetime from creation. */
export function postExpiresAtMs(template: PostTemplate, createdAtMs: number): number {
  return createdAtMs + POST_TEMPLATES[template].expiryHours * 60 * 60 * 1000;
}

export function isPostLive(post: { expiresAtMs: number }, nowMs: number): boolean {
  return post.expiresAtMs > nowMs;
}

export interface PostEligibilityInput {
  profileComplete: boolean;
  accountAgeMs: number;
  /** Checked in at a Pack Day (packDays/{eventId}/checkins/{uid}). Pass false
   *  if check-ins are not available yet: the age rule alone then applies. */
  attendedPackDay: boolean;
}

/** New accounts can't post until the profile is complete AND either a few days
 *  have passed or they've attended a Pack Day. */
export function postEligibility(input: PostEligibilityInput): { ok: true } | { ok: false; message: string } {
  if (!input.profileComplete) {
    return { ok: false, message: 'Finish your dog’s profile to post to the city feed.' };
  }
  const oldEnough = input.accountAgeMs >= CITY_FEED_LIMITS.minAccountAgeDays * 24 * 60 * 60 * 1000;
  if (!oldEnough && !input.attendedPackDay) {
    return { ok: false, message: 'You can post after a few days here, or right after your first Pack Day.' };
  }
  return { ok: true };
}

export interface PostInput {
  template: PostTemplate;
  text: string;
  place: string;
}

/** Shape check only (the content filter and contact-detail check run next to it). */
export function validatePostFields(input: { template?: unknown; text?: unknown; place?: unknown }):
  | { ok: true; value: PostInput }
  | { ok: false; message: string } {
  const template = input.template;
  if (typeof template !== 'string' || !(template in POST_TEMPLATES)) {
    return { ok: false, message: 'Choose what kind of post this is.' };
  }
  const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : '';
  const place = typeof input.place === 'string' ? input.place.replace(/\s+/g, ' ').trim() : '';
  if (!text) return { ok: false, message: 'Write a few words first.' };
  if (text.length > CITY_FEED_LIMITS.maxTextLength) {
    return { ok: false, message: `Keep it to ${CITY_FEED_LIMITS.maxTextLength} characters.` };
  }
  if (place.length > CITY_FEED_LIMITS.maxPlaceLength) {
    return { ok: false, message: `Keep the place to ${CITY_FEED_LIMITS.maxPlaceLength} characters.` };
  }
  if (POST_TEMPLATES[template as PostTemplate].placeRequired && !place) {
    return { ok: false, message: 'Add where, so neighbors know if it’s near them.' };
  }
  return { ok: true, value: { template: template as PostTemplate, text, place } };
}

// ── Feed assembly ──────────────────────────────────────────────────────────────

export type FeedItem =
  | { kind: 'lost'; id: string; authorUid: string; sortMs: number; data: Record<string, unknown> }
  | { kind: 'packday'; id: string; authorUid: string; sortMs: number }
  | { kind: 'post'; id: string; authorUid: string; sortMs: number; template: PostTemplate; text: string; place: string; claimed: boolean };

/** Lost-dog alerts first (urgent), then Pack Days and posts woven together: one
 *  Pack Day after every `every` posts, so the feed is never just chatter and
 *  never an empty forum. Blocked authors are dropped. Newest posts first;
 *  soonest Pack Days first. */
export function mergeFeed(
  items: FeedItem[],
  blocked: ReadonlySet<string>,
  opts: { every?: number } = {},
): FeedItem[] {
  const every = opts.every ?? 2;
  const visible = items.filter((i) => !blocked.has(i.authorUid));
  const lost = visible.filter((i) => i.kind === 'lost').sort((a, b) => b.sortMs - a.sortMs);
  const days = visible.filter((i) => i.kind === 'packday').sort((a, b) => a.sortMs - b.sortMs);
  const posts = visible.filter((i) => i.kind === 'post').sort((a, b) => b.sortMs - a.sortMs);

  const out: FeedItem[] = [...lost];
  if (days.length > 0) out.push(days.shift()!); // a Pack Day always leads the feed
  while (posts.length > 0 || days.length > 0) {
    for (let n = 0; n < every && posts.length > 0; n++) out.push(posts.shift()!);
    if (days.length > 0) out.push(days.shift()!);
    else if (posts.length === 0) break;
  }
  return out;
}
