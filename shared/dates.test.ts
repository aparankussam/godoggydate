import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseUsDateInput,
  isRealCalendarDate,
  formatUsDate,
  formatUsIso,
  formatUsMonthYear,
  formatUsPartial,
  partialFromBirthFields,
  birthFieldsFromPartial,
  toAdoptionDateIso,
  partialFromAdoptionDate,
  toIsoDate,
  partialFromIsoDate,
  maskUsDateInput,
} from './dates.ts';

// ── parsing ──────────────────────────────────────────────────────────────────

test('parseUsDateInput accepts the three US shapes, padded or not', () => {
  assert.deepEqual(parseUsDateInput('06/14/2021'), { ok: true, value: { year: 2021, month: 6, day: 14 } });
  assert.deepEqual(parseUsDateInput('6/14/2021'), { ok: true, value: { year: 2021, month: 6, day: 14 } });
  assert.deepEqual(parseUsDateInput('06/2021'), { ok: true, value: { year: 2021, month: 6, day: null } });
  assert.deepEqual(parseUsDateInput('6/2021'), { ok: true, value: { year: 2021, month: 6, day: null } });
  assert.deepEqual(parseUsDateInput('2021'), { ok: true, value: { year: 2021, month: null, day: null } });
  assert.deepEqual(parseUsDateInput('  06/14/2021  '), { ok: true, value: { year: 2021, month: 6, day: 14 } });
});

test('parseUsDateInput DEGRADES an impossible day but keeps year+month', () => {
  // This is the behaviour both save paths already had — losing the month the
  // owner clearly knows would be worse than ignoring a typo'd day.
  assert.deepEqual(parseUsDateInput('02/31/2021'), { ok: true, value: { year: 2021, month: 2, day: null } });
  assert.deepEqual(parseUsDateInput('04/31/2021'), { ok: true, value: { year: 2021, month: 4, day: null } });
  // A leap day that DOES exist survives.
  assert.deepEqual(parseUsDateInput('02/29/2024'), { ok: true, value: { year: 2024, month: 2, day: 29 } });
  // …and one that doesn't, degrades.
  assert.deepEqual(parseUsDateInput('02/29/2023'), { ok: true, value: { year: 2023, month: 2, day: null } });
});

