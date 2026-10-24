import assert from 'node:assert/strict';
import test from 'node:test';
import { MUSD_ADDRESS } from './mezo-config';
import { buildMusdPaymentLink, buildMusdPaymentRequest, createMusdTransferPrefill, parseMusdPaymentRequest } from './musd-payment-request';

const recipient = '0x1111111111111111111111111111111111111111';

test('accepts a wallet address copied from a QR code', () => {
  assert.deepEqual(parseMusdPaymentRequest(recipient), {
    recipient,
    source: 'address',
  });
});

test('builds plain wallet QR text and amount-specific MUSD requests exactly', () => {
  assert.equal(buildMusdPaymentRequest(recipient), `ethereum:${MUSD_ADDRESS}@31611/transfer?address=${recipient}`);
  assert.equal(
    buildMusdPaymentRequest(recipient, '1.2345'),
    `ethereum:${MUSD_ADDRESS}@31611/transfer?address=${recipient}&uint256=1234500000000000000`,
  );
  assert.throws(() => buildMusdPaymentRequest('not-an-address'), /valid recipient address/);
  assert.throws(() => buildMusdPaymentRequest(recipient, '0'), /greater than zero/);
  assert.throws(() => buildMusdPaymentRequest(recipient, '1.0000000000000000001'), /18 decimal places/);
});

test('builds a MezoFlow payment link with explicit network and token details', () => {
  const link = buildMusdPaymentLink(recipient, '1.2345', '/', 'https://app.example');
  assert.equal(
    link,
    `https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=1.2345`,
  );
  assert.deepEqual(parseMusdPaymentRequest(link), {
    recipient,
    amount: '1.2345',
    source: 'url',
  });
});

test('payment links respect artifact base paths and reject unsafe amounts', () => {
  const link = buildMusdPaymentLink(recipient, undefined, '/mezoflow/', 'https://app.example');
  assert.equal(
    link,
    `https://app.example/mezoflow/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1`,
  );
  assert.deepEqual(parseMusdPaymentRequest(link), {
    recipient,
    source: 'url',
  });
  assert.throws(
    () => buildMusdPaymentLink(recipient, '1.0000000000000000001', '/', 'https://app.example'),
    /18 decimal places/,
  );
  assert.throws(
    () => buildMusdPaymentLink(recipient, '0', '/', 'https://app.example'),
    /greater than zero/,
  );
});

test('builds and parses versioned payment requests with an optional off-chain note', () => {
  const link = buildMusdPaymentLink(
    recipient,
    '12.5',
    '/',
    'https://app.example',
    'Invoice 42 — coffee',
  );
  assert.equal(
    link,
    `https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=12.5&memo=Invoice+42+%E2%80%94+coffee`,
  );
  assert.deepEqual(parseMusdPaymentRequest(link), {
    recipient,
    amount: '12.5',
    memo: 'Invoice 42 — coffee',
    source: 'url',
  });
});

test('prefills validated request details and always requires a separate send review', () => {
  const link = buildMusdPaymentLink(recipient, '4.25', '/', 'https://app.example', 'Invoice');
  assert.deepEqual(createMusdTransferPrefill(link), {
    recipient,
    amount: '4.25',
    memo: 'Invoice',
    source: 'url',
    requiresReview: true,
  });
  assert.deepEqual(createMusdTransferPrefill(recipient), {
    recipient,
    amount: '',
    memo: '',
    source: 'address',
    requiresReview: true,
  });
});

test('reads recipient and human amount from a MezoFlow payment URL', () => {
  assert.deepEqual(
    parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=12.5`),
    { recipient, amount: '12.5', source: 'url' },
  );
});

test('decodes an EIP-681 MUSD transfer QR amount in base units exactly', () => {
  const request = `ethereum:${MUSD_ADDRESS}@31611/transfer?address=${recipient}&uint256=1234500000000000000`;
  assert.deepEqual(parseMusdPaymentRequest(request), {
    recipient,
    amount: '1.2345',
    source: 'ethereum',
  });
});

test('rejects wrong-network and unverified-token payment requests', () => {
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${MUSD_ADDRESS}@1/transfer?address=${recipient}`),
    /not Mezo Testnet/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:0x2222222222222222222222222222222222222222@31611/transfer?address=${recipient}`),
    /unverified token contract/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=1&token=${MUSD_ADDRESS}&version=1`),
    /not Mezo Testnet/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=0x2222222222222222222222222222222222222222&version=1`),
    /other than verified Testnet MUSD/,
  );
});

test('rejects unsupported versions, incomplete versioned links, and ambiguous fields', () => {
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&version=2`),
    /version 2 is not supported/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&version=1&chainId=31611`),
    /must specify the network and token/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1`),
    /duplicate recipient/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&chainId=31611&token=${MUSD_ADDRESS}&version=1`),
    /duplicate chainId/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=1&campaign=source`),
    /unsupported campaign field/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=1&uint256=1000000000000000000`),
    /unsupported uint256 field/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&memo=${'x'.repeat(141)}`),
    /140 characters/,
  );
  assert.throws(
    () => buildMusdPaymentLink(recipient, undefined, '/', 'https://app.example', 'bad\nnote'),
    /control characters/,
  );
});

test('rejects malformed recipients and zero or invalid amounts', () => {
  assert.throws(() => parseMusdPaymentRequest('not-an-address'), /valid wallet address or payment request/);
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${MUSD_ADDRESS}@31611/transfer?address=${recipient}&uint256=0`),
    /positive integer/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=0`),
    /invalid for MUSD/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=`),
    /invalid for MUSD/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&amount=${'1'.repeat(65)}`),
    /amount is too long/,
  );
});

test('rejects ambiguous Ethereum QR payloads without an explicit Mezo Testnet MUSD transfer', () => {
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${MUSD_ADDRESS}/transfer?address=${recipient}`),
    /not a supported MUSD transfer request/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${MUSD_ADDRESS}@31611?address=${recipient}`),
    /not a supported MUSD transfer request/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${recipient}@31611/transfer?address=${recipient}`),
    /unverified token contract/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`ethereum:${MUSD_ADDRESS}@31611/transfer?address=${recipient}&campaign=source`),
    /unsupported campaign field/,
  );
});

test('requires versioned MezoFlow links and rejects malformed or oversized inputs', () => {
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}`),
    /missing its version/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1&memo=%ZZ`),
    /malformed URL encoding/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musd?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1#send`),
    /link is malformed/,
  );
  assert.throws(
    () => parseMusdPaymentRequest(`https://app.example/musdx?recipient=${recipient}&chainId=31611&token=${MUSD_ADDRESS}&version=1`),
    /not a MezoFlow MUSD payment request/,
  );
  assert.throws(() => parseMusdPaymentRequest('x'.repeat(4097)), /too large/);
  assert.throws(
    () => buildMusdPaymentLink(recipient, '1'.repeat(65), '/', 'https://app.example'),
    /amount is too long/,
  );
});
