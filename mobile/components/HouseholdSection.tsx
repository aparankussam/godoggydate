// mobile/components/HouseholdSection.tsx
// Mirrors web/components/HouseholdSection.tsx — Household. Free, no payment
// gating: the only mechanic that's a genuine viral vector at four total
// users. Two differences from the web version: invite sharing uses the
// native Share sheet instead of clipboard copy (no clipboard dependency in
// this project yet, and Share is built into react-native), and accepting an
// invite has no separate route to land on — mobile has no equivalent of
// web's /app/household/join page — so joining-by-code lives inline here.
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { acceptHouseholdInvite, createHouseholdInvite, removeHouseholdMember } from '../lib/household';

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
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
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
    const webBase = (process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '')) || 'https://godoggydate.com';
    try {
      await Share.share({
        message: `Join ${dogName || 'my dog'}'s household on GoDoggyDate — code ${invite.code}. ${webBase}/app/household/join?code=${invite.code}`,
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

  async function handleJoin() {
    if (!joinCode.trim()) {
      setJoinError('Enter the invite code');
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      await acceptHouseholdInvite(joinCode.trim());
      setJoined(true);
      setShowJoin(false);
      setJoinCode('');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join — check the code and try again');
    } finally {
      setJoining(false);
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
              <Pressable onPress={() => handleRemove(uid)} disabled={busyUid === uid} hitSlop={8}>
                <Text style={[styles.removeText, busyUid === uid && { opacity: 0.5 }]}>Remove</Text>
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
            <Pressable style={styles.secondaryBtn} onPress={handleShare}>
              <Text style={styles.secondaryBtnText}>📤 Share invite</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.secondaryBtn, (inviting || memberIds.length >= 3) && { opacity: 0.5 }]}
            onPress={handleInvite}
            disabled={inviting || memberIds.length >= 3}
          >
            <Text style={styles.secondaryBtnText}>
              {inviting ? 'Creating…' : memberIds.length >= 3 ? 'Household is full (4 max)' : '+ Invite someone'}
            </Text>
          </Pressable>
        )}
        {inviteError && <Text style={styles.errorText}>{inviteError}</Text>}
      </View>

      <View style={styles.section}>
        {joined ? (
          <Text style={styles.joinedText}>You&apos;re in this household 🐾</Text>
        ) : showJoin ? (
          <View style={styles.joinForm}>
            <TextInput
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase())}
              placeholder="Invite code"
              placeholderTextColor={colors.brownLight}
              autoCapitalize="characters"
              maxLength={6}
              style={styles.joinInput}
            />
            {joinError && <Text style={styles.errorText}>{joinError}</Text>}
            <View style={styles.joinActions}>
              <Pressable style={[styles.submitBtn, joining && { opacity: 0.6 }]} onPress={handleJoin} disabled={joining}>
                <Text style={styles.submitText}>{joining ? 'Joining…' : 'Join household'}</Text>
              </Pressable>
              <Pressable onPress={() => { setShowJoin(false); setJoinError(null); }} hitSlop={8}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setShowJoin(true)}>
            <Text style={styles.joinLink}>Have an invite code?</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  subtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 2 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberName: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  removeText: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  section: { padding: 16, gap: 8 },
  codeBox: {
    borderRadius: radius.md,
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  codeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, textAlign: 'center' },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.brown,
    textAlign: 'center',
    paddingVertical: 4,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: '#DC2626' },
  joinLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primaryDark, textDecorationLine: 'underline' },
  joinedText: { fontFamily: fonts.semibold, fontSize: 13, color: '#1a5c1a' },
  joinForm: { gap: 8 },
  joinInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.brown,
  },
  joinActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  submitBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  submitText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  cancelLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownLight },
});
