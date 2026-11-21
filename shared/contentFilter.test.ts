import test from 'node:test';
import assert from 'node:assert/strict';

import { checkContent, checkContentFields, contentFilterWords } from './contentFilter.ts';

function blocked(text: string) {
  const result = checkContent(text);
  return result.ok ? null : result.reason;
}

test('ordinary dog talk is allowed, including words that look rude out of context', () => {
  for (const text of [
    'Kaju is a sweet little bitch, spayed last year',
    'Our stud is retired, no more breeding',
    'He keeps humping the couch cushion',
    'Cocker spaniel and a coonhound mix',
    'Vet says his anal glands are fine now',
    'We moved here from Niger last spring',
    'Visiting Scunthorpe this weekend',
    'She loves pumpkin spice treats',
    'This hike will kill you, bring water',
    'Sex: female. Size: medium',
    'Playdate at 10:30? Bring $5 for the coffee',
    'Ugh, the damn squirrel again',
    '',
  ]) {
    assert.equal(blocked(text), null, text);
  }
});

test('slurs are blocked, also with l33tspeak, stretched or spaced-out letters', () => {
  assert.equal(blocked('you are a faggot'), 'slur');
  assert.equal(blocked('f4gg0t'), 'slur');
  assert.equal(blocked('niiiggger'), 'slur');
  assert.equal(blocked('f a g g o t'), 'slur');
  assert.equal(blocked('what a retard'), 'slur');
  assert.equal(blocked('FAGS'), 'slur');
});

test('sexual solicitation is blocked', () => {
  assert.equal(blocked('send nudes'), 'sexual');
  assert.equal(blocked('check my onlyfans'), 'sexual');
  assert.equal(blocked('feeling horny'), 'sexual');
  assert.equal(blocked('wanna fuck after the walk?'), 'sexual');
});

test('threats and self-harm taunts are blocked', () => {
  assert.equal(blocked('kys'), 'threat');
  assert.equal(blocked('just kill yourself'), 'threat');
  assert.equal(blocked("I'm going to kill you"), 'threat');
  assert.equal(blocked('I know where you live'), 'threat');
});

test('normalising strips accents, apostrophes and l33tspeak', () => {
  assert.deepEqual(contentFilterWords("Café! I'm h0me"), ['cafe', 'im', 'home']);
});

test('checking several fields stops at the first problem', () => {
  assert.deepEqual(checkContentFields(['Kaju', null, 'loves balls']), { ok: true });
  assert.deepEqual(checkContentFields(['Kaju', 'send nudes']), { ok: false, reason: 'sexual' });
});

// ── Unicode tricks, look-alike letters, l33tspeak, spacing ────────────────────

test('letters from other alphabets that look Latin cannot hide a word', () => {
  assert.equal(blocked('n\u0456gger'), 'slur'); // Cyrillic і
  assert.equal(blocked('nigg\u0435r'), 'slur'); // Cyrillic е
  assert.equal(blocked('f\u0430ggot'), 'slur'); // Cyrillic а
  assert.equal(blocked('\u0455lut'), 'slur'); // Cyrillic ѕ
  assert.equal(blocked('c\u03C5nt'), 'slur'); // Greek υ
  assert.equal(blocked('nazi'.replace('a', '\u03B1')), 'slur'); // Greek α
  assert.equal(blocked('k\u0443s'), 'threat'); // Cyrillic у
  assert.equal(blocked('k\u03B3s'), 'threat'); // Greek γ
  assert.equal(blocked('p\u043Erno'), 'sexual'); // Cyrillic о
  assert.equal(blocked('\u0262\u1D0F\u1D0F\u1D0B'), 'slur'); // small-capital gook
  assert.equal(blocked('\u0274\u026A\u0262\u0262\u1D07\u0280'), 'slur'); // small-capital nigger
});

test('fullwidth, circled, accented and zero-width forms are read as plain letters', () => {
  assert.equal(blocked('\uFF4E\uFF49\uFF47\uFF47\uFF45\uFF52'), 'slur'); // fullwidth nigger
  assert.equal(blocked('\u24DD\u24D8\u24D6\u24D6\u24D4\u24E1'), 'slur'); // circled nigger
  assert.equal(blocked('n\u00EEgg\u00E9r'), 'slur');
  assert.equal(blocked('nig\u200Bger'), 'slur'); // zero-width space inside
  assert.equal(blocked('f\u200Da\u200Dg\u200Dg\u200Do\u200Dt'), 'slur'); // zero-width joiners
  assert.equal(blocked('ni\u00ADgger'), 'slur'); // soft hyphen
  assert.equal(blocked('n\u0336i\u0336g\u0336g\u0336e\u0336r\u0336'), 'slur'); // strike-through
  assert.equal(blocked('\u{1D5C7}\u{1D5C2}\u{1D5C0}\u{1D5C0}\u{1D5BE}\u{1D5CB}'), 'slur'); // math sans-serif nigger
  assert.equal(blocked('n\u{E0061}igger'), 'slur'); // tag character inside
});

