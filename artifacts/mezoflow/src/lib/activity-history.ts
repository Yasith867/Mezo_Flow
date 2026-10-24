import { isAddress } from 'viem';

export const MEZO_EXPLORER_API = 'https://api.explorer.test.mezo.org/api/v2';

export type ActivitySource =
  | 'transactions'
  | 'token-transfers'
  | 'internal-transactions';

export type ActivityKind =
  | 'transaction'
  | 'native_transfer'
  | 'contract_interaction'
  | 'token_transfer'
  | 'internal_transaction'
  | 'internal_transfer'
  | 'local_transfer';

export type ActivityStatus = 'success' | 'failed' | 'pending' | 'unknown';

export type ActivityRecord = {
  id: string;
  source: ActivitySource | 'local';
  kind: ActivityKind;
  hash: `0x${string}`;
  timestamp?: string;
  submittedAt?: number;
  blockNumber?: number;
  from?: string;
  to?: string;
  value?: string;
  amountDecimals?: number;
  tokenSymbol?: string;
  tokenName?: string;
  tokenType?: string;
  eventType?: string;
  tokenAddress?: string;
  tokenId?: string;
  method?: string;
  status: ActivityStatus;
  direction: 'incoming' | 'outgoing' | 'interaction' | 'unknown';
};

export type ActivityPageResult = {
  items: ActivityRecord[];
  nextPageParams: Record<string, string | number | boolean> | null;
};

type ExplorerAddress = {
  hash?: unknown;
  is_contract?: unknown;
};

type ExplorerPage = {
  items?: unknown;
  next_page_params?: unknown;
};

const hashPattern = /^0x[0-9a-f]{64}$/i;

function addressHash(value: unknown): string | undefined {
  if (typeof value !== 'string' || !isAddress(value)) return undefined;
  return value;
}

function transactionHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !hashPattern.test(value)) {
    throw new Error('The explorer returned an invalid transaction hash.');
  }
  return value as `0x${string}`;
}

function integerString(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function pageCursor(value: unknown): Record<string, string | number | boolean> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The explorer returned an invalid pagination cursor.');
  }
  const cursor: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry !== 'string' &&
      typeof entry !== 'number' &&
      typeof entry !== 'boolean'
    ) {
      throw new Error('The explorer returned an unsupported pagination cursor.');
    }
    cursor[key] = entry;
  }
  return cursor;
}

function directionFor(
  walletAddress: string,
  from: string | undefined,
  to: string | undefined,
  interaction = false,
): ActivityRecord['direction'] {
  const wallet = walletAddress.toLowerCase();
  if (from?.toLowerCase() === wallet && to?.toLowerCase() === wallet) {
    return 'interaction';
  }
  if (from?.toLowerCase() === wallet) return 'outgoing';
  if (to?.toLowerCase() === wallet) return 'incoming';
  return interaction ? 'interaction' : 'unknown';
}

function transactionStatus(value: unknown): ActivityRecord['status'] {
  if (value === 'success') return 'success';
  if (value === 'error' || value === 'failed') return 'failed';
  if (value === 'pending') return 'pending';
  return 'unknown';
}

function normalizeTransaction(
  raw: unknown,
  walletAddress: string,
): ActivityRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The explorer returned a malformed transaction.');
  }
  const tx = raw as Record<string, unknown>;
  const hash = transactionHash(tx.hash);
  const from = addressHash((tx.from as ExplorerAddress | null)?.hash);
  const to = addressHash((tx.to as ExplorerAddress | null)?.hash);
  const value = integerString(tx.value);
  if (value === undefined) {
    throw new Error('The explorer returned a transaction without a valid value.');
  }
  const isContractCall =
    (tx.to as ExplorerAddress | null)?.is_contract === true ||
    (typeof tx.raw_input === 'string' && tx.raw_input !== '0x') ||
    !to;
  const kind: ActivityKind = isContractCall
    ? 'contract_interaction'
    : BigInt(value) > 0n
      ? 'native_transfer'
      : 'transaction';
  return {
    id: `transaction:${hash.toLowerCase()}`,
    source: 'transactions',
    kind,
    hash,
    timestamp: validTimestamp(tx.timestamp),
    blockNumber:
      typeof tx.block_number === 'number' ? tx.block_number : undefined,
    from,
    to,
    value,
    amountDecimals: 18,
    method: typeof tx.method === 'string' ? tx.method : undefined,
    status: transactionStatus(tx.result),
    direction: directionFor(walletAddress, from, to, isContractCall),
  };
}

