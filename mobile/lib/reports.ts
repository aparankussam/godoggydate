// mobile/lib/reports.ts
// Report or block someone from anywhere in the app: a Discover card, a
// matched dog's page, chat, or a Pack Day event. Apple guideline 1.2 expects
// both wherever another person's content appears, not only inside chat.
//
// Writes the same report documents as web/components/ReportProfileMenu.tsx:
// reports/{reporterId}_{targetUserId}_{ms}, create-only per firestore.rules,
// which onReportCreated forwards to the ops channel. Blocking happens first
// and on its own, so a failed report write never skips the block.

import { Alert } from 'react-native';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { blockUser } from './blocks';
import { trackEvent } from './analytics';

export type ReportReason = 'block' | 'spam' | 'inappropriate';
export type ReportSource = 'profile' | 'chat' | 'packday' | 'cityfeed';

export interface ReportTarget {
  reporterId: string;
  targetUserId: string;
  source: ReportSource;
  /** Set when reporting from a match or chat, so the server keeps the thread as evidence. */
  matchId?: string;
  /** Set when reporting from a Pack Day event, so a moderator can see which one. */
  eventId?: string;
  /** Set with eventId when reporting one Pack Day chat message, so a moderator sees exactly that message. */
  messageId?: string;
  /** Set when reporting a city feed post, so a moderator can see which one. */
  postId?: string;
}

export type ReportOutcome = 'reported' | 'blocked' | 'blocked_report_failed' | 'failed';

export async function submitReport(target: ReportTarget, reason: ReportReason): Promise<ReportOutcome> {
  if (!target.reporterId || !target.targetUserId || target.reporterId === target.targetUserId) {
    return 'failed';
  }

  if (reason === 'block') {
    try {
      await blockUser(target.reporterId, target.targetUserId);
    } catch (error) {
      console.warn('Block failed', error);
      return 'failed';
    }
  }

  try {
    const { db } = getFirebase();
    // Unique id per submission, so a repeat report is a create, never an update.
    await setDoc(doc(db, 'reports', `${target.reporterId}_${target.targetUserId}_${Date.now()}`), {
      reporterId: target.reporterId,
      targetUserId: target.targetUserId,
      ...(target.matchId ? { matchId: target.matchId } : {}),
      ...(target.eventId ? { eventId: target.eventId } : {}),
      ...(target.messageId ? { messageId: target.messageId } : {}),
      ...(target.postId ? { postId: target.postId } : {}),
      reason,
      source: target.source,
      createdAt: serverTimestamp(),
    });
    trackEvent('report_submitted', { reason, source: target.source });
    return reason === 'block' ? 'blocked' : 'reported';
  } catch (error) {
    console.warn('Report failed', error);
    return reason === 'block' ? 'blocked_report_failed' : 'failed';
  }
}

export interface ReportSheetOptions {
  /** Shown in the sheet title, e.g. the dog's name. */
  name?: string;
  /** Runs after a successful block, e.g. to leave the screen or drop the card. */
  onBlocked?: () => void;
}

/** The standard safety sheet: report spam, report inappropriate, or block. */
export function openReportSheet(target: ReportTarget, options: ReportSheetOptions = {}): void {
  const run = async (reason: ReportReason) => {
    const outcome = await submitReport(target, reason);
    if (outcome === 'blocked' || outcome === 'blocked_report_failed') {
      Alert.alert('Blocked', 'You won’t see each other on GoDoggyDate any more.', [
        { text: 'OK', onPress: () => options.onBlocked?.() },
      ]);
    } else if (outcome === 'reported') {
      Alert.alert('Report sent', 'Thanks for letting us know. We review every report within 24 hours.');
    } else {
      Alert.alert('That didn’t go through', 'Please check your connection and try again.');
    }
  };

  Alert.alert(
    options.name ? `Safety options for ${options.name}` : 'Safety options',
    'Reports are private. The other person isn’t told who reported them.',
    [
      { text: 'Report spam or fake profile', onPress: () => void run('spam') },
      { text: 'Report inappropriate behaviour', onPress: () => void run('inappropriate') },
      { text: 'Block', style: 'destructive', onPress: () => void run('block') },
      { text: 'Cancel', style: 'cancel' },
    ],
    // Android shows at most three buttons, so Cancel can be the one dropped;
    // tapping outside (or Back) must still be a way out that reports nothing.
    { cancelable: true },
  );
}
