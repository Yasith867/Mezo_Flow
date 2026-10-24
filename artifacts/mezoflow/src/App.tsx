import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { WagmiProvider, useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { isAddress } from 'viem';
import { QRCodeSVG } from 'qrcode.react';
import AddressBookPage from '@/components/address-book-page';
import { PaymentRequestHistoryPage, PaymentRequestPage } from '@/components/payment-request-pages';
import { formatTokenAmount, parseTokenAmount } from '@/lib/token-amount';
import { parseLocalTransfers, type LocalTransfer } from '@/lib/local-transfers';
import { buildMusdPaymentLink, createMusdTransferPrefill, parseMusdPaymentRequest } from '@/lib/musd-payment-request';
import { deleteAddressBookContact, parseAddressBook, saveAddressBookContact, validateAddressBookContactDraft, type AddressBookContact, type AddressBookContactDraft } from '@/lib/address-book';
import { createLocalPaymentRequest, parseLocalPaymentRequests, prependLocalPaymentRequest, type LocalPaymentRequest, type LocalPaymentRequestDraft } from '@/lib/payment-requests';
import {
  fetchActivityPage,
  mergeActivityRecords,
  type ActivityRecord,
  type ActivitySource,
} from '@/lib/activity-history';
import { OPPORTUNITY_FAUCET, OPPORTUNITY_SOURCE, VERIFIED_OPPORTUNITIES } from '@/lib/opportunities';
import { Activity as ActivityIcon, ArrowRight, ArrowUpRight, Bitcoin, Check, CheckCircle2, CircleHelp, Clock3, Compass, Copy, ExternalLink, FileText, Gauge, Info, LayoutDashboard, LockKeyhole, Moon, MoreHorizontal, Network, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Settings, Share, ShieldCheck, Sun, TriangleAlert, Users, Wallet, X } from 'lucide-react';
import { DOCS, EXPLORER, FAUCET, MEZO_APP, MEZO_MAINNET_ADDRESS, MEZO_TESTNET_ID, MEZO_TESTNET_RPC, MUSD_ABI, MUSD_ADDRESS, MUSD_DECIMALS, TOKEN_DOCS, mezoTestnet, wagmiConfig } from '@/lib/mezo-config';
import { mergePreferences, parsePreferences, type AppPreferences, type AppTheme } from '@/lib/preferences';
import './index.css';

const queryClient = new QueryClient();
const CHAIN_ID = MEZO_TESTNET_ID;
const RPC_URL = MEZO_TESTNET_RPC;

type WalletModel = {
  address?: `0x${string}`;
  chainId?: number;
  connected: boolean;
  btcBalance?: string;
  musdBalance?: string;
  musdBalanceRaw?: bigint;
  musdName?: string;
  musdSymbol?: string;
  musdDecimals?: number;
  musdMetadataLoading: boolean;
  musdMetadataError: string;
  balanceLoading: boolean;
  btcBalanceLoading: boolean;
  musdBalanceLoading: boolean;
  btcBalanceError: string;
  musdBalanceError: string;
  balanceError: string;
  lastBalanceUpdatedAt?: number;
  networkError: string;
  networkSwitching: boolean;
  switchNetwork: () => Promise<void>;
  copyAddress: () => Promise<void>;
  transfers: LocalTransfer[];
  sendTransfer: (recipient: string, amount: string) => Promise<void>;
  transferError: string;
  sending: boolean;
  latestHash?: `0x${string}`;
  latestStatus?: 'success' | 'reverted' | 'pending' | 'unavailable';
  refreshLatestReceipt: () => void;
  refreshBalances: () => void;
};

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: Gauge },
  { href: '/positions', label: 'Positions', icon: LockKeyhole },
  { href: '/opportunities', label: 'Opportunities', icon: Compass },
  { href: '/musd', label: 'MUSD', icon: CircleHelp },
  { href: '/request', label: 'Request MUSD', icon: FileText },
  { href: '/recipients', label: 'Saved recipients', icon: Users },
  { href: '/requests', label: 'Request history', icon: Clock3 },
  { href: '/mezo', label: 'MEZO & network', icon: Network },
  { href: '/activity', label: 'Activity', icon: ActivityIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/docs', label: 'Docs & safety', icon: FileText },
];

type OpportunityFilter = 'all' | 'network' | 'musd' | 'mezo' | 'locking' | 'voting';
const OPPORTUNITY_FILTERS: { value: OpportunityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'network', label: 'On my network' },
  { value: 'musd', label: 'MUSD-related' },
  { value: 'mezo', label: 'MEZO-related' },
  { value: 'locking', label: 'Staking & locking' },
  { value: 'voting', label: 'Voting & governance' },
];

