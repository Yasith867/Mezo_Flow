import { formatUnits, isAddress } from 'viem';
import { MEZO_TESTNET_ID, MUSD_ADDRESS, MUSD_DECIMALS } from './mezo-config';
import { parseTokenAmount } from './token-amount';

export type MusdPaymentRequest = {
  recipient: `0x${string}`;
  amount?: string;
  memo?: string;
  source: 'address' | 'url' | 'ethereum';
};

export type MusdTransferPrefill = {
  recipient: `0x${string}`;
  amount: string;
  memo: string;
  source: MusdPaymentRequest['source'];
  requiresReview: true;
};

export const MUSD_PAYMENT_REQUEST_VERSION = '1';
export const MAX_PAYMENT_REQUEST_MEMO_LENGTH = 140;
export const MAX_PAYMENT_REQUEST_LENGTH = 4096;
const MAX_PAYMENT_REQUEST_AMOUNT_LENGTH = 64;

function checkedMemo(value: string | null): string | undefined {
  if (value === null || value === '') return undefined;
  const memo = value.trim();
  if (memo.length > MAX_PAYMENT_REQUEST_MEMO_LENGTH) {
    throw new Error(`The payment request note must be ${MAX_PAYMENT_REQUEST_MEMO_LENGTH} characters or fewer.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(memo)) {
    throw new Error('The payment request note contains unsupported control characters.');
  }
  return memo || undefined;
}

function singleParam(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error(`The payment request contains duplicate ${key} fields.`);
  return values[0] ?? null;
}

function rejectUnknownParams(params: URLSearchParams, allowed: string[]) {
  const unexpected = [...params.keys()].find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`The payment request contains an unsupported ${unexpected} field.`);
}

function oneOfParams(
  params: URLSearchParams,
  keys: string[],
  label: string,
): string | null {
  const found = keys.flatMap((key) => params.getAll(key));
  if (found.length > 1) throw new Error(`The payment request contains ambiguous ${label} fields.`);
  return found[0] ?? null;
}

export function buildMusdPaymentRequest(recipient: string, amount?: string): string {
  if (!isAddress(recipient)) {
    throw new Error('A valid recipient address is required to build a MUSD payment request.');
  }
  if (amount === undefined || amount.trim() === '') {
    return `ethereum:${MUSD_ADDRESS}@${MEZO_TESTNET_ID}/transfer?address=${recipient}`;
  }
  let units: bigint;
  try {
    units = parseTokenAmount(amount, MUSD_DECIMALS);
  } catch (error) {
    if (error instanceof Error && /greater than zero/.test(error.message)) {
      throw new Error('Enter an amount greater than zero.');
    }
    throw new Error('Enter a valid MUSD amount with no more than 18 decimal places.');
  }
  if (units <= 0n) throw new Error('Enter an amount greater than zero.');
  return `ethereum:${MUSD_ADDRESS}@${MEZO_TESTNET_ID}/transfer?address=${recipient}&uint256=${units}`;
}

export function buildMusdPaymentLink(
  recipient: string,
  amount: string | undefined,
  basePath: string,
  origin: string,
  memo?: string,
): string {
  if (!isAddress(recipient)) {
    throw new Error('A valid recipient address is required to build a MUSD payment link.');
  }
  if (amount !== undefined && amount.trim() !== '') {
    if (amount.length > MAX_PAYMENT_REQUEST_AMOUNT_LENGTH) {
      throw new Error('The payment request amount is too long.');
    }
    let units: bigint;
    try {
      units = parseTokenAmount(amount, MUSD_DECIMALS);
    } catch (error) {
      if (error instanceof Error && /greater than zero/.test(error.message)) {
        throw new Error('Enter an amount greater than zero.');
      }
      throw new Error('Enter a valid MUSD amount with no more than 18 decimal places.');
    }
    if (units <= 0n) throw new Error('Enter an amount greater than zero.');
  }
  const normalizedMemo = checkedMemo(memo ?? null);

  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const link = new URL(`${normalizedBasePath}musd`, origin);
  link.searchParams.set('recipient', recipient);
  link.searchParams.set('chainId', String(MEZO_TESTNET_ID));
  link.searchParams.set('token', MUSD_ADDRESS);
  link.searchParams.set('version', MUSD_PAYMENT_REQUEST_VERSION);
  if (amount !== undefined && amount.trim() !== '') link.searchParams.set('amount', amount);
  if (normalizedMemo) link.searchParams.set('memo', normalizedMemo);
  const serialized = link.toString();
  if (serialized.length > MAX_PAYMENT_REQUEST_LENGTH) {
    throw new Error('The payment request link is too long.');
  }
  return serialized;
}

function checkedAddress(value: string | null): `0x${string}` {
  if (!value || !isAddress(value)) {
    throw new Error('The payment request does not contain a valid recipient address.');
  }
  return value as `0x${string}`;
}

function amountFromQuery(params: URLSearchParams): string | undefined {
  const rawUnits = singleParam(params, 'uint256');
  if (rawUnits !== null) {
    if (rawUnits.length > MAX_PAYMENT_REQUEST_AMOUNT_LENGTH) {
      throw new Error('The QR payment amount is too long.');
    }
    if (!/^\d+$/.test(rawUnits) || BigInt(rawUnits) <= 0n) {
      throw new Error('The QR payment amount must be a positive integer in token units.');
    }
    const amount = formatUnits(BigInt(rawUnits), MUSD_DECIMALS);
    return amount.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  }

  const humanAmount = singleParam(params, 'amount');
  if (humanAmount === null) return undefined;
  if (humanAmount.length > MAX_PAYMENT_REQUEST_AMOUNT_LENGTH) {
    throw new Error('The payment request amount is too long.');
  }
  try {
    parseTokenAmount(humanAmount, MUSD_DECIMALS);
  } catch {
    throw new Error('The payment request amount is invalid for MUSD.');
  }
  return humanAmount;
}

function validateNetwork(network: string) {
  if (!/^\d+$/.test(network) || !Number.isSafeInteger(Number(network)) || Number(network) !== MEZO_TESTNET_ID) {
    throw new Error(`This payment request is for chain ${network}, not Mezo Testnet (${MEZO_TESTNET_ID}).`);
  }
}

export function parseMusdPaymentRequest(input: string): MusdPaymentRequest {
  const value = input.trim();
  if (!value) throw new Error('Paste a wallet address, MezoFlow link, or supported MUSD QR request.');
  if (value.length > MAX_PAYMENT_REQUEST_LENGTH) {
    throw new Error('The payment request is too large to open safely.');
  }
  if (isAddress(value)) {
    return { recipient: value as `0x${string}`, source: 'address' };
  }

  if (/^ethereum:/i.test(value)) {
    if (/%(?![0-9a-f]{2})/i.test(value)) {
      throw new Error('The QR payment request contains malformed URL encoding.');
    }
    const parts = value.slice(value.indexOf(':') + 1).split('?');
    if (parts.length > 2) throw new Error('The QR payment request is malformed.');
    const [path, query = ''] = parts;
    const match = /^(0x[0-9a-fA-F]{40})@(\d+)\/transfer$/i.exec(path);
    if (!match) throw new Error('This Ethereum QR payload is not a supported MUSD transfer request.');

    const contractOrAddress = match[1];
    const chainId = match[2];
    const params = new URLSearchParams(query);
    rejectUnknownParams(params, ['address', 'to', 'uint256']);
    if (Number(chainId) !== MEZO_TESTNET_ID) {
      throw new Error(`This QR request targets chain ${chainId}, not Mezo Testnet (${MEZO_TESTNET_ID}).`);
    }

    if (contractOrAddress.toLowerCase() !== MUSD_ADDRESS.toLowerCase()) {
      throw new Error('This QR request uses an unverified token contract. Only the official Testnet MUSD contract is supported.');
    }
    const recipient = oneOfParams(params, ['address', 'to'], 'recipient');
    const amount = amountFromQuery(params);
    return {
      recipient: checkedAddress(recipient),
      ...(amount ? { amount } : {}),
      source: 'ethereum',
    };
  }

  if (/%(?![0-9a-f]{2})/i.test(value)) {
    throw new Error('The payment request contains malformed URL encoding.');
  }
  if (!value.startsWith('/') && !/^https?:\/\//i.test(value) && !value.includes('?')) {
    throw new Error('Enter a valid wallet address or payment request.');
  }
  let url: URL;
  try {
    url = new URL(value, 'https://mezoflow.invalid');
  } catch {
    throw new Error('Enter a valid wallet address or payment request.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.hash) {
    throw new Error('The payment request link is malformed.');
  }
  if (!url.pathname.replace(/\/+$/, '').endsWith('/musd')) {
    throw new Error('This link is not a MezoFlow MUSD payment request.');
  }
  const params = url.searchParams;
  rejectUnknownParams(params, ['recipient', 'chainId', 'token', 'version', 'amount', 'memo']);
  const version = singleParam(params, 'version');
  if (version !== MUSD_PAYMENT_REQUEST_VERSION) {
    if (version === null) throw new Error('The payment request is missing its version identifier.');
    throw new Error(`Payment request version ${version} is not supported.`);
  }

  const recipient = singleParam(params, 'recipient');
  if (!recipient) {
    throw new Error('The link does not include a recipient address.');
  }
  const chainId = singleParam(params, 'chainId');
  const token = singleParam(params, 'token');
  if (!chainId || !token) {
    throw new Error('Version 1 payment requests must specify the network and token contract.');
  }
  validateNetwork(chainId);
  if (token && (!isAddress(token) || token.toLowerCase() !== MUSD_ADDRESS.toLowerCase())) {
    throw new Error('The link identifies a token other than verified Testnet MUSD.');
  }
  const amount = amountFromQuery(params);
  const memo = checkedMemo(singleParam(params, 'memo'));
  return {
    recipient: checkedAddress(recipient),
    ...(amount ? { amount } : {}),
    ...(memo ? { memo } : {}),
    source: 'url',
  };
}

export function createMusdTransferPrefill(input: string): MusdTransferPrefill {
  const request = parseMusdPaymentRequest(input);
  return {
    recipient: request.recipient,
    amount: request.amount ?? '',
    memo: request.memo ?? '',
    source: request.source,
    requiresReview: true,
  };
}
