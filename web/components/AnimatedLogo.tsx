'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Kaju runs in and becomes "Doggy". Plays, rests on the full logo (the last
// frame), then replays — only while on screen. Hover or tap replays at once.
// Reduce Motion gets the still logo instead.
const HOLD_MS = 5000;
const POSTER = '/brand/godoggydate-logo-cutout.webp';

export default function AnimatedLogo({ className = '' }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const clearHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const replay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    clearHold();
    v.currentTime = 0;
    v.play().catch(() => {}); // autoplay can be refused; the poster still shows the logo
  }, [clearHold]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduceMotion) return;
    const onEnded = () => {
      clearHold();
      if (visible.current) timer.current = setTimeout(replay, HOLD_MS);
    };
    v.addEventListener('ended', onEnded);
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        if (v.ended) replay();
        else v.play().catch(() => {});
      } else {
        v.pause();
        clearHold();
      }
    });
    io.observe(v);
    return () => {
      v.removeEventListener('ended', onEnded);
      io.disconnect();
      clearHold();
    };
  }, [reduceMotion, replay, clearHold]);

  if (reduceMotion) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={POSTER} alt="GoDoggyDate" width={1774} height={887} className={`h-auto w-full rounded-xl ${className}`} />;
  }

  return (
    <video
      ref={videoRef}
      poster={POSTER}
      muted
      playsInline
      preload="auto"
      role="img"
      aria-label="GoDoggyDate"
      width={358}
      height={268}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') replay(); }}
      onClick={replay}
      className={`h-auto w-full cursor-pointer rounded-xl ${className}`}
    >
      <source src="/brand/godoggydate-logo-animated-cutout.mov" type='video/mp4; codecs="hvc1"' />
      <source src="/brand/godoggydate-logo-animated-cutout.webm" type="video/webm" />
    </video>
  );
}
