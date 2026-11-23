'use client';
// web/components/UndoToast.tsx
// A short-lived toast with one action ("Undo"). Mounted by lib/undoToast.ts, which
// keeps it alive across route changes and across the component that raised it
// unmounting: blocking someone from a swipe card removes the card, and blocking
// from chat leaves the chat, but the Undo has to stay on screen either way.

import { useEffect, useRef, useState } from 'react';

export interface UndoToastProps {
  message: string;
  actionLabel: string;
  /** Resolves when the action worked; throws when it did not. */
  onAction: () => Promise<void>;
  /** Shown after the action worked. */
  doneMessage: string;
  failedMessage: string;
  durationMs: number;
  onClose: () => void;
}

type Phase = 'idle' | 'working' | 'done' | 'failed';

export default function UndoToast({
  message, actionLabel, onAction, doneMessage, failedMessage, durationMs, onClose,
}: UndoToastProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Idle toasts leave on their own; a finished action leaves a moment after.
  useEffect(() => {
    if (phase === 'working') return;
    const ms = phase === 'idle' ? durationMs : 3500;
    const timer = setTimeout(() => closeRef.current(), ms);
    return () => clearTimeout(timer);
  }, [phase, durationMs]);

  async function run() {
    if (phase !== 'idle') return;
    setPhase('working');
    try {
      await onAction();
      setPhase('done');
    } catch {
      setPhase('failed');
    }
  }

  const text = phase === 'done' ? doneMessage : phase === 'failed' ? failedMessage : message;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-6 pointer-events-none"
    >
      <div
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2 pl-5 text-sm font-semibold text-white shadow-xl ${
          phase === 'failed' ? 'bg-red-600' : 'bg-brown'
        }`}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
        {phase === 'idle' && (
          <button
            type="button"
            onClick={run}
            className="shrink-0 min-h-[44px] rounded-xl px-3 font-bold text-gold hover:bg-white/10"
          >
            {actionLabel}
          </button>
        )}
        {phase === 'working' && <span className="shrink-0 px-3 text-white/70">…</span>}
      </div>
    </div>
  );
}