function useWalletModel(): WalletModel {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: networkSwitching } = useSwitchChain();
  const [transfers, setTransfers] = useState<LocalTransfer[]>([]);
  const [transferError, setTransferError] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [latestHash, setLatestHash] = useState<`0x${string}`>();
  const [sending, setSending] = useState(false);
  const {
    data: btcData, isLoading: btcLoading, isFetching: btcFetching, isError: btcError, dataUpdatedAt: btcUpdatedAt, refetch: refetchBtc,
  } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: Boolean(address && chainId === CHAIN_ID), refetchInterval: 20_000 } });
  const {
    data: musdData, isLoading: musdLoading, isFetching: musdFetching, isError: musdError, dataUpdatedAt: musdUpdatedAt, refetch: refetchMusd,
  } = useReadContract({
    address: MUSD_ADDRESS, abi: MUSD_ABI, functionName: 'balanceOf', args: address ? [address] : undefined,
    chainId: CHAIN_ID, query: { enabled: Boolean(address && chainId === CHAIN_ID), refetchInterval: 20_000 },
  });
  const tokenName = useReadContract({
    address: MUSD_ADDRESS, abi: MUSD_ABI, functionName: 'name', chainId: CHAIN_ID,
    query: { staleTime: 3_600_000 },
  });
  const tokenSymbol = useReadContract({
    address: MUSD_ADDRESS, abi: MUSD_ABI, functionName: 'symbol', chainId: CHAIN_ID,
    query: { staleTime: 3_600_000 },
  });
  const tokenDecimals = useReadContract({
    address: MUSD_ADDRESS, abi: MUSD_ABI, functionName: 'decimals', chainId: CHAIN_ID,
    query: { staleTime: 3_600_000 },
  });
  const { writeContractAsync } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: latestHash, chainId: CHAIN_ID, query: { enabled: Boolean(latestHash), refetchInterval: 3_000 } });

  useEffect(() => {
    try {
      const records = parseLocalTransfers(localStorage.getItem('mezoflow-transfers'));
      setTransfers(records);
      const pending = records.find((record) => record.status === 'submitted');
      if (pending) setLatestHash(pending.hash);
    } catch {
      setTransfers([]);
    }
  }, []);

  useEffect(() => {
    if (!latestHash || !receipt.isSuccess || !receipt.data) return;
    const latestTransfer = transfers.find((item) => item.hash === latestHash);
    if (!latestTransfer || latestTransfer.status !== 'submitted') return;
    const status: LocalTransfer['status'] = receipt.data.status === 'success' ? 'success' : 'reverted';
    void refetchBtc();
    void refetchMusd();
    const updated = transfers.map((item) => item.hash === latestHash ? { ...item, status } : item);
    setTransfers(updated);
    try {
      localStorage.setItem('mezoflow-transfers', JSON.stringify(updated));
    } catch {
      setTransferError('Receipt status was verified, but this browser could not save the updated activity record.');
    }
    const nextPending = updated.find((item) => item.status === 'submitted');
    setLatestHash(nextPending?.hash);
  }, [latestHash, receipt.isSuccess, receipt.data, transfers, refetchBtc, refetchMusd]);

  const refreshBalances = () => {
    void refetchBtc();
    void refetchMusd();
  };
  const switchNetwork = async () => {
    setNetworkError('');
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The wallet could not switch networks.';
      if (getWalletErrorCode(error) === 4902 || /unrecognized chain|unknown chain|chain is not added/i.test(message)) {
        try {
          await addMezoTestnetToWallet();
          await switchChainAsync({ chainId: CHAIN_ID });
        } catch (addError) {
          setNetworkError(addError instanceof Error ? addError.message : 'The wallet could not add Mezo Testnet.');
        }
      } else {
        setNetworkError(message);
      }
    }
  };

  const sendTransfer = async (recipient: string, amount: string) => {
    setTransferError('');
    if (!address) { setTransferError('Connect a wallet to send MUSD.'); return; }
    if (chainId !== CHAIN_ID) { setTransferError('Switch to Mezo Testnet before sending.'); return; }
    if (tokenName.data !== 'Mezo USD' || tokenSymbol.data !== 'MUSD' || tokenDecimals.data !== MUSD_DECIMALS) {
      setTransferError('The MUSD contract metadata could not be verified. Sending is disabled until the official token details can be read.');
      return;
    }
    if (!isAddress(recipient)) { setTransferError('Enter a valid EVM recipient address.'); return; }
    let parsed: bigint;
    try {
      parsed = parseTokenAmount(amount, MUSD_DECIMALS);
    } catch {
      setTransferError('Enter a valid MUSD amount with no more than 18 decimal places.');
      return;
    }
    if (parsed <= 0n) { setTransferError('Enter an amount greater than zero.'); return; }
    if (typeof musdData !== 'bigint') { setTransferError('The MUSD balance is unavailable. Refresh it before preparing a transfer.'); return; }
    if (parsed > musdData) { setTransferError('The transfer amount exceeds the connected wallet’s MUSD balance.'); return; }
    setSending(true);
    try {
      const hash = await writeContractAsync({
        address: MUSD_ADDRESS, abi: MUSD_ABI, functionName: 'transfer', args: [recipient as `0x${string}`, parsed], chainId: CHAIN_ID,
      });
      const record: LocalTransfer = { hash, sender: address, amount, recipient, timestamp: Date.now(), status: 'submitted' };
      setLatestHash(hash);
      const updated = [record, ...transfers];
      setTransfers(updated);
      try {
        localStorage.setItem('mezoflow-transfers', JSON.stringify(updated));
        setTransferError('');
      } catch {
        setTransferError('The transaction was submitted, but this browser could not save its activity record.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The wallet could not submit this transfer.';
      setTransferError(message.toLowerCase().includes('reject') || message.toLowerCase().includes('denied') ? 'Wallet request was rejected. No transaction was submitted.' : message);
    } finally {
      setSending(false);
    }
  };
  const copyAddress = async () => {
    if (address) await navigator.clipboard.writeText(address);
  };
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;
  const networkBalanceError = wrongNetwork ? 'Switch to Mezo Testnet to read supported balances.' : '';
  const btcBalanceError = networkBalanceError || (btcError ? 'Could not read the native BTC balance from Mezo Testnet.' : '');
  const musdBalanceError = networkBalanceError || (musdError ? 'Could not read the MUSD balance from its testnet contract.' : '');
  const musdMetadataLoading = tokenName.isLoading || tokenSymbol.isLoading || tokenDecimals.isLoading;
  const musdMetadataError = tokenName.isError || tokenSymbol.isError || tokenDecimals.isError
    ? 'Could not read the MUSD token metadata from Mezo Testnet.'
    : tokenName.data !== undefined && tokenName.data !== 'Mezo USD'
      || tokenSymbol.data !== undefined && tokenSymbol.data !== 'MUSD'
      || tokenDecimals.data !== undefined && tokenDecimals.data !== MUSD_DECIMALS
      ? 'The on-chain MUSD metadata differs from the values in Mezo’s official contract reference.'
      : '';
  const lastBalanceUpdatedAt = btcUpdatedAt && musdUpdatedAt
    ? Math.min(btcUpdatedAt, musdUpdatedAt)
    : btcUpdatedAt || musdUpdatedAt || undefined;
  return {
    address, chainId, connected: isConnected, btcBalance: btcData ? formatTokenAmount(btcData.value, btcData.decimals, 8) : undefined,
    musdBalance: typeof musdData === 'bigint' ? formatTokenAmount(musdData, MUSD_DECIMALS, 8) : undefined,
    musdBalanceRaw: typeof musdData === 'bigint' ? musdData : undefined,
    musdName: tokenName.data,
    musdSymbol: tokenSymbol.data,
    musdDecimals: tokenDecimals.data,
    musdMetadataLoading,
    musdMetadataError,
    balanceLoading: btcFetching || musdFetching,
    btcBalanceLoading: btcLoading, musdBalanceLoading: musdLoading,
    btcBalanceError, musdBalanceError, lastBalanceUpdatedAt,
    balanceError: wrongNetwork
      ? networkBalanceError
      : btcError || musdError ? 'Could not read one or more balances from Mezo Testnet. Retry to check the RPC connection.' : '',
    networkError, networkSwitching, switchNetwork,
    copyAddress, transfers, sendTransfer, transferError, sending, latestHash,
    latestStatus: receipt.isSuccess ? (receipt.data?.status === 'success' ? 'success' : 'reverted') : receipt.isError ? 'unavailable' : latestHash ? 'pending' : undefined,
    refreshLatestReceipt: () => { void receipt.refetch(); },
    refreshBalances,
  };
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <MezoFlow />
        </WouterRouter>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

function MezoFlow() {
  const wallet = useWalletModel();
  const [location, setLocation] = useLocation();
  const [toast, setToast] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [contacts, setContacts] = useState<AddressBookContact[]>(() => {
    try { return parseAddressBook(localStorage.getItem('mezoflow-address-book')); }
    catch { return []; }
  });
  const [paymentRequests, setPaymentRequests] = useState<LocalPaymentRequest[]>(() => {
    try { return parseLocalPaymentRequests(localStorage.getItem('mezoflow-payment-requests')); }
    catch { return []; }
  });
  const [pendingSendRecipient, setPendingSendRecipient] = useState<string>();
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    try {
      return parsePreferences(localStorage.getItem('mezoflow-preferences'));
    } catch {
      return parsePreferences(null);
    }
  });
  const updatePreferences = (updates: Partial<AppPreferences>) => {
    let next = parsePreferences(null);
    try {
      const serialized = mergePreferences(localStorage.getItem('mezoflow-preferences'), updates);
      next = parsePreferences(serialized);
      localStorage.setItem('mezoflow-preferences', serialized);
    } catch {
      next = { ...preferences, ...updates };
      setToast('Preference changed for this session, but this browser could not save it.');
    }
    setPreferences(next);
  };
  const changeTheme = (nextTheme: AppTheme) => updatePreferences({ theme: nextTheme });
  const resetPreferences = () => {
    try {
      localStorage.removeItem('mezoflow-preferences');
      setToast('Local preferences cleared. Transfer records were not changed.');
    } catch {
      setToast('Defaults restored for this session, but browser storage could not be cleared.');
    }
    setPreferences(parsePreferences(null));
  };
  useEffect(() => setMoreOpen(false), [location]);
  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(decodeURIComponent(targetId))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [location]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', preferences.compact);
  }, [preferences.compact]);
  useEffect(() => {
    const syncPreferences = (event: StorageEvent) => {
      if (event.key === 'mezoflow-preferences') {
        setPreferences(parsePreferences(event.newValue));
      }
      if (event.key === 'mezoflow-address-book') {
        setContacts(parseAddressBook(event.newValue));
      }
      if (event.key === 'mezoflow-payment-requests') {
        setPaymentRequests(parseLocalPaymentRequests(event.newValue));
      }
    };
    window.addEventListener('storage', syncPreferences);
    return () => window.removeEventListener('storage', syncPreferences);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark');
  }, [preferences.theme]);
  const notify = (message: string) => setToast(message);
  const persistContacts = (updated: AddressBookContact[]) => {
    try {
      localStorage.setItem('mezoflow-address-book', JSON.stringify(updated));
      setContacts(updated);
      return true;
    } catch {
      notify('Could not save the address book in this browser.');
      return false;
    }
  };
  const saveContact = (draft: AddressBookContactDraft, id?: string) => {
    try {
      return persistContacts(saveAddressBookContact(contacts, draft, { ...(id ? { id } : {}) }));
    } catch {
      return false;
    }
  };
  const removeContact = (id: string) => {
    try {
      return persistContacts(deleteAddressBookContact(contacts, id));
    } catch {
      return false;
    }
  };
  const copyAddress = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };
  const copyPaymentValue = async (value: string, label: string) => {
    const copied = await copyAddress(value);
    notify(copied ? `${label} copied.` : `Could not copy the ${label.toLowerCase()}.`);
    return copied;
  };
  const createPaymentRequest = (draft: LocalPaymentRequestDraft) => {
    const request = createLocalPaymentRequest(draft, {
      basePath: import.meta.env.BASE_URL,
      origin: window.location.origin,
    });
    const updated = prependLocalPaymentRequest(paymentRequests, request);
    try {
      localStorage.setItem('mezoflow-payment-requests', JSON.stringify(updated));
    } catch {
      throw new Error('The request was not saved because this browser could not store local history.');
    }
    setPaymentRequests(updated);
    return request;
  };
  const sendToContact = (contact: AddressBookContact) => {
    try {
      const recipient = validateAddressBookContactDraft({
        name: contact.name,
        address: contact.address,
        note: contact.note,
      }).address;
      setPendingSendRecipient(recipient);
      setLocation('/musd#send');
    } catch {
      notify('This saved recipient address is no longer valid. Edit the contact before using it.');
    }
  };
  const activeLabel = NAV.find((item) => item.href === location)?.label ?? 'Not found';
  useEffect(() => {
    document.title = `${activeLabel} · MezoFlow`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = `${activeLabel} for MezoFlow — live Mezo Testnet wallet tools with clear, verified-data limitations.`;
  }, [activeLabel]);
  const props = { wallet, notify };
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <Link href="/" className="brand" data-testid="link-brand-home"><span className="brand-mark"><Bitcoin size={18} strokeWidth={2.4} /></span><span>mezo<span className="lime">flow</span></span></Link>
        <div className="network-stamp">Command center</div>
        <nav className="nav-list" aria-label="Main navigation">
          {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-nav-${href === '/' ? 'overview' : href.slice(1)}`}><Icon /><span>{label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-network"><span className="network-dot" /><div><span className="network-title">Mezo Testnet</span>{preferences.networkDisplay === 'name-and-id' && <span className="network-sub">CHAIN {CHAIN_ID}</span>}</div></div>
          <div className="side-footer">Bitcoin-native, EVM-compatible</div>
        </div>
      </aside>
      <div className="main-frame">
        <header className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} data-testid="button-toggle-sidebar">
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="mobile-top"><Link href="/" className="brand" data-testid="link-mobile-brand"><span className="brand-mark"><Bitcoin size={16} /></span><span>mezo<span className="lime">flow</span></span></Link></div>
          <div className="crumb">MezoFlow <span className="muted">/</span> {activeLabel}</div>
          <div className="top-actions">
            <div className={`chain-pill ${wallet.connected && wallet.chainId !== CHAIN_ID ? 'unsupported' : ''}`}><span className="network-dot" /><b>{wallet.connected && wallet.chainId !== CHAIN_ID ? 'UNSUPPORTED NETWORK' : 'MEZO TESTNET'}</b>{preferences.networkDisplay === 'name-and-id' && <><span className="muted">·</span><span className="mono">{wallet.chainId ?? CHAIN_ID}</span></>}</div>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => changeTheme(preferences.theme === 'dark' ? 'light' : 'dark')}
              aria-label={preferences.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={preferences.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              data-testid="button-theme-toggle"
            >
              {preferences.theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <WalletConnect wallet={wallet} />
          </div>
        </header>
        <Switch>
          <Route path="/"><HomePage {...props} /></Route>
          <Route path="/portfolio"><PortfolioPage {...props} /></Route>
          <Route path="/positions"><PositionsPage /></Route>
          <Route path="/opportunities"><OpportunitiesPage wallet={wallet} /></Route>
          <Route path="/musd"><MusdPage {...props} selectedRecipient={pendingSendRecipient} onSelectedRecipientApplied={() => setPendingSendRecipient(undefined)} /></Route>
          <Route path="/request"><PaymentRequestPage walletAddress={wallet.address} connected={wallet.connected} onCreateRequest={createPaymentRequest} onCopy={copyPaymentValue} requests={paymentRequests} /></Route>
          <Route path="/recipients"><AddressBookPage contacts={contacts} onSave={saveContact} onDelete={removeContact} onCopy={copyAddress} onSend={sendToContact} /></Route>
          <Route path="/requests"><PaymentRequestHistoryPage requests={paymentRequests} onCopy={copyPaymentValue} /></Route>
          <Route path="/mezo"><MezoPage wallet={wallet} /></Route>
          <Route path="/activity"><ActivityPage wallet={wallet} /></Route>
          <Route path="/settings"><SettingsPage wallet={wallet} notify={notify} preferences={preferences} onUpdatePreferences={updatePreferences} onResetPreferences={resetPreferences} /></Route>
          <Route path="/docs"><DocsPage /></Route>
          <Route><NotFoundPage /></Route>
        </Switch>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={location === href ? 'active' : ''} data-testid={`mobile-nav-${href === '/' ? 'overview' : href.slice(1)}`}><Icon /><span>{label === 'Overview' ? 'Home' : label}</span></Link>)}
        <button className={`mobile-more ${moreOpen || NAV.slice(5).some((item) => item.href === location) ? 'active' : ''}`} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} data-testid="button-mobile-more"><MoreHorizontal /><span>More</span></button>
        {moreOpen && <div className="mobile-more-menu" role="menu" data-testid="menu-mobile-more">
          {NAV.slice(5).map(({ href, label, icon: Icon }) => <Link href={href} key={href} role="menuitem" className={location === href ? 'active' : ''} data-testid={`mobile-nav-${href.slice(1)}`}><Icon /><span>{label}</span></Link>)}
        </div>}
      </nav>
      {toast && <div className="toast-note" role="status" data-testid="status-toast">{toast}</div>}
    </div>
  );
}

function WalletConnect({ wallet }: { wallet: WalletModel }) {
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const connector = connectors[0];
  if (!wallet.connected) {
    return <div>
      <button className="button primary" disabled={!connector || isPending} onClick={() => connector && connect({ connector, chainId: CHAIN_ID })} data-testid="button-connect-wallet">
         <Wallet size={15} /> {isPending ? 'Connecting…' : 'Connect MetaMask'}
      </button>
      {error && <span className="connect-error" role="alert" data-testid="status-connect-error">{error.message}</span>}
    </div>;
  }
  return <div className="row-actions">
    {wallet.chainId !== CHAIN_ID && <button className="button" onClick={() => void wallet.switchNetwork()} disabled={wallet.networkSwitching} data-testid="button-switch-mezo">{wallet.networkSwitching ? 'Switching…' : 'Switch to Mezo'}</button>}
    <button className="button" onClick={() => void wallet.copyAddress()} aria-label="Copy connected wallet address" data-testid="button-wallet-account"><span className="network-dot" />{short(wallet.address)} <Copy size={12} /></button>
    <button className="button" onClick={() => disconnect()} data-testid="button-disconnect-wallet">Disconnect</button>
    {wallet.networkError && <span className="connect-error" role="alert" data-testid="status-network-error">{wallet.networkError}</span>}
  </div>;
}

function PageHead({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p className="page-sub">{description}</p>}</div>{children}</div>;
}
function Page({ children }: { children: ReactNode }) { return <main className="page-wrap">{children}</main>; }
function CardHeading({ title, caption, action }: { title: string; caption?: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}><div><div className="section-title">{title}</div>{caption && <div className="section-caption">{caption}</div>}</div>{action}</div>;
}
function Callout({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`callout ${warning ? 'warning' : ''}`}><Info size={16} />{children}</div>;
}
function BalanceValue({ value, loading, error }: { value?: string; loading: boolean; error: string }) {
  if (loading) return <div className="skeleton" style={{ width: 130, height: 26, marginTop: 8 }} aria-label="Loading balance" />;
  if (error) return <span className="muted" data-testid="text-balance-unavailable">Unavailable</span>;
  return <span data-testid="text-live-balance">{value ?? '—'}</span>;
}
function formatUpdatedAt(timestamp?: number) {
  return timestamp ? `Last read ${new Date(timestamp).toLocaleTimeString()}` : 'Waiting for first balance read';
}
function WalletNeeded({ wallet }: { wallet: WalletModel }) {
  return <div className="empty-state"><div><div className="empty-icon"><Wallet size={17} /></div><strong>MetaMask connection needed</strong><p>Connect MetaMask on Mezo Testnet to read balances directly from the chain. No sample figures are shown.</p><div style={{ marginTop: 14 }}><WalletConnect wallet={wallet} /></div></div></div>;
}

function HomePage({ wallet }: { wallet: WalletModel; notify: (message: string) => void }) {
  return <Page>
    <PageHead eyebrow="Bitcoin-native finance · Mezo Testnet" title="Your Mezo, in view." description="A clear read on your connected assets and the Mezo ecosystem. Only live chain data appears here." />
    {wallet.balanceError && <div style={{ marginBottom: 16 }}><Callout warning>{wallet.balanceError}</Callout></div>}
    <div className="grid-overview">
      <section className="card hero-panel" data-testid="panel-portfolio-overview">
        <div className="hero-kicker"><span className="live-dot" /> LIVE WALLET OVERVIEW <span className="muted">·</span> Testnet</div>
        {!wallet.connected ? <><div className="hero-value">A portfolio, not a guess.</div><p className="page-sub" style={{ maxWidth: 470 }}>Connect your wallet to read MUSD and native BTC balances directly from Mezo Testnet.</p><div style={{ marginTop: 18 }}><WalletConnect wallet={wallet} /></div></> :
          <><div className="hero-value" data-testid="text-portfolio-value">Value not available</div><p className="page-sub" style={{ marginTop: 7 }}>Market pricing is not configured. Asset quantities below are read live from your wallet.</p><div className="hero-foot"><div className="hero-asset"><span className="asset-icon">BTC</span><span>Native BTC · <b className="mono"><BalanceValue value={wallet.btcBalance} loading={wallet.balanceLoading} error={wallet.balanceError} /></b></span></div><div className="hero-asset"><span className="asset-icon">M$</span><span>MUSD · <b className="mono"><BalanceValue value={wallet.musdBalance} loading={wallet.balanceLoading} error={wallet.balanceError} /></b></span></div></div></>}
      </section>
      <section className="card small-card" data-testid="panel-network-status">
        <CardHeading title="Network status" caption="Wallet environment" />
        <div className="status-row"><span className="network-dot" /><span style={{ fontSize: 13 }}>Mezo Testnet</span><span className="status-badge">VERIFIED</span></div>
        <div className="divider" />
        <div className="info-line"><span className="muted">Chain ID</span><span className="mono" data-testid="text-chain-id">{wallet.chainId ?? '—'} <span className="muted">/ {CHAIN_ID}</span></span></div>
        <div className="info-line"><span className="muted">Wallet</span><span>{wallet.connected ? 'Connected' : 'Not connected'}</span></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 15 }}><a className="button secondary" href={EXPLORER} target="_blank" rel="noreferrer" data-testid="link-explorer">Explorer <ExternalLink size={13} /></a><a className="button secondary" href={FAUCET} target="_blank" rel="noreferrer" data-testid="link-faucet">Faucet <ExternalLink size={13} /></a></div>
      </section>
    </div>
    <div style={{ marginTop: 17 }} className="card card-pad">
      <CardHeading title="Assets" caption={wallet.connected ? `Live quantities · auto-refresh every 20 seconds · ${formatUpdatedAt(wallet.lastBalanceUpdatedAt)}` : 'Connect to read on-chain balances'} action={<div className="row-actions"><button className="button secondary" onClick={wallet.refreshBalances} disabled={!wallet.connected || wallet.balanceLoading} data-testid="button-refresh-balances"><RefreshCw size={13} />Refresh</button><Link className="button secondary" href="/portfolio" data-testid="link-view-portfolio">View portfolio <ArrowRight size={13} /></Link></div>} />
      {!wallet.connected ? <WalletNeeded wallet={wallet} /> : <>
        {wallet.balanceError && <Callout warning>{wallet.balanceError}</Callout>}
        <AssetTable wallet={wallet} />
      </>}
    </div>
    <div className="two-col" style={{ marginTop: 17 }}>
      <ActionCenter wallet={wallet} />
      <RecentActivityPanel wallet={wallet} />
    </div>
    <div className="two-col" style={{ marginTop: 17 }}>
      <section className="card card-pad">
        <CardHeading title="Current readout" caption="No unsupported estimates" />
        <div className="metric-grid"><div><div className="stat-label">Portfolio value</div><div className="stat-value">Unavailable</div><div className="stat-note">No market price feed is configured</div></div><div><div className="stat-label">Borrow positions</div><div className="stat-value">Unavailable</div><div className="stat-note">Account positions are not exposed here</div></div><div><div className="stat-label">Price history</div><div className="stat-value">Unavailable</div><div className="stat-note">No historical market data source</div></div></div>
      </section>
      <section className="card card-pad">
        <CardHeading title="Verified destinations" caption="Official Mezo resources only" />
        <div style={{ display: 'grid', gap: 8 }}><Destination title="Mezo documentation" detail="Network, assets and protocol references" href={DOCS} /><Destination title="Mezo Testnet explorer" detail="Inspect confirmed on-chain activity" href={EXPLORER} /></div>
      </section>
    </div>
  </Page>;
}

function AssetTable({ wallet }: { wallet: WalletModel }) {
  const rows = [
    { name: 'Bitcoin', symbol: 'BTC', note: 'Native gas asset on Mezo', value: wallet.btcBalance, mark: '₿', loading: wallet.btcBalanceLoading, error: wallet.btcBalanceError },
    { name: 'Mezo USD', symbol: 'MUSD', note: 'Official Mezo Testnet token', value: wallet.musdBalance, mark: '$', loading: wallet.musdBalanceLoading, error: wallet.musdBalanceError },
    { name: 'Mezo', symbol: 'MEZO', note: 'Officially documented on Mezo Mainnet, not testnet', value: undefined, mark: 'M', loading: false, error: '' },
  ];
  return <div className="table-wrap"><table className="asset-table"><thead><tr><th>Asset</th><th>Balance</th><th>Market value</th><th>Source</th></tr></thead><tbody>{rows.map((asset) => <tr key={asset.symbol} data-testid={`row-asset-${asset.symbol.toLowerCase()}`}><td><div className="asset-name"><span className={`asset-icon ${asset.symbol === 'BTC' ? 'orange' : ''}`}>{asset.mark}</span><div><div>{asset.name} <span className="muted">{asset.symbol}</span></div><div className="asset-description">{asset.note}</div></div></div></td><td className="mono">{asset.symbol === 'MEZO' ? <span className="muted">Not on testnet</span> : <BalanceValue value={asset.value} loading={asset.loading} error={asset.error} />}</td><td className="muted">Unavailable</td><td><span className="verified-tag"><CheckCircle2 />{asset.symbol === 'MEZO' ? 'Mainnet docs' : 'On-chain'}</span></td></tr>)}</tbody></table></div>;
}

function ActionCenter({ wallet }: { wallet: WalletModel }) {
  const networkReady = wallet.connected && wallet.chainId === CHAIN_ID;
  const hasMusd = typeof wallet.musdBalanceRaw === 'bigint' && wallet.musdBalanceRaw > 0n;
  const sendDisabledReason = !wallet.connected
    ? 'Connect a wallet to send MUSD.'
    : wallet.chainId !== CHAIN_ID
      ? `Switch to Mezo Testnet (chain ${CHAIN_ID}) first.`
      : wallet.musdBalanceLoading || wallet.musdBalanceRaw === undefined
        ? 'Waiting for a verified MUSD balance read.'
        : !hasMusd
          ? 'This wallet has no MUSD available to send.'
          : '';
  return <section className="card card-pad">
    <CardHeading title="Action center" caption="Available actions for this wallet and network" />
    {!wallet.connected && <div className="action-wallet-prompt"><Wallet size={15} /><span>Connect MetaMask to unlock wallet actions. No transaction can be prepared while disconnected.</span></div>}
    {wallet.connected && !networkReady && <div className="action-wallet-prompt warning"><Network size={15} /><span>Wallet is on chain {wallet.chainId ?? 'unknown'}. Switch to Mezo Testnet only when you approve it in your wallet.</span><button className="button secondary" onClick={() => void wallet.switchNetwork()} disabled={wallet.networkSwitching} data-testid="button-action-switch-network">{wallet.networkSwitching ? 'Switching…' : 'Switch network'}</button></div>}
    <div className="action-grid">
      <div className="action-item">
        {sendDisabledReason
          ? <button className="button primary" disabled data-testid="action-send-musd"><ArrowUpRight size={14} />Send MUSD</button>
          : <Link className="button primary" href="/musd#send" data-testid="action-send-musd"><ArrowUpRight size={14} />Send MUSD</Link>}
        <span>{sendDisabledReason || 'Review the recipient and estimated network fee, then sign in your wallet.'}</span>
      </div>
      <div className="action-item">
        {wallet.connected
          ? <Link className="button" href="/musd#receive" data-testid="action-receive-musd"><Copy size={14} />Receive MUSD</Link>
          : <button className="button" disabled data-testid="action-receive-musd"><Copy size={14} />Receive MUSD</button>}
        <span>{wallet.connected ? 'Share a Testnet-specific address and QR payment request.' : 'Connect a wallet to show its receive address.'}</span>
      </div>
      <div className="action-item">
        <Link className="button" href="/activity" data-testid="action-view-activity"><ActivityIcon size={14} />Activity</Link>
        <span>{networkReady ? 'Open explorer-indexed wallet transactions.' : 'Activity is loaded only on the supported Testnet.'}</span>
      </div>
      <div className="action-item">
        <Link className="button" href="/opportunities" data-testid="action-explore"><Compass size={14} />Explore</Link>
        <span>Browse official Mezo destinations with network and risk notes.</span>
      </div>
    </div>
  </section>;
}

function RecentActivityPanel({ wallet }: { wallet: WalletModel }) {
  const networkReady = wallet.connected && wallet.chainId === CHAIN_ID;
  const activityQuery = useQuery({
    queryKey: ['overview-recent-activity', wallet.address?.toLowerCase(), CHAIN_ID],
    queryFn: async () => {
      if (!wallet.address) throw new Error('Connect a wallet to load recent activity.');
      const sources: ActivitySource[] = ['transactions', 'token-transfers', 'internal-transactions'];
      const results = await Promise.allSettled(sources.map((source) => fetchActivityPage(wallet.address!, source, null)));
      const records: ActivityRecord[] = [];
      let failedSources = 0;
      for (const result of results) {
        if (result.status === 'fulfilled') records.push(...result.value.items);
        else failedSources += 1;
      }
      if (failedSources === sources.length) {
        const firstFailure = results.find((result) => result.status === 'rejected');
        throw firstFailure?.status === 'rejected' ? firstFailure.reason : new Error('The explorer did not return recent activity.');
      }
      return { records: mergeActivityRecords(records), failedSources };
    },
    enabled: networkReady,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const recent = [...(activityQuery.data?.records ?? [])]
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a))
    .slice(0, 4);
  return <section className="card card-pad">
    <CardHeading title="Recent wallet activity" caption="Latest records returned by the Mezo Testnet explorer" action={<Link className="button secondary" href="/activity" data-testid="link-overview-activity">View all <ArrowRight size={13} /></Link>} />
    {!wallet.connected
      ? <div className="empty-state"><div><div className="empty-icon"><ActivityIcon size={17} /></div><strong>Connect a wallet to see activity</strong><p>Only transactions returned by the verified explorer are shown.</p></div></div>
      : !networkReady
        ? <Callout warning>Switch to Mezo Testnet before loading history. Testnet and Mainnet records are not mixed.</Callout>
        : activityQuery.isPending || activityQuery.isFetching && !activityQuery.data
          ? <div className="loading-line"><RefreshCw size={13} />Loading explorer-indexed activity…</div>
          : activityQuery.isError
            ? <div className="activity-error" role="alert"><strong>Recent activity is unavailable</strong><p>{getActivityErrorMessage(activityQuery.error)}</p><button className="button secondary" onClick={() => void activityQuery.refetch()} data-testid="button-retry-overview-activity"><RefreshCw size={12} />Retry</button></div>
            : <>
              {activityQuery.data?.failedSources ? <div className="fine-print" style={{ marginBottom: 9 }}>Some explorer categories could not be loaded. <button className="activity-detail-button" onClick={() => void activityQuery.refetch()}>Retry activity</button></div> : null}
              {recent.length === 0
                ? <div className="empty-state"><div><div className="empty-icon"><ActivityIcon size={17} /></div><strong>No indexed activity found</strong><p>The explorer returned no records for this wallet.</p></div></div>
                : <div className="recent-activity-list">{recent.map((record) => {
                  const timestamp = activityTimestamp(record);
                  return <div className="recent-activity-row" key={record.id}>
                    <span className={`recent-activity-mark ${record.status === 'failed' ? 'failed' : ''}`}><ActivityIcon size={14} /></span>
                    <div className="recent-activity-main">
                      <div className="recent-activity-title">{activityTypeLabel(record)}</div>
                      <a className="txhash" href={`${EXPLORER}tx/${record.hash}`} target="_blank" rel="noreferrer" title={record.hash}>{short(record.hash)} <ExternalLink size={10} /></a>
                    </div>
                    <div className="recent-activity-value">
                      <span className="mono">{formatActivityValue(record)}</span>
                      <span className={record.status === 'success' ? 'lime' : record.status === 'failed' ? 'orange' : 'muted'}>{activityStatusLabel(record)}</span>
                      <span className="muted">{timestamp ? new Date(timestamp).toLocaleString() : 'Time unavailable'}</span>
                    </div>
                  </div>;
                })}</div>}
            </>}
    <p className="fine-print" style={{ marginTop: 10 }}>Explorer-indexed records may omit pending or unindexed activity.</p>
  </section>;
}

function activityTimestamp(record: ActivityRecord) {
  if (record.timestamp) {
    const timestamp = Date.parse(record.timestamp);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return record.submittedAt ?? 0;
}

function PortfolioPage({ wallet }: { wallet: WalletModel; notify: (message: string) => void }) {
  return <Page><PageHead eyebrow="Portfolio" title="Balances & analytics" description="Only balances read from the connected wallet are shown. Valuation and history are unavailable without a configured market data source." />
    {!wallet.connected ? <div className="card"><WalletNeeded wallet={wallet} /></div> : <>
      {wallet.balanceError && <div style={{ marginBottom: 16 }}><Callout warning>{wallet.balanceError} <button className="button" onClick={wallet.refreshBalances} data-testid="button-retry-balances"><RefreshCw size={13} /> Retry</button></Callout></div>}
      <div className="three-col">
        <div className="card card-pad"><div className="stat-label">Native BTC balance</div><div className="stat-value mono"><BalanceValue value={wallet.btcBalance} loading={wallet.balanceLoading} error={wallet.balanceError} /></div><div className="stat-note">Mezo Testnet · read from wallet address</div></div>
        <div className="card card-pad"><div className="stat-label">MUSD balance</div><div className="stat-value mono"><BalanceValue value={wallet.musdBalance} loading={wallet.balanceLoading} error={wallet.balanceError} /></div><div className="stat-note">Official Mezo Testnet ERC-20 token</div></div>
        <div className="card card-pad"><div className="stat-label">Portfolio valuation</div><div className="stat-value">Unavailable</div><div className="stat-note">No market price or valuation feed configured</div></div>
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}><CardHeading title="Wallet assets" caption={`Live chain balances · ${formatUpdatedAt(wallet.lastBalanceUpdatedAt)}`} action={<button className="button secondary" onClick={wallet.refreshBalances} disabled={wallet.balanceLoading} data-testid="button-refresh-portfolio"><RefreshCw size={13} />Refresh</button>} /><AssetTable wallet={wallet} /></div>
      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="card card-pad"><CardHeading title="Allocation" caption="Requires comparable live market prices" /><div className="empty-state"><div><div className="empty-icon"><Gauge size={17} /></div><strong>Allocation unavailable</strong><p>Token quantities alone do not establish portfolio weighting. No price source is configured.</p></div></div></div>
        <div className="card card-pad"><CardHeading title="Balance history" caption="No historical snapshots are stored" /><div className="empty-state"><div><div className="empty-icon"><ActivityIcon size={17} /></div><strong>History unavailable</strong><p>MezoFlow does not have an indexed balance history service. Current values are queried live.</p></div></div></div>
      </div>
    </>}
  </Page>;
}

function PositionsPage() {
  return <Page><PageHead eyebrow="Borrowing monitor" title="Positions" description="A careful view of Bitcoin-backed borrowing starts with verified account data. That data source is not available in MezoFlow." />
    <div className="grid-overview">
      <div className="card card-pad">
        <div className="status-row"><span className="status-badge warning-badge">ACCOUNT DATA UNAVAILABLE</span></div>
        <h2 style={{ fontSize: 19, letterSpacing: '-.03em', fontWeight: 500, margin: '19px 0 7px' }}>No verified position feed</h2>
        <p className="page-sub" style={{ marginTop: 0 }}>MezoFlow cannot currently read your borrowing positions from a verified account source. We will not infer a collateral ratio or liquidation threshold.</p>
        <div className="divider" />
        <div className="metric-grid"><div><div className="stat-label">Collateral</div><div className="stat-value">Unavailable</div></div><div><div className="stat-label">Debt</div><div className="stat-value">Unavailable</div></div><div><div className="stat-label">Liquidation risk</div><div className="stat-value">Unavailable</div></div></div>
      </div>
       <div className="card card-pad"><CardHeading title="Risk metrics" caption="No estimation without verified parameters" />
        <div className="info-line"><span className="muted">Collateral ratio</span><span>Unavailable</span></div><div className="info-line"><span className="muted">Liquidation price</span><span>Unavailable</span></div><div className="info-line"><span className="muted">Borrow limit</span><span>Unavailable</span></div>
        <div style={{ marginTop: 18 }}><Callout warning>Do not rely on this dashboard for liquidation monitoring. Consult the official Mezo interface and verify all displayed parameters.</Callout></div>
         <div className="row-actions" style={{ flexWrap: 'wrap', marginTop: 16 }}><a href={`${MEZO_APP}/feature/borrow`} target="_blank" rel="noreferrer" className="button" data-testid="link-official-mezo-borrowing">Open official borrowing app <ExternalLink size={13} /></a><a href="https://mezo.org/docs/users/borrow/mint-musd/" target="_blank" rel="noreferrer" className="button secondary">Borrowing guide <ExternalLink size={12} /></a></div>
      </div>
    </div>
  </Page>;
}

function OpportunitiesPage({ wallet }: { wallet: WalletModel }) {
  const [filter, setFilter] = useState<OpportunityFilter>('all');
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const opportunities = VERIFIED_OPPORTUNITIES.filter((item) => {
    const searchableText = `${item.name} ${item.category} ${item.network} ${item.summary} ${item.assets} ${item.tags.join(' ')}`.toLowerCase();
    const matchesNetwork = item.networkChainId !== undefined && wallet.connected && wallet.chainId === item.networkChainId;
    const matchesFilter = filter === 'all'
      || filter === 'network' && matchesNetwork
      || filter === 'musd' && item.tags.includes('MUSD')
      || filter === 'mezo' && item.tags.includes('MEZO')
      || filter === 'locking' && item.category === 'Locking'
      || filter === 'voting' && item.category === 'Voting';
    return matchesFilter && (!normalizedSearch || searchableText.includes(normalizedSearch));
  });
  return <Page><PageHead eyebrow="Ecosystem directory" title="Opportunities" description="A short list of verified Mezo destinations. No yields, liquidity, or integrations are implied." />
    <Callout warning>These are official external destinations, not in-app protocol integrations. MezoFlow does not verify wallet eligibility, live pool state, incentives, or rates; review the connected network and every transaction in the official app before signing.</Callout>
    <div className="directory-controls">
      <label className="directory-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search opportunities</span>
        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search protocols, assets, or categories" data-testid="input-opportunity-search" />
      </label>
      <div className="directory-filters" role="group" aria-label="Filter verified opportunities">
        {OPPORTUNITY_FILTERS.map((item) => <button key={item.value} className={`filter-chip ${filter === item.value ? 'active' : ''}`} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} data-testid={`filter-opportunities-${item.value}`}>{item.label}</button>)}
      </div>
    </div>
    <div className="directory-grid">
      {opportunities.map((item) => <article className="card directory-card" key={item.id} data-testid={`card-opportunity-${item.id}`}>
        <div className="directory-card-top"><span className="directory-badges"><span className="status-badge">{item.category}</span><span className="status-badge informational-badge">INFORMATIONAL</span></span><span className="directory-network">{item.network}</span></div>
        <h2>{item.name}</h2>
        <p className="directory-summary">{item.summary}</p>
        <div className="directory-detail"><span className="muted">Documented assets</span><span>{item.assets}</span></div>
        <div className="opportunity-check"><span className="muted">Wallet eligibility</span><span>{item.eligibility}</span></div>
        <div className="opportunity-check"><span className="muted">Approvals & transactions</span><span>{item.transactionNotes}</span></div>
        <div className="opportunity-check"><span className="muted">Verification status</span><span>{item.verificationStatus}</span></div>
        {item.contracts?.length ? <div className="opportunity-contracts">
          <div className="muted opportunity-contract-heading">Officially documented contracts</div>
          {item.contracts.map((contract) => <div className="opportunity-contract" key={contract.address}>
            <span>{contract.name}</span>
            <a className="mono" href={contract.explorer} target="_blank" rel="noreferrer" title={contract.address}>{short(contract.address)} <ExternalLink size={11} /></a>
          </div>)}
        </div> : <div className="opportunity-check"><span className="muted">Contract address</span><span>Not published in the linked source; use the verified official app.</span></div>}
        <div className="directory-risk"><ShieldCheck size={14} /><span>{item.risk}</span></div>
        <div className="row-actions directory-actions">
          <a className="button primary" href={item.website} target="_blank" rel="noreferrer">{item.category === 'Voting' ? 'Open official voting page' : 'Open official app'} <ExternalLink size={12} /></a>
          <a className="button secondary" href={item.documentation} target="_blank" rel="noreferrer">Source docs <ExternalLink size={12} /></a>
        </div>
      </article>)}
      {opportunities.length === 0 && <div className="card directory-empty"><strong>{filter === 'network' && !wallet.connected ? 'Connect a wallet to check network matches' : filter === 'network' && wallet.chainId !== MEZO_TESTNET_ID ? 'No resources match the connected network' : 'No matching destinations'}</strong><p>{filter === 'network' && !wallet.connected ? 'This filter checks the wallet’s connected chain only. It does not claim protocol eligibility.' : filter === 'network' && wallet.chainId !== MEZO_TESTNET_ID ? 'MezoFlow currently supports Mezo Testnet wallet reads and transactions. Mainnet resources remain available under All.' : 'Try another search or filter.'}</p></div>}
    </div>
    <div className="row-actions directory-footer">
      <a className="button secondary" href={OPPORTUNITY_FAUCET} target="_blank" rel="noreferrer" data-testid="link-opportunities-faucet">Testnet faucet <ExternalLink size={12} /></a>
      <a className="button secondary" href={OPPORTUNITY_SOURCE} target="_blank" rel="noreferrer" data-testid="link-opportunities-docs">Official contract reference <ExternalLink size={12} /></a>
    </div>
    <p className="page-footnote">Pool addresses come from Mezo’s official Testnet pool documentation. MEZO locking and voting are Mainnet workflows and remain separate from MezoFlow’s Testnet MUSD wallet. No pool APR, liquidity, rewards, or position is reported here.</p>
  </Page>;
}
function Destination({ title, detail, href }: { title: string; detail: string; href: string }) {
  return <a className="tool-link" href={href} target="_blank" rel="noreferrer" data-testid={`link-destination-${title.toLowerCase().replaceAll(' ', '-')}`}><div><div className="tool-name">{title}</div><div className="tool-desc">{detail}</div></div><ExternalLink /></a>;
}

function MusdPage({
  wallet,
  notify,
  selectedRecipient,
  onSelectedRecipientApplied,
}: {
  wallet: WalletModel;
  notify: (message: string) => void;
  selectedRecipient?: string;
  onSelectedRecipientApplied: () => void;
}) {
  const [pegAmount, setPegAmount] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [paymentRequestMemo, setPaymentRequestMemo] = useState('');
  const [mustReviewTransfer, setMustReviewTransfer] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [paymentRequestText, setPaymentRequestText] = useState('');
  const [paymentRequestError, setPaymentRequestError] = useState('');
  const [paymentRequestNotice, setPaymentRequestNotice] = useState('');
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const parsedPegAmount = Number(pegAmount);
  let parsedTransferAmount: bigint | undefined;
  try { parsedTransferAmount = parseTokenAmount(amount, MUSD_DECIMALS); } catch { parsedTransferAmount = undefined; }
  const metadataVerified = wallet.musdName === 'Mezo USD' && wallet.musdSymbol === 'MUSD' && wallet.musdDecimals === MUSD_DECIMALS;
  const valid = Boolean(wallet.connected && wallet.chainId === CHAIN_ID && metadataVerified && isAddress(recipient) && parsedTransferAmount !== undefined && parsedTransferAmount > 0n && wallet.musdBalanceRaw !== undefined && parsedTransferAmount <= wallet.musdBalanceRaw);
  const transferReviewEnabled = (() => {
    try { return parsePreferences(localStorage.getItem('mezoflow-preferences')).confirm; }
    catch { return true; }
  })();
  const requireReview = transferReviewEnabled || mustReviewTransfer;
  const estimateQuery = useQuery({
    queryKey: ['musd-transfer-estimate', wallet.address?.toLowerCase(), recipient.toLowerCase(), amount, CHAIN_ID],
    queryFn: async () => {
      if (!publicClient || !wallet.address || parsedTransferAmount === undefined || !isAddress(recipient)) {
        throw new Error('A verified wallet, recipient, and amount are required for a fee estimate.');
      }
      const gas = await publicClient.estimateContractGas({
        address: MUSD_ADDRESS,
        abi: MUSD_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsedTransferAmount],
        account: wallet.address,
      });
      const gasPrice = await publicClient.getGasPrice();
      return { gas, fee: gas * gasPrice };
    },
    enabled: Boolean(valid && publicClient),
    staleTime: 10_000,
    retry: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('recipient') && !params.has('to') && !params.has('address')) return;
    try {
      const request = createMusdTransferPrefill(window.location.href);
      setRecipient(request.recipient);
      setAmount(request.amount);
      setPaymentRequestMemo(request.memo);
      setMustReviewTransfer(request.requiresReview);
      setPaymentRequestNotice('Payment details came from a link. Verify them before continuing to your wallet.');
    } catch (error) {
      setPaymentRequestError(error instanceof Error ? error.message : 'The payment link could not be read.');
    }
  }, []);

  useEffect(() => {
    if (!selectedRecipient) return;
    if (!isAddress(selectedRecipient)) {
      setPaymentRequestError('The selected saved recipient is no longer a valid wallet address.');
      onSelectedRecipientApplied();
      return;
    }
    setRecipient(selectedRecipient);
    setPaymentRequestMemo('');
    setMustReviewTransfer(true);
    setPaymentRequestNotice('Saved address loaded. Confirm the full recipient address before opening your wallet.');
    setPaymentRequestError('');
    onSelectedRecipientApplied();
  }, [selectedRecipient, onSelectedRecipientApplied]);

  const applyPaymentRequest = () => {
    setPaymentRequestError('');
    setPaymentRequestNotice('');
    try {
      const request = createMusdTransferPrefill(paymentRequestText);
      setRecipient(request.recipient);
      setAmount(request.amount);
      setPaymentRequestMemo(request.memo);
      setMustReviewTransfer(request.requiresReview);
      setPaymentRequestText('');
      setPaymentRequestNotice('Details filled in. Confirm the recipient, amount, network, and token before signing.');
    } catch (error) {
      setPaymentRequestError(error instanceof Error ? error.message : 'The payment request could not be read.');
    }
  };
  const submit = async () => {
    setShowConfirm(false);
    await wallet.sendTransfer(recipient, amount);
    setMustReviewTransfer(false);
  };
  return <Page><PageHead eyebrow="Mezo USD · MUSD" title="Understand the peg. Move MUSD." description="The calculator uses a $1 target for estimation only. It is not a live market quote or a guarantee of redemption." />
    <div className="two-col">
      <section className="card card-pad">
        <CardHeading title="Peg calculator" caption="Approximate target value · not a guaranteed market price" />
        <div className="field"><label htmlFor="musd-calc-amount">Amount in MUSD</label><div className="input-row"><input id="musd-calc-amount" className="input" type="number" min="0" step="any" value={pegAmount} onChange={(event) => setPegAmount(event.target.value)} placeholder="0.00" data-testid="input-musd-amount" /><span className="input-suffix">MUSD</span></div></div>
        <div className="card peg-estimate-card"><div className="label">Approximate target value</div><div className="stat-value mono" data-testid="text-peg-estimate">{pegAmount && parsedPegAmount > 0 ? `≈ $${parsedPegAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</div><div className="fine-print" style={{ marginTop: 7 }}>Based on an approximate $1 peg target. Not an offer, market quote, or guarantee.</div></div>
        <div className="divider" />
         <div className="info-line"><span className="muted">Network</span><span>Mezo Testnet · {CHAIN_ID}</span></div>
         <div className="info-line"><span className="muted">On-chain name</span><span>{wallet.musdMetadataLoading ? 'Checking…' : wallet.musdName ?? 'Unavailable'}</span></div>
         <div className="info-line"><span className="muted">On-chain symbol / decimals</span><span className="mono">{wallet.musdMetadataLoading ? 'Checking…' : wallet.musdSymbol !== undefined && wallet.musdDecimals !== undefined ? `${wallet.musdSymbol} · ${wallet.musdDecimals}` : 'Unavailable'}</span></div>
         <div className="info-line"><span className="muted">Contract</span><a className="verified-tag mono" href={`${EXPLORER}token/${MUSD_ADDRESS}`} target="_blank" rel="noreferrer" data-testid="link-musd-contract">{short(MUSD_ADDRESS)} <ExternalLink size={11} /></a></div>
         {wallet.musdMetadataError && <div style={{ marginTop: 12 }}><Callout warning>{wallet.musdMetadataError} Verify the contract in the official explorer before proceeding.</Callout></div>}
      </section>
      <section id="send" className="card card-pad" style={{ scrollMarginTop: 90 }}>
        <CardHeading title="Send MUSD" caption="A real ERC-20 transfer on Mezo Testnet" />
        {!wallet.connected ? <div className="callout warning"><Wallet size={16} />Connect MetaMask to prepare a transaction. MetaMask will review and authorize the transfer.</div> : <>
          <div className="info-line"><span className="muted">Connected address</span><span className="mono" style={{ fontSize: 10 }}>{short(wallet.address)}</span></div>
          <div className="info-line"><span className="muted">Network</span><span className={wallet.chainId === CHAIN_ID ? 'lime' : 'orange'}>{wallet.chainId === CHAIN_ID ? 'Mezo Testnet' : `Wrong network · ${wallet.chainId ?? 'unknown'}`}</span></div>
          <div className="info-line"><span className="muted">MUSD available</span><span className="mono">{wallet.musdBalanceRaw === undefined ? 'Unavailable' : `${wallet.musdBalance ?? '0'} MUSD`}</span></div>
          <div className="info-line"><span className="muted">Native BTC for gas</span><span className="mono">{wallet.btcBalance === undefined ? 'Unavailable' : `${wallet.btcBalance} BTC`}</span></div>
          {wallet.balanceError && <div style={{ marginTop: 12 }}><Callout warning>{wallet.balanceError}</Callout></div>}
          {wallet.chainId !== CHAIN_ID && <button className="button" onClick={() => void wallet.switchNetwork()} disabled={wallet.networkSwitching} style={{ marginTop: 13 }} data-testid="button-switch-network-transfer">{wallet.networkSwitching ? 'Switching…' : 'Switch to Mezo Testnet'} <ArrowRight size={13} /></button>}
          {wallet.networkError && <div className="form-error" role="alert" data-testid="status-network-error">{wallet.networkError}</div>}
          <div className="payment-request-import">
            <div className="field">
              <label htmlFor="musd-payment-request">Prefill from a link or scanned QR</label>
              <input id="musd-payment-request" className="input" value={paymentRequestText} onChange={(event) => setPaymentRequestText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyPaymentRequest(); }} placeholder="Paste an address, URL, or ethereum: QR payload" data-testid="input-payment-request" />
            </div>
            <button type="button" className="button secondary" onClick={applyPaymentRequest} disabled={!paymentRequestText.trim()} data-testid="button-apply-payment-request">Fill transfer details</button>
            <p className="fine-print">A QR scanner or wallet can provide the QR text to paste here. This only fills the form; it never signs or sends.</p>
            {paymentRequestNotice && <div className="lime payment-request-status" role="status" data-testid="status-payment-request">{paymentRequestNotice}</div>}
            {paymentRequestError && <div className="form-error" role="alert" data-testid="error-payment-request">{paymentRequestError}</div>}
          </div>
          <div className="field" style={{ marginTop: 18 }}><label htmlFor="musd-recipient">Recipient address</label><input id="musd-recipient" className="input" value={recipient} onChange={(event) => { setRecipient(event.target.value.trim()); setPaymentRequestMemo(''); }} placeholder="0x…" data-testid="input-musd-recipient" /></div>
          <div className="field"><label htmlFor="musd-send-amount">Amount</label><div className="input-row"><input id="musd-send-amount" className="input" type="text" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setPaymentRequestMemo(''); }} placeholder="0.00" data-testid="input-transfer-amount" /><span className="input-suffix">MUSD</span></div></div>
          {parsedTransferAmount !== undefined && wallet.musdBalanceRaw !== undefined && parsedTransferAmount > wallet.musdBalanceRaw && <div className="form-error" role="alert" data-testid="status-insufficient-musd">The amount is greater than the connected wallet’s MUSD balance.</div>}
          <div className="callout"><ShieldCheck size={16} />Confirm recipient, amount, and BTC gas in your wallet. Mezo gas is paid in BTC. MezoFlow never submits a transaction without wallet approval.</div>
           {wallet.transferError && <div className="form-error" role="alert" data-testid="status-transfer-error">{wallet.transferError}</div>}
          <button className="button primary" style={{ width: '100%', marginTop: 15 }} disabled={!valid || wallet.sending} onClick={() => requireReview ? setShowConfirm(true) : void wallet.sendTransfer(recipient, amount)} data-testid="button-review-transfer">{wallet.sending ? 'Waiting for wallet…' : requireReview ? 'Review transfer' : 'Continue to wallet'} <ArrowUpRight size={14} /></button>
        </>}
         {wallet.latestHash && <div className="card" style={{ marginTop: 15, padding: 14 }} data-testid="panel-latest-transfer"><div className="status-row"><span className={wallet.latestStatus === 'success' ? 'network-dot' : 'orange'}>{wallet.latestStatus === 'success' ? <CheckCircle2 size={14} /> : wallet.latestStatus === 'reverted' ? <X size={14} /> : wallet.latestStatus === 'unavailable' ? <TriangleAlert size={14} /> : <Clock3 size={14} />}</span><span style={{ fontSize: 11 }}>{wallet.latestStatus === 'success' ? 'Confirmed on-chain' : wallet.latestStatus === 'reverted' ? 'Transaction reverted' : wallet.latestStatus === 'unavailable' ? 'Receipt unavailable · check explorer' : 'Awaiting receipt confirmation'}</span></div><div className="row-actions" style={{ justifyContent: 'space-between', marginTop: 10 }}><a className="txhash" href={`${EXPLORER}tx/${wallet.latestHash}`} target="_blank" rel="noreferrer" data-testid="link-latest-transaction">{short(wallet.latestHash)} <ExternalLink size={12} /></a>{wallet.latestStatus === 'unavailable' && <button className="button secondary" onClick={wallet.refreshLatestReceipt} data-testid="button-retry-receipt"><RefreshCw size={12} />Retry status</button>}</div></div>}
      </section>
    </div>
    <ReceiveMusdCard wallet={wallet} notify={notify} />
    <div className="page-footnote">Token contract <span className="mono">{MUSD_ADDRESS}</span> · Confirm the token and network in your wallet before signing.</div>
    {showConfirm && <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal-backdrop"><div className="modal card"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 id="confirm-title" style={{ fontSize: 17, fontWeight: 550, margin: 0 }}>Review MUSD transfer</h2><button className="copy-button" onClick={() => setShowConfirm(false)} aria-label="Close confirmation" data-testid="button-close-confirm"><X /></button></div><p className="section-caption" style={{ marginTop: 9 }}>Your wallet will show the transaction and request your signature.</p><div className="divider" /><div className="info-line"><span className="muted">Amount</span><b className="mono">{amount} MUSD</b></div><div className="info-line"><span className="muted">Recipient</span><span className="mono" style={{ fontSize: 10, overflowWrap: 'anywhere', textAlign: 'right' }} data-testid="text-review-recipient">{recipient}</span></div>{paymentRequestMemo && <div className="info-line"><span className="muted">Request note</span><span style={{ textAlign: 'right' }}>{paymentRequestMemo}</span></div>}<div className="info-line"><span className="muted">Token contract</span><a className="verified-tag mono" href={`${EXPLORER}token/${MUSD_ADDRESS}`} target="_blank" rel="noreferrer">{short(MUSD_ADDRESS)} <ExternalLink size={11} /></a></div><div className="info-line"><span className="muted">Network</span><span>Mezo Testnet · {CHAIN_ID} · BTC gas</span></div><div className="info-line"><span className="muted">Estimated transfer gas</span><span className="mono">{estimateQuery.isFetching ? 'Estimating…' : estimateQuery.data ? `${estimateQuery.data.gas.toString()} units` : 'Unavailable'}</span></div><div className="info-line"><span className="muted">Estimated fee</span><span className="mono">{estimateQuery.isFetching ? 'Estimating…' : estimateQuery.data ? `${formatTokenAmount(estimateQuery.data.fee, 18, 8)} BTC` : 'Unavailable'}</span></div><p className="fine-print">The fee estimate uses the current Testnet RPC gas price and may change. If it is unavailable, verify the final fee shown in your wallet before signing.</p><div className="callout warning" style={{ marginTop: 15 }}>Check the recipient carefully. Transfers cannot be reversed by MezoFlow.</div><div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button className="button" onClick={() => setShowConfirm(false)} data-testid="button-cancel-transfer">Cancel</button><button className="button primary" onClick={submit} disabled={!valid || wallet.sending} data-testid="button-confirm-transfer">Continue to wallet <ArrowRight size={14} /></button></div></div></div>}
  </Page>;
}

