import { isAddress } from 'viem';
import { buildMusdPaymentLink, parseMusdPaymentRequest } from './musd-payment-request';

export type LocalPaymentRequest = {
  id: string;
  recipient: `0x${string}`;
  amount?: string;
  memo?: string;
  link: string;
  createdAt: number;
  status: 'unknown';
};

export type LocalPaymentRequestDraft = {
  recipient: string;
  amount?: string;
  memo?: string;
};

const MAX_SAVED_REQUESTS = 20;
const MAX_PAYMENT_REQUESTS_STORAGE_LENGTH = 100_000;
const addressPattern = /^0x[0-9a-f]{40}$/i;

export function createLocalPaymentRequest(
  draft: LocalPaymentRequestDraft,
  options: { basePath: string; origin: string; id?: string; now?: number },
): LocalPaymentRequest {
  if (
    !draft ||
    typeof draft !== 'object' ||
    Array.isArray(draft) ||
    Object.keys(draft).some((key) => !['recipient', 'amount', 'memo'].includes(key)) ||
    typeof draft.recipient !== 'string' ||
    (draft.amount !== undefined && typeof draft.amount !== 'string') ||
    (draft.memo !== undefined && typeof draft.memo !== 'string')
  ) {
    throw new Error('The payment request contains unsupported or invalid fields.');
  }
  if (!isAddress(draft.recipient)) {
    throw new Error('A valid recipient address is required to save this request.');
  }
  const link = buildMusdPaymentLink(
    draft.recipient,
    draft.amount,
    options.basePath,
    options.origin,
    draft.memo,
  );
  const parsed = parseMusdPaymentRequest(link);
  const createdAt = options.now ?? Date.now();
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || createdAt > 8_640_000_000_000_000) {
    throw new Error('A valid request creation time is required.');
  }

  const request: LocalPaymentRequest = {
    id: options.id ?? crypto.randomUUID(),
    recipient: parsed.recipient,
    ...(parsed.amount ? { amount: parsed.amount } : {}),
    ...(parsed.memo ? { memo: parsed.memo } : {}),
    link,
    createdAt,
    status: 'unknown',
  };
  if (!isLocalPaymentRequest(request)) {
    throw new Error('The generated payment request could not be validated.');
  }
  return request;
}

function isLocalPaymentRequest(value: unknown): value is LocalPaymentRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (
    Object.keys(request).some((key) => !['id', 'recipient', 'amount', 'memo', 'link', 'createdAt', 'status'].includes(key)) ||
    typeof request.id !== 'string' ||
    request.id.length === 0 ||
    request.id.length > 128 ||
    typeof request.recipient !== 'string' ||
    !addressPattern.test(request.recipient) ||
    !isAddress(request.recipient) ||
    typeof request.link !== 'string' ||
    request.link.length > 4096 ||
    typeof request.createdAt !== 'number' ||
    !Number.isSafeInteger(request.createdAt) ||
    request.createdAt <= 0 ||
    request.createdAt > 8_640_000_000_000_000 ||
    (request.amount !== undefined && typeof request.amount !== 'string') ||
    (request.memo !== undefined && typeof request.memo !== 'string')
  ) {
    return false;
  }

  try {
    const parsed = parseMusdPaymentRequest(request.link);
    return parsed.source === 'url'
      && parsed.recipient.toLowerCase() === request.recipient.toLowerCase()
      && parsed.amount === request.amount
      && parsed.memo === request.memo;
  } catch {
    return false;
  }
}

export function validateLocalPaymentRequest(request: LocalPaymentRequest): LocalPaymentRequest {
  if (!isLocalPaymentRequest(request)) {
    throw new Error('This saved payment request is invalid or has been changed.');
  }
  return {
    id: request.id,
    recipient: request.recipient,
    ...(request.amount ? { amount: request.amount } : {}),
    ...(request.memo ? { memo: request.memo } : {}),
    link: request.link,
    createdAt: request.createdAt,
    status: 'unknown',
  };
}

export function parseLocalPaymentRequests(serialized: string | null): LocalPaymentRequest[] {
  if (!serialized || serialized.length > MAX_PAYMENT_REQUESTS_STORAGE_LENGTH) return [];

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    const seenIds = new Set<string>();
    return parsed
      .filter(isLocalPaymentRequest)
      .filter((request) => {
        if (seenIds.has(request.id)) return false;
        seenIds.add(request.id);
        return true;
      })
      .slice(0, MAX_SAVED_REQUESTS)
      .map((request) => ({
        id: request.id,
        recipient: request.recipient,
        ...(request.amount ? { amount: request.amount } : {}),
        ...(request.memo ? { memo: request.memo } : {}),
        link: request.link,
        createdAt: request.createdAt,
        status: 'unknown',
      }));
  } catch {
    return [];
  }
}

export function prependLocalPaymentRequest(
  requests: LocalPaymentRequest[],
  request: LocalPaymentRequest,
): LocalPaymentRequest[] {
  return [request, ...requests.filter((item) => item.id !== request.id)].slice(0, MAX_SAVED_REQUESTS);
}
