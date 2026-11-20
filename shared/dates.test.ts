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
  isPartialDateInFuture,
  birthDateProblem,
  adoptionDateProblem,
  rabiesExpiryProblem,
  maskedCaretPosition,
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
  assert.equal(maskUsDateInput('06//14'), '06/14');
  assert.equal(maskUsDateInput('/06'), '06');
  assert.equal(maskUsDateInput('06/14/2021/9'), '06/14/2021');
  assert.equal(maskUsDateInput('ab06/14/2021'), '06/14/2021');
  // Segment caps.
  assert.equal(maskUsDateInput('06/14/20219'), '06/14/2021');
  assert.equal(maskUsDateInput('20219'), '2021');
  assert.equal(maskUsDateInput(''), '');
});

// Type like a controlled <input maxLength={10}>: each key is appended to what
// the box currently shows, then masked.
function typeInto(keys: string): string {
  let shown = '';
  for (const key of keys) {
    const next = shown + key;
    if (next.length > 10) continue;
    shown = maskUsDateInput(next);
  }
  return shown;
}

test('maskUsDateInput: digits-only typing gets its slashes (a phone numeric keypad has no "/")', () => {
  // This is the reported bug: the box stuck at "0614" because nothing but a
  // typed slash could continue it.
  assert.equal(typeInto('06142021'), '06/14/2021');
  assert.equal(typeInto('01012020'), '01/01/2020');
  assert.equal(typeInto('12312025'), '12/31/2025');
  assert.equal(typeInto('02292024'), '02/29/2024');
  // Months 3–9 and days 4–9 need no leading zero; months 1–2 and days 1–3 do.
  assert.equal(typeInto('6142021'), '6/14/2021');
  assert.equal(typeInto('06142021'), '06/14/2021');
  assert.equal(typeInto('6/4/2021'), '6/4/2021');
  assert.equal(typeInto('0642021'), '06/4/2021');
  // Days 19 and 20 look like the start of a year until the fifth digit.
  assert.equal(typeInto('06202021'), '06/20/2021');
  assert.equal(typeInto('06192019'), '06/19/2019');
  assert.equal(typeInto('05202027'), '05/20/2027');
  // Every full date it produces parses to what was typed.
  assert.deepEqual(parseUsDateInput(typeInto('06142021')), { ok: true, value: { year: 2021, month: 6, day: 14 } });
  assert.deepEqual(parseUsDateInput(typeInto('06202021')), { ok: true, value: { year: 2021, month: 6, day: 20 } });
});

test('maskUsDateInput: the two PARTIAL shapes still work digits-only', () => {
  // The case that ruled out naive auto-slashing: these must NOT be rebuilt as
  // "06/20/21" and "20/21".
  assert.equal(typeInto('062021'), '06/2021');
  assert.equal(typeInto('62021'), '6/2021');
  assert.equal(typeInto('2021'), '2021');
  assert.equal(typeInto('1999'), '1999');
  assert.deepEqual(parseUsDateInput(typeInto('062021')), { ok: true, value: { year: 2021, month: 6, day: null } });
  assert.deepEqual(parseUsDateInput(typeInto('2021')), { ok: true, value: { year: 2021, month: null, day: null } });
  // Each keystroke on the way shows what a person expects.
  const shown: string[] = [];
  let v = '';
  for (const key of '06142021') shown.push((v = maskUsDateInput(v + key)));
  assert.deepEqual(shown, ['0', '06', '06/1', '06/14', '06/14/2', '06/14/20', '06/14/202', '06/14/2021']);
});

test('maskUsDateInput: dashes, dots and spaces stand in for slashes, and ISO is turned around', () => {
  assert.equal(typeInto('06-14-2021'), '06/14/2021');
  assert.equal(typeInto('06.14.2021'), '06/14/2021');
  assert.equal(typeInto('06 14 2021'), '06/14/2021');
  // Pasted 'YYYY-MM-DD' used to collapse silently to the year ("2021").
  assert.equal(maskUsDateInput('2021-06-14'), '06/14/2021');
  assert.equal(maskUsDateInput(' 2021-06-14 '), '06/14/2021');
  assert.equal(typeInto('2021-06-14'), '06/14/2021');
  // Not flipped halfway through typing it.
  assert.equal(maskUsDateInput('2021-06-1'), '2021/06/1');
});

