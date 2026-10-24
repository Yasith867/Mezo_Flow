# MezoFlow

MezoFlow is a Bitcoin-native DeFi command center for checking live Mezo Testnet balances, using MUSD, and opening verified Mezo ecosystem resources. The interface is deliberately honest about missing market feeds and protocol data.

## Problem and intended users

MUSD holders need a clear way to check their Testnet balance, request a specific payment, and send MUSD without confusing a pending wallet transaction with a confirmed transfer. MezoFlow combines those steps in one wallet-aware flow and makes the recipient's network and token explicit before the sender signs.

The main users are Mezo Testnet MUSD holders and recipients, people demonstrating MUSD payments, and builders evaluating Mezo integrations. The ecosystem directory supports discovery, but the product's core value is the working MUSD payment journey: live balance, receive address and request QR/link, validated send prefill, explicit transaction review, wallet signature, and receipt-based status.

## Implemented

- Responsive dashboard and twelve routes, including MUSD requests, request history, and saved recipients.
- MetaMask connection via wagmi's MetaMask connector; transaction signing and network approvals remain in the MetaMask browser extension.
- Live reads for native BTC and the official Mezo Testnet MUSD balance.
- On-chain reads of the deployed MUSD contract's name, symbol, and decimals. MUSD sending stays disabled unless those values match the official contract reference.
- Independent BTC and MUSD loading/error states, 20-second balance polling, manual refresh controls, and last-read timestamps.
- Real MUSD ERC-20 transfers after an in-app review and explicit wallet signature; receipt status is checked on-chain.
- Receive tools with a plain wallet-address QR or an explicitly labeled MUSD request QR with an optional exact amount; copied addresses and request text report success or failure.
- Shareable MezoFlow payment links that encode the recipient, Mezo Testnet chain ID, official MUSD contract, and optional exact amount. Opening a link only prefills the send form; the sender must review and sign separately.
- Version 1 payment links validate their version, recipient, network, token, amount, note, and allowed fields. Requests can be created, copied, shared, and shown as a QR code.
- A searchable local address book supports add, edit, delete, copy, and send-prefill actions. Saved contacts are revalidated and the full destination address is shown before wallet signing.
- Browser-local payment-request history includes recipient, requested amount, note, creation time, and a copyable link. It labels requests as created locally and payment status unknown; no incoming transfer is claimed as verified.
- Validated payment-request prefill for wallet addresses, supported links, and chain-explicit official MUSD transfer QR payloads; no imported request submits or signs automatically.
- A searchable directory of official Mezo resources across Testnet and Mainnet. Each entry distinguishes documented information from runtime-verified state; these are external destinations, not in-app pool, lock, or gauge actions.
- Browser-local records for transfers submitted through MezoFlow and local display preferences.
- Saved recipients and payment requests are stored only in the browser and do not create on-chain records.
- Validated local transfer records; receipt checks continue for pending records stored in this browser.
- Wallet-wide Activity history from the official Mezo Testnet Blockscout API: ordinary transactions, indexed token-transfer events, and indexed internal transactions.
- Dashboard shortcuts for sending and receiving MUSD, opening Activity, and browsing verified destinations, plus recent indexed Activity with type, available amount, status, date, and explorer link.
- Activity transaction-detail dialogs show the available indexed hash, status, block/time, addresses, value, and token-event metadata, with unavailable fields labeled instead of inferred.
- Separate explorer cursors per activity category, event-level deduplication, wallet/network change handling, refresh, filters, and partial-source error states.
- A persisted light/dark appearance preference shared by the header toggle and Settings; dark remains the default.
- Local display preferences for density, transfer review, currency display, and network labels, with a confirmed reset that removes only the preferences entry.
- Live Mezo Testnet RPC information on the network page, including RPC-reported chain ID, latest block, timestamp, refresh state, and a clear note that one successful RPC read is not a full health check.
- MUSD target-peg calculator that is clearly labeled as an estimate, not a live market price or guaranteed redemption value.
- Verified official links to Mezo's docs, testnet app, explorer, and faucet.
- Integer-safe MUSD parsing and balance display helpers with utility tests.

## Supported network and token

MezoFlow is configured for Mezo Testnet:

