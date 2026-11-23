// mobile/components/HouseholdSection.tsx
// Mirrors web/components/HouseholdSection.tsx — Household. Free, no payment
// gating: the only mechanic that's a genuine viral vector at four total
// users. One difference from the web version: invite sharing uses the
// native Share sheet instead of clipboard copy (no clipboard dependency in
// this project yet, and Share is built into react-native).
// The shared link (/app/household/join?code=…) opens app/household/join.tsx
// when the app is installed (universal links), and the website otherwise.
// HouseholdJoinForm below is the one code-entry form, also used by onboarding
// and the join screen.
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../constants/theme';
import { PrimaryButton, SecondaryButton } from './sticker';
import {
  acceptHouseholdInvite,
  createHouseholdInvite,
  normalizeInviteCode,
  removeHouseholdMember,
} from '../lib/household';
import { webUrl } from '../lib/webLinks';

interface JoinFormProps {
  initialCode?: string | null;
  /** Called after the invite is accepted. The form shows "Joining…" until it settles. */
  onJoined?: (result: { dogId: string }) => void | Promise<void>;
  /** Shows a Cancel link next to the button when provided. */
  onCancel?: () => void;
  submitLabel?: string;
  /** Render the submit as the screen's one pink action (only where nothing
   *  else on the screen is pink, e.g. the join screen). Paper otherwise. */
  primary?: boolean;
}

export function HouseholdJoinForm({ initialCode, onJoined, onCancel, submitLabel = 'Join household', primary = false }: JoinFormProps) {
  const [joinCode, setJoinCode] = useState(normalizeInviteCode(initialCode));
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleJoin() {
    const code = normalizeInviteCode(joinCode);
    if (!code) {
      setJoinError('Enter the invite code');
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const result = await acceptHouseholdInvite(code);
      await onJoined?.(result);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join — check the code and try again');
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={styles.joinForm}>
      <TextInput
        value={joinCode}
        onChangeText={(v) => setJoinCode(normalizeInviteCode(v))}
        placeholder="Invite code"
        placeholderTextColor="#8E87A8"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        style={styles.joinInput}
        returnKeyType="go"
        onSubmitEditing={handleJoin}
        accessibilityLabel="Household invite code"
      />
      {joinError && <Text style={styles.errorText}>{joinError}</Text>}
      <View style={styles.joinActions}>
        {primary ? (
          <PrimaryButton
            label={joining ? 'Joining…' : submitLabel}
            onPress={handleJoin}
            disabled={joining}
            style={styles.submitBtn}
          />
        ) : (
          <SecondaryButton
            label={joining ? 'Joining…' : submitLabel}
            onPress={handleJoin}
            disabled={joining}
            style={styles.submitBtn}
          />
        )}
        {onCancel && (
          <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" style={styles.cancelHit}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface Props {
  /** The signed-in user's own dog. Never hardcode a name here — every
   *  user's invite text must reference their own dog, not a fixed one. */
  dogName: string;
  memberIds: string[];
  memberNames?: Record<string, string>;
}

export default function HouseholdSection({ dogName, memberIds, memberNames }: Props) {
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [showJoin, setShowJoin] = useState(false);
  const [joined, setJoined] = useState(false);

  async function handleInvite() {
    setInviting(true);
    setInviteError(null);
    try {
      const result = await createHouseholdInvite();
      setInvite(result);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not create an invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleShare() {
    if (!invite) return;
    try {
      await Share.share({
        message: `Join ${dogName || 'my dog'}'s household on GoDoggyDate — code ${invite.code}. ${webUrl(`/app/household/join?code=${invite.code}`)}`,
      });
    } catch {
      // User dismissed the share sheet — the code is still visible on screen.
    }
  }

  async function handleRemove(uid: string) {
    setBusyUid(uid);
    try {
      await removeHouseholdMember(uid);
    } catch {
      // Non-critical — they can retry.
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Household</Text>
        <Text style={styles.subtitle}>Everyone who takes care of this dog — they don&apos;t need a dog of their own.</Text>
      </View>

      {memberIds.length > 0 && (
        <View>
          {memberIds.map((uid) => (
            <View key={uid} style={styles.memberRow}>
              <Text style={styles.memberName} numberOfLines={1}>{memberNames?.[uid] ?? 'Household member'}</Text>
              <Pressable
                onPress={() => handleRemove(uid)}
                disabled={busyUid === uid}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${memberNames?.[uid] ?? 'household member'}`}
                style={[styles.removeBtn, busyUid === uid && { opacity: 0.5 }]}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        {invite ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Share this code — it expires in 7 days:</Text>
            <Text style={styles.codeText}>{invite.code}</Text>
            <SecondaryButton
              label="Share invite"
              icon={<Ionicons name="share-outline" size={18} color={colors.ink} />}
              onPress={handleShare}
            />
          </View>
        ) : (
          <SecondaryButton
            label={inviting ? 'Creating…' : memberIds.length >= 3 ? 'Household is full (4 max)' : 'Invite someone'}
            icon={inviting || memberIds.length >= 3 ? undefined : <Ionicons name="person-add" size={17} color={colors.ink} />}
            onPress={handleInvite}
            disabled={inviting || memberIds.length >= 3}
          />
        )}
        {inviteError && <Text style={styles.errorText}>{inviteError}</Text>}
      </View>

      <View style={styles.section}>
        {joined ? (
          <Text style={styles.joinedText}>You&apos;re in this household.</Text>
        ) : showJoin ? (
          <HouseholdJoinForm
            onJoined={() => {
              setJoined(true);
              setShowJoin(false);
            }}
            onCancel={() => setShowJoin(false)}
          />
        ) : (
          <Pressable onPress={() => setShowJoin(true)} accessibilityRole="button" style={styles.joinLinkHit}>
            <Text style={styles.joinLink}>Have an invite code?</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    marginBottom: 16,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.creamDark,
  },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.ink },
  subtitle: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, color: colors.brownMid, marginTop: 2 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.creamDark,
  },
  memberName: { flex: 1, fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  removeBtn: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  removeText: { fontFamily: fonts.black, fontSize: 12.5, color: colors.ink },
  section: { padding: 16, gap: 8 },
  codeBox: {
    borderRadius: radius.md,
    backgroundColor: colors.note,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 14,
    gap: 8,
  },
  codeLabel: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.brownMid, textAlign: 'center' },
  codeText: {
    fontFamily: fonts.black,
    fontSize: 28,
    letterSpacing: 4,
    color: colors.ink,
    textAlign: 'center',
    paddingVertical: 4,
  },
  errorText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.danger },
  joinLinkHit: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  joinLink: { fontFamily: fonts.black, fontSize: 13.5, color: colors.ink, textDecorationLine: 'underline' },
  joinedText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  joinForm: { gap: 10 },
  joinInput: {
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.black,
    fontSize: 20,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.ink,
  },
  joinActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  submitBtn: { flex: 1 },
  cancelHit: { minHeight: 44, justifyContent: 'center' },
  cancelLink: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
});
