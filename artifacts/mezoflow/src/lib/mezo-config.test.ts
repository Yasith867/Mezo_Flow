import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPLORER,
  MEZO_MAINNET_ADDRESS,
  MEZO_TESTNET_ID,
  MEZO_TESTNET_RPC,
  MUSD_ADDRESS,
  MUSD_DECIMALS,
  mezoTestnet,
} from './mezo-config.ts';

test('uses the documented Mezo Testnet network configuration', () => {
  assert.equal(MEZO_TESTNET_ID, 31611);
  assert.equal(mezoTestnet.id, 31611);
  assert.equal(MEZO_TESTNET_RPC, 'https://rpc.test.mezo.org');
  assert.equal(EXPLORER, 'https://explorer.test.mezo.org/');
  assert.equal(mezoTestnet.nativeCurrency.symbol, 'BTC');
  assert.equal(mezoTestnet.nativeCurrency.decimals, 18);
});

test('keeps the documented MUSD contract distinct from the mainnet MEZO token', () => {
  assert.equal(MUSD_ADDRESS, '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503');
  assert.equal(MUSD_DECIMALS, 18);
  assert.equal(MEZO_MAINNET_ADDRESS, '0x7B7c000000000000000000000000000000000001');
  assert.notEqual(MUSD_ADDRESS.toLowerCase(), MEZO_MAINNET_ADDRESS.toLowerCase());
});