function ReceiveMusdCard({ wallet, notify }: { wallet: WalletModel; notify: (message: string) => void }) {
  const [qrMode, setQrMode] = useState<'address' | 'request'>('address');
  const [receiveAmount, setReceiveAmount] = useState('');
  let parsedReceiveAmount: bigint | undefined;
  try {
    if (receiveAmount.trim()) parsedReceiveAmount = parseTokenAmount(receiveAmount, MUSD_DECIMALS);
  } catch {
    parsedReceiveAmount = undefined;
  }
  const receiveAmountInvalid = Boolean(receiveAmount.trim() && (parsedReceiveAmount === undefined || parsedReceiveAmount <= 0n));
  const paymentLink = wallet.address && !receiveAmountInvalid
    ? buildMusdPaymentLink(wallet.address, receiveAmount.trim() ? receiveAmount : undefined, import.meta.env.BASE_URL, window.location.origin)
    : '';
  const qrValue = qrMode === 'address' ? wallet.address ?? '' : paymentLink;
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`);
    } catch {
      notify(`Could not copy the ${label.toLowerCase()}.`);
    }
  };
  const sharePaymentLink = async () => {
    if (!paymentLink) return;
    if (typeof navigator.share !== 'function') {
      await copy(paymentLink, 'Payment link');
      return;
    }
    try {
      await navigator.share({
        title: 'MezoFlow MUSD payment request',
        text: receiveAmount.trim()
          ? `Requesting ${receiveAmount} MUSD on Mezo Testnet`
          : 'MUSD payment request on Mezo Testnet',
        url: paymentLink,
      });
      notify('Payment request shared');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify('Could not share the payment request.');
    }
  };
  return <section id="receive" className="card card-pad receive-card" style={{ marginTop: 16, scrollMarginTop: 90 }}>
    <CardHeading title="Receive MUSD" caption="Testnet-specific payment details for this wallet" />
    {!wallet.connected || !wallet.address
      ? <WalletNeeded wallet={wallet} />
      : <>
        <div className="receive-content">
          <div className="receive-qr-column">
            <div className="receive-qr-modes" role="group" aria-label="Choose QR code contents">
              <button type="button" className={`filter-chip ${qrMode === 'address' ? 'active' : ''}`} aria-pressed={qrMode === 'address'} onClick={() => setQrMode('address')} data-testid="button-receive-qr-address">Wallet address</button>
              <button type="button" className={`filter-chip ${qrMode === 'request' ? 'active' : ''}`} aria-pressed={qrMode === 'request'} onClick={() => setQrMode('request')} data-testid="button-receive-qr-request">MUSD request</button>
            </div>
            {qrMode === 'request' && <div className="field receive-amount-field">
              <label htmlFor="receive-musd-amount">Requested amount (optional)</label>
              <div className="input-row"><input id="receive-musd-amount" className="input" type="text" inputMode="decimal" value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} placeholder="Any amount" aria-invalid={receiveAmountInvalid} data-testid="input-receive-musd-amount" /><span className="input-suffix">MUSD</span></div>
              {receiveAmountInvalid && <span className="form-error" role="alert" data-testid="error-receive-musd-amount">Enter a positive amount with no more than 18 decimal places.</span>}
              <p className="fine-print">{receiveAmount.trim() ? 'The QR includes this exact MUSD amount.' : 'Leave blank to request MUSD without a preset amount.'}</p>
            </div>}
            <div className="receive-qr-wrap" aria-label={qrMode === 'address' ? 'QR code containing only the connected wallet address' : receiveAmount.trim() ? 'Amount-specific Mezo Testnet MUSD payment request QR code' : 'Mezo Testnet MUSD payment request QR code without a preset amount'}>
              {qrValue ? <QRCodeSVG value={qrValue} size={184} level="Q" includeMargin /> : <div className="receive-qr-placeholder" aria-live="polite">QR unavailable until the amount is valid</div>}
            </div>
            <div className="receive-qr-caption" data-testid="text-receive-qr-kind">{qrMode === 'address' ? 'Wallet-address QR · no token or amount encoded' : receiveAmount.trim() ? `MUSD payment request · ${receiveAmount} MUSD` : 'MUSD payment request · no preset amount'}</div>
          </div>
          <div className="receive-details">
            <div className="info-line"><span className="muted">Network</span><span>Mezo Testnet · {CHAIN_ID}</span></div>
            <div className="info-line"><span className="muted">Token</span><span>Mezo USD (MUSD)</span></div>
            <div className="info-line"><span className="muted">MUSD contract</span><a className="verified-tag mono" href={`${EXPLORER}token/${MUSD_ADDRESS}`} target="_blank" rel="noreferrer">{short(MUSD_ADDRESS)} <ExternalLink size={11} /></a></div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="receive-wallet-address">Your connected address</label>
              <div className="receive-address-row">
                <input id="receive-wallet-address" className="input mono" value={wallet.address} readOnly aria-label="Connected receive address" data-testid="text-receive-address" />
                <button className="button secondary" onClick={() => void copy(wallet.address!, 'Wallet address')} data-testid="button-copy-receive-address"><Copy size={13} />Copy</button>
              </div>
            </div>
            <div className="callout warning receive-warning"><TriangleAlert size={15} />Only use this request for MUSD on Mezo Testnet. Sending assets on the wrong network or using another token may leave them inaccessible.</div>
            <div className="row-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {qrMode === 'address'
                ? <button className="button" onClick={() => void copy(wallet.address!, 'Wallet address')} data-testid="button-copy-qr-content"><Copy size={13} />Copy QR address</button>
                : <>
                  <button className="button" disabled={!paymentLink} onClick={() => void copy(paymentLink, 'MUSD payment request')} data-testid="button-copy-qr-content"><Copy size={13} />Copy QR request link</button>
                  <button className="button secondary" disabled={!paymentLink} onClick={() => void copy(paymentLink, 'Payment link')} data-testid="button-copy-payment-link"><Copy size={13} />Copy payment link</button>
                  {typeof navigator.share === 'function' && <button className="button secondary" disabled={!paymentLink} onClick={() => void sharePaymentLink()} data-testid="button-share-payment-link"><Share size={13} />Share link</button>}
                </>}
              <a className="button secondary" href={`${EXPLORER}address/${wallet.address}`} target="_blank" rel="noreferrer">Open address in explorer <ExternalLink size={12} /></a>
            </div>
          </div>
        </div>
        <p className="fine-print receive-footer">{qrMode === 'address' ? 'This QR contains only the connected wallet address. It is not a token or network-specific payment request.' : 'This request identifies the official MUSD contract and Mezo Testnet chain. The sender must verify the details and sign separately; scanning never sends funds.'}</p>
      </>}
  </section>;
}

function MezoPage({ wallet }: { wallet: WalletModel }) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const networkQuery = useQuery({
    queryKey: ['mezo-latest-block', CHAIN_ID],
    queryFn: async () => {
      if (!publicClient) throw new Error('The configured Mezo Testnet RPC client is unavailable.');
      const rpcChainId = await publicClient.getChainId();
      if (rpcChainId !== CHAIN_ID) {
        throw new Error(`The configured RPC reported chain ID ${rpcChainId}, not Mezo Testnet (${CHAIN_ID}).`);
      }
      const blockNumber = await publicClient.getBlockNumber();
      const block = await publicClient.getBlock({ blockNumber });
      return { blockNumber, timestamp: block.timestamp, chainId: rpcChainId };
    },
    enabled: true,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
  const blockTimestamp = networkQuery.data?.timestamp;
  const blockTime = blockTimestamp === undefined
    ? 'Unavailable'
    : blockTimestamp * 1_000n <= BigInt(Number.MAX_SAFE_INTEGER)
      ? new Date(Number(blockTimestamp * 1_000n)).toLocaleString()
      : 'Unavailable';
  const rpcStatus = networkQuery.isPending
    ? 'Checking…'
    : networkQuery.isError && !networkQuery.data
      ? 'Unavailable'
      : networkQuery.isError
        ? 'Refresh failed · last result shown'
        : 'Block response received';
  return <Page><PageHead eyebrow="Network reference" title="Mezo & MEZO" description="Testnet facts and native asset context, separated clearly from token claims." />
    <div className="grid-overview">
      <section className="card card-pad">
        <div className="status-row"><span className="network-dot" /><span style={{ fontSize: 13 }}>Mezo Testnet</span><span className="status-badge">VERIFIED CONFIG</span></div>
        <div style={{ marginTop: 15 }} className="info-line"><span className="muted">Configured chain ID</span><span className="mono">{CHAIN_ID}</span></div>
        <div className="info-line"><span className="muted">Connected wallet network</span><span>{wallet.connected ? wallet.chainId === CHAIN_ID ? 'Mezo Testnet' : `Unsupported network · ${wallet.chainId ?? 'unknown'}` : 'Wallet disconnected'}</span></div>
        <div className="info-line"><span className="muted">Connected wallet chain ID</span><span className="mono">{wallet.connected ? wallet.chainId ?? 'Unavailable' : 'Unavailable'}</span></div>
        <div className="info-line"><span className="muted">RPC endpoint</span><span className="mono" style={{ fontSize: 10 }}>{RPC_URL}</span></div>
        <div className="info-line"><span className="muted">RPC connectivity</span><span className={networkQuery.isError && !networkQuery.data ? 'orange' : ''} data-testid="text-rpc-status">{rpcStatus}</span></div>
        <div className="info-line"><span className="muted">RPC-reported chain ID</span><span className="mono">{networkQuery.data?.chainId ?? 'Unavailable'}</span></div>
        <div className="info-line"><span className="muted">Latest block</span><span className="mono" data-testid="text-latest-block">{networkQuery.data?.blockNumber.toLocaleString() ?? 'Unavailable'}</span></div>
        <div className="info-line"><span className="muted">Block timestamp</span><span data-testid="text-block-timestamp">{blockTime}</span></div>
        <div className="row-actions network-refresh">
          <button className="button secondary" onClick={() => void networkQuery.refetch()} disabled={networkQuery.isFetching} data-testid="button-refresh-network">
            <RefreshCw size={13} />{networkQuery.isFetching ? 'Checking…' : 'Refresh network info'}
          </button>
          <span className="fine-print">{formatUpdatedAt(networkQuery.dataUpdatedAt || undefined)}</span>
        </div>
        {networkQuery.isError && <div className="form-error" role="status" data-testid="error-network-rpc">{networkQuery.error instanceof Error ? networkQuery.error.message : 'The latest block could not be refreshed from the configured RPC.'} {networkQuery.data ? 'The last successful block result remains visible.' : 'Retry when the endpoint is available.'}</div>}
        <p className="fine-print network-health-note">A returned block confirms RPC connectivity only; it does not establish full network health.</p>
        <div className="info-line"><span className="muted">Explorer</span><a href={EXPLORER} target="_blank" rel="noreferrer" className="verified-tag" data-testid="link-mezo-explorer">Open explorer <ExternalLink /></a></div>
        <div className="info-line"><span className="muted">Gas asset</span><span>BTC</span></div>
        <div className="info-line"><span className="muted">Compatibility</span><span>EVM-compatible</span></div>
      </section>
      <section className="card card-pad">
        <CardHeading title="MEZO token status" caption="No testnet MEZO token is represented here" />
        <div className="empty-state"><div><div className="empty-icon"><Info size={17} /></div><strong>Testnet token details unavailable</strong><p>MezoFlow has not verified a MEZO token contract for this testnet. We do not display a testnet token balance, price, or address.</p></div></div>
         <div className="info-line"><span className="muted">Documented mainnet MEZO</span><a className="verified-tag mono" href={`https://explorer.mezo.org/token/${MEZO_MAINNET_ADDRESS}`} target="_blank" rel="noreferrer" data-testid="link-mezo-mainnet-contract">{short(MEZO_MAINNET_ADDRESS)} <ExternalLink size={11} /></a></div>
        <a className="button secondary" href={TOKEN_DOCS} target="_blank" rel="noreferrer" data-testid="link-mezo-token-docs">Verify mainnet contract in official docs <ExternalLink size={13} /></a>
      </section>
    </div>
    <section className="card card-pad" style={{ marginTop: 16 }}>
      <CardHeading title="Network endpoints" caption="Testnet configuration verified against official Mezo references" />
      <div className="two-col"><Destination title="Mezo Testnet explorer" detail={EXPLORER} href={EXPLORER} /><Destination title="Mezo Testnet faucet" detail="Request testnet BTC for network gas" href={FAUCET} /></div>
    </section>
  </Page>;
}

