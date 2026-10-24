# MezoFlow

MezoFlow is a web app for checking MUSD and BTC balances and preparing MUSD payments on **Mezo Testnet**. It connects to MetaMask for wallet actions. It does not hold funds or ask for your private key or recovery phrase.

> **Testnet only:** Testnet tokens are for testing and should not be treated as money. Check the network and token in your wallet before approving a transaction.

## What you can do

- Connect a MetaMask wallet and read its live Mezo Testnet BTC and MUSD balances.
- Send MUSD through the official Mezo Testnet token contract. MetaMask must approve the transaction, and MezoFlow checks the on-chain receipt.
- Receive MUSD by sharing your wallet address or a payment-request link/QR code.
- Create a version 1 payment request with an optional amount and note.
- Save, edit, search, copy, and select recipient contacts when preparing a payment.
- See payment requests you created in this browser and explorer-indexed wallet activity.
- Browse Mezo network information and links to official Mezo resources.

MezoFlow does not provide live market prices, loan-position data, swaps, or protocol actions such as borrowing and staking.

## How payments work

### Request MUSD

1. Connect the wallet that should receive the payment.
2. Open **Request MUSD** and optionally enter an amount and note.
3. Create the request. MezoFlow makes a link and QR code that specify the recipient, Mezo Testnet, the official MUSD contract, and request version.
4. Share the link or QR code with the sender.
5. The sender opens the link in MezoFlow. It fills in the send form; it does **not** sign or send anything.
6. The sender checks the recipient, amount, network, and token, then chooses to continue to MetaMask and approve or reject the transaction there.

The note is part of the link only; it is not written to the blockchain.

### Send MUSD

You can enter an address yourself, choose a saved recipient, or open a valid payment request. MezoFlow checks the recipient and amount. Before using a saved contact or request, it shows the **full recipient address** and payment details for review. MetaMask still asks you to approve the transaction.

After submission, MezoFlow checks the transaction receipt. A submitted transaction is not treated as confirmed until a successful receipt is available.

### Payment-request history

Requests you create are saved in your browser. Their status is shown as **Created locally** and **Payment status unknown**. MezoFlow cannot reliably connect an incoming transfer to a specific request, so it does not mark a request as paid based only on the amount or a transaction hash.

## Find your way around

- **Overview** shows wallet shortcuts and recent explorer-indexed activity.
- **MUSD** contains the send and receive tools. Receive can show a plain address QR or a versioned MUSD request QR/link.
- **Request MUSD** creates a shareable request with an optional amount and note.
- **Saved recipients** lets you add a name, wallet address, and optional personal note. Choose **Select for send** to load that address into the MUSD screen.
- **Request history** lists requests saved in this browser and lets you copy their links.
- **Activity** shows transactions and token events indexed by Mezo's Testnet explorer. It may not include every chain event.
- **Portfolio**, **Positions**, **Opportunities**, **MEZO & network**, **Settings**, and **Docs & safety** provide balance context, network information, preferences, and links to official resources. The app does not make up missing prices, lending positions, or protocol yields.

## Local data and wallet safety

- Saved recipients, payment-request history, display preferences, and MezoFlow's submitted-transfer references are stored in the current browser's local storage. They are not shared across devices and may be lost if that browser's site data is cleared.
- Saved names and notes are local labels. They are not stored on-chain.
- MezoFlow never needs your private key or recovery phrase. MetaMask handles wallet connection, network approval, and transaction signing.
- A payment request is not a payment. Creating or opening one never sends funds.
- Always check the full address, network, token contract, and amount in the app and in MetaMask before approving.
- MUSD transfers require Mezo Testnet BTC for network fees.

## Network details

| Setting | Mezo Testnet value |
| --- | --- |
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | [Mezo Testnet Explorer](https://explorer.test.mezo.org/) |
| Faucet | [Mezo Testnet Faucet](https://faucet.test.mezo.org/) |
| Token | Mezo USD (MUSD), 18 decimals |
| MUSD contract | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Native gas token | BTC |

The app reads MUSD's name, symbol, and decimals from the contract and disables sending if they do not match the expected details. Network or explorer availability depends on the public services it uses.

## Run the app locally

### You will need

- Node.js 20.20 or newer
- pnpm 10
- MetaMask, if you want to connect a wallet

From the repository root:

```sh
pnpm install --frozen-lockfile
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/mezoflow run dev
```

Open [http://localhost:5173](http://localhost:5173). The `PORT` and `BASE_PATH` values are required by the Vite configuration. In Replit, the managed MezoFlow workflow supplies them automatically.

The MezoFlow frontend uses public Mezo Testnet RPC and Blockscout endpoints. It does not need a database or API key to run. This workspace also contains a separate API Server artifact; MezoFlow does not call it.

### Check and build

```sh
# Run the MezoFlow utility tests
pnpm --filter @workspace/mezoflow run test

# Typecheck all workspace packages
pnpm run typecheck

# Build the MezoFlow static frontend
PORT=23806 BASE_PATH=/ pnpm --filter @workspace/mezoflow run build
```

The built site is written to `artifacts/mezoflow/dist/public`. The app is a single-page application; its Replit artifact configuration includes the route fallback needed when a page such as `/activity` is opened directly or refreshed.

## Put this project on GitHub

The root `README.md` is the guide GitHub displays on the repository home page.

1. Create an empty repository on GitHub, or open the GitHub repository already connected to this project.
2. In Replit's **Git** or **Version Control** panel, review the changed files, commit them, and push to GitHub.
3. To use Git from a terminal, first check what will be included:

   ```sh
   git status
   git add .
   git diff --cached
   git commit -m "Add MezoFlow project guide"
   git push
   ```

   Review the staged files before committing, and leave out any secrets or files you do not want to publish. For a new repository that has no remote configured, add your own GitHub repository URL as the `origin` remote and use `git push -u origin main` for the first push.

Pushing to GitHub publishes the **source code and README**, not a running website. To make the app publicly accessible, publish it separately through a hosting service. The Replit artifact configuration is set up to build and serve MezoFlow as a static single-page app. No public deployment URL is recorded in this repository.

Do not commit private keys, recovery phrases, passwords, or API credentials. MezoFlow's frontend does not require them.

## Project layout

```text
artifacts/mezoflow/     MezoFlow web app
artifacts/api-server/   Separate API service; not used by the MezoFlow frontend
lib/                    Shared workspace libraries
pnpm-workspace.yaml     Workspace package and dependency configuration
```

For implementation details, verified sources, and current limitations, see the [MezoFlow-specific guide](artifacts/mezoflow/README.md).
