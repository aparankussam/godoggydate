'use client';

import { useEffect } from 'react';
import { installErrorReporting } from '../lib/errorReporting';

/** Mounted once in the root layout: starts the browser error listeners. Renders nothing. */
export default function ErrorReporter() {
  useEffect(() => {
    installErrorReporting();
  }, []);
  return null;
}