function ActivityPage({ wallet }: { wallet: WalletModel }) {
  const sources: ActivitySource[] = ['transactions', 'token-transfers', 'internal-transactions'];
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [cursors, setCursors] = useState<Record<ActivitySource, Record<string, string | number | boolean> | null>>({
    transactions: null, 'token-transfers': null, 'internal-transactions': null,
  });
  const [loadedSources, setLoadedSources] = useState<ActivitySource[]>([]);
  const [failedSources, setFailedSources] = useState<ActivitySource[]>([]);
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadMoreController = useRef<AbortController | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const networkReady = wallet.connected && wallet.chainId === CHAIN_ID;

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setRecords([]);
    setLoadingMore(false);
    setCursors({ transactions: null, 'token-transfers': null, 'internal-transactions': null });
    setLoadedSources([]);
    setFailedSources([]);
    setRequestError('');
    setTypeFilter('all');
    setStatusFilter('all');
    if (!networkReady || !wallet.address) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void Promise.allSettled(sources.map((source) =>
      fetchActivityPage(wallet.address!, source, null, controller.signal),
    )).then((results) => {
      if (controller.signal.aborted) return;
      const nextCursors: typeof cursors = {
        transactions: null, 'token-transfers': null, 'internal-transactions': null,
      };
      const nextRecords: ActivityRecord[] = [];
      const loaded: ActivitySource[] = [];
      const failed: ActivitySource[] = [];
      results.forEach((result, index) => {
        const source = sources[index];
        if (result.status === 'fulfilled') {
          nextRecords.push(...result.value.items);
          nextCursors[source] = result.value.nextPageParams;
          loaded.push(source);
        } else {
          failed.push(source);
        }
      });
      setCursors(nextCursors);
      setRecords(mergeActivityRecords(nextRecords));
      setLoadedSources(loaded);
      setFailedSources(failed);
      if (failed.length === sources.length) {
        const firstFailure = results.find((result) => result.status === 'rejected');
        setRequestError(firstFailure?.status === 'rejected'
          ? getActivityErrorMessage(firstFailure.reason)
          : 'The Mezo Testnet explorer could not return wallet activity.');
      }
      setLoading(false);
    });
    return () => {
      controller.abort();
      loadMoreController.current?.abort();
      loadMoreController.current = null;
    };
  }, [wallet.address, wallet.connected, wallet.chainId, networkReady, reloadKey]);

  const localPending = useMemo(() => {
    if (!wallet.address) return [];
    return wallet.transfers
      .filter((transfer) =>
        transfer.sender?.toLowerCase() === wallet.address?.toLowerCase() &&
        transfer.status === 'submitted' &&
        !records.some((record) =>
          record.hash.toLowerCase() === transfer.hash.toLowerCase() &&
          (record.source === 'transactions' || record.source === 'token-transfers'),
        ),
      )
      .map((transfer): ActivityRecord => ({
        id: `local:${transfer.hash.toLowerCase()}`,
        source: 'local',
        kind: 'local_transfer',
        hash: transfer.hash,
        submittedAt: transfer.timestamp,
        from: transfer.sender,
        to: transfer.recipient,
        value: (() => {
          try { return parseTokenAmount(transfer.amount, MUSD_DECIMALS).toString(); }
          catch { return undefined; }
        })(),
        amountDecimals: MUSD_DECIMALS,
        tokenSymbol: 'MUSD',
        tokenName: 'Mezo USD',
        tokenType: 'ERC-20',
        tokenAddress: MUSD_ADDRESS,
        status: 'pending',
        direction: 'outgoing',
      }));
  }, [wallet.address, wallet.transfers, records]);

  const visibleRecords = useMemo(() => mergeActivityRecords(records, localPending)
    .filter((record) => typeFilter === 'all' || activityTypeGroup(record) === typeFilter)
    .filter((record) => statusFilter === 'all' || record.status === statusFilter),
  [records, localPending, typeFilter, statusFilter]);
  const hasMore = loadedSources.some((source) => cursors[source] !== null);

  const loadMore = async () => {
    if (!wallet.address || !networkReady || loadingMore) return;
    const pendingSources = sources.filter((source) => cursors[source] !== null);
    if (!pendingSources.length) return;
    const address = wallet.address;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setFailedSources([]);
    const results = await Promise.allSettled(pendingSources.map((source) =>
      fetchActivityPage(address, source, cursors[source], controller.signal),
    ));
    if (controller.signal.aborted) return;
    const nextRecords: ActivityRecord[] = [];
    const nextCursors = { ...cursors };
    const failed: ActivitySource[] = [];
    results.forEach((result, index) => {
      const source = pendingSources[index];
      if (result.status === 'fulfilled') {
        nextRecords.push(...result.value.items);
        nextCursors[source] = result.value.nextPageParams;
      } else {
        failed.push(source);
      }
    });
    setRecords((existing) => mergeActivityRecords(existing, nextRecords));
    setCursors(nextCursors);
    setFailedSources(failed);
    setLoadingMore(false);
    if (loadMoreController.current === controller) loadMoreController.current = null;
  };

  const unsupportedNetwork = wallet.connected && wallet.chainId !== CHAIN_ID;
  const filteredEmpty = visibleRecords.length === 0 && records.length + localPending.length > 0;
  const failedLabels = failedSources.map(activitySourceLabel).join(', ');
  return <Page>
    <PageHead eyebrow="Wallet-wide history" title="Activity" description="Indexed Mezo Testnet transactions, token events, and internal transactions for the connected wallet." />
    <section className="card card-pad activity-wallet" data-testid="panel-activity-wallet">
      <div>
        <div className="activity-wallet-label">Connected wallet</div>
        <div className="mono activity-wallet-address">{wallet.address ?? 'Not connected'}</div>
      </div>
      <div className="activity-wallet-right">
        <span className={`status-badge ${networkReady ? '' : 'activity-status-warning'}`} data-testid="text-activity-network">
          {wallet.connected ? (networkReady ? 'MEZO TESTNET' : `WRONG NETWORK · ${wallet.chainId ?? 'unknown'}`) : 'WALLET DISCONNECTED'}
        </span>
        <button className="button secondary" onClick={() => setReloadKey((key) => key + 1)} disabled={!networkReady || loading} data-testid="button-refresh-activity">
          <RefreshCw size={13} />Refresh
        </button>
      </div>
    </section>
    {!wallet.connected ? <div style={{ marginTop: 14 }}><Callout warning>Connect a wallet to load its Mezo Testnet history. No activity is shown until an address and network are confirmed.</Callout></div>
      : unsupportedNetwork ? <div style={{ marginTop: 14 }}><Callout warning>Your wallet is on chain {wallet.chainId ?? 'unknown'}, not Mezo Testnet (chain {CHAIN_ID}). Switch networks before loading or labeling activity.</Callout></div>
      : <div className="activity-scope-note" role="note">History is provided by the official Mezo Testnet Blockscout explorer and is limited to activity that explorer has indexed. Pending transactions, unindexed internal calls, and unindexed token events may not appear.</div>}
    {networkReady && <section className="card card-pad" style={{ marginTop: 16 }} data-testid="panel-activity-history">
      <CardHeading title="Wallet activity" caption={loading ? 'Fetching indexed history from the Mezo Testnet explorer…' : `${records.length + localPending.length} indexed or locally pending records`}
        action={wallet.address ? <a className="button secondary" href={`${EXPLORER}address/${wallet.address}`} target="_blank" rel="noreferrer" data-testid="link-wallet-history">Open explorer <ExternalLink size={13} /></a> : undefined} />
      {requestError ? <div className="activity-error" role="alert" data-testid="error-activity-history"><div><strong>Could not load wallet history</strong><p>{requestError}</p><button className="button secondary" onClick={() => setReloadKey((key) => key + 1)} data-testid="button-retry-activity"><RefreshCw size={13} />Retry</button></div></div>
        : loading ? <ActivitySkeleton />
          : <>
            {failedSources.length > 0 && <div style={{ marginBottom: 14 }}><Callout warning>{loadedSources.length > 0
              ? `Partial history: ${failedLabels} could not be loaded. Available categories are shown; refresh to retry the failed source${failedSources.length > 1 ? 's' : ''}.`
              : `Could not load ${failedLabels}. Retry to request this history category again.`}
              <button className="button secondary" onClick={() => setReloadKey((key) => key + 1)} data-testid="button-retry-activity-partial"><RefreshCw size={12} />Retry</button>
            </Callout></div>}
            <div className="activity-controls">
              <label className="activity-filter">Type
                <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} data-testid="select-activity-type">
                  <option value="all">All activity types</option><option value="transaction">Transactions</option><option value="token">Token transfers</option><option value="internal">Internal transactions</option><option value="local">MezoFlow pending</option>
                </select>
              </label>
              <label className="activity-filter">Status
                <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} data-testid="select-activity-status">
                  <option value="all">All statuses</option><option value="success">Successful / indexed</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="unknown">Unknown</option>
                </select>
              </label>
            </div>
            {filteredEmpty ? <div className="empty-state" data-testid="empty-activity-filtered"><div><div className="empty-icon"><Search size={17} /></div><strong>No activity matches these filters</strong><p>Change the type or status filter to see other records.</p></div></div>
              : visibleRecords.length === 0 ? <div className="empty-state" data-testid="empty-activity-history"><div><div className="empty-icon"><ActivityIcon size={17} /></div><strong>No indexed activity found</strong><p>The explorer returned no matching transactions, token events, or internal transactions for this wallet.</p></div></div>
                : <div className="table-wrap activity-table-wrap"><table className="asset-table activity-table"><thead><tr><th>Activity</th><th>Direction</th><th>Value / asset</th><th>From → To</th><th>Time · block</th><th>Status</th></tr></thead><tbody>
                  {visibleRecords.map((record) => <ActivityRow key={record.id} record={record} />)}
                </tbody></table></div>}
            {hasMore && <div className="activity-load-more"><button className="button secondary" onClick={() => { void loadMore(); }} disabled={loadingMore} data-testid="button-load-more-activity"><RefreshCw size={13} />{loadingMore ? 'Loading…' : 'Load more activity'}</button></div>}
            <div className="activity-source-note">{loadedSources.length > 0
              ? `Sources: ${loadedSources.map(activitySourceLabel).join(' · ')} · each source uses its own explorer cursor.`
              : 'No activity source has returned data.'}</div>
          </>}
    </section>}
  </Page>;
}

