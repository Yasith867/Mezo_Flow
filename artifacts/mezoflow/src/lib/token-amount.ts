import { formatUnits, parseUnits } from 'viem';

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError('Token decimals must be a non-negative integer.');
  }

  const normalized = amount.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new TypeError('Token amount must be a decimal number.');
  }
  const fraction = normalized.split('.')[1] ?? '';
  if (fraction.length > decimals) {
    throw new RangeError(`Token amount cannot have more than ${decimals} decimal places.`);
  }
  const parsed = parseUnits(normalized, decimals);
  if (parsed <= 0n) {
    throw new RangeError('Token amount must be greater than zero.');
  }
  return parsed;
}

export function formatTokenAmount(
  value: bigint,
  decimals: number,
  maxFractionDigits: number,
): string {
  if (value < 0n) {
    throw new RangeError('Token balances cannot be negative.');
  }
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
    throw new RangeError('Maximum fraction digits must be a non-negative integer.');
  }

  const [whole, fraction = ''] = formatUnits(value, decimals).split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const visibleFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  if (visibleFraction) return `${groupedWhole}.${visibleFraction}`;
  if (value > 0n && fraction.replace(/0/g, '')) {
    return `<0.${'0'.repeat(Math.max(0, maxFractionDigits - 1))}1`;
  }
  return groupedWhole;
}
