// mobile/components/BrandLogo.tsx
// The GoDoggyDate logo, same art and same placements as the website: screen
// headers and the brand line on every share card (web BrandLogo + ShareLogo).
// One trimmed PNG with transparency, so it sits on the sky, on cream and on
// the dark cards alike, and react-native-view-shot captures it as is.

import { Image, type ImageStyle, type StyleProp } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles static assets through require()
const LOGO = require('../assets/brand/godoggydate-logo.png');
const RATIO = 900 / 234;

export default function BrandLogo({ height, style }: { height: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={LOGO}
      style={[{ height, width: Math.round(height * RATIO) }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="GoDoggyDate"
    />
  );
}
