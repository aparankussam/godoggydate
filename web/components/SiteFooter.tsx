// web/components/SiteFooter.tsx
// Shared footer for the public content and legal pages: © year (hydration-safe),
// who operates the service (same wording as the Terms and Privacy Policy), and
// the links people look for at the bottom of a page.

import Link from 'next/link';
import CopyrightYear from './CopyrightYear';

interface Props {
  /** Optional page-specific line shown after the copyright. */
  note?: string;
}

export default function SiteFooter({ note }: Props) {
  return (
    <footer className="border-t border-border py-8">
      <div className="max-w-4xl mx-auto px-6 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-brown-light">
          © <CopyrightYear /> GoDoggyDate{note ? ` · ${note}` : ''}
        </p>
        <p className="text-xs text-brown-light">
          GoDoggyDate is operated by GoBots LLC ·{' '}
          <a href="https://gobotsai.com" target="_blank" rel="noreferrer" className="hover:text-rose transition-colors">
            gobotsai.com
          </a>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-brown-light">
          <Link href="/support" className="py-2.5 hover:text-rose transition-colors">Support</Link>
          <Link href="/terms" className="py-2.5 hover:text-rose transition-colors">Terms</Link>
          <Link href="/privacy" className="py-2.5 hover:text-rose transition-colors">Privacy</Link>
          <Link href="/playdate-safety" className="py-2.5 hover:text-rose transition-colors">Play or Fight?</Link>
          <Link href="/delete-account" className="py-2.5 hover:text-rose transition-colors">Delete account</Link>
        </nav>
      </div>
    </footer>
  );
}
