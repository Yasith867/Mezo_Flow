export type AppTheme = 'dark' | 'light';
export type DisplayCurrency = 'USD' | 'AUD' | 'EUR' | 'GBP';
export type NetworkDisplay = 'name' | 'name-and-id';

export type AppPreferences = {
  theme: AppTheme;
  compact: boolean;
  confirm: boolean;
  currency: DisplayCurrency;
  networkDisplay: NetworkDisplay;
};

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  compact: false,
  confirm: true,
  currency: 'USD',
  networkDisplay: 'name-and-id',
};

export function parsePreferences(value: string | null): AppPreferences {
  if (!value) return DEFAULT_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return DEFAULT_PREFERENCES;
    }
    const preferences = parsed as Record<string, unknown>;
    return {
      theme: preferences.theme === 'light' ? 'light' : 'dark',
      compact: preferences.compact === true,
      confirm: preferences.confirm !== false,
      currency: preferences.currency === 'AUD' || preferences.currency === 'EUR' || preferences.currency === 'GBP'
        ? preferences.currency
        : 'USD',
      networkDisplay: preferences.networkDisplay === 'name' ? 'name' : 'name-and-id',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function mergePreferences(
  value: string | null,
  updates: Partial<AppPreferences>,
): string {
  return JSON.stringify({ ...parsePreferences(value), ...updates });
}
