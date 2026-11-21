// mobile/lib/keyboards.ts
// Keyboard types for the boxes that take digits. 'numbers-and-punctuation' is
// iOS-only: on Android React Native ignores it and shows the FULL letter
// keyboard, so a ZIP or date box there invites letters and hides the number
// row behind a long-press. Each constant picks the right pad per platform.

import { Platform, type KeyboardTypeOptions } from 'react-native';

/**
 * Date boxes (MM/DD/YYYY, MM/YYYY, YYYY). iOS keeps the digits-and-punctuation
 * pad, which has a "/" key. Android gets a plain digit pad, which has none —
 * fine, because maskUsDateInput (shared/dates.ts) places the slashes itself
 * when only digits are typed.
 */
export const DATE_KEYBOARD: KeyboardTypeOptions =
  Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'number-pad';

/**
 * ZIP box. Needs a hyphen for ZIP+4, so Android uses 'numeric' (digits plus a
 * minus/hyphen key) rather than 'number-pad' (digits only); iOS keeps the
 * digits-and-punctuation pad.
 */
export const ZIP_KEYBOARD: KeyboardTypeOptions =
  Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';
