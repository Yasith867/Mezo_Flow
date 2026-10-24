import { EXPLORER, FAUCET, MAINNET_EXPLORER, MEZO_APP, MEZO_TESTNET_ID } from './mezo-config';

export type OpportunityCategory = 'Borrowing' | 'Liquidity' | 'Locking' | 'Voting';
export type OpportunityTag = 'MUSD' | 'MEZO';

export type VerifiedOpportunity = {
  id: string;
  name: string;
  category: OpportunityCategory;
  network: string;
  networkChainId?: number;
  summary: string;
  assets: string;
  eligibility: string;
  transactionNotes: string;
  verificationStatus: string;
  risk: string;
  tags: OpportunityTag[];
  website: string;
  documentation: string;
  contracts?: { name: string; address: `0x${string}`; explorer: string }[];
};

const TESTNET_POOLS_DOCS = 'https://mezo.org/docs/developers/features/mezo-pools';
const CONTRACT_REFERENCE = 'https://mezo.org/docs/users/resources/contracts-reference';

export const VERIFIED_OPPORTUNITIES: VerifiedOpportunity[] = [
  {
    id: 'mezo-borrow',
    name: 'Mezo Borrow',
    category: 'Borrowing',
    network: 'Mezo Testnet',
    networkChainId: MEZO_TESTNET_ID,
    summary: 'Official Bitcoin-backed borrowing flow for testing MUSD loans.',
    assets: 'Testnet BTC collateral · MUSD debt',
    eligibility: 'The official app determines collateral and borrowing eligibility. MezoFlow does not read your loan.',
    transactionNotes: 'Review any collateral deposit, approval, and borrowing details in the official app and wallet before signing.',
    verificationStatus: 'Official Testnet guide linked · eligibility and live position are not checked by MezoFlow.',
    risk: 'Borrowing creates debt secured by BTC collateral. Protocol rules may liquidate collateral; this app does not monitor loan health.',
    tags: ['MUSD'],
    website: `${MEZO_APP}/feature/borrow`,
    documentation: 'https://mezo.org/docs/users/borrow/mint-musd/',
  },
  {
    id: 'mezo-pools-testnet',
    name: 'Mezo Pools · Testnet',
    category: 'Liquidity',
    network: 'Mezo Testnet',
    networkChainId: MEZO_TESTNET_ID,
    summary: 'Officially documented MUSD pools. MezoFlow does not report live reserves, pool health, APR, or user positions.',
    assets: 'MUSD/BTC · MUSD/mUSDC · MUSD/mUSDT',
    eligibility: 'The connected wallet must be on Mezo Testnet to use these testnet contracts; asset balances and pool eligibility are not checked here.',
    transactionNotes: 'Pool deposits require supported assets and may require token approvals. Review the pool, amounts, and approval spender in the official app and wallet.',
    verificationStatus: 'Official Testnet pool addresses are documented · deployment code and pool state are not checked at runtime.',
    risk: 'Liquidity provision can lose value through pool-price changes and fees. Testnet assets are not represented as having real-world value.',
    tags: ['MUSD'],
    website: 'https://mezo.org/',
    documentation: TESTNET_POOLS_DOCS,
    contracts: [
      { name: 'MUSD/BTC pool', address: '0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9', explorer: `${EXPLORER}address/0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9` },
      { name: 'MUSD/mUSDC pool', address: '0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e', explorer: `${EXPLORER}address/0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e` },
      { name: 'MUSD/mUSDT pool', address: '0x27414B76CF00E24ed087adb56E26bAeEEe93494e', explorer: `${EXPLORER}address/0x27414B76CF00E24ed087adb56E26bAeEEe93494e` },
      { name: 'Testnet pool router', address: '0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9', explorer: `${EXPLORER}address/0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` },
    ],
  },
  {
    id: 'mezo-vemezo-lock',
    name: 'Lock MEZO · veMEZO',
    category: 'Locking',
    network: 'Mezo Mainnet',
    summary: 'The official Mezo Earn flow locks MEZO into a veMEZO position.',
    assets: 'MEZO on Mezo Mainnet',
    eligibility: 'Requires MEZO and a connected wallet. The official app checks the position and amount.',
    transactionNotes: 'Lock amount, duration, approvals, and the resulting position are reviewed in the official app before wallet signing.',
    verificationStatus: 'Official Mainnet locking guide linked · this Testnet app does not inspect or submit the position.',
    risk: 'Locked MEZO is committed for the selected duration and is not liquid like an unlocked token. Review current terms and expiration before signing.',
    tags: ['MEZO'],
    website: 'https://mezo.org/',
    documentation: 'https://mezo.org/docs/users/mezo-earn/lock/vemezo/how-to-lock-mezo',
    contracts: [
      { name: 'MEZO token (source asset)', address: '0x7B7c000000000000000000000000000000000001', explorer: `${MAINNET_EXPLORER}token/0x7B7c000000000000000000000000000000000001` },
    ],
  },
  {
    id: 'mezo-gauge-voting',
    name: 'MEZO Gauge voting',
    category: 'Voting',
    network: 'Mezo Mainnet · incentives target Ethereum and Base pools',
    summary: 'The official MEZO Gauge page lets veMEZO holders allocate votes to eligible off-Mezo MUSD liquidity gauges.',
    assets: 'Active veMEZO position · BTC for Mezo gas',
    eligibility: 'The official voting app checks the connected wallet and active veMEZO position. MezoFlow does not calculate voting power.',
    transactionNotes: 'Vote allocations and eligibility are reviewed by the official app. The documented flow allows one vote action per lock each weekly epoch.',
    verificationStatus: 'Official Mainnet guide and voting page linked · gauges, eligibility, and voting power are not checked here.',
    risk: 'Votes persist until changed and cannot be changed again in the same epoch. Incentives and emission allocations are not guaranteed returns.',
    tags: ['MUSD', 'MEZO'],
    website: 'https://mezo.org/earn/vote/mezo',
    documentation: 'https://mezo.org/docs/users/mezo-earn/vote/mezo-gauges/how-to-vote',
  },
];

export const OPPORTUNITY_SOURCE = CONTRACT_REFERENCE;
export const OPPORTUNITY_FAUCET = FAUCET;
