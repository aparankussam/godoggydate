#!/usr/bin/env node
// Admin tool: take down a Pack Day (moderator removal).
//
// Cancels the event the same way the host's Cancel button does (status
// 'cancelled' plus cancelledAtMs, which both apps already show as "This Pack
// Day was cancelled."), and also sets removedByModerator: true and
// removedReason. The onPackDayCancelled Cloud Function sees the change and
// pushes to everyone who signed up ("<title> was removed by GoDoggyDate.") and
// to the host. The event and the reason are recorded in
// moderationLog/packday_<eventId> (Admin-only).
//
// Deploy the functions (with onPackDayCancelled) before using this, or
// nobody is told. The push is sent once, on the change to cancelled, so it
// won't go out later for events removed before the deploy.
//
// The reason is stored on the event, which every signed-in member can read,
// so write it for them ("Broke the Pack Day rules"), not as an internal note.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-remove-packday.cjs <eventId> [--reason "..."]            # dry run, changes nothing
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//     node scripts/admin-remove-packday.cjs <eventId> [--reason "..."] --confirm  # removes it
//
// The event id is in the ops alert for a Pack Day report, and in the
// /app/pack/<eventId> link.

const admin = require('firebase-admin');

const MAX_REASON = 280;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/admin-remove-packday.cjs <eventId> [--reason "..."] [--confirm]');
  process.exit(1);
}

function parseArgs() {
  const args = { confirm: false, reason: null, eventId: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confirm') args.confirm = true;
    else if (arg === '--reason') {
      if (i + 1 >= argv.length) usage('--reason needs a value.');
      args.reason = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg.startsWith('--')) usage(`Unknown option ${arg}.`);
    else if (args.eventId === null) args.eventId = arg;
    else usage(`Unexpected argument ${arg}. Put the reason in quotes.`);
  }
  if (!args.eventId || args.eventId.length > 128 || args.eventId.includes('/')) {
    usage('Give the Pack Day event id.');
  }
  if (args.reason !== null) {
    args.reason = args.reason.replace(/\s+/g, ' ').trim() || null;
    if (args.reason && args.reason.length > MAX_REASON) usage(`Keep the reason to ${MAX_REASON} characters.`);
  }
  return args;
}

function when(event) {
  const startsAtMs = typeof event.startsAtMs === 'number' ? event.startsAtMs : null;
  const utc = startsAtMs !== null ? new Date(startsAtMs).toISOString() : 'unknown';
  return `${event.localDate ?? '?'} ${event.localTime ?? '?'} local (${utc}), ${event.durationMinutes ?? '?'} min`;
}

function isOver(event, nowMs) {
  if (typeof event.startsAtMs !== 'number' || typeof event.durationMinutes !== 'number') return false;
  return nowMs >= event.startsAtMs + event.durationMinutes * 60_000;
}

function printEvent(eventId, event) {
  const attendees = Array.isArray(event.attendeeUids) ? event.attendeeUids : [];
  const where = [event.placeName, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  console.log(`Pack Day ${eventId}`);
  console.log(`  title:     ${event.title ?? '(none)'}`);
  console.log(`  host:      ${event.hostDogName ?? '(no name)'} (${event.hostUid ?? 'unknown'})`);
  console.log(`  when:      ${when(event)}`);
  console.log(`  where:     ${where || '(none)'}`);
  console.log(`  note:      ${event.note || '(none)'}`);
  console.log(`  going:     ${attendees.length} of ${event.capacity ?? '?'} (host included)`);
  console.log(`  status:    ${event.status ?? 'unknown'}${event.removedByModerator === true ? ' (removed by a moderator)' : ''}`);
  if (event.official === true) console.log('  official:  yes (founder-hosted)');
}

async function main() {
  const { eventId, reason, confirm } = parseArgs();

  admin.initializeApp({ projectId: 'godoggydate' });
  const db = admin.firestore();
  const ref = db.doc(`packDays/${eventId}`);
  const logRef = db.doc(`moderationLog/packday_${eventId}`);

  console.log(`Firebase project: ${admin.app().options.projectId}\n`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`packDays/${eventId} doesn't exist.`);
  const event = snap.data();
  printEvent(eventId, event);

  if (event.status === 'cancelled') {
    console.log('\nAlready cancelled, so there is nothing to take down. Nothing changed.');
    return;
  }

  const attendees = (Array.isArray(event.attendeeUids) ? event.attendeeUids : []).filter((u) => u !== event.hostUid);
  const over = isOver(event, Date.now());
  console.log('\nWill:');
  console.log(`  - set status 'cancelled', removedByModerator: true, removedReason: ${reason ? JSON.stringify(reason) : 'null'} on ${ref.path}`);
  console.log(`  - write ${logRef.path}`);
  if (over) {
    console.log('  - push to nobody: the event is already over (onPackDayCancelled skips finished events)');
  } else {
    console.log(`  - push (from onPackDayCancelled) to ${attendees.length} attendee(s) and the host`);
  }

  if (!confirm) {
    console.log('\nDry run only. Re-run with --confirm to remove it.');
    return;
  }

  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new Error(`packDays/${eventId} was deleted while this ran.`);
    const current = fresh.data();
    if (current.status === 'cancelled') throw new Error('It was cancelled while this ran. Nothing changed.');
    tx.update(ref, {
      status: 'cancelled',
      cancelledAtMs: nowMs,
      removedByModerator: true,
      removedReason: reason,
    });
    tx.set(logRef, {
      kind: 'packday_removed',
      uid: current.hostUid ?? null,
      eventId,
      reason,
      // The event as it was, so the record stands even if the host later
      // deletes their account (which deletes the event).
      event: {
        title: current.title ?? null,
        note: current.note ?? null,
        placeName: current.placeName ?? null,
        city: current.city ?? null,
        state: current.state ?? null,
        hostUid: current.hostUid ?? null,
        hostDogName: current.hostDogName ?? null,
        startsAtMs: current.startsAtMs ?? null,
        localDate: current.localDate ?? null,
        localTime: current.localTime ?? null,
        attendeeUids: current.attendeeUids ?? [],
        official: current.official === true,
      },
      via: 'scripts/admin-remove-packday.cjs',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(`\nRemoved. ${over ? 'No pushes (the event is over).' : 'onPackDayCancelled will tell the attendees and the host.'}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Failed:', error.message || error);
  process.exit(1);
});
