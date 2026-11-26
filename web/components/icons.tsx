// web/components/icons.tsx
// <Icon name> draws the same shapes as the app's MaterialCommunityIcons.
// The Pupfile header icons, drawn for their real size (solid shapes, 2px+ strokes).
// The app uses PNGs exported from these same paths: mobile/assets/icons/make-icons.cjs.

import { MDI } from './mdi-paths';

export type IconName = keyof typeof MDI;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`inline-block shrink-0 align-[-0.15em] ${className}`}>
      <path d={MDI[name]} fill="currentColor" />
    </svg>
  );
}

export function SirenIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`inline-block shrink-0 align-[-0.15em] ${className}`}>
      <path d="M5.7 18h12.6a1.7 1.7 0 0 1 0 3.4H5.7a1.7 1.7 0 0 1 0-3.4ZM6.8 18V12.6a5.2 5.2 0 0 1 10.4 0V18ZM10.3 11.2a1.1 1.1 0 0 1 1.1 1.1v2.4a1.1 1.1 0 0 1-2.2 0v-2.4a1.1 1.1 0 0 1 1.1-1.1Z" fill="currentColor" fillRule="evenodd" />
      <path d="M12 2.2v2.2M4.6 5.2l1.6 1.6M19.4 5.2l-1.6 1.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function GearIcon({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-0.7 -0.7 25.4 25.4" aria-hidden="true" className={className}>
      <path
        d="M10.03 4.66L10.26 2.15A10 10 0 0 1 13.74 2.15L13.97 4.66A7.6 7.6 0 0 1 15.8 5.42L17.74 3.81A10 10 0 0 1 20.19 6.26L18.58 8.2A7.6 7.6 0 0 1 19.34 10.03L21.85 10.26A10 10 0 0 1 21.85 13.74L19.34 13.97A7.6 7.6 0 0 1 18.58 15.8L20.19 17.74A10 10 0 0 1 17.74 20.19L15.8 18.58A7.6 7.6 0 0 1 13.97 19.34L13.74 21.85A10 10 0 0 1 10.26 21.85L10.03 19.34A7.6 7.6 0 0 1 8.2 18.58L6.26 20.19A10 10 0 0 1 3.81 17.74L5.42 15.8A7.6 7.6 0 0 1 4.66 13.97L2.15 13.74A10 10 0 0 1 2.15 10.26L4.66 10.03A7.6 7.6 0 0 1 5.42 8.2L3.81 6.26A10 10 0 0 1 6.26 3.81L8.2 5.42A7.6 7.6 0 0 1 10.03 4.66ZM15.9 12a3.9 3.9 0 1 0 -7.8 0a3.9 3.9 0 1 0 7.8 0Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fillRule="evenodd"
      />
    </svg>
  );
}
