'use client';
// web/components/PlaydateTicket.tsx
// The playdate proposal / confirmed playdate drawn as a paper ticket: an ink
// header, When / Where, a perforation, then the actions. Purely presentational:
// the chat thread owns every handler and decides which single action is pink.

import type { ReactNode } from 'react';

/** The ONE pink action on a ticket (Accept playdate / I'm here). */
export const TICKET_PINK =
  'btn-primary flex min-h-[52px] w-full items-center justify-center gap-2 px-4 pb-1 text-2xl leading-none disabled:opacity-50';
/** Everything else on a ticket: paper with a hard cream-dark edge. */
export const TICKET_CREAM =
  'btn-secondary flex min-h-[48px] w-full items-center justify-center gap-2 px-4 pb-1 text-[15px] font-black leading-none disabled:opacity-50';
/** Quieter still: Decline, Running late, Cancel. */
export const TICKET_QUIET =
  'btn-secondary flex min-h-[46px] w-full items-center justify-center px-4 pb-1 text-sm font-black leading-none text-brown-mid disabled:opacity-50';

export function PawIcon({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="#2A1F4A" className="shrink-0">
      <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
      <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
      <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
      <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
      <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
    </svg>
  );
}

export function TicketGlyph({ size = 18, color = '#FFF9EC', slit = '#2A1F4A' }: { size?: number; color?: string; slit?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v1.6a2.4 2.4 0 0 0 0 4.8v1.6A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-1.6a2.4 2.4 0 0 0 0-4.8z" fill={color} />
      <path d="M13 5.5v12" fill="none" stroke={slit} strokeWidth="1.6" strokeDasharray="2.4 2.4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
      <rect x="3" y="5" width="18" height="16" rx="3.2" fill="#2A1F4A" />
      <rect x="6.2" y="2.4" width="2.6" height="5" rx="1.3" fill="#2A1F4A" />
      <rect x="15.2" y="2.4" width="2.6" height="5" rx="1.3" fill="#2A1F4A" />
      <rect x="5.6" y="11" width="12.8" height="7.4" rx="1.6" fill="#FFF9EC" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
      <path d="M12 1.6c-4.7 0-8.5 3.7-8.5 8.3 0 5.8 8.5 12.5 8.5 12.5s8.5-6.7 8.5-12.5C20.5 5.3 16.7 1.6 12 1.6z" fill="#2A1F4A" />
      <circle cx="12" cy="9.8" r="3.1" fill="#FFF9EC" />
    </svg>
  );
}

interface Props {
  align: 'start' | 'end' | 'center';
  header: ReactNode;
  when: string;
  place: string;
  /** Plain status lines under When / Where (waiting, passed, you declined). */
  status?: ReactNode;
  /** Buttons below the perforation. */
  actions?: ReactNode;
  time?: string;
}

export default function PlaydateTicket({ align, header, when, place, status, actions, time }: Props) {
  const self = align === 'end' ? 'self-end' : align === 'center' ? 'self-center' : 'self-start';
  return (
    // shrink-0: the thread is a fixed-height flex column, and an overflow-hidden
    // item there shrinks to fit, which clipped the actions off the bottom.
    <div
      className={`${self} relative w-full shrink-0 max-w-[26rem] overflow-hidden rounded-[15px] border-2 border-brown bg-cream shadow-[0_4px_0_rgba(42,31,74,0.16)]`}
    >
      <div className="flex items-center gap-2 bg-brown px-4 py-2.5 text-cream">
        <TicketGlyph />
        <span className="min-w-0 text-[13px] font-black leading-tight [overflow-wrap:anywhere]">{header}</span>
      </div>
      <div className="space-y-3 px-4 pb-1 pt-3.5">
        <div className="flex items-center gap-3">
          <CalendarIcon />
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-black leading-tight text-brown-mid">When</span>
            <span className="text-[15px] font-black leading-tight">{when}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PinIcon />
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-black leading-tight text-brown-mid">Where</span>
            <span className="text-[15px] font-black leading-tight [overflow-wrap:anywhere]">{place}</span>
          </div>
        </div>
        {status && <div className="text-[13px] font-extrabold leading-snug text-brown-mid">{status}</div>}
      </div>
      {actions && (
        <>
          <div className="relative mt-3.5 h-0 border-t-2 border-dashed border-brown" aria-hidden="true">
            <span className="absolute -left-[9px] -top-[9px] h-4 w-4 rounded-full border-2 border-brown bg-sky" />
            <span className="absolute -right-[9px] -top-[9px] h-4 w-4 rounded-full border-2 border-brown bg-sky" />
          </div>
          <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">{actions}</div>
        </>
      )}
      {time && <p className="px-4 pb-2 pt-1 text-xs font-bold text-brown-mid">{time}</p>}
    </div>
  );
}
