import { permanentRedirect } from 'next/navigation';

// There is no separate About page; people who look for one want to know who is
// behind the app and how to reach them, which is what Support answers.
export default function AboutPage() {
  permanentRedirect('/support');
}
