import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coarsenPin,
  isValidLostId,
  lostFacts,
  medicineNeeds,
  sniffImageType,
  timeAgo,
  validateSighting,
} from './lostDog.ts';
import { checkContent } from './contentFilter.ts';

const clean = (t: string) => checkContent(t).ok;

test('medicineNeeds lists only Daily medicine reminders as "Needs <label> daily"', () => {
  assert.deepEqual(
    medicineNeeds([
      { type: 'medication', label: ' Apoquel ' },
      { type: 'heartworm', label: 'Heartworm prevention' },
      { type: 'medication', label: 'Apoquel' },
      { type: 'medication', label: '' },
    ]),
    ['Needs Apoquel daily', 'Needs medicine daily'],
  );
  assert.deepEqual(medicineNeeds([]), []);
});

test('medicineNeeds caps the list', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ type: 'medication', label: `Med ${i}` }));
  assert.equal(medicineNeeds(many).length, 5);
});

test('lostFacts lists what a finder needs and nothing private', () => {
  const lines = lostFacts({
    breed: 'Beagle', size: 'M', markings: 'White chest', microchipped: true,
    medicines: ['Needs Apoquel daily'], lastSeen: 'Riverside Park', city: 'Austin', state: 'TX',
  });
  assert.deepEqual(lines, [
    'Beagle · Medium', 'Markings: White chest', 'Microchipped', 'Needs Apoquel daily',
    'Last seen: Riverside Park', 'Lost near Austin, TX',
  ]);
});

test('coarsenPin rounds to about a kilometre and rejects junk', () => {
  assert.deepEqual(coarsenPin(30.267153, -97.743057), { lat: 30.27, lng: -97.74 });
  assert.equal(coarsenPin(91, 0), null);
  assert.equal(coarsenPin('1', 2), null);
  assert.equal(coarsenPin(NaN, 2), null);
});

test('validateSighting accepts a normal report and keeps the exact pin for the owner', () => {
  const r = validateSighting({ message: 'Saw him by the creek at 5pm', contact: '555 010 0199', lat: 30.267153, lng: -97.743057 }, clean);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.lat, 30.267153);
    assert.equal(r.value.contact, '555 010 0199');
  }
});

test('validateSighting rejects links, empty messages and bad pins', () => {
  assert.equal(validateSighting({ message: 'buy now http://spam.example' }, clean).ok, false);
  assert.equal(validateSighting({ message: 'visit spam.com today' }, clean).ok, false);
  assert.equal(validateSighting({ message: 'ok' }, clean).ok, false);
  assert.equal(validateSighting({ message: 'I saw the dog', lat: 500, lng: 1 }, clean).ok, false);
  assert.equal(validateSighting({ message: 'I saw the dog', lat: '', lng: '' }, clean).ok, true);
});

test('validateSighting runs the content filter on every text field', () => {
  const r = validateSighting({ message: 'I saw the dog near the park', finderName: 'I will kill you' }, clean);
  assert.equal(r.ok, false);
});

test('sniffImageType trusts bytes, not the declared type', () => {
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
  assert.equal(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
});

test('isValidLostId and timeAgo', () => {
  assert.equal(isValidLostId('AbCdEfGh12'), true);
  assert.equal(isValidLostId('../etc'), false);
  assert.equal(timeAgo(0, 30 * 60000), '30 min ago');
  assert.equal(timeAgo(0, 3 * 3600000), '3 h ago');
});

test('kit readiness counts the four parts and names what is missing', async () => {
  const { kitReadiness } = await import('./lostDog.ts');
  assert.deepEqual(kitReadiness(null), { done: 0, total: 4, missing: ['Recent photo', 'Markings', 'Microchip number', 'Vet phone'] });
  assert.deepEqual(kitReadiness({ photoUrl: 'x', markings: ' ', microchip: '985', vetPhone: '555' }), { done: 3, total: 4, missing: ['Markings'] });
});

test('the panic checklist is short and every step says what to do', async () => {
  const { LOST_CHECKLIST } = await import('./lostDog.ts');
  assert.ok(LOST_CHECKLIST.length >= 4 && LOST_CHECKLIST.length <= 6);
  for (const step of LOST_CHECKLIST) assert.ok(step.title && step.body.length > 20);
});
