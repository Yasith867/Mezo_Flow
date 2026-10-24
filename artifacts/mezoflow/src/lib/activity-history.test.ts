import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchActivityPage,
  mergeActivityRecords,
  type ActivityRecord,
} from './activity-history.ts';

const wallet = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}`;

function txItem(overrides: Record<string, unknown> = {}) {
  return {
    hash,
    value: '2500000000000000000',
    raw_input: '0x',
    result: 'success',
    timestamp: '2026-10-21T12:30:00Z',
    block_number: 123,
    from: { hash: wallet, is_contract: false },
    to: { hash: '0x2222222222222222222222222222222222222222', is_contract: false },
    ...overrides,
  };
}

test('requests wallet transactions and preserves the explorer cursor', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      items: [txItem()],
      next_page_params: { block_number: 122, index: 4, items_count: 50 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await fetchActivityPage(wallet, 'transactions', null);
    const url = new URL(requestedUrl);
    assert.equal(url.origin, 'https://api.explorer.test.mezo.org');
    assert.equal(url.pathname, `/api/v2/addresses/${wallet}/transactions`);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].kind, 'native_transfer');
    assert.equal(result.items[0].direction, 'outgoing');
    assert.equal(result.items[0].blockNumber, 123);
    assert.deepEqual(result.nextPageParams, {
      block_number: 122,
      index: 4,
      items_count: 50,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applies the explorer cursor without inventing page parameters', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ items: [], next_page_params: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await fetchActivityPage(
      wallet,
      'token-transfers',
      { block_number: 120, index: 9, items_count: 50 },
    );
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, `/api/v2/addresses/${wallet}/token-transfers`);
    assert.equal(url.searchParams.get('block_number'), '120');
    assert.equal(url.searchParams.get('index'), '9');
    assert.equal(url.searchParams.get('items_count'), '50');
    assert.deepEqual(result.items, []);
    assert.equal(result.nextPageParams, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps distinct indexed token events with the same transaction hash', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    items: [0, 1].map((logIndex) => ({
      transaction_hash: hash,
      log_index: logIndex,
      type: 'token_transfer',
      timestamp: '2026-10-21T12:30:00Z',
      block_number: 123,
      from: { hash: '0x2222222222222222222222222222222222222222' },
      to: { hash: wallet },
      token: { name: 'Test token', symbol: 'TEST', type: 'ERC-20', decimals: '18', address: '0x3333333333333333333333333333333333333333' },
      total: { value: '1000000000000000000', decimals: '18' },
    })),
    next_page_params: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await fetchActivityPage(wallet, 'token-transfers', null);
    assert.equal(result.items.length, 2);
    assert.notEqual(result.items[0].id, result.items[1].id);
    assert.deepEqual(result.items.map((item) => item.direction), ['incoming', 'incoming']);
    assert.equal(result.items[0].tokenSymbol, 'TEST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('distinguishes contract calls and failed transactions', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    items: [
      txItem({ raw_input: '0x1234', value: '0', result: 'error' }),
      txItem({
        hash: `0x${'b'.repeat(64)}`,
        raw_input: '0x',
        value: '0',
        from: { hash: '0x2222222222222222222222222222222222222222', is_contract: false },
        to: { hash: wallet, is_contract: false },
      }),
    ],
    next_page_params: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await fetchActivityPage(wallet, 'transactions', null);
    assert.equal(result.items[0].kind, 'contract_interaction');
    assert.equal(result.items[0].status, 'failed');
    assert.equal(result.items[1].direction, 'incoming');
    assert.equal(result.items[1].kind, 'transaction');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normalizes indexed internal transactions without merging their parent transaction', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    items: [{
      transaction_hash: hash,
      index: 3,
      block_number: 122,
      timestamp: '2026-10-21T12:20:00Z',
      from: { hash: '0x2222222222222222222222222222222222222222' },
      to: { hash: wallet },
      value: '1000000000000000000',
      success: true,
      type: 'call',
    }],
    next_page_params: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await fetchActivityPage(wallet, 'internal-transactions', null);
    assert.equal(result.items[0].kind, 'internal_transfer');
    assert.equal(result.items[0].status, 'success');
    assert.equal(result.items[0].direction, 'incoming');
    assert.equal(result.items[0].id, `internal:${hash}:3`);
    assert.notEqual(result.items[0].id, `transaction:${hash}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not convert an explorer API error into an empty result', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try {
    await assert.rejects(
      fetchActivityPage(wallet, 'internal-transactions', null),
      /HTTP 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('merges duplicate page rows by event identity, not transaction hash alone', () => {
  const record = {
    id: `token:${hash}:0`,
    source: 'token-transfers',
    kind: 'token_transfer',
    hash,
    status: 'success',
    direction: 'incoming',
  } as ActivityRecord;
  const secondLog = { ...record, id: `token:${hash}:1` };
  const result = mergeActivityRecords([record], [record, secondLog]);
  assert.equal(result.length, 2);
  assert.deepEqual(new Set(result.map((item) => item.id)), new Set([record.id, secondLog.id]));
});
