// mobile/components/ModerationNotice.tsx
// A calm banner at the top of the Profile tab, shown when the server cleared
// some of the dog's profile text for breaking the community rules (the
// content-filter trigger in firebase/functions). The server writes
// users/{uid}/private/moderationNotice as
//   { fields: string[], reason: 'slur' | 'sexual' | 'threat', at: Timestamp }
// and the owner can read and delete it under the existing private-doc rule.
// Dismissing deletes the doc, so it doesn't come back on the next launch or on
// web. The reason isn't shown: the point is to tell the owner what changed and
// that they can fix it, not to repeat what was said.

import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { colors, fonts, radius } from '../constants/theme';
import { getFirebase } from '../lib/firebase';

// Every key the server can write, in the words the owner sees in the editor.
// Unknown keys fall back to the raw key rather than disappearing.
const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  breed: 'breed',
  location: 'neighborhood',
  bio: 'bio',
  healthNotes: 'health notes',
  temperament: 'temperament',
  playStyles: 'play style',
  notGoodWith: 'safety notes',
  behaviorFlags: 'safety notes',
  goodWith: 'good with',
  boundaries: 'boundaries',
  allergies: 'allergies',
  specialNeeds: 'special needs',
  prompts: 'prompt answers',
};

/** Friendly, de-duplicated labels for the cleared fields, in the order given. */
export function friendlyFieldLabels(fields: unknown): string[] {
  if (!Array.isArray(fields)) return [];
  const labels: string[] = [];
  for (const field of fields) {
    if (typeof field !== 'string' || !field.trim()) continue;
    const label = FIELD_LABELS[field] ?? field;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

/** "name", "name and bio", "name, bio, and prompt answers". */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/** Identifies one notice, so the same one doesn't trigger a re-read twice. */
function noticeKey(data: Record<string, unknown> | undefined): string {
  const at = data?.at as { toMillis?: () => number } | undefined;
  const millis = typeof at?.toMillis === 'function' ? at.toMillis() : null;
  return millis !== null ? String(millis) : JSON.stringify(data?.fields ?? null);
}

interface Props {
  uid: string;
  dogName?: string;
  /** Opens the profile editor. */
  onEdit?: () => void;
  /**
   * Called once for each new notice. The server has just changed the dog doc,
   * so the screen's copy of the profile is out of date; the Profile tab
   * re-reads it here, as web does.
   */
  onNotice?: () => void;
}

export default function ModerationNotice({ uid, dogName, onEdit, onNotice }: Props) {
  // undefined until the first snapshot; null when there's no notice.
  const [fields, setFields] = useState<string[] | null | undefined>(undefined);
  const [dismissing, setDismissing] = useState(false);
  // Kept in refs so a new callback identity doesn't re-subscribe the listener.
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const lastNoticeKey = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    return onSnapshot(
      doc(db, 'users', uid, 'private', 'moderationNotice'),
      (snap) => {
        if (!snap.exists()) {
          setFields(null);
          return;
        }
        const data = snap.data();
        setFields(friendlyFieldLabels(data?.fields));
        const key = noticeKey(data);
        if (key !== lastNoticeKey.current) {
          lastNoticeKey.current = key;
          onNoticeRef.current?.();
        }
      },
      // A failed read is not worth an error on the profile; show nothing.
      () => setFields(null),
    );
  }, [uid]);

  if (!fields) return null;

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      const { db } = getFirebase();
      await deleteDoc(doc(db, 'users', uid, 'private', 'moderationNotice'));
      // The listener hides the banner once the delete lands.
    } catch {
      Alert.alert('Could not dismiss', 'Please try again in a moment.');
    } finally {
      setDismissing(false);
    }
  }

  const name = dogName?.trim();
  const whose = name ? `${name}’s` : 'your dog’s';
  const list = joinLabels(fields);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.body}>
        We removed some text from {whose} profile because it broke our community rules
        {list ? `: ${list}` : ''}. You can edit it any time.
      </Text>
      <View style={styles.actions}>
        {onEdit && (
          <Pressable
            onPress={onEdit}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={styles.editButton}
          >
            <Text style={styles.editText}>Edit profile</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleDismiss}
          disabled={dismissing}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this notice"
          style={[styles.dismissButton, dismissing && styles.busy]}
        >
          <Text style={styles.dismissText}>{dismissing ? 'Dismissing…' : 'Dismiss'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  editButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  dismissButton: { paddingHorizontal: 8, paddingVertical: 7 },
  dismissText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownLight },
  busy: { opacity: 0.6 },
});
