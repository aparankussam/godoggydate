// mobile/components/AnimatedLogo.tsx
// Kaju runs in and becomes "Doggy": the website's animated logo (web
// AnimatedLogo), for the same welcome moments. The 16 frames of the web video
// live in one 4x4 sheet with transparency; we show one cell at a time, so it
// works the same on iOS and Android with no video or GIF support needed.
// Plays, rests on the full logo for 5 s, replays. Tap replays at once.
// Reduce Motion gets the still, finished logo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles static assets through require()
const SHEET = require('../assets/brand/godoggydate-logo-frames.png');
const FRAMES = 16;
const COLS = 4;
const FRAME_W = 351; // each cell is the web frame trimmed to where the animation draws
const FRAME_H = 192;
const FRAME_MS = 160; // the web video's 6.25 fps
const HOLD_MS = 5000;
const LAST = FRAMES - 1;

export default function AnimatedLogo({ width, style }: { width: number; style?: StyleProp<ViewStyle> }) {
  const height = Math.round((width * FRAME_H) / FRAME_W);
  const [frame, setFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const play = useCallback(() => {
    stop();
    let f = 0;
    setFrame(0);
    const tick = () => {
      f += 1;
      setFrame(f);
      timer.current = setTimeout(f < LAST ? tick : play, f < LAST ? FRAME_MS : HOLD_MS);
    };
    timer.current = setTimeout(tick, FRAME_MS);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      stop();
      setFrame(LAST);
      return;
    }
    play();
    return stop;
  }, [reduceMotion, play]);

  const shown = reduceMotion ? LAST : frame;
  return (
    <Pressable
      onPress={reduceMotion ? undefined : play}
      accessibilityRole="image"
      accessibilityLabel="GoDoggyDate"
      style={[{ width, height, overflow: 'hidden' }, style]}
    >
      <View pointerEvents="none">
        <Image
          resizeMode="stretch"
          source={SHEET}
          style={{
            width: width * COLS,
            height: height * (FRAMES / COLS),
            transform: [{ translateX: -(shown % COLS) * width }, { translateY: -Math.floor(shown / COLS) * height }],
          }}
        />
      </View>
    </Pressable>
  );
}
