import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocalPaymentRequest,
  parseLocalPaymentRequests,
  prependLocalPaymentRequest,
  validateLocalPaymentRequest,
} from './payment-requests';

const recipient = '0x1111111111111111111111111111111111111111';

test('creates a validated local request with an explicit unknown status', () => {
  const request = createLocalPaymentRequest(
    { recipient, amount: '3.5', memo: 'Dinner' },
    { basePath: '/', origin: 'https://app.example', id: 'request-1', now: 100 },
  );
  assert.equal(request.id, 'request-1');
  assert.equal(request.recipient, recipient);
  assert.equal(request.amount, '3.5');
  assert.equal(request.memo, 'Dinner');
  assert.equal(request.createdAt, 100);
  assert.equal(request.status, 'unknown');
  assert.deepEqual(parseLocalPaymentRequests(JSON.stringify([request])), [request]);
});

test('rejects malformed or mismatched local payment requests', () => {
  const request = createLocalPaymentRequest(
    { recipient, amount: '3.5' },
    { basePath: '/', origin: 'https://app.example', id: 'request-1', now: 100 },
  );
  assert.deepEqual(parseLocalPaymentRequests(JSON.stringify([
    request,
    { ...request, id: 'bad-address', recipient: 'not-an-address' },
    { ...request, id: 'mismatched', amount: '4' },
  ])), [request]);
  assert.deepEqual(parseLocalPaymentRequests('{broken'), []);
});

test('prepends new requests, de-duplicates IDs, and keeps newest requests first', () => {
  const older = createLocalPaymentRequest(
    { recipient },
    { basePath: '/', origin: 'https://app.example', id: 'old', now: 100 },
  );
  const newer = createLocalPaymentRequest(
    { recipient, amount: '1' },
    { basePath: '/', origin: 'https://app.example', id: 'new', now: 200 },
  );
  assert.deepEqual(prependLocalPaymentRequest([older], newer), [newer, older]);
  assert.deepEqual(prependLocalPaymentRequest([older], { ...newer, id: 'old' }), [
    { ...newer, id: 'old' },
  ]);
});

test('payment history remains local and never trusts a stored paid status', () => {
  const request = createLocalPaymentRequest(
    { recipient, amount: '2', memo: 'Lunch' },
    { basePath: '/', origin: 'https://app.example', id: 'request-1', now: 100 },
  );
  const restored = parseLocalPaymentRequests(JSON.stringify([{ ...request, status: 'verified' }]));
  assert.deepEqual(restored, [request]);
  assert.equal(restored[0].status, 'unknown');
  assert.deepEqual(parseLocalPaymentRequests('x'.repeat(100_001)), []);
});

test('revalidates the exact request link before sharing or copying it', () => {
  const request = createLocalPaymentRequest(
    { recipient, amount: '2', memo: 'Lunch' },
    { basePath: '/', origin: 'https://app.example', id: 'request-1', now: 100 },
  );
  assert.deepEqual(validateLocalPaymentRequest(request), request);
  assert.throws(
    () => validateLocalPaymentRequest({ ...request, link: `${request.link}&campaign=unknown` }),
    /invalid or has been changed/,
  );
  assert.throws(
    () => createLocalPaymentRequest(
      { recipient, memo: 'Lunch', extra: 'unexpected' } as LocalPaymentRequestDraft,
      { basePath: '/', origin: 'https://app.example', id: 'request-2', now: 200 },
    ),
    /unsupported or invalid fields/,
  );
});
