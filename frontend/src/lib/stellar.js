import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api'

// .trim() everywhere — Vercel CRLF fix
const CONTRACT_ID     = (import.meta.env.VITE_CONTRACT_ID       || '').trim()
const XLM_TOKEN       = (import.meta.env.VITE_XLM_TOKEN         || '').trim()
const CREATOR_ADDRESS = (import.meta.env.VITE_CREATOR_ADDRESS   || '').trim()
const NET             = (import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').trim()
const RPC_URL         = (import.meta.env.VITE_SOROBAN_RPC_URL   || 'https://soroban-testnet.stellar.org').trim()
const DUMMY           = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

export async function connectWallet() {
  const { isConnected: connected } = await isConnected()
  if (!connected) throw new Error('Freighter not installed.')
  const { address, error } = await requestAccess()
  if (error) throw new Error(error)
  return address
}

async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  // Freighter v6 — networkPassphrase only (network param is ignored/bugged)
  const result = await signTransaction(prepared.toXDR(), { networkPassphrase: NET })
  if (result.error) throw new Error(result.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(result.signedTxXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  return pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

async function approveXlm(publicKey, stroops) {
  return sendTx(publicKey, new StellarSdk.Contract(XLM_TOKEN).call(
    'approve',
    StellarSdk.Address.fromString(publicKey).toScVal(),
    StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvU32(3_110_400),
  ))
}

const tc = () => new StellarSdk.Contract(CONTRACT_ID)

export async function setupChannel(owner, name, pricePerMonth) {
  const price = Math.ceil(pricePerMonth * 10_000_000)
  return sendTx(owner, tc().call(
    'setup',
    StellarSdk.Address.fromString(owner).toScVal(),
    StellarSdk.xdr.ScVal.scvString(name),
    new StellarSdk.XdrLargeInt('i128', BigInt(price)).toI128(),
  ))
}

export async function postContent(owner, title, description, hash) {
  return sendTx(owner, tc().call(
    'post_content',
    StellarSdk.Address.fromString(owner).toScVal(),
    StellarSdk.xdr.ScVal.scvString(title),
    StellarSdk.xdr.ScVal.scvString(description),
    StellarSdk.xdr.ScVal.scvString(hash),
  ))
}

export async function subscribe(subscriber, months, pricePerMonth) {
  const total = Math.ceil(pricePerMonth * months * 10_000_000)
  await approveXlm(subscriber, total)
  return sendTx(subscriber, tc().call(
    'subscribe',
    StellarSdk.Address.fromString(subscriber).toScVal(),
    StellarSdk.xdr.ScVal.scvU32(months),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function getProfile() {
  try { return await readContract(tc().call('get_profile')) }
  catch { return null }
}

export async function getContentMeta(contentId) {
  try {
    return await readContract(tc().call(
      'get_content_meta',
      StellarSdk.xdr.ScVal.scvU32(contentId),
    ))
  } catch { return null }
}

export async function getContentFull(subscriber, contentId) {
  try {
    return await readContract(tc().call(
      'get_content',
      StellarSdk.Address.fromString(subscriber).toScVal(),
      StellarSdk.xdr.ScVal.scvU32(contentId),
    ))
  } catch { return null }
}

export async function getSubscription(subscriber) {
  try {
    return await readContract(tc().call(
      'get_subscription',
      StellarSdk.Address.fromString(subscriber).toScVal(),
    ))
  } catch { return null }
}

export async function checkIsSubscribed(subscriber) {
  try {
    return await readContract(tc().call(
      'is_subscribed',
      StellarSdk.Address.fromString(subscriber).toScVal(),
    ))
  } catch { return false }
}

export async function getContentCount() {
  try { return Number(await readContract(tc().call('content_count'))) }
  catch { return 0 }
}

// ledgers remaining → human time
export function ledgersToTime(ledgersLeft) {
  const secs = ledgersLeft * 5
  if (secs <= 0)    return 'Expired'
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

export const xlm   = s => (Number(s) / 10_000_000).toFixed(2)
export const short = a => a ? `${a.toString().slice(0, 5)}…${a.toString().slice(-4)}` : '—'
export { CONTRACT_ID, CREATOR_ADDRESS }
