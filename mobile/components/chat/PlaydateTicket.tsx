// mobile/components/chat/PlaydateTicket.tsx
// A playdate proposal / confirmed playdate drawn as a paper invitation ticket:
// an ink header strip, When / Where with filled glyphs, a perforation, then the
// actions. Port of web/components/PlaydateTicket.tsx. Purely presentational:
// the chat screen owns every handler and decides which ONE action is pink.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { PawIcon, PrimaryButton, SecondaryButton } from '../sticker';

interface Props {
  align: 'start' | 'end' | 'center';
  header: string;
  when: string;
  place: string;
  /** Plain status line under When / Where (waiting, passed, you declined). */
  status?: string | null;
  /** Buttons below the perforation. */
  actions?: ReactNode;
  time?: string;
}

export default function PlaydateTicket({ align, header, when, place, status, actions, time }: Props) {
  const self: ViewStyle['alignSelf'] = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  return (
    <View style={[styles.ticket, { alignSelf: self }]}>
      <View style={styles.strip}>
        <MaterialCommunityIcons name="ticket" size={18} color={colors.paper} />
        <Text style={styles.stripText} numberOfLines={2}>{header}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="calendar" size={24} color={colors.ink} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>When</Text>
            <Text style={styles.rowValue}>{when}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="map-marker" size={24} color={colors.ink} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Where</Text>
            <Text style={styles.rowValue}>{place}</Text>
          </View>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      {actions ? (
        <>
          <View style={styles.perforation} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {/* Drawn dashes: iOS can't dash a single border side. */}
            <View style={styles.perfLine}>
              {Array.from({ length: 48 }).map((_, i) => <View key={i} style={styles.dash} />)}
            </View>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>
          <View style={styles.actions}>{actions}</View>
        </>
      ) : null}
      {time ? <Text style={styles.time}>{time}</Text> : null}
    </View>
  );
}

// ── Ticket buttons ───────────────────────────────────────────────────────────

type TicketButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: 'paw' | 'clock' | 'calendar' | 'none';
  style?: StyleProp<ViewStyle>;
};

function iconFor(icon: TicketButtonProps['icon'], size: number) {
  if (icon === 'paw') return <PawIcon size={size} />;
  if (icon === 'clock') return <MaterialCommunityIcons name="clock" size={size} color={colors.ink} />;
  if (icon === 'calendar') return <MaterialCommunityIcons name="calendar" size={size} color={colors.ink} />;
  return undefined;
}

/** The ONE pink action on a ticket (Accept playdate / I'm here). Ink text. */
export function TicketPink({ label, onPress, disabled, icon = 'paw', style }: TicketButtonProps) {
  return (
    <PrimaryButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      icon={iconFor(icon, 22)}
      style={[styles.btnFull, style]}
    />
  );
}

/** Everything else on a ticket: paper with a hard cream-dark edge. */
export function TicketCream({ label, onPress, disabled, icon = 'none', style }: TicketButtonProps) {
  return (
    <SecondaryButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      icon={iconFor(icon, 19)}
      style={[styles.btnFull, styles.btnCream, style]}
      textStyle={styles.creamText}
    />
  );
}

/** Quieter still: Decline, Cancel. Soft ink, smaller. */
export function TicketQuiet({ label, onPress, disabled, style }: TicketButtonProps) {
  return (
    <SecondaryButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnFull, styles.btnQuiet, style]}
      textStyle={styles.quietText}
    />
  );
}

/** A plain line between ticket buttons ("Let Sam know you can't make it?"). */
export function TicketNote({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

/** Small round paper button for the composer and header (44px). */
export function RoundPaperButton({
  icon,
  onPress,
  disabled,
  accessibilityLabel,
  size = 44,
}: {
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const NOTCH = 16;

const styles = StyleSheet.create({
  ticket: {
    width: '100%',
    maxWidth: 420,
    marginVertical: 6,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 3,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stripText: {
    flex: 1,
    fontFamily: fonts.black,
    fontSize: 13,
    lineHeight: 18,
    color: colors.paper,
  },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: colors.brownMid },
  rowValue: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.ink },
  status: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.brownMid },
  perforation: { marginTop: 14, height: 2, justifyContent: 'center' },
  perfLine: {
    height: 2,
    marginHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
  },
  dash: { width: 8, height: 2, backgroundColor: colors.ink },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2 + 1,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.sky,
  },
  notchLeft: { left: -NOTCH / 2 - 1 },
  notchRight: { right: -NOTCH / 2 - 1 },
  actions: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 10 },
  time: {
    paddingHorizontal: 16,
    paddingBottom: 9,
    paddingTop: 2,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownMid,
  },
  btnFull: { width: '100%' },
  btnCream: { minHeight: 48, paddingTop: 6, paddingBottom: 10 },
  creamText: { fontSize: 15 },
  btnQuiet: { minHeight: 46, paddingTop: 6, paddingBottom: 10 },
  quietText: { fontSize: 14, color: colors.brownMid },
  note: { fontFamily: fonts.black, fontSize: 14, lineHeight: 19, color: colors.ink },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
  },
  pressed: { transform: [{ translateY: 1 }], opacity: 0.92 },
  disabled: { opacity: 0.45 },
});
