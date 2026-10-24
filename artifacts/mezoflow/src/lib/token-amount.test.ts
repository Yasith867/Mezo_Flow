import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTokenAmount, parseTokenAmount } from './token-amount.ts';

test('parses token strings with integer precision', () => {
  assert.equal(parseTokenAmount('1.000000000000000001', 18), 1000000000000000001n);
  assert.equal(parseTokenAmount('0.5', 6), 500000n);
});

test('rejects zero, negative, and excess precision amounts', () => {
  assert.throws(() => parseTokenAmount('0', 18));
  assert.throws(() => parseTokenAmount('-1', 18));
  assert.throws(() => parseTokenAmount('0.0000000000000000001', 18));
  assert.throws(() => parseTokenAmount('1.0000000000000000001', 18), /18 decimal places/);
  assert.throws(() => parseTokenAmount('1e2', 18), /decimal number/);
});

test('formats balances without converting through floating-point numbers', () => {
  assert.equal(formatTokenAmount(1234567890123456789n, 18, 8), '1.23456789');
  assert.equal(formatTokenAmount(1234567890000000000000n, 18, 8), '1,234.56789');
});

test('does not display a tiny positive balance as zero', () => {
  assert.equal(formatTokenAmount(1n, 18, 8), '<0.00000001');
  assert.equal(formatTokenAmount(0n, 18, 8), '0');
});
