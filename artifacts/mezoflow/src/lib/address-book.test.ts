import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteAddressBookContact,
  parseAddressBook,
  saveAddressBookContact,
  validateAddressBookContactDraft,
  type AddressBookContact,
} from './address-book';

const address = '0x1111111111111111111111111111111111111111';
const otherAddress = '0x2222222222222222222222222222222222222222';
const contact: AddressBookContact = {
  id: 'contact-1',
  name: 'Alex',
  address: '0x1111111111111111111111111111111111111111',
  note: 'Test wallet',
  createdAt: 100,
  updatedAt: 100,
};

test('normalizes valid contact drafts and optional notes', () => {
  assert.deepEqual(validateAddressBookContactDraft({
    name: '  Alex  ',
    address,
    note: '  Test wallet  ',
  }), {
    name: 'Alex',
    address: '0x1111111111111111111111111111111111111111',
    note: 'Test wallet',
  });
  assert.deepEqual(validateAddressBookContactDraft({ name: 'Sam', address: otherAddress }), {
    name: 'Sam',
    address: otherAddress,
  });
});

test('rejects empty names, invalid addresses, oversized fields, and control characters', () => {
  assert.throws(() => validateAddressBookContactDraft({ name: ' ', address }), /name/);
  assert.throws(() => validateAddressBookContactDraft({ name: 'Alex', address: '0x123' }), /valid EVM/);
  assert.throws(() => validateAddressBookContactDraft({ name: 'x'.repeat(49), address }), /48 characters/);
  assert.throws(() => validateAddressBookContactDraft({ name: 'Alex', address, note: 'x'.repeat(161) }), /160 characters/);
  assert.throws(() => validateAddressBookContactDraft({ name: 'Al\nex', address }), /control characters/);
});

test('parses valid local contacts and ignores malformed records and duplicate IDs', () => {
  assert.deepEqual(parseAddressBook(JSON.stringify([
    contact,
    { ...contact, address: 'not-an-address' },
    { ...contact, name: 'Duplicate ID' },
    { ...contact, id: 'contact-2', name: 'Sam', address: otherAddress },
  ])), [
    contact,
    { ...contact, id: 'contact-2', name: 'Sam', address: otherAddress },
  ]);
  assert.deepEqual(parseAddressBook('{broken'), []);
  assert.deepEqual(parseAddressBook(JSON.stringify({ contact })), []);
});

test('adds, edits, and deletes contacts without changing other entries', () => {
  const created = saveAddressBookContact([contact], {
    name: 'Sam',
    address: otherAddress,
  }, { now: 200 });
  assert.equal(created.length, 2);
  assert.equal(created[0].name, 'Sam');
  assert.equal(created[0].createdAt, 200);

  const edited = saveAddressBookContact(created, {
    name: 'Sam Rivera',
    address: otherAddress,
    note: 'Family',
  }, { id: created[0].id, now: 300 });
  assert.equal(edited[0].name, 'Sam Rivera');
  assert.equal(edited[0].createdAt, 200);
  assert.equal(edited[0].updatedAt, 300);
  assert.equal(edited[1].id, contact.id);
  assert.deepEqual(deleteAddressBookContact(edited, created[0].id), [contact]);
});

test('rejects editing a missing contact', () => {
  assert.throws(
    () => saveAddressBookContact([], { name: 'Sam', address }, { id: 'missing' }),
    /could not be found/,
  );
});
