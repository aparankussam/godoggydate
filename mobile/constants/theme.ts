// "Sticker Book, grown up": the same design system as the web app
// (web/tailwind.config.ts + web/app/globals.css). Key names are kept from the
// old theme so every screen re-skins at once; new keys carry the new roles.
export const colors = {
  // The ONE pink action per screen (WOOF, Accept playdate, Join this Pack Day).
  // Text on it is ink, never white.
  primary: '#FF5C8D',
  primaryLight: '#FF8FB0',
  primaryDark: '#D63A6B',   // the hard bottom edge of the pink button
  rose: '#B8214F',          // pink used as TEXT on paper (passes contrast)

  // Accent (legacy key; prefer fit/amber, which carry meaning)
  gold: '#FFC56B',
  goldLight: '#FFE2AE',

  // Page + paper
  sky: '#8FC9F2',           // page background
  skyLight: '#A7D5F5',      // gingham stripe tone
  cream: '#FFF9EC',         // paper: cards, notes, tab bar
  creamDark: '#F3ECDC',     // calm inset slips
  paper: '#FFF9EC',
  white: '#FFFFFF',
  note: '#DCEEFB',          // sticky-note tint, my chat bubbles
  kraft: '#E6CFA6',         // tape, place ticket

  // Ink
  ink: '#2A1F4A',
  brown: '#2A1F4A',         // legacy key = ink
  brownMid: '#4A3F6E',
  brownLight: '#4D4373',

  // Meaning only, never decoration
  fit: '#6FDB9C',           // Strong / Good fit
  amber: '#FFC56B',         // an owner limit that applies to the viewer's dog
  amberSpine: '#E8820C',
  success: '#2E9E5B',
  warning: '#E8820C',
  danger: '#D93A3A',

  // UI
  border: '#E3D6BA',        // also the hard edge of paper buttons
  cardBg: '#FFF9EC',
  overlay: 'rgba(42,31,74,0.45)',
};

export const fonts = {
  display: 'Chewy_400Regular',        // headings, dog names, WOOF; never under 18px
  displaySemibold: 'Chewy_400Regular',
  hand: 'Caveat_700Bold',             // one handwritten owner line, never buttons
  body: 'Nunito_400Regular',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
};

/** Ink outline used on every paper card, sticker and button. */
export const outline = {
  borderWidth: 2,
  borderColor: '#2A1F4A',
};

export const shadow = {
  // Hard, flat "sticker" shadow instead of a soft blur.
  card: {
    shadowColor: '#2A1F4A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 0,
    elevation: 4,
  },
  button: {
    shadowColor: '#2A1F4A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 3,
  },
};

/** The pink action button: ink outline + darker hard bottom edge. */
export const primaryButton = {
  backgroundColor: '#FF5C8D',
  borderWidth: 2.5,
  borderColor: '#2A1F4A',
  borderBottomWidth: 6,
  borderBottomColor: '#2A1F4A',
};

/** Everything else pressable: paper with a hard cream-dark edge. */
export const secondaryButton = {
  backgroundColor: '#FFF9EC',
  borderWidth: 2.5,
  borderColor: '#2A1F4A',
  borderBottomWidth: 5,
};
