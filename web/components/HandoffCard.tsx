'use client';
import { formatUsDate, reminderDueLabel } from '../../shared/dates';
// web/components/HandoffCard.tsx
// The Handoff Card — one image the owner hands to a sitter, walker, groomer,
// or the friend watching the dog this weekend.
//
// Why this exists: notGoodWith and behaviorFlags are collected on both
// platforms and were rendered on ZERO surfaces. DogProfileForm promises the
// owner, verbatim, "Only what you tell us here can warn another owner before
// a meetup" — this card is the first place that promise pays off, and it
// needs no match, no second user, and no swipe to be worth having.
//
// Every line is something the owner typed. Nothing on this card is verified,
// scored, or inferred — there is deliberately no badge, no percentage, and no
// green checkmark anywhere on it, because a stranger reading it has to be
// able to tell "the owner said so" from "GoDoggyDate checked". So it says
// which one it is, on the vaccination line and again at the bottom.

import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus } from '../lib/photos';
import type { Reminder } from '../../shared/types';

interface Props {
  profile: SavedDogProfile;
  /** This dog's Cadence reminders. Only overdue and near-term ones are
   *  printed — a sheet for a weekend shouldn't list next year's rabies
   *  booster as if the sitter were supposed to act on it. */
  reminders?: Reminder[];
  /** Forwarded ref target for html2canvas capture — must wrap the whole card. */
  innerRef?: React.Ref<HTMLDivElement>;
}

const SIZE_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra large',
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Anything further out than this isn't a handoff concern. */
const UPCOMING_WINDOW_DAYS = 60;

