'use client';
// web/app/global-error.tsx
// Last-resort boundary for errors thrown by the root layout itself. It replaces
// the whole document, so it carries its own <html>/<body> and plain inline
// styling (the layout's fonts and stylesheet may be what failed).

import { useEffect } from 'react';
import { reportClientError } from '../lib/errorReporting';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('global error', error);
    reportClientError(error, 'global-boundary', { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 1.5rem',
          textAlign: 'center',
          background: '#8FC9F2',
          color: '#2A1F4A',
          fontFamily: 'Nunito, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            background: '#FFF9EC',
            border: '2px solid #2A1F4A',
            borderRadius: '1.5rem',
            boxShadow: '0 10px 0 rgba(42,31,74,0.12)',
            padding: '2.5rem 1.5rem',
            maxWidth: '28rem',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
        <h1 style={{ fontFamily: 'Chewy, system-ui, sans-serif', fontWeight: 400, fontSize: '2rem', margin: '0 0 0.5rem' }}>Something went sideways</h1>
        <p style={{ color: '#4A3F6E', margin: 0 }}>
          GoDoggyDate hit a snag loading. Give it another go.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '2rem',
            background: '#FF5C8D',
            color: '#2A1F4A',
            fontWeight: 800,
            border: '2.5px solid #2A1F4A',
            boxShadow: 'inset 0 -6px 0 #D63A6B',
            borderRadius: '9999px',
            minHeight: 48,
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        </div>
      </body>
    </html>
  );
}