| Setting | Verified value |
| --- | --- |
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Native gas currency | BTC, 18 decimals |
| Explorer | `https://explorer.test.mezo.org/` |
| Faucet | `https://faucet.test.mezo.org/` |
| MUSD contract | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| MUSD name / symbol | Mezo USD / MUSD |
| MUSD decimals | 18 |

Network information and token addresses are sourced from the [official Mezo developer guide](https://mezo.org/docs/developers/getting-started/) and [official contracts reference](https://mezo.org/docs/users/resources/contracts-reference/). The Testnet chain ID and MUSD name, symbol, and decimals were checked against the documented public RPC; the app also reads the token metadata on-chain at runtime and disables transfers if it cannot verify the expected values. The MEZO contract documented for Mezo Mainnet is shown only as a reference; MezoFlow does not query a MEZO balance or claim a Testnet MEZO token.

## Verified directory sources

- [Mezo's Testnet borrowing guide](https://mezo.org/docs/users/borrow/mint-musd/) documents the official Testnet borrow-and-mint flow.
- [Mezo Pools developer documentation](https://mezo.org/docs/developers/features/mezo-pools/) lists Mainnet and Testnet pool/router contracts and describes a basic swap flow. MezoFlow links to the documentation but does not verify contract code or live pool state, or claim pools are active; no swap, deposit, or withdrawal action is implemented.
- [Official MEZO locking guide](https://mezo.org/docs/users/mezo-earn/lock/vemezo/how-to-lock-mezo) and [MEZO Gauge voting guide](https://mezo.org/docs/users/mezo-earn/vote/mezo-gauges/how-to-vote) document separate Mainnet workflows. MezoFlow links to these resources but does not read or submit lock or vote positions.
- [Mezo's network guide](https://mezo.org/docs/developers/getting-started/) documents the Testnet network settings and faucet.

## Buildathon submission readiness

The official [Mezo Buildathon listing](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10) requires a MUSD and/or MEZO integration and a working deployment on an accepted network; Mezo Testnet is accepted. MezoFlow's real Testnet MUSD balance reads and wallet-signed ERC-20 transfer are the integration. The deployment requirement is **not confirmed by this repository**: no published URL or live deployment check is recorded here. Do not describe the project as submission-ready until the app is published and the public URL and wallet flow have been checked.

For a judge demonstration, connect MetaMask to Mezo Testnet, open **MUSD**, show the live balance and Receive MUSD request, then use a second wallet to open/share the link, verify the prefilled recipient and amount, review the transaction, sign in the wallet, and confirm the receipt and explorer record. Testnet MUSD must first be borrowed through Mezo's official Testnet flow; it is not dispensed by the faucet.

## Known limitations

- No price feed is configured. Portfolio dollar value, price history, and allocation are therefore unavailable.
- No verified user-position data source or protocol risk parameters are integrated. Collateral ratios, liquidation thresholds, and borrowing capacity are not estimated; use the official Mezo app to inspect a loan.
- Activity reflects what the Mezo Testnet Blockscout index exposes, not an independently complete chain archive. Unindexed pending transactions, token events, and internal calls may be absent; the interface labels this limitation and surfaces source errors instead of treating them as empty history.
- Opportunities list official Mezo products and resources; it does not integrate external protocols or provide APY, liquidity, or risk ratings.
- Mezo's pool documentation identifies Testnet router and pool addresses and gives a generic swap method, but MezoFlow has not independently verified all required token contracts, deployed code, live routes, quote/slippage parameters, and transaction arguments. A direct swap was therefore not added.
- MezoFlow is a frontend product; it has not deployed smart contracts and does not custody assets.
- Public RPC availability and browser wallet support depend on the user's environment. Wallet confirmation is authoritative for network fees.

## Architecture

- `src/App.tsx`: routes, wallet state, live balances, transfer flow, RPC network information, activity details, and shared appearance controls.
- `src/lib/mezo-config.ts`: verified network parameters, token address/ABI, and wagmi configuration.
- `src/lib/token-amount.ts`: exact `bigint`-based parsing and display formatting.
- `src/lib/activity-history.ts`: Blockscout endpoint requests, response validation, event identities, and cursor handling.
- `src/index.css`: dark product theme, light-theme overrides, and responsive layout.

The MezoFlow web artifact is a static frontend. Wallet reads use Mezo's public RPC; wallet history uses the public Mezo Testnet Blockscout API (`https://api.explorer.test.mezo.org/api/v2`). Neither requires an API key or this repository's API Server artifact. The separate API Server artifact is not called by the MezoFlow frontend; applications that use that backend would need to host it separately and configure its database environment.

## Run and verify

This project uses pnpm in a workspace. The MezoFlow artifact's Replit configuration supplies `PORT` and `BASE_PATH`.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/mezoflow run typecheck
pnpm --filter @workspace/mezoflow run test
PORT=23806 BASE_PATH=/ pnpm --filter @workspace/mezoflow run build
```

The production output is `artifacts/mezoflow/dist/public`. Replit's existing `artifacts/mezoflow/.replit-artifact/artifact.toml` builds and serves that directory as a static SPA and rewrites app routes to `index.html`. These settings support direct navigation and page refreshes on routes such as `/activity`.

To use live balance reads and transfers:

1. Install and unlock the MetaMask browser extension; never paste a seed phrase or private key into MezoFlow.
2. Connect MetaMask and switch to Mezo Testnet (chain ID `31611`). MezoFlow can request that MetaMask add the documented network if it is not already configured.
3. Use the official [Mezo Testnet faucet](https://faucet.test.mezo.org/) if test BTC is needed for network fees.
4. Verify the recipient, amount, token, network, and BTC fee in MetaMask before signing. Account changes are made in MetaMask and reflected by the app.

## Environment variables

No secret, database, or API-key environment variables are required by the MezoFlow frontend. For a standalone build, set `PORT` and `BASE_PATH` as shown above; Replit supplies these through the artifact configuration. The app uses Mezo's public HTTPS Testnet RPC and Blockscout's public API. The API Server artifact is separate and is not needed to serve this static frontend.

## Hosting and custom domain

The selected host is **Replit Deployments**, using the existing static SPA artifact configuration. This matches the Vite frontend, avoids introducing a backend requirement, and does not depend on Vercel or Cloudflare.

1. Publish the MezoFlow web artifact from Replit. The existing artifact config builds `artifacts/mezoflow/dist/public` and routes application paths to `index.html`.
2. In the project editor, open **Tools → Domains** and add the domain or subdomain you want to use.
3. Replit will show the exact DNS values for that domain. Add the displayed `A` and `TXT` records at your registrar/DNS provider. Do not use guessed or copied values from another deployment.
4. Keep the `replit-verify` TXT record in DNS permanently; Replit uses it to renew the TLS certificate. HTTPS is provisioned automatically after DNS verification, which can take up to 48 hours.
5. Add each hostname separately. For example, connecting the root domain does not automatically connect its `www` or `app` subdomain.

Before changing DNS, check existing website and email records. Change only the web records that conflict with the target hostname; preserve MX, SPF, DKIM, and other email records. For Cloudflare-managed DNS, use DNS-only mode for the Replit A record.

The domain name and DNS provider have not been supplied, so domain connection is not configured or claimed as live. To finish, provide the domain name, its DNS provider/registrar, and whether you want the root, a subdomain, or both. Replit will supply the exact DNS record values after the hostname is added.

## Deployment checklist

- Run the frontend typecheck, unit tests, and production build listed above.
- Confirm the published site is served over HTTPS for wallet-provider compatibility.
- Test connection, unsupported-network recovery, balance errors, transaction rejection, receipt status, and a shared payment link between two compatible wallets on Mezo Testnet.
- Test Activity against a connected wallet on Mezo Testnet; verify account/network changes in MetaMask.
- Keep public testnet data clearly distinct from mainnet financial data.
- Re-verify the official chain configuration and MUSD address before each deployment.

Publishing the frontend is not a blockchain deployment. No smart contracts are deployed by this project.

## Future milestones

1. Add verified Mezo position reads and protocol parameters before showing risk metrics.
2. Add a price source only after confirming coverage, caching rules, and terms.
3. Evaluate verified ecosystem integrations individually; do not imply endorsement or yield.
4. Expand MEZO tracking only when a supported network and reliable market data source are configured.
