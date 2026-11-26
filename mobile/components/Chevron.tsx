// mobile/components/Chevron.tsx
// The open/close arrow beside a label (replaces typed ▲ ▼). Works inside <Text>.

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { colors } from '../constants/theme';

export default function Chevron({ open, color = colors.ink }: { open?: boolean; color?: ColorValue }) {
  return <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={color} />;
}