function activitySourceLabel(source: ActivitySource) {
  if (source === 'transactions') return 'Transactions';
  if (source === 'token-transfers') return 'Token transfers';
  return 'Internal transactions';
}

function activityTypeGroup(record: ActivityRecord) {
  if (record.source === 'local') return 'local';
  if (record.source === 'token-transfers') return 'token';
  if (record.source === 'internal-transactions') return 'internal';
  return 'transaction';
}

function getActivityErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'The Mezo Testnet explorer could not return wallet activity. Please retry.';
}

function activityTypeLabel(record: ActivityRecord) {
  switch (record.kind) {
    case 'native_transfer': return 'Native BTC transfer';
    case 'contract_interaction': return 'Contract interaction';
    case 'token_transfer':
      if (record.eventType?.includes('mint')) return 'Token mint';
      if (record.eventType?.includes('burn')) return 'Token burn';
      return record.tokenType && record.tokenType !== 'ERC-20'
        ? `${record.tokenType} event`
        : 'Token transfer';
    case 'internal_transfer': return 'Internal BTC transfer';
    case 'internal_transaction': return 'Internal transaction';
    case 'local_transfer': return 'MUSD transfer · awaiting indexer';
    default: return 'Transaction';
  }
}

function formatActivityValue(record: ActivityRecord) {
  if (record.kind === 'token_transfer') {
    if (record.tokenId) {
      if (record.value && record.amountDecimals !== undefined) {
        try {
          const quantity = formatTokenAmount(BigInt(record.value), record.amountDecimals, 6);
          return `${quantity} ${record.tokenSymbol ?? 'token'} · #${record.tokenId}`;
        } catch {
          return `Token #${record.tokenId}${record.tokenSymbol ? ` · ${record.tokenSymbol}` : ''}`;
        }
      }
      return `Token #${record.tokenId}${record.tokenSymbol ? ` · ${record.tokenSymbol}` : ''}`;
    }
    if (record.value && record.amountDecimals !== undefined) {
      try {
        return `${formatTokenAmount(BigInt(record.value), record.amountDecimals, 6)} ${record.tokenSymbol ?? 'token'}`;
      } catch {
        return 'Token amount unavailable';
      }
    }
    return record.tokenSymbol ?? record.tokenName ?? 'Token amount unavailable';
  }
  if (record.kind === 'local_transfer') {
    if (record.value) {
      try { return `${formatTokenAmount(BigInt(record.value), MUSD_DECIMALS, 6)} MUSD`; }
      catch { return 'MUSD amount unavailable'; }
    }
    return 'MUSD amount unavailable';
  }
  if (record.value && record.amountDecimals !== undefined && BigInt(record.value) > 0n) {
    try { return `${formatTokenAmount(BigInt(record.value), record.amountDecimals, 8)} BTC`; }
    catch { return 'Value unavailable'; }
  }
  return record.kind === 'contract_interaction' ? 'No native value' : '—';
}