test('parseUsDateInput reports empty vs unrecognized vs impossible', () => {
  assert.deepEqual(parseUsDateInput(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseUsDateInput('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(parseUsDateInput(null), { ok: false, reason: 'empty' });
  assert.deepEqual(parseUsDateInput(undefined), { ok: false, reason: 'empty' });
  assert.deepEqual(parseUsDateInput('hello'), { ok: false, reason: 'unrecognized' });
  assert.deepEqual(parseUsDateInput('2021-08-14'), { ok: false, reason: 'unrecognized' });
  assert.deepEqual(parseUsDateInput('06/14/21'), { ok: false, reason: 'unrecognized' });
  assert.deepEqual(parseUsDateInput('1/2/3/4'), { ok: false, reason: 'unrecognized' });
  assert.deepEqual(parseUsDateInput('13/2021'), { ok: false, reason: 'impossible' });
  assert.deepEqual(parseUsDateInput('00/2021'), { ok: false, reason: 'impossible' });
});

test('isRealCalendarDate round-trips rather than trusting JS rollover', () => {
  assert.equal(isRealCalendarDate(2021, 2, 31), false);
  assert.equal(isRealCalendarDate(2021, 2, 28), true);
  assert.equal(isRealCalendarDate(2024, 2, 29), true);
  assert.equal(isRealCalendarDate(2023, 2, 29), false);
  assert.equal(isRealCalendarDate(2021, 13, 1), false);
  assert.equal(isRealCalendarDate(2021, 0, 1), false);
  assert.equal(isRealCalendarDate(2021, 1, 0), false);
});

// ── display ──────────────────────────────────────────────────────────────────

test('formatters emit US format and never a fake date', () => {
  assert.equal(formatUsDate(new Date(2026, 7, 26)), '08/26/2026');
  assert.equal(formatUsDate(new Date(2026, 0, 5)), '01/05/2026');
  assert.equal(formatUsDate(null), '');
  assert.equal(formatUsIso('2027-04-18'), '04/18/2027');
  assert.equal(formatUsIso('2027-02-31'), null); // not a real date
  assert.equal(formatUsIso('2027-04'), null); // wrong shape
  assert.equal(formatUsIso(null), null);
  assert.equal(formatUsMonthYear(new Date(2026, 7, 1)), 'August 2026');
  assert.equal(formatUsPartial({ year: 2021, month: 6, day: 14 }), '06/14/2021');
  assert.equal(formatUsPartial({ year: 2021, month: 6, day: null }), '06/2021');
  assert.equal(formatUsPartial({ year: 2021, month: null, day: null }), '2021');
  assert.equal(formatUsPartial(null), '');
});

// ── birthday round-trip (the stored contract must not drift) ──────────────────

test('birthday fields survive a full round-trip byte-identically', () => {
  const now = new Date(2026, 7, 27);
  const cases = [
    { birthYear: 2021, birthMonth: 6, birthDay: 14 },
    { birthYear: 2021, birthMonth: 6, birthDay: null },
    { birthYear: 2021, birthMonth: null, birthDay: null },
  ];
  for (const stored of cases) {
    const shown = formatUsPartial(
      partialFromBirthFields(stored.birthYear, stored.birthMonth, stored.birthDay),
    );
    const reparsed = parseUsDateInput(shown);
    assert.equal(reparsed.ok, true, `should re-parse "${shown}"`);
    const back = birthFieldsFromPartial(reparsed.ok ? reparsed.value : null, now);
    assert.deepEqual(back, stored, `round-trip failed for ${JSON.stringify(stored)}`);
  }
});

test('birthFieldsFromPartial enforces the 1990..thisYear range lifeStage requires', () => {
  const now = new Date(2026, 7, 27);
  assert.deepEqual(
    birthFieldsFromPartial({ year: 1989, month: 6, day: 14 }, now),
    { birthYear: null, birthMonth: null, birthDay: null },
  );
  assert.deepEqual(
    birthFieldsFromPartial({ year: 2027, month: 6, day: 14 }, now),
    { birthYear: null, birthMonth: null, birthDay: null },
  );
  assert.deepEqual(
    birthFieldsFromPartial({ year: 1990, month: 1, day: 1 }, now),
    { birthYear: 1990, birthMonth: 1, birthDay: 1 },
  );
  // A day with no month can't be stored (it would be meaningless).
  assert.deepEqual(
    birthFieldsFromPartial({ year: 2021, month: null, day: 14 }, now),
    { birthYear: 2021, birthMonth: null, birthDay: null },
  );
});

// ── Gotcha Day round-trip ────────────────────────────────────────────────────

test('adoptionDate survives a full round-trip and is ALWAYS zero-padded', () => {
  for (const stored of ['2021-08-14', '2021-08', '2021-12-01']) {
    const shown = formatUsPartial(partialFromAdoptionDate(stored));
    const reparsed = parseUsDateInput(shown);
    assert.equal(reparsed.ok, true, `should re-parse "${shown}"`);
    const back = toAdoptionDateIso(reparsed.ok ? reparsed.value : null);
    assert.equal(back, stored, `round-trip failed for ${stored}`);
  }
});

test('toAdoptionDateIso zero-pads regardless of how it was typed', () => {
  const parsed = parseUsDateInput('6/4/2021');
  assert.equal(parsed.ok, true);
  assert.equal(toAdoptionDateIso(parsed.ok ? parsed.value : null), '2021-06-04');
  const monthOnly = parseUsDateInput('6/2021');
  assert.equal(toAdoptionDateIso(monthOnly.ok ? monthOnly.value : null), '2021-06');
});

test('toAdoptionDateIso refuses a year-only value rather than inventing January', () => {
  // adoptionDate has no year-only stored form; fabricating 'YYYY-01' would fire
  // a wrong Gotcha Day push.
  assert.equal(toAdoptionDateIso({ year: 2021, month: null, day: null }), null);
});

test('partialFromAdoptionDate rejects malformed/unpadded stored values', () => {
  assert.equal(partialFromAdoptionDate('2021-8'), null);
  assert.equal(partialFromAdoptionDate('2021'), null);
  assert.equal(partialFromAdoptionDate('2021-02-31'), null);
  assert.equal(partialFromAdoptionDate(''), null);
  assert.equal(partialFromAdoptionDate(null), null);
});

// ── strict ISO (rabies expiry) ───────────────────────────────────────────────

test('rabies expiry round-trips through the strict ISO helpers', () => {
  const stored = '2027-04-18';
  const shown = formatUsPartial(partialFromIsoDate(stored));
  assert.equal(shown, '04/18/2027');
  const reparsed = parseUsDateInput(shown);
  assert.equal(toIsoDate(reparsed.ok ? reparsed.value : null), stored);
  // A partial date is not a valid expiry — it must be exact.
  assert.equal(toIsoDate({ year: 2027, month: 4, day: null }), null);
  assert.equal(partialFromIsoDate('2027-04'), null);
});

// ── masking ──────────────────────────────────────────────────────────────────

test('maskUsDateInput keeps the slashes the owner types and caps each segment', () => {
  // Typing a full date, one keystroke at a time.
  assert.equal(maskUsDateInput('0'), '0');
  assert.equal(maskUsDateInput('06'), '06');
  assert.equal(maskUsDateInput('06/'), '06/');
  assert.equal(maskUsDateInput('06/1'), '06/1');
  assert.equal(maskUsDateInput('06/14'), '06/14');
  assert.equal(maskUsDateInput('06/14/'), '06/14/');
  assert.equal(maskUsDateInput('06/14/2021'), '06/14/2021');
  // Idempotent.
  assert.equal(maskUsDateInput(maskUsDateInput('06/14/2021')), '06/14/2021');
  // Junk stripped, repeated slashes collapsed, extra parts dropped.
  assert.equal(maskUsDateInput('06-14-2021'), '06142021'.slice(0, 4));
  assert.equal(maskUsDateInput('06//14'), '06/14');
  assert.equal(maskUsDateInput('06/14/2021/9'), '06/14/2021');
  // Segment caps.
  assert.equal(maskUsDateInput('061/14/2021'), '06/14/2021');
  assert.equal(maskUsDateInput('06/14/20219'), '06/14/2021');
  assert.equal(maskUsDateInput(''), '');
});

test('maskUsDateInput leaves the two PARTIAL shapes typeable', () => {
  // This is the regression that made a month-only Gotcha Day and a year-only
  // birthday impossible to enter: an auto-inserting mask rebuilt "062021" as
  // "06/20/21" and "2021" as "20/21", both of which then failed to parse.
  assert.equal(maskUsDateInput('06/2021'), '06/2021');
  assert.equal(maskUsDateInput('2021'), '2021');
  for (const shape of ['06/2021', '2021', '06/14/2021']) {
    const masked = maskUsDateInput(shape);
    assert.equal(masked, shape, `mask must not rewrite ${shape}`);
    assert.equal(parseUsDateInput(masked).ok, true, `${shape} must stay parseable`);
  }
  // And each keystroke on the way to "06/2021" survives.
  for (const step of ['0', '06', '06/', '06/2', '06/20', '06/202', '06/2021']) {
    assert.equal(maskUsDateInput(step), step, `keystroke "${step}" must pass through`);
  }
});