test('l33tspeak, censored letters and spacing are caught', () => {
  assert.equal(blocked('n00dz'), 'sexual');
  assert.equal(blocked('n0des'), 'sexual');
  assert.equal(blocked('send n00ds'), 'sexual');
  assert.equal(blocked('p0rn'), 'sexual');
  assert.equal(blocked('ni99er'), 'slur');
  assert.equal(blocked('n1gg3r'), 'slur');
  assert.equal(blocked('$lut'), 'slur');
  assert.equal(blocked('sl*t'), 'slur');
  assert.equal(blocked('c*nt'), 'slur');
  assert.equal(blocked('n*gger'), 'slur');
  assert.equal(blocked('n!gger'), 'slur');
  assert.equal(blocked('c u n t'), 'slur');
  assert.equal(blocked('n i g g e r'), 'slur');
  assert.equal(blocked('n.i.g.g.e.r'), 'slur');
  assert.equal(blocked('k y s'), 'threat');
  assert.equal(blocked('k-y-s'), 'threat');
  assert.equal(blocked('C U N T'), 'slur');
  assert.equal(blocked('kill y0urself'), 'threat');
});

test('the terms that were missing are blocked, plurals and stretched too', () => {
  assert.equal(blocked('you cunt'), 'slur');
  assert.equal(blocked('CUNTS'), 'slur');
  assert.equal(blocked('what a dyke'), 'slur');
  assert.equal(blocked('dykes'), 'slur');
  assert.equal(blocked('stupid chink'), 'slur');
  assert.equal(blocked('chinks'), 'slur');
  assert.equal(blocked('go home coon'), 'slur');
  assert.equal(blocked('coons'), 'slur');
  assert.equal(blocked('cooooon'), 'slur');
  assert.equal(blocked('you slut'), 'slur');
  assert.equal(blocked('sluuuut'), 'slur');
  assert.equal(blocked('heil, nazi'), 'slur');
  assert.equal(blocked('nazis'), 'slur');
  assert.equal(blocked('kill your self'), 'threat');
  assert.equal(blocked('Kill Your Self.'), 'threat');
  assert.equal(blocked('kill ur self'), 'threat');
  assert.equal(blocked('kill yourselves'), 'threat');
  assert.equal(blocked('xxx videos'), 'sexual');
  assert.equal(blocked('check my xxx pics'), 'sexual');
});

test('a kiss on the end of a message is fine', () => {
  for (const text of ['see you soon xxx', 'Thanks for the playdate! xxx', 'xxx', 'XXXX love', 'xoxo', 'hugs & kisses xxx']) {
    assert.equal(blocked(text), null, text);
  }
});

test('ordinary dog text with substrings of blocked words stays allowed', () => {
  for (const text of [
    // places and names with a bad word inside
    'Scunthorpe', 'Visiting Scunthorpe', 'Essex', 'Sussex', 'Middlesex', 'Dickens', 'Dick Van Dyke', 'Dyker Heights',
    'Cocker Spaniel', 'Cockapoo', 'Hancock', 'Peacock', 'Cumberland', 'Cummings', 'document', 'circumstances',
    'class', 'assistant', 'assistance', 'Massachusetts', 'bass', 'Glasgow', 'grape', 'grapes', 'drape', 'therapist',
    'Niger', 'Nigeria', 'Pakistan', 'Nazareth', 'Chinook', 'chinchilla', 'Chinatown', 'Chin Chin', 'Slutsky', 'Spicy',
    'Matsumoto', 'Kyste', 'Kiss', 'raccoon', 'raccoons', 'Rocky Raccoon',
    // coon in the real names that contain it
    'Maine Coon cat', 'we live with a Maine Coon', 'Black and Tan Coonhound', 'Redbone Coon Hound', 'Treeing Walker coonhound',
    'Coon Rapids, MN', 'a chink in the fence', 'there are chinks in the armor',
    // breeds, names, everyday dog talk
    'Labrador Retriever', 'Bernese Mountain Dog', 'Shih Tzu', 'Pit Bull Terrier', 'Jack Russell', 'Whippet mix',
    'Kaju', 'Waffles', 'Biscuit', 'Moose', 'Juno', 'Dobby', 'Zoë', 'José', 'Zoe loves Ñoño the cat',
    'Loves fetch, tug and the sprinkler. Not great with squirrels.',
    'He is 3 years old, 45 lbs, vaccinated 04/18/2026',
    'Playdate at 10:30? Bring $5 for the coffee',
    'Meet at the park on 5th Street, gate #3',
    'Call me at 734-555-0123 after 7pm',
    'Prefers dogs 20-40 lbs; 2 cups of kibble at 6',
    'Our dog is 1 of 7 puppies from a litter of 9',
    'Привет, друзья!', // Russian "hello, friends" must not turn into a slur
    '你好 and こんにちは',
    '🐶🐾❤️ 👨‍👩‍👧 🏳️‍🌈',
    'Anal glands are fine now', 'He keeps humping the couch cushion', 'sweet little bitch',
  ]) {
    assert.equal(blocked(text), null, text);
  }
});

test('a very long or odd input is checked quickly and without throwing', () => {
  const started = Date.now();
  assert.equal(blocked('a'.repeat(20000)), null);
  assert.equal(blocked('0'.repeat(20000)), null);
  assert.equal(blocked('1 '.repeat(10000)), null);
  assert.equal(blocked('*'.repeat(5000)), null);
  assert.equal(blocked('\u200B'.repeat(20000)), null);
  assert.equal(blocked('n' + '\u200B'.repeat(5000) + 'igger'), 'slur');
  assert.equal(blocked('\uD800'), null); // a lone surrogate
  assert.ok(Date.now() - started < 3000, 'took too long');
});
