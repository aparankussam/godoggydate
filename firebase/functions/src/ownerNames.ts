// firebase/functions/src/ownerNames.ts
// Owner first names, for matched people only (decision D4).
//
// A match shows "Priya · Waffles's owner" in the chat header and on playdate
// cards. The name comes from the account's Auth display name (Google / Apple),
// is written onto the MATCH document (matches/{id}.dog1OwnerFirstName and
// dog2OwnerFirstName), and nowhere else: not on dogs/{uid} (readable by every
// signed-in member), not on public pages, not in Discover, not in Pack Day. The
// match document is readable only by its two participants (firestore.rules), so
// a non-matched member cannot see it.
//
// Each owner can hide theirs with users/{uid}/private/preferences
// { showFirstName: false } (the switch in Profile; owner-writable per the
// private-docs rule). Hiding removes the field from every match they are in;
// showing writes it back.
//
// Both triggers write with the Admin SDK, which bypasses firestore.rules, so the
// rules can keep refusing client writes to these fields.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkContent } from './contentFilter';

// Lazy on purpose: index.ts calls admin.initializeApp() at its top level, and this
// module is pulled in from the bottom of that file.
const db = () => admin.firestore();

const MAX_FIRST_NAME_LENGTH = 30;

/**
 * The first word of an Auth display name, made safe to show to another member, or
 * null when there is nothing safe to show: no name; a first word that is not a name
 * (it must start with a letter and hold only letters, marks, apostrophes, hyphens
 * and periods, which also rules out emails, links, markup and emoji); or words the
 * content filter refuses.
 */
export function firstNameFromDisplayName(displayName: string | null | undefined): string | null {
  if (typeof displayName !== 'string') return null;
  const cleaned = displayName
    .normalize('NFC')
    // Newlines and tabs separate words; other control, zero-width and bidi-override
    // characters are dropped, not kept in a name.
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
    .trim();
  const first = cleaned.split(' ')[0] ?? '';
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’.-]*$/u.test(first)) return null;
  const name = Array.from(first).slice(0, MAX_FIRST_NAME_LENGTH).join('');
  return checkContent(name).ok ? name : null;
}

/** True unless the owner explicitly turned it off. */
async function showsFirstName(uid: string): Promise<boolean> {
  try {
    const snap = await db().doc(`users/${uid}/private/preferences`).get();
    return snap.data()?.showFirstName !== false;
  } catch (error) {
    // Cannot tell: do not show a name we may have been asked to hide.
    console.error('ownerNames: could not read preferences', { uid, error });
    return false;
  }
}

async function firstNameForUid(uid: string): Promise<string | null> {
  try {
    const user = await admin.auth().getUser(uid);
    return firstNameFromDisplayName(user.displayName);
  } catch (error) {
    // No such account (already deleted) or Auth hiccup: skip, never throw.
    console.warn('ownerNames: could not read auth user', { uid, error });
    return null;
  }
}

// New match: stamp both owners' first names (those who show one).
export const onMatchCreatedOwnerNames = functions.firestore
  .document('matches/{matchId}')
  .onCreate(async (snap, context) => {
    const { matchId } = context.params as { matchId: string };
    const data = snap.data() as { dog1UserId?: string; dog2UserId?: string };
    const updates: Record<string, string> = {};

    for (const [slot, uid] of [['dog1OwnerFirstName', data.dog1UserId], ['dog2OwnerFirstName', data.dog2UserId]] as const) {
      if (!uid || typeof uid !== 'string') continue;
      if (!(await showsFirstName(uid))) continue;
      const name = await firstNameForUid(uid);
      if (name) updates[slot] = name;
    }

    if (Object.keys(updates).length === 0) return;
    try {
      await snap.ref.update(updates);
    } catch (error) {
      // The match may have been deleted already; nothing to repair.
      console.error('ownerNames: could not stamp match', { matchId, error });
    }
  });

// The owner flipped the switch (or the preferences doc was written/deleted):
// bring that owner's name on every match they are in in line with it.
export const onFirstNamePreferenceChange = functions.firestore
  .document('users/{uid}/private/preferences')
  .onWrite(async (change, context) => {
    const { uid } = context.params as { uid: string };
    const before = change.before.exists ? change.before.data()?.showFirstName : undefined;
    const after = change.after.exists ? change.after.data()?.showFirstName : undefined;
    // Other preferences share this document; only act when this one changed.
    if (before === after) return;

    const show = after !== false;
    const name = show ? await firstNameForUid(uid) : null;
    const value = name ?? FieldValue.delete();

    for (const [userField, nameField] of [['dog1UserId', 'dog1OwnerFirstName'], ['dog2UserId', 'dog2OwnerFirstName']] as const) {
      const matches = await db().collection('matches').where(userField, '==', uid).get();
      for (let i = 0; i < matches.docs.length; i += 400) {
        const batch = db().batch();
        for (const match of matches.docs.slice(i, i + 400)) batch.update(match.ref, { [nameField]: value });
        await batch.commit();
      }
    }
  });
