import { createConfig, http } from 'wagmi';
import { metaMask } from 'wagmi/connectors';
import { defineChain } from 'viem';

export const MEZO_TESTNET_ID = 31611;
export const MEZO_TESTNET_RPC = 'https://rpc.test.mezo.org';
export const EXPLORER = 'https://explorer.test.mezo.org/';
export const MAINNET_EXPLORER = 'https://explorer.mezo.org/';
export const FAUCET = 'https://faucet.test.mezo.org/';
export const MEZO_APP = 'https://testnet.mezo.org';
export const DOCS = 'https://mezo.org/docs/developers/';
export const TOKEN_DOCS = 'https://mezo.org/docs/users/resources/contracts-reference/';
export const MUSD_ADDRESS = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503' as const;
export const MUSD_DECIMALS = 18;
export const MEZO_MAINNET_ADDRESS = '0x7B7c000000000000000000000000000000000001' as const;

export const mezoTestnet = defineChain({
  id: MEZO_TESTNET_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [MEZO_TESTNET_RPC] } },
  blockExplorers: { default: { name: 'Mezo Testnet Explorer', url: EXPLORER } },
  testnet: true,
});

export const MUSD_ABI = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const wagmiConfig = createConfig({
  chains: [mezoTestnet],
  connectors: [metaMask()],
  transports: { [MEZO_TESTNET_ID]: http(MEZO_TESTNET_RPC) },
});