function activityStatusLabel(record: ActivityRecord) {
  if (record.source === 'token-transfers') return 'Indexed event';
  if (record.status === 'success') return 'Successful';
  if (record.status === 'failed') return 'Failed';
  if (record.status === 'pending') return 'Pending';
  return 'Status unknown';
}

function ActivityRow({ record }: { record: ActivityRecord }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const time = record.timestamp ? Date.parse(record.timestamp) : record.submittedAt;
  const statusClass = record.status === 'success' ? 'lime' : record.status === 'failed' ? 'orange' : 'muted';
  return <>
    <tr data-testid={`row-activity-${record.id.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 56)}`}>
      <td><div>{activityTypeLabel(record)}</div>
        {record.method && <div className="activity-subtext">{record.method}</div>}
        <a className="txhash" href={`${EXPLORER}tx/${record.hash}`} target="_blank" rel="noreferrer" title={record.hash} data-testid="link-activity-transaction">{short(record.hash)} <ExternalLink size={11} /></a>
        <button type="button" className="activity-detail-button" onClick={() => setDetailsOpen(true)} aria-label={`Open details for transaction ${short(record.hash)}`} data-testid="button-activity-details">View details</button>
      </td>
      <td>{record.direction === 'incoming' ? 'Incoming' : record.direction === 'outgoing' ? 'Outgoing' : record.direction === 'interaction' ? 'Interaction' : 'Unavailable'}</td>
      <td className="mono">{formatActivityValue(record)}</td>
      <td className="mono activity-addresses">
        {record.from ? <span title={record.from}>{short(record.from)}</span> : 'Unavailable'}
        <span className="muted"> → </span>
        {record.to ? <span title={record.to}>{short(record.to)}</span> : 'Unavailable'}
      </td>
      <td className="muted">
        {time && Number.isFinite(time) ? new Date(time).toLocaleString() : 'Time unavailable'}
        {record.blockNumber !== undefined && <a className="activity-block" href={`${EXPLORER}block/${record.blockNumber}`} target="_blank" rel="noreferrer">Block {record.blockNumber}</a>}
        {record.source === 'local' && <span className="activity-subtext">Submission time · not an on-chain timestamp</span>}
      </td>
      <td><span className={statusClass}>{activityStatusLabel(record)}</span></td>
    </tr>
    {detailsOpen && <ActivityDetailsDialog record={record} onClose={() => setDetailsOpen(false)} />}
  </>;
}

