import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePreferences, parsePreferences } from './preferences';

test('uses dark mode and safe defaults for missing or malformed preferences', () => {
  assert.deepEqual(parsePreferences(null), {
    theme: 'dark',
    compact: false,
    confirm: true,
    currency: 'USD',
    networkDisplay: 'name-and-id',
  });
  assert.deepEqual(parsePreferences('{broken'), {
    theme: 'dark',
    compact: false,
    confirm: true,
    currency: 'USD',
    networkDisplay: 'name-and-id',
  });
});

test('loads saved light mode and existing display preferences together', () => {
  assert.deepEqual(parsePreferences('{"theme":"light","compact":true,"confirm":false,"currency":"AUD","networkDisplay":"name"}'), {
    theme: 'light',
    compact: true,
    confirm: false,
    currency: 'AUD',
    networkDisplay: 'name',
  });
});

test('updates theme without discarding other saved preferences', () => {
  assert.deepEqual(
    JSON.parse(mergePreferences('{"theme":"dark","compact":true,"confirm":false,"currency":"EUR"}', { theme: 'light' })),
    { theme: 'light', compact: true, confirm: false, currency: 'EUR', networkDisplay: 'name-and-id' },
  );
});

test('falls back to supported display choices for invalid stored values', () => {
  assert.deepEqual(parsePreferences('{"currency":"JPY","networkDisplay":"mainnet"}'), {
    theme: 'dark',
    compact: false,
    confirm: true,
    currency: 'USD',
    networkDisplay: 'name-and-id',
  });
});
