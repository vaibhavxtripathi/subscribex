# SubscribeX

On-chain content paywall built on Stellar. Creators post content hashes (IPFS CIDs or any hash). The smart contract gates access — only wallets with an active subscription can read the real hash. Subscriptions are paid in XLM and enforced entirely on-chain.

## Live Links

| | |
|---|---|
| **Frontend** | `https://subscribex.vercel.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/subscribex` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CONTRACT_ID` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

## How It Works

1. Creator deploys the contract, calls `setup()` with name and monthly price
2. Creator posts content via `post_content()` — title, description, and a content hash (e.g. IPFS CID)
3. Non-subscribers see the title and description, but the hash is hidden
4. Subscribers call `subscribe(months, xlm_token)` — XLM goes directly to creator
5. Active subscribers call `get_content(subscriber, content_id)` to retrieve the real hash
6. Access is verified by comparing `subscription.expires_at >= current_ledger`

## Contract Functions

```rust
setup(owner, name, price_per_month: i128)
post_content(owner, title, description, hash) -> u32
subscribe(subscriber, months: u32, xlm_token)
get_profile() -> CreatorProfile
get_content_meta(content_id) -> ContentItem   // hash redacted
get_content(subscriber, content_id) -> ContentItem  // full hash, sub required
get_subscription(subscriber) -> Option<Subscription>
is_subscribed(subscriber) -> bool
content_count() -> u32
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter API 6.0.1 |
| Stellar SDK | 14.6.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```
