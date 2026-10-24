export type LocalTransferStatus = 'submitted' | 'success' | 'reverted';

export type LocalTransfer = {
  hash: `0x${string}`;
  sender?: `0x${string}`;
  amount: string;
  recipient: `0x${string}`;
  timestamp: number;
  status: LocalTransferStatus;
};

const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const amountPattern = /^\d+(?:\.\d{1,18})?$/;

function isLocalTransfer(value: unknown): value is LocalTransfer {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hash === 'string' &&
    transactionHashPattern.test(record.hash) &&
    (record.sender === undefined ||
      (typeof record.sender === 'string' && addressPattern.test(record.sender))) &&
    typeof record.recipient === 'string' &&
    addressPattern.test(record.recipient) &&
    typeof record.amount === 'string' &&
    amountPattern.test(record.amount) &&
    /[1-9]/.test(record.amount) &&
    typeof record.timestamp === 'number' &&
    Number.isFinite(record.timestamp) &&
    record.timestamp > 0 &&
    (record.status === 'submitted' ||
      record.status === 'success' ||
      record.status === 'reverted')
  );
}

export function parseLocalTransfers(serialized: string | null): LocalTransfer[] {
  if (!serialized) return [];

  try {
    const records: unknown = JSON.parse(serialized);
    return Array.isArray(records) ? records.filter(isLocalTransfer) : [];
  } catch {
    return [];
  }
}