function normalizeTokenTransfer(
  raw: unknown,
  walletAddress: string,
): ActivityRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The explorer returned a malformed token transfer.');
  }
  const event = raw as Record<string, unknown>;
  const hash = transactionHash(event.transaction_hash ?? event.tx_hash);
  const logIndex =
    typeof event.log_index === 'number' || typeof event.log_index === 'string'
      ? String(event.log_index)
      : undefined;
  if (!logIndex || !/^\d+$/.test(logIndex)) {
    throw new Error('The explorer returned a token transfer without a log index.');
  }
  const from = addressHash((event.from as ExplorerAddress | null)?.hash);
  const to = addressHash((event.to as ExplorerAddress | null)?.hash);
  const token =
    event.token && typeof event.token === 'object'
      ? (event.token as Record<string, unknown>)
      : {};
  const total =
    event.total && typeof event.total === 'object'
      ? (event.total as Record<string, unknown>)
      : {};
  const tokenType =
    typeof event.token_type === 'string'
      ? event.token_type
      : typeof token.type === 'string'
        ? token.type
        : undefined;
  const tokenId =
    typeof total.token_id === 'string' ? total.token_id : undefined;
  const decimals = integerString(total.decimals ?? token.decimals);
  const value = integerString(total.value);
  const tokenAddress = addressHash(token.address ?? token.address_hash);
  return {
    id: `token:${hash.toLowerCase()}:${logIndex}`,
    source: 'token-transfers',
    kind: 'token_transfer',
    hash,
    timestamp: validTimestamp(event.timestamp),
    blockNumber:
      typeof event.block_number === 'number' ? event.block_number : undefined,
    from,
    to,
    value,
    amountDecimals:
      decimals !== undefined && Number(decimals) <= 255
        ? Number(decimals)
        : undefined,
    tokenSymbol:
      typeof token.symbol === 'string' ? token.symbol : undefined,
    tokenName: typeof token.name === 'string' ? token.name : undefined,
    tokenType,
    eventType: typeof event.type === 'string' ? event.type : undefined,
    tokenAddress,
    tokenId,
    method: typeof event.method === 'string' ? event.method : undefined,
    // An indexed token log is emitted only by a successful on-chain execution.
    status: 'success',
    direction: directionFor(walletAddress, from, to),
  };
}

function normalizeInternalTransaction(
  raw: unknown,
  walletAddress: string,
): ActivityRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The explorer returned a malformed internal transaction.');
  }
  const event = raw as Record<string, unknown>;
  const hash = transactionHash(event.transaction_hash);
  const index =
    typeof event.index === 'number' || typeof event.index === 'string'
      ? String(event.index)
      : undefined;
  if (!index || !/^\d+$/.test(index)) {
    throw new Error('The explorer returned an internal transaction without an index.');
  }
  const from = addressHash((event.from as ExplorerAddress | null)?.hash);
  const to = addressHash((event.to as ExplorerAddress | null)?.hash);
  const value = integerString(event.value);
  const isTransfer = value !== undefined && BigInt(value) > 0n;
  return {
    id: `internal:${hash.toLowerCase()}:${index}`,
    source: 'internal-transactions',
    kind: isTransfer ? 'internal_transfer' : 'internal_transaction',
    hash,
    timestamp: validTimestamp(event.timestamp),
    blockNumber:
      typeof event.block_number === 'number' ? event.block_number : undefined,
    from,
    to,
    value,
    amountDecimals: 18,
    method: typeof event.type === 'string' ? event.type : undefined,
    status:
      event.success === true
        ? 'success'
        : event.success === false
          ? 'failed'
          : 'unknown',
    direction: directionFor(walletAddress, from, to),
  };
}

const normalizers: Record<
  ActivitySource,
  (item: unknown, walletAddress: string) => ActivityRecord
> = {
  transactions: normalizeTransaction,
  'token-transfers': normalizeTokenTransfer,
  'internal-transactions': normalizeInternalTransaction,
};

export async function fetchActivityPage(
  address: string,
  source: ActivitySource,
  cursor: Record<string, string | number | boolean> | null,
  signal?: AbortSignal,
): Promise<ActivityPageResult> {
  if (!isAddress(address)) throw new Error('A valid wallet address is required.');
  const url = new URL(
    `${MEZO_EXPLORER_API}/addresses/${address}/${source}`,
  );
  if (cursor) {
    for (const [key, value] of Object.entries(cursor)) {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const statusMessage =
      response.status === 429
        ? 'The explorer rate limit was reached. Wait a moment and retry.'
        : `The explorer returned HTTP ${response.status}.`;
    throw new Error(statusMessage);
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('The explorer returned an invalid response.');
  }
  const page = payload as ExplorerPage;
  if (!Array.isArray(page.items)) {
    throw new Error('The explorer response did not contain an activity list.');
  }
  return {
    items: page.items.map((item) => normalizers[source](item, address)),
    nextPageParams: pageCursor(page.next_page_params),
  };
}

export function mergeActivityRecords(
  ...recordGroups: ActivityRecord[][]
): ActivityRecord[] {
  const records = new Map<string, ActivityRecord>();
  for (const record of recordGroups.flat()) records.set(record.id, record);
  return [...records.values()].sort((a, b) => {
    const timeA = Date.parse(a.timestamp ?? '') || a.submittedAt || 0;
    const timeB = Date.parse(b.timestamp ?? '') || b.submittedAt || 0;
    return timeB - timeA || b.id.localeCompare(a.id);
  });
}
