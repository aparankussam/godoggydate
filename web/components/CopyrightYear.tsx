'use client';
// The footer's © year. Server and client both render FALLBACK_YEAR first, so
// there is never a hydration mismatch (a prerendered page is frozen at build
// time, and new Date() on the client can disagree around New Year). The real
// year replaces it right after mount.

import { useEffect, useState } from 'react';

const FALLBACK_YEAR = 2026;

export default function CopyrightYear() {
  const [year, setYear] = useState(FALLBACK_YEAR);
  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);
  return <>{year}</>;
}
