// web/lib/undoToast.ts
// Raise a toast with one Undo action from anywhere (a component that is about to
// unmount, a route that is about to change). It renders into its own root on
// document.body, so it outlives whatever called it. One toast at a time: a new
// one replaces the old.

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import UndoToast from '../components/UndoToast';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let serial = 0;

export interface UndoToastOptions {
  message: string;
  actionLabel?: string;
  onAction: () => Promise<void>;
  doneMessage: string;
  failedMessage?: string;
  durationMs?: number;
}

export function showUndoToast(opts: UndoToastOptions): void {
  if (typeof document === 'undefined') return;
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-undo-toast-host', '');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const mine = ++serial;
  root!.render(
    createElement(UndoToast, {
      key: mine,
      message: opts.message,
      actionLabel: opts.actionLabel ?? 'Undo',
      onAction: opts.onAction,
      doneMessage: opts.doneMessage,
      failedMessage: opts.failedMessage ?? 'Couldn’t undo that. Please try again.',
      durationMs: opts.durationMs ?? 10000,
      // A newer toast has replaced this one: its close must not clear the new one.
      onClose: () => { if (mine === serial) root?.render(null); },
    }),
  );
}