// Keeps this card's "<date> · <relative>" shape while taking the relative
// half from shared/dates.ts, so the wording matches the other reminder
// surfaces and the absolute half is US-formatted with a year.
function dueText(dueDate: number): { text: string; urgent: boolean } {
  const { days, urgent } = reminderDueLabel(dueDate);
  const date = formatUsDate(new Date(dueDate));
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${date} · ${n} day${n === 1 ? '' : 's'} overdue`, urgent: true };
  }
  if (days === 0) return { text: `${date} · today`, urgent: true };
  if (days === 1) return { text: `${date} · tomorrow`, urgent: true };
  return { text: date, urgent };
}

function capitalize(value?: string): string | undefined {
  if (!value) return undefined;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brown-light">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Owner-declared tags, rendered VERBATIM — never reworded, grouped, or
 *  softened. The owner picked these exact strings and someone's dog meets
 *  this one on the strength of them. */
function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold text-brown"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export default function HandoffCard({ profile, reminders = [], innerRef }: Props) {
  const photo = getHeroPhoto(profile.photos, resolveHeroIndex(profile));
  const notGoodWith = profile.notGoodWith ?? [];
  const behaviorFlags = profile.behaviorFlags ?? [];
  const declaredNothing = notGoodWith.length === 0 && behaviorFlags.length === 0;

  // vaccinated is typed non-optional on SavedDogProfile, but the form's own
  // state DEFAULTS it to true and dog docs written before the field existed
  // carry no value at all. Read it defensively so "not stated" stays a
  // reachable outcome rather than a missing value silently printing as
  // "not vaccinated" on a sheet a stranger will act on.
  const vaccinated = (profile as { vaccinated?: boolean | null }).vaccinated ?? null;

  const identity = [
    profile.breed,
    capitalize(profile.age),
    SIZE_LABELS[profile.size],
  ].filter(Boolean).join(' · ');

  const now = Date.now();
  const upcoming = [...reminders]
    .sort((a, b) => a.dueDate - b.dueDate)
    .filter((r) => r.dueDate - now <= UPCOMING_WINDOW_DAYS * DAY_MS)
    .slice(0, 4);

  return (
    // Fluid up to 360px, rather than the fixed 360 DogTradingCard needs for
    // its 9:16 aspect: this card has no fixed aspect, so letting it shrink on
    // a narrow phone avoids the scale-transform-plus-negative-margin dance and
    // still exports cleanly — html2canvas captures the element at whatever
    // width it rendered at, doubled by its own scale: 2.
    <div
      ref={innerRef}
      className="w-full max-w-[360px] rounded-[1.5rem] overflow-hidden border border-border bg-cream shadow-xl"
    >
      {/* Identity */}
      <div className="bg-white px-5 py-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-[1.1rem] overflow-hidden bg-gradient-to-br from-gold to-primary shrink-0 flex items-center justify-center">
          {photo ? (
            // No crossOrigin, matching DogTradingCard: Firebase Storage isn't
            // CORS-configured for this origin, so requesting it as CORS makes
            // the browser refuse the image outright. html2canvas re-fetches it
            // with its own useCORS during capture, independent of this element.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={profile.name} className="w-full h-full object-cover" style={{ objectPosition: getHeroFocus(profile) }} />
          ) : (
            <span className="text-3xl">🐕</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Care sheet
          </p>
          <p className="font-display text-2xl text-brown leading-tight truncate">{profile.name}</p>
          {identity && <p className="text-xs text-brown-light truncate">{identity}</p>}
        </div>
      </div>

      {/* Owner-declared safety. Both lists print verbatim; when the owner
          declared nothing we say exactly that, rather than implying this dog
          is fine with everyone — an empty answer is not a clearance. */}
      <Section title="What the owner flagged">
        {declaredNothing ? (
          <p className="text-xs leading-relaxed text-brown-mid">
            The owner didn&apos;t flag anything here. That means nothing was declared — not that
            nothing applies.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {notGoodWith.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-brown-mid">Not a good match with</p>
                <TagList tags={notGoodWith} />
              </div>
            )}
            {behaviorFlags.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-brown-mid">Good to know before meeting</p>
                <TagList tags={behaviorFlags} />
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Vaccination. Three distinct states, and "true" is NOT a verified
          badge — the form pre-selects Vaccinated, so a true here can mean the
          owner confirmed it or simply never touched the control. The wording
          attributes it to the owner in every case. */}
      <Section title="Vaccination">
        {vaccinated === false ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">Owner marked: NOT vaccinated</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-red-700/80">
              Ask before any contact with other dogs.
            </p>
          </div>
        ) : vaccinated === true ? (
          <div className="rounded-xl border border-border bg-white px-3 py-2.5">
            <p className="text-xs font-bold text-brown">Owner marked: vaccinated</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
              Self-reported. No record was checked — ask for paperwork if you need it.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-bold text-amber-800">Vaccination status not stated</p>
          </div>
        )}
      </Section>

      {/* Cadence — real reminder rows off dogs/{dogId}/reminders. Rendered
          only when something is actually due; never a "0 due" placeholder. */}
      {upcoming.length > 0 && (
        <Section title="Due next">
          <div className="flex flex-col gap-1.5">
            {upcoming.map((r) => {
              const due = dueText(r.dueDate);
              return (
                <div key={r.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-brown truncate">{r.label}</span>
                  <span className={`text-[11px] shrink-0 ${due.urgent ? 'font-bold text-red-600' : 'text-brown-light'}`}>
                    {due.text}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* The disclaimer is part of the image on purpose — this card gets
          screenshotted and forwarded, and it has to keep saying this after it
          leaves the app. */}
      <div className="border-t border-border bg-white px-5 py-3.5">
        <p className="text-[11px] leading-relaxed text-brown-light">
          GoDoggyDate does not verify any of this. Everything above is what {profile.name}&apos;s
          owner wrote about their own dog.
        </p>
        <div className="mt-2 flex items-center justify-between">
          <p className="font-display text-sm text-brown">GoDoggyDate</p>
          <p className="text-[10px] text-brown-light">godoggydate.com</p>
        </div>
      </div>
    </div>
  );
}
