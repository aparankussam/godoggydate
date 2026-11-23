// mobile/app/fun/playroom.tsx
// The Playroom is now a tab; this keeps old links (/fun/playroom) working.
import { Redirect } from 'expo-router';

export default function PlayroomRedirect() {
  return <Redirect href="/(tabs)/playroom" />;
}
