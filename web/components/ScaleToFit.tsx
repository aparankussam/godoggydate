'use client';
// web/components/ScaleToFit.tsx
// Share cards (Excuse Note, Barkle result, the public dog card) are built at a
// fixed pixel width so the PNG a visitor saves always has the same layout. On a
// 320-360px phone that width is wider than the page gutter, so the card pushed
// the whole page into horizontal scroll (or got clipped on both sides when
// centred). This shows the card scaled down to fit and leaves the card itself
// untouched: shareCard.ts clears this transform when it captures the PNG, so
// the exported image is still full size.

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** The card's own fixed width in px. */
  width: number;
  children: React.ReactNode;
}

export default function ScaleToFit({ width, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const next = Math.min(1, outer.clientWidth / width);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width]);

  const shrunk = scale < 1;
  return (
    <div
      ref={outerRef}
      className="flex w-full items-start justify-center"
      style={{ maxWidth: width, height: shrunk && height !== null ? height : undefined }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          flexShrink: 0,
          transform: shrunk ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