function ActivityDetailsDialog({ record, onClose }: { record: ActivityRecord; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const timestamp = record.timestamp && Number.isFinite(Date.parse(record.timestamp))
    ? new Date(record.timestamp).toLocaleString()
    : record.submittedAt
      ? `${new Date(record.submittedAt).toLocaleString()} · local submission time`
      : 'Unavailable';
  const value = formatActivityValue(record);
  const isTokenEvent = record.source === 'token-transfers' || record.kind === 'local_transfer';
  const sourceLabel = record.source === 'local' ? 'MezoFlow submission record' : activitySourceLabel(record.source);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      data-testid="dialog-activity-details-backdrop"
    >
      <section role="dialog" aria-modal="true" aria-labelledby="activity-details-title" className="modal card activity-detail-modal">
        <div className="activity-detail-heading">
          <div><div className="eyebrow">Indexed record</div><h2 id="activity-details-title">Transaction details</h2></div>
          <button className="copy-button" type="button" onClick={onClose} aria-label="Close transaction details" data-testid="button-close-activity-details"><X /></button>
        </div>
        <div className="activity-detail-list">
          <DetailRow label="Transaction hash"><span className="mono detail-hash">{record.hash}</span></DetailRow>
          <DetailRow label="Status"><span className={record.status === 'success' ? 'lime' : record.status === 'failed' ? 'orange' : 'muted'}>{activityStatusLabel(record)}</span></DetailRow>
          <DetailRow label="Block">
            {record.blockNumber !== undefined
              ? <a className="verified-tag mono" href={`${EXPLORER}block/${record.blockNumber}`} target="_blank" rel="noreferrer">{record.blockNumber} <ExternalLink size={11} /></a>
              : 'Unavailable'}
          </DetailRow>
          <DetailRow label={record.source === 'local' ? 'Submitted at' : 'Timestamp'}>{timestamp}</DetailRow>
          <DetailRow label="Sender"><span className="mono detail-address">{record.from ?? 'Unavailable'}</span></DetailRow>
          <DetailRow label="Recipient"><span className="mono detail-address">{record.to ?? 'Unavailable'}</span></DetailRow>
          <DetailRow label="Value">{value === '—' ? 'Unavailable' : value}</DetailRow>
          {record.method && <DetailRow label="Method / event">{record.method}</DetailRow>}
          {isTokenEvent && <>
            <div className="activity-detail-subheading">Token transfer details</div>
            <DetailRow label="Token name">{record.tokenName ?? 'Unavailable'}</DetailRow>
            <DetailRow label="Token symbol">{record.tokenSymbol ?? 'Unavailable'}</DetailRow>
            <DetailRow label="Token standard">{record.tokenType ?? 'Unavailable'}</DetailRow>
            <DetailRow label="Token contract"><span className="mono detail-address">{record.tokenAddress ?? 'Unavailable'}</span></DetailRow>
            <DetailRow label="Token ID">{record.tokenId ?? 'Not supplied by this event'}</DetailRow>
          </>}
          <DetailRow label="Data source">{sourceLabel}</DetailRow>
        </div>
        <p className="fine-print activity-detail-note">
          Explorer details are limited to fields returned by its index. Missing fields are shown as unavailable; indexed history may not include every on-chain event.
        </p>
        <div className="row-actions activity-detail-actions">
          <a className="button secondary" href={`${EXPLORER}tx/${record.hash}`} target="_blank" rel="noreferrer" data-testid="link-activity-details-explorer">Open in Mezo explorer <ExternalLink size={13} /></a>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="activity-detail-row"><span className="muted">{label}</span><span>{children}</span></div>;
}

function ActivitySkeleton() {
  return <div className="activity-skeleton" aria-label="Loading wallet activity" aria-live="polite" data-testid="loading-activity">
    {[0, 1, 2, 3].map((item) => <div className="activity-skeleton-row" key={item}><span /><span /><span /><span /></div>)}
  </div>;
}

function SettingsPage({ wallet, notify, preferences, onUpdatePreferences, onResetPreferences }: {
  wallet: WalletModel;
  notify: (message: string) => void;
  preferences: AppPreferences;
  onUpdatePreferences: (updates: Partial<AppPreferences>) => void;
  onResetPreferences: () => void;
}) {
  const { disconnect } = useDisconnect();
  const [confirmReset, setConfirmReset] = useState(false);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`);
    } catch {
      notify(`Could not copy the ${label.toLowerCase()}.`);
    }
  };
  return <Page><PageHead eyebrow="Configuration" title="Settings" description="Network configuration is fixed to the verified Mezo Testnet. Local preferences remain in this browser." />
    <div className="two-col">
      <section className="card card-pad"><CardHeading title="Network configuration" caption="Verified Mezo Testnet details" />
         <ConfigRow label="Network" value="Mezo Testnet" /><ConfigRow label="Chain ID" value={String(CHAIN_ID)} copy={() => copy(String(CHAIN_ID), 'Chain ID')} /><ConfigRow label="RPC endpoint" value={RPC_URL} copy={() => copy(RPC_URL, 'RPC URL')} /><ConfigRow label="Explorer" value={EXPLORER} copy={() => copy(EXPLORER, 'Explorer URL')} /><ConfigRow label="Faucet" value={FAUCET} copy={() => copy(FAUCET, 'Faucet URL')} />
          <div className="divider" /><div className="row-actions" style={{ flexWrap: 'wrap' }}><button className="button" onClick={() => void wallet.switchNetwork()} disabled={!wallet.connected || wallet.chainId === CHAIN_ID || wallet.networkSwitching} data-testid="button-settings-switch">{wallet.chainId === CHAIN_ID ? <Check size={14} /> : <Network size={14} />}{wallet.chainId === CHAIN_ID ? 'Connected to Mezo' : wallet.networkSwitching ? 'Switching…' : 'Switch wallet to Mezo'}</button><button className="button secondary" onClick={wallet.refreshBalances} disabled={!wallet.connected || wallet.balanceLoading} data-testid="button-settings-refresh"><RefreshCw size={13} />Refresh balances</button><a href={DOCS} target="_blank" rel="noreferrer" className="button secondary" data-testid="link-network-docs">Official docs <ExternalLink size={12} /></a></div>
          <p className="fine-print" style={{ marginTop: 12 }}>Connected wallet balances refresh automatically every 20 seconds. {formatUpdatedAt(wallet.lastBalanceUpdatedAt)}.</p>
         {wallet.networkError && <div className="form-error" role="alert" data-testid="status-network-error">{wallet.networkError}</div>}
      </section>
      <section className="card card-pad"><CardHeading title="Preferences" caption="Saved only on this device" />
        <div className="toggle-row appearance-row">
          <div><div style={{ fontSize: 12 }}>Appearance</div><div className="section-caption">Currently using {preferences.theme} mode across MezoFlow.</div></div>
          <button
            type="button"
            className="button secondary appearance-button"
            onClick={() => onUpdatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}
            aria-label={preferences.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            data-testid="button-settings-theme-toggle"
          >
            {preferences.theme === 'dark' ? <><Sun aria-hidden="true" />Switch to light</> : <><Moon aria-hidden="true" />Switch to dark</>}
          </button>
        </div>
        <div className="toggle-row"><div><div style={{ fontSize: 12 }}>Compact data density</div><div className="section-caption">Use a tighter table layout where supported.</div></div><button className={`toggle ${preferences.compact ? 'on' : ''}`} role="switch" aria-checked={preferences.compact} aria-label="Toggle compact data density" onClick={() => onUpdatePreferences({ compact: !preferences.compact })} data-testid="toggle-compact" /></div>
        <div className="toggle-row"><div><div style={{ fontSize: 12 }}>In-app transfer review</div><div className="section-caption">Show an additional summary before opening the wallet. Your wallet’s signature prompt is always required.</div></div><button className={`toggle ${preferences.confirm ? 'on' : ''}`} role="switch" aria-checked={preferences.confirm} aria-label="Toggle transfer review prompt" onClick={() => onUpdatePreferences({ confirm: !preferences.confirm })} data-testid="toggle-confirm" /></div>
        <div className="preference-select-row">
          <label htmlFor="display-currency">Preferred display currency</label>
          <select id="display-currency" className="input" value={preferences.currency} onChange={(event) => onUpdatePreferences({ currency: event.target.value as AppPreferences['currency'] })} data-testid="select-display-currency">
            <option value="USD">USD</option><option value="AUD">AUD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
          </select>
          <span className="fine-print">This preference does not create price quotes or convert balances. Market value remains unavailable without a verified price feed.</span>
        </div>
        <div className="preference-select-row">
          <label htmlFor="network-display">Network label</label>
          <select id="network-display" className="input" value={preferences.networkDisplay} onChange={(event) => onUpdatePreferences({ networkDisplay: event.target.value as AppPreferences['networkDisplay'] })} data-testid="select-network-display">
            <option value="name-and-id">Network name and chain ID</option><option value="name">Network name only</option>
          </select>
        </div>
        <div className="divider" /><div className="info-line"><span className="muted">Wallet address</span><span className="mono">{wallet.connected ? short(wallet.address) : 'Not connected'}</span></div>
        {wallet.connected && <div className="row-actions" style={{ marginTop: 12 }}><button className="button" onClick={() => { void wallet.copyAddress().then(() => notify('Wallet address copied')).catch(() => notify('Could not copy the wallet address.')); }} data-testid="button-copy-wallet"><Copy size={13} />Copy address</button><button className="button danger" onClick={() => disconnect()} data-testid="button-settings-disconnect">Disconnect wallet</button></div>}
        <div className="divider" />
         <div className="preference-reset">
          <div><strong>Reset display preferences</strong><span>Restore the default theme, display currency, density, network label, and transfer review setting. Wallet connection, saved transfer references, and on-chain activity will not be changed.</span></div>
          <button className="button secondary" onClick={() => setConfirmReset(true)} data-testid="button-clear-preferences">Reset preferences</button>
        </div>
      </section>
    </div>
     <p className="page-footnote">MezoFlow stores submitted transfer references separately from display preferences in this browser. Disconnecting the wallet does not affect on-chain assets; resetting preferences does not delete transfer records.</p>
     {confirmReset && <div className="modal-backdrop" role="presentation">
       <section className="modal card" role="alertdialog" aria-modal="true" aria-labelledby="reset-preferences-title" aria-describedby="reset-preferences-description" data-testid="dialog-reset-preferences">
         <h2 id="reset-preferences-title">Reset display preferences?</h2>
         <p id="reset-preferences-description" className="section-caption">This restores the default theme, currency, density, network label, and transfer-review setting. It only removes MezoFlow’s local display-preferences entry. Your wallet stays connected; saved transfer references, blockchain activity, and wallet data are not cleared.</p>
         <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
           <button type="button" className="button" onClick={() => setConfirmReset(false)} data-testid="button-cancel-preference-reset">Cancel</button>
           <button type="button" className="button danger" onClick={() => { onResetPreferences(); setConfirmReset(false); }} data-testid="button-confirm-preference-reset">Reset preferences</button>
         </div>
       </section>
     </div>}
  </Page>;
}
function ConfigRow({ label, value, copy }: { label: string; value: string; copy?: () => void }) {
  return <div className="config-row"><div><div className="muted" style={{ fontSize: 10 }}>{label}</div><div className="mono config-value">{value}</div></div>{copy && <button className="copy-button" onClick={copy} aria-label={`Copy ${label}`} data-testid={`button-copy-${label.toLowerCase().replaceAll(' ', '-')}`}><Copy /></button>}</div>;
}

function DocsPage() {
  return <Page><PageHead eyebrow="Product reference" title="Docs & safety" description="What MezoFlow reads, what it can do, and where its limits are." />
    <div className="two-col">
      <section className="card card-pad"><CardHeading title="Implemented capabilities" caption="Current frontend behavior" />
        {[
          'Connect MetaMask through wagmi and approve each transaction in the MetaMask extension.',
          'Read native BTC and the verified Mezo Testnet MUSD balance from the connected address.',
          'Read MUSD name, symbol, and decimals from the deployed Testnet contract before enabling transfers.',
          'Review and submit wallet-signed MUSD transfers with an RPC gas estimate, duplicate-submit protection, and on-chain receipt status.',
          'Receive MUSD with a plain wallet-address QR or a separate MUSD payment-request QR; optional amounts are encoded in exact token units.',
          'Prefill transfers from a supported URL or pasted address/QR payload; unsupported networks and token contracts are rejected, and imported details never submit automatically.',
          'Load wallet history from the official Mezo Testnet Blockscout API v2 address endpoints for transactions, token transfers, and internal transactions. Transaction/event status comes from explorer fields or the indexed event; MezoFlow-submitted pending records are labeled separately.',
          'Search and filter official borrowing, pool, lock, and voting resources. Testnet pool contracts link to the explorer.',
          'Show recent explorer-indexed activity and wallet/network-aware dashboard actions.',
          'Save theme, display currency, network-label, density, and transfer-review preferences locally; clear preferences without deleting transfer records.',
          'Switch to Mezo Testnet, copy network information, and open official network resources.',
        ].map((text, index) => <div className="doc-line" key={text}><span className="lime mono">0{index + 1}</span><span>{text}</span></div>)}
      </section>
      <section className="card card-pad"><CardHeading title="Limitations" caption="Unavailable means unavailable" />
        {[
          'No configured prices, portfolio valuation, or historical price chart.',
          'No verified account-position source, borrowing metrics, or liquidation estimates.',
          'No in-app pool deposits, withdrawals, swaps, staking, or claims; official apps handle those transactions.',
          'No live yield, liquidity, rewards, or user eligibility figures.',
          'Activity reads https://api.explorer.test.mezo.org/api/v2/addresses/{wallet}/{transactions|token-transfers|internal-transactions}. It reflects the explorer index, not a complete chain archive; pending transactions and unindexed token events or internal calls may be missing. Explorer status fields may be unknown, and locally submitted transactions remain pending until a receipt check updates them.',
          'MEZO Gauge voting is linked to the official Mainnet app, but is not signed or verified inside MezoFlow because this app does not integrate the gauge registry/contracts, voting power, or epoch state.',
          'MEZO is documented on Mainnet only; MezoFlow does not represent it as a Testnet asset.',
        ].map((text) => <div className="doc-line" key={text}><span className="orange"><TriangleAlert size={14} /></span><span>{text}</span></div>)}
      </section>
    </div>
    <div className="two-col" style={{ marginTop: 16 }}>
      <section className="card card-pad"><CardHeading title="Verified references" caption="Official Mezo resources" />
        <div style={{ display: 'grid', gap: 8 }}><Destination title="Mezo documentation" detail="Official network and protocol references" href={DOCS} /><Destination title="Mezo Testnet explorer" detail={EXPLORER} href={EXPLORER} /><Destination title="Mezo Mainnet explorer" detail={MEZO_MAINNET_ADDRESS} href={`https://explorer.mezo.org/token/${MEZO_MAINNET_ADDRESS}`} /><Destination title="Official MEZO Gauge voting" detail="Requires a separate Mezo Mainnet veMEZO workflow" href="https://mezo.org/earn/vote/mezo" /><Destination title="Mezo Testnet faucet" detail="Official testnet BTC faucet" href={FAUCET} /></div>
      </section>
      <section className="card card-pad"><CardHeading title="Security notes" caption="Review every request" />
        <div className="doc-line"><ShieldCheck size={15} className="lime" /><span>MezoFlow never asks for a seed phrase or private key.</span></div>
        <div className="doc-line"><ShieldCheck size={15} className="lime" /><span>Wallet transactions are explicit. Verify chain, token, recipient, amount, and BTC gas in your wallet before signing.</span></div>
        <div className="doc-line"><ShieldCheck size={15} className="lime" /><span>Only an on-chain receipt determines confirmed or reverted status; submitting a request is not success.</span></div>
        <div className="doc-line"><ShieldCheck size={15} className="lime" /><span>Testnet assets should not be interpreted as having a real-world market value.</span></div>
      </section>
    </div>
    <p className="page-footnote">MezoFlow is an independent interface. Official links are provided as references; always verify the domain and transaction details before interacting.</p>
  </Page>;
}

function NotFoundPage() {
  return <Page><div className="empty-state" style={{ minHeight: '60vh' }}><div><div className="empty-icon"><CircleHelp size={17} /></div><strong>Page not found</strong><p>This route is not part of MezoFlow.</p><Link className="button" href="/" style={{ marginTop: 14 }} data-testid="link-not-found-home">Return to overview</Link></div></div></Page>;
}

function short(value?: string) {
  if (!value) return '—';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function getWalletErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === 'number') return candidate.code;
  if (candidate.cause !== error) return getWalletErrorCode(candidate.cause);
  return undefined;
}

async function addMezoTestnetToWallet(): Promise<void> {
  const provider = (window as Window & {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }).ethereum;
  if (!provider) throw new Error('No injected EVM wallet was found. Add Mezo Testnet manually in your wallet.');
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: `0x${CHAIN_ID.toString(16)}`,
      chainName: 'Mezo Testnet',
      nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
      rpcUrls: [RPC_URL],
      blockExplorerUrls: [EXPLORER],
    }],
  });
}

export default App;
