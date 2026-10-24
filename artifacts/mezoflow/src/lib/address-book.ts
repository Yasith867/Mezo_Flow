import { getAddress, isAddress } from 'viem';

export type AddressBookContact = {
  id: string;
  name: string;
  address: `0x${string}`;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export type AddressBookContactDraft = {
  name: string;
  address: string;
  note?: string;
};

const MAX_CONTACTS = 100;
const MAX_NAME_LENGTH = 48;
const MAX_NOTE_LENGTH = 160;
const addressBookAddressPattern = /^0x[0-9a-f]{40}$/i;

export function validateAddressBookContactDraft(
  draft: AddressBookContactDraft,
): Omit<AddressBookContact, 'id' | 'createdAt' | 'updatedAt'> {
  const name = draft.name.trim();
  const address = draft.address.trim();
  const note = draft.note?.trim() ?? '';

  if (!name) throw new Error('Enter a name for this recipient.');
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Recipient names must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Recipient names cannot contain control characters.');
  }
  if (!isAddress(address)) throw new Error('Enter a valid EVM wallet address.');
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Recipient notes must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) {
    throw new Error('Recipient notes cannot contain control characters.');
  }

  return {
    name,
    address: getAddress(address),
    ...(note ? { note } : {}),
  };
}

function isAddressBookContact(value: unknown): value is AddressBookContact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const contact = value as Record<string, unknown>;

  if (
    typeof contact.id !== 'string' ||
    contact.id.length === 0 ||
    contact.id.length > 128 ||
    typeof contact.name !== 'string' ||
    typeof contact.address !== 'string' ||
    !addressBookAddressPattern.test(contact.address) ||
    !isAddress(contact.address) ||
    typeof contact.createdAt !== 'number' ||
    !Number.isFinite(contact.createdAt) ||
    contact.createdAt <= 0 ||
    typeof contact.updatedAt !== 'number' ||
    !Number.isFinite(contact.updatedAt) ||
    contact.updatedAt <= 0 ||
    (contact.note !== undefined && typeof contact.note !== 'string')
  ) {
    return false;
  }

  try {
    validateAddressBookContactDraft({
      name: contact.name,
      address: contact.address,
      note: contact.note as string | undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export function parseAddressBook(serialized: string | null): AddressBookContact[] {
  if (!serialized) return [];

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    const seenIds = new Set<string>();
    return parsed
      .filter(isAddressBookContact)
      .filter((contact) => {
        if (seenIds.has(contact.id)) return false;
        seenIds.add(contact.id);
        return true;
      })
      .slice(0, MAX_CONTACTS);
  } catch {
    return [];
  }
}

export function saveAddressBookContact(
  contacts: AddressBookContact[],
  draft: AddressBookContactDraft,
  options: { id?: string; now?: number } = {},
): AddressBookContact[] {
  const normalized = validateAddressBookContactDraft(draft);
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now) || now <= 0) throw new Error('A valid save time is required.');

  if (options.id) {
    const existing = contacts.find((contact) => contact.id === options.id);
    if (!existing) throw new Error('The recipient to edit could not be found.');
    const updated = { ...existing, ...normalized, updatedAt: now };
    return contacts.map((contact) => contact.id === options.id ? updated : contact);
  }

  if (contacts.length >= MAX_CONTACTS) {
    throw new Error(`The local address book can contain up to ${MAX_CONTACTS} contacts.`);
  }

  const id = crypto.randomUUID();
  return [{ id, ...normalized, createdAt: now, updatedAt: now }, ...contacts];
}

export function deleteAddressBookContact(
  contacts: AddressBookContact[],
  id: string,
): AddressBookContact[] {
  return contacts.filter((contact) => contact.id !== id);
}
