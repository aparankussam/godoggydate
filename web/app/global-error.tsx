'use client';
// web/app/global-error.tsx
// Last-resort boundary for errors thrown by the root layout itself. It replaces
// the whole document, so it carries its own <html>/<body> and plain inline
// styling (the layout's fonts and stylesheet may be what failed).

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          background: '#FDF6EE',
          color: '#2D1A0E',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <p style={{ fontSize: '3.5rem', margin: 0 }} aria-hidden="true">🐾</p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', margin: '1rem 0 0.5rem' }}>Something went sideways</h1>
        <p style={{ maxWidth: '28rem', color: '#5C3D2E', margin: 0 }}>
          GoDoggyDate hit a snag loading. Give it another go.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '2rem',
            background: '#E8633A',
            color: '#fff',
            fontWeight: 700,
            border: 0,
            borderRadius: '9999px',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
