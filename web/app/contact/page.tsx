import { permanentRedirect } from 'next/navigation';

// Contact details live on the Support page.
export default function ContactPage() {
  permanentRedirect('/support');
}
