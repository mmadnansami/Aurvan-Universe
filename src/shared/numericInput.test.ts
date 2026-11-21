import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntInRange, parsePositiveInt, sanitizeDigitInput } from './numericInput';

test('sanitizeDigitInput preserves empty string instead of forcing zero', () => {
  assert.equal(sanitizeDigitInput(''), '');
  assert.equal(sanitizeDigitInput('abc'), '');
});

test('sanitizeDigitInput strips non-digits and leading zeros when typing numbers', () => {
  assert.equal(sanitizeDigitInput('1'), '1');
  assert.equal(sanitizeDigitInput('5'), '5');
  assert.equal(sanitizeDigitInput('10'), '10');
  assert.equal(sanitizeDigitInput('05'), '5');
  assert.equal(sanitizeDigitInput('0012'), '12');
  assert.equal(sanitizeDigitInput('120 mins'), '120');
  assert.equal(sanitizeDigitInput('0'), '0');
});

test('parsePositiveInt parses any integer >= 1 and rejects empty or zero', () => {
  assert.equal(parsePositiveInt(''), null);
  assert.equal(parsePositiveInt('0'), null);
  assert.equal(parsePositiveInt('1'), 1);
  assert.equal(parsePositiveInt('7'), 7);
  assert.equal(parsePositiveInt('10'), 10);
  assert.equal(parsePositiveInt('250'), 250);
  assert.equal(parsePositiveInt('-3'), null);
});

test('parseIntInRange validates inclusive numeric bounds', () => {
  assert.equal(parseIntInRange('', 0, 100), null);
  assert.equal(parseIntInRange('0', 0, 100), 0);
  assert.equal(parseIntInRange('85', 0, 100), 85);
  assert.equal(parseIntInRange('100', 0, 100), 100);
  assert.equal(parseIntInRange('101', 0, 100), null);
});