test('maskUsDateInput: an impossible day stays visible instead of being reshuffled', () => {
  // "03322022" must not become "03/3/2202" (March 3, year 2202). It shows the
  // 32, and parseUsDateInput then keeps just March 2022, same as typing 03/32/2022.
  assert.equal(typeInto('03322022'), '03/32/2022');
  assert.deepEqual(parseUsDateInput('03/32/2022'), { ok: true, value: { year: 2022, month: 3, day: null } });
  // A month that isn't one is left for the save-time error, not dropped.
  assert.equal(typeInto('13/2021'), '13/2021');
  assert.deepEqual(parseUsDateInput('13/2021'), { ok: false, reason: 'impossible' });
});

test('maskUsDateInput is stable: re-masking never changes a value, and backspace never sticks', () => {
  // Exhaustive over every string of up to 5 characters from a digit/slash
  // alphabet that covers each segment rule.
  const alphabet = ['0', '1', '2', '3', '4', '9', '/'];
  const walk = (s: string, depth: number) => {
    const out = maskUsDateInput(s);
    assert.equal(maskUsDateInput(out), out, `re-masking ${JSON.stringify(s)} → ${JSON.stringify(out)}`);
    // Deleting the last character of what's shown must give back exactly that
    // shorter string, otherwise an auto-inserted slash would trap the cursor.
    for (let k = 0; k < out.length; k++) {
      const shorter = out.slice(0, k);
      assert.equal(maskUsDateInput(shorter), shorter, `backspace from ${JSON.stringify(out)} to ${JSON.stringify(shorter)}`);
    }
    if (depth === 0) return;
    for (const c of alphabet) walk(s + c, depth - 1);
  };
  walk('', 5);
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

// ── trailing separators, future dates, absurd years, caret ───────────────────

test('parseUsDateInput ignores a trailing slash (a trailing space is masked into one)', () => {
  // "2021 " and "06/2021 " are what a phone keyboard leaves behind; they were
  // rejected with "Use MM/DD/YYYY" even though the date is plainly typed.
  assert.deepEqual(parseUsDateInput('2021/'), { ok: true, value: { year: 2021, month: null, day: null } });
  assert.deepEqual(parseUsDateInput('06/2021/'), { ok: true, value: { year: 2021, month: 6, day: null } });
  assert.deepEqual(parseUsDateInput('06/14/2021/'), { ok: true, value: { year: 2021, month: 6, day: 14 } });
  assert.equal(maskUsDateInput('2021 '), '2021/');
  assert.deepEqual(parseUsDateInput(maskUsDateInput('2021 ')), { ok: true, value: { year: 2021, month: null, day: null } });
  // Still unrecognised when what precedes the slash isn't a date.
  assert.deepEqual(parseUsDateInput('06/14/'), { ok: false, reason: 'unrecognized' });
  assert.deepEqual(parseUsDateInput('/'), { ok: false, reason: 'empty' });
});

test('isPartialDateInFuture judges each shape against today', () => {
  const now = new Date(2026, 10, 20); // 20 Nov 2026
  assert.equal(isPartialDateInFuture({ year: 2026, month: 11, day: 20 }, now), false); // today
  assert.equal(isPartialDateInFuture({ year: 2026, month: 11, day: 21 }, now), true); // tomorrow
  assert.equal(isPartialDateInFuture({ year: 2026, month: 12, day: 25 }, now), true); // later this year
  assert.equal(isPartialDateInFuture({ year: 2026, month: 12, day: null }, now), true);
  assert.equal(isPartialDateInFuture({ year: 2026, month: 11, day: null }, now), false); // month under way
  assert.equal(isPartialDateInFuture({ year: 2026, month: 10, day: 31 }, now), false);
  assert.equal(isPartialDateInFuture({ year: 2026, month: null, day: null }, now), false);
  assert.equal(isPartialDateInFuture({ year: 2027, month: null, day: null }, now), true);
  assert.equal(isPartialDateInFuture({ year: 2025, month: 12, day: 31 }, now), false);
});

test('birthDateProblem rejects pre-1990 and not-yet-happened birthdays only', () => {
  const now = new Date(2026, 10, 20);
  assert.equal(birthDateProblem({ year: 2021, month: 6, day: 14 }, now), null);
  assert.equal(birthDateProblem({ year: 2026, month: 11, day: 20 }, now), null); // born today
  assert.equal(birthDateProblem({ year: 2026, month: 11, day: null }, now), null);
  assert.equal(birthDateProblem({ year: 2026, month: null, day: null }, now), null);
  assert.equal(birthDateProblem({ year: 1990, month: 1, day: 1 }, now), null);
  assert.match(birthDateProblem({ year: 1989, month: 12, day: 31 }, now) ?? '', /between 1990 and 2026/);
  assert.match(birthDateProblem({ year: 2027, month: null, day: null }, now) ?? '', /between 1990 and 2026/);
  // The year is fine but the date is later this year.
  assert.match(birthDateProblem({ year: 2026, month: 11, day: 21 }, now) ?? '', /hasn't happened yet/);
  assert.match(birthDateProblem({ year: 2026, month: 12, day: 25 }, now) ?? '', /hasn't happened yet/);
  assert.match(birthDateProblem({ year: 2026, month: 12, day: null }, now) ?? '', /hasn't happened yet/);
});

test('adoptionDateProblem rejects pre-1990 and future Gotcha Days', () => {
  const now = new Date(2026, 10, 20);
  assert.equal(adoptionDateProblem({ year: 2023, month: 9, day: 14 }, now), null);
  assert.equal(adoptionDateProblem({ year: 2023, month: 9, day: null }, now), null);
  assert.equal(adoptionDateProblem({ year: 2026, month: 11, day: 20 }, now), null); // came home today
  assert.match(adoptionDateProblem({ year: 1899, month: 1, day: 1 }, now) ?? '', /between 1990 and 2026/);
  assert.match(adoptionDateProblem({ year: 2026, month: 12, day: 25 }, now) ?? '', /can't be in the future/);
  assert.match(adoptionDateProblem({ year: 2026, month: 12, day: null }, now) ?? '', /can't be in the future/);
  assert.match(adoptionDateProblem({ year: 2027, month: 1, day: null }, now) ?? '', /between 1990 and 2026/);
});

test('rabiesExpiryProblem allows a past expiry but not an absurd year', () => {
  const now = new Date(2026, 10, 20);
  assert.equal(rabiesExpiryProblem({ year: 2020, month: 4, day: 18 }, now), null); // expired is valid
  assert.equal(rabiesExpiryProblem({ year: 2026, month: 11, day: 19 }, now), null);
  assert.equal(rabiesExpiryProblem({ year: 2029, month: 4, day: 18 }, now), null);
  assert.equal(rabiesExpiryProblem({ year: 2036, month: 12, day: 31 }, now), null);
  assert.match(rabiesExpiryProblem({ year: 2037, month: 1, day: 1 }, now) ?? '', /between 1990 and 2036/);
  assert.match(rabiesExpiryProblem({ year: 2207, month: 4, day: 18 }, now) ?? '', /between 1990 and 2036/);
  assert.match(rabiesExpiryProblem({ year: 1000, month: 1, day: 1 }, now) ?? '', /between 1990 and 2036/);
  assert.match(rabiesExpiryProblem({ year: 9999, month: 1, day: 1 }, now) ?? '', /between 1990 and 2036/);
});

test('maskedCaretPosition keeps the caret among the digits when the mask rewrites the value', () => {
  // Typing at the end: always the end.
  assert.equal(maskedCaretPosition('06/14', 5, '06/14'), 5);
  assert.equal(maskedCaretPosition('0614', 4, '06/14'), 5);
  // Backspace over the slash of 06/4/2021: raw "064/2021", caret 2 -> the mask
  // puts the slash back and the caret stays after the "6".
  assert.equal(maskUsDateInput('064/2021'), '06/4/2021');
  assert.equal(maskedCaretPosition('064/2021', 2, '06/4/2021'), 2);
  // Insert "/" into 06/2021 after the 06: raw "06//2021" caret 3 collapses to
  // "06/2021" and the caret sits after the slash, ready for "14".
  assert.equal(maskUsDateInput('06//2021'), '06/2021');
  assert.equal(maskedCaretPosition('06//2021', 3, '06/2021'), 3);
  // Insert a digit mid-month: "1" typed after "0" of 06/2021 -> raw "016/2021".
  assert.equal(maskUsDateInput('016/2021'), '01/6/2021');
  assert.equal(maskedCaretPosition('016/2021', 2, '01/6/2021'), 2);
  // Caret at the very start.
  assert.equal(maskedCaretPosition('x06/2021', 0, '06/2021'), 0);
});
