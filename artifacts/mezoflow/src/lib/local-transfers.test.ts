import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLocalTransfers } from './local-transfers.ts';

const validTransfer = {
  hash: `0x${'a'.repeat(64)}`,
  amount: '1.25',
  recipient: `0x${'b'.repeat(40)}`,
  timestamp: 1_750_000_000_000,
  status: 'submitted',
};

test('loads valid locally stored transfer records', () => {
  assert.deepEqual(parseLocalTransfers(JSON.stringify([validTransfer])), [
    validTransfer,
  ]);
});

test('ignores malformed local storage and invalid records', () => {
  assert.deepEqual(parseLocalTransfers('{bad json'), []);
  assert.deepEqual(parseLocalTransfers(JSON.stringify({ ...validTransfer })), []);
  assert.deepEqual(
    parseLocalTransfers(
      JSON.stringify([
        validTransfer,
        { ...validTransfer, hash: 'not-a-transaction-hash' },
        { ...validTransfer, amount: '1e8' },
        { ...validTransfer, status: 'confirmed' },
        { ...validTransfer, recipient: '0x1234' },
      ]),
    ),
    [validTransfer],
  );
});

test('rejects zero amounts and non-finite timestamps', () => {
  assert.deepEqual(
    parseLocalTransfers(
      JSON.stringify([
        { ...validTransfer, amount: '0' },
        { ...validTransfer, timestamp: Number.NaN },
      ]),
    ),
    [],
  );
});
