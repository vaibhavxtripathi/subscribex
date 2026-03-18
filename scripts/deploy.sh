#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}SUBSCRIBEX — DEPLOY${NC}"

stellar keys generate --global creator    --network testnet 2>/dev/null || true
stellar keys generate --global subscriber --network testnet 2>/dev/null || true
stellar keys fund creator    --network testnet
stellar keys fund subscriber --network testnet
CREATOR=$(stellar keys address creator)
SUBSCRIBER=$(stellar keys address subscriber)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
echo -e "${GREEN}✓ Creator   : ${CREATOR}${NC}"
echo -e "${GREEN}✓ Subscriber: ${SUBSCRIBER}${NC}"

cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/subscribex.wasm"
cd ..

WASM_HASH=$(stellar contract upload --network testnet --source creator --wasm contract/${WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source creator --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Setup channel
stellar contract invoke --network testnet --source creator --id ${CONTRACT_ID} \
  -- setup \
  --owner ${CREATOR} \
  --name '"Stellar Dev Insights"' \
  --price_per_month 10000000 2>&1 || true

# Post content item
stellar contract invoke --network testnet --source creator --id ${CONTRACT_ID} \
  -- post_content \
  --owner ${CREATOR} \
  --title '"How Soroban Changes DeFi Forever"' \
  --description '"A deep dive into Soroban smart contracts and why they matter for the future of decentralised finance."' \
  --hash '"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"' 2>&1 || true

# Approve and buy proof subscription
stellar contract invoke --network testnet --source subscriber --id ${XLM_TOKEN} \
  -- approve \
  --from ${SUBSCRIBER} \
  --spender ${CONTRACT_ID} \
  --amount 15000000 \
  --expiration_ledger 3110400 2>&1 || true

TX_RESULT=$(stellar contract invoke \
  --network testnet --source subscriber --id ${CONTRACT_ID} \
  -- subscribe \
  --subscriber ${SUBSCRIBER} \
  --months 1 \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_CREATOR_ADDRESS=${CREATOR}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
