import { useState, useEffect } from 'react'
import {
  connectWallet, setupChannel, postContent, subscribe,
  getProfile, getContentMeta, getContentFull,
  getSubscription, checkIsSubscribed, getContentCount,
  ledgersToTime, xlm, short, CONTRACT_ID, CREATOR_ADDRESS,
} from './lib/stellar'

// ── Lock icon SVG ──────────────────────────────────────────────────────────
function LockIcon({ unlocked }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="lock-icon">
      {unlocked ? (
        <>
          <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M6 8V5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M6 8V5a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
        </>
      )}
    </svg>
  )
}

// ── Content card ───────────────────────────────────────────────────────────
function ContentCard({ meta, isSubscribed, wallet, onReveal }) {
  const [full,    setFull]    = useState(null)
  const [loading, setLoading] = useState(false)

  const handleReveal = async () => {
    if (!isSubscribed || !wallet) return
    setLoading(true)
    const item = await getContentFull(wallet, meta.id)
    if (item) setFull(item)
    else onReveal({ ok: false, msg: 'Could not load content' })
    setLoading(false)
  }

  const hash = full?.hash
  const isIPFS = hash && (hash.startsWith('bafy') || hash.startsWith('Qm'))

  return (
    <div className={`content-card ${full ? 'card-unlocked' : ''}`}>
      <div className="cc-header">
        <LockIcon unlocked={!!full} />
        <div className="cc-id">#{meta.id?.toString().padStart(2, '0')}</div>
      </div>

      <h3 className="cc-title">{meta.title}</h3>
      {meta.description && <p className="cc-desc">{meta.description}</p>}

      {!full ? (
        <div className="cc-locked">
          {isSubscribed ? (
            <button className="btn-reveal" disabled={loading} onClick={handleReveal}>
              {loading ? 'Loading…' : 'Reveal Content'}
            </button>
          ) : (
            <div className="cc-paywall">
              <div className="cpw-text">Subscribe to unlock</div>
              <div className="cpw-hash">Content hash hidden</div>
            </div>
          )}
        </div>
      ) : (
        <div className="cc-revealed">
          <div className="cr-label">CONTENT HASH</div>
          <div className="cr-hash">{hash}</div>
          {isIPFS && (
            <a
              className="cr-link"
              href={`https://ipfs.io/ipfs/${hash}`}
              target="_blank" rel="noreferrer"
            >
              View on IPFS ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Subscribe modal ────────────────────────────────────────────────────────
function SubscribePanel({ profile, wallet, onSubscribed, onCancel }) {
  const [months, setMonths] = useState(1)
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]     = useState('')

  const total = (Number(profile.price_per_month) / 10_000_000 * months).toFixed(2)

  const handleSubscribe = async () => {
    setBusy(true); setErr('')
    try {
      const hash = await subscribe(wallet, months, Number(profile.price_per_month) / 10_000_000)
      onSubscribed(hash)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="sub-overlay" onClick={onCancel}>
      <div className="sub-modal" onClick={e => e.stopPropagation()}>
        <button className="sub-close" onClick={onCancel}>×</button>
        <div className="sm-title">Subscribe to</div>
        <div className="sm-channel">{profile.name}</div>

        <div className="sm-price-row">
          <span className="sm-price-val">{xlm(profile.price_per_month)}</span>
          <span className="sm-price-unit">XLM / month</span>
        </div>

        <div className="sm-months">
          <div className="sm-months-label">HOW MANY MONTHS?</div>
          <div className="sm-months-grid">
            {[1, 3, 6, 12].map(m => (
              <button key={m}
                className={`month-btn ${months === m ? 'month-active' : ''}`}
                onClick={() => setMonths(m)}>
                {m}mo
              </button>
            ))}
          </div>
        </div>

        <div className="sm-total">
          <span>Total</span>
          <span className="sm-total-val">{total} XLM</span>
        </div>

        <div className="sm-perks">
          <div className="sm-perk">✓ Instant access to all {profile.subscriber_count > 0 ? 'gated' : ''} content</div>
          <div className="sm-perk">✓ Access verified by smart contract</div>
          <div className="sm-perk">✓ Extend at any time</div>
        </div>

        {err && <p className="sm-err">{err}</p>}

        <button className="btn-sub-confirm" disabled={busy || !wallet} onClick={handleSubscribe}>
          {busy ? 'Signing…' : `Subscribe · ${total} XLM`}
        </button>
      </div>
    </div>
  )
}

// ── Post content form ──────────────────────────────────────────────────────
function PostForm({ wallet, onPosted }) {
  const [title, setTitle] = useState('')
  const [desc,  setDesc]  = useState('')
  const [hash,  setHash]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const txHash = await postContent(wallet, title, desc, hash)
      onPosted(txHash)
      setTitle(''); setDesc(''); setHash('')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      <div className="pf-title">POST NEW CONTENT</div>
      <div className="pf-field">
        <label>TITLE</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Article or content title" maxLength={80}
          required disabled={busy} />
      </div>
      <div className="pf-field">
        <label>DESCRIPTION (public preview)</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="What subscribers will get…" maxLength={200}
          rows={3} disabled={busy} />
      </div>
      <div className="pf-field">
        <label>CONTENT HASH (IPFS CID or any hash)</label>
        <input value={hash} onChange={e => setHash(e.target.value)}
          placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
          maxLength={100} required disabled={busy} />
        <span className="pf-hint">Only active subscribers can read this hash. Upload to IPFS via pinata.cloud or nft.storage first.</span>
      </div>
      {err && <p className="pf-err">{err}</p>}
      <button type="submit" className="btn-post"
        disabled={busy || !title || !hash}>
        {busy ? 'Posting…' : 'Post to Chain'}
      </button>
    </form>
  )
}

// ── Setup form ─────────────────────────────────────────────────────────────
function SetupForm({ wallet, onSetup }) {
  const [name,  setName]  = useState('')
  const [price, setPrice] = useState('5')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await setupChannel(wallet, name, parseFloat(price))
      onSetup()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-icon">🔐</div>
        <h2 className="setup-title">Set Up Your Channel</h2>
        <p className="setup-sub">Name your channel and set a monthly subscription price in XLM.</p>
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="pf-field">
            <label>CHANNEL NAME</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Your channel name" maxLength={80}
              required disabled={busy} />
          </div>
          <div className="pf-field">
            <label>PRICE PER MONTH (XLM)</label>
            <div className="price-presets">
              {['1','5','10','25','50'].map(p => (
                <button key={p} type="button"
                  className={`pp-btn ${price === p ? 'pp-active' : ''}`}
                  onClick={() => setPrice(p)}>{p}</button>
              ))}
            </div>
            <input type="number" min="0.1" step="0.1"
              value={price} onChange={e => setPrice(e.target.value)}
              className="price-custom" disabled={busy} />
            <span className="pf-unit">XLM/month</span>
          </div>
          {err && <p className="pf-err">{err}</p>}
          <button type="submit" className="btn-setup" disabled={busy || !name}>
            {busy ? 'Setting up…' : 'Launch Channel'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,       setWallet]       = useState(null)
  const [profile,      setProfile_]     = useState(null)
  const [contentMetas, setContentMetas] = useState([])
  const [contentCount, setContentCount] = useState(0)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [currentLedger,setCurrentLedger]= useState(0)
  const [loading,      setLoading]      = useState(true)
  const [toast,        setToast]        = useState(null)
  const [showSub,      setShowSub]      = useState(false)
  const [tab,          setTab]          = useState('content')
  const [needsSetup,   setNeedsSetup]   = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, count] = await Promise.all([getProfile(), getContentCount()])
      if (p) { setProfile_(p); setNeedsSetup(false) }
      else   { setNeedsSetup(true) }
      setContentCount(count)
      if (count > 0) {
        const ids = Array.from({ length: count }, (_, i) => i + 1)
        const metas = await Promise.allSettled(ids.map(id => getContentMeta(id)))
        setContentMetas(metas.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).reverse())
      }
      // Current ledger
      try {
        const resp = await fetch(
          (import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org').trim(),
          { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({jsonrpc:'2.0',id:1,method:'getLedgers',params:{limit:1}}) }
        ).then(r => r.json())
        if (resp.result?.ledgers?.[0]?.sequence) setCurrentLedger(resp.result.ledgers[0].sequence)
      } catch {}
    } catch {}
    setLoading(false)
  }

  const loadSubStatus = async (addr) => {
    const [isSub, sub] = await Promise.all([
      checkIsSubscribed(addr),
      getSubscription(addr),
    ])
    setIsSubscribed(isSub)
    setSubscription(sub)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (wallet) loadSubStatus(wallet) }, [wallet])

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleSubscribed = (hash) => {
    showToast(true, 'Subscribed! Content unlocked.', hash)
    setShowSub(false)
    if (wallet) loadSubStatus(wallet)
  }

  const handlePosted = (hash) => {
    showToast(true, 'Content posted on-chain!', hash)
    setTab('content')
    loadData()
  }

  const isOwner    = wallet && profile?.owner?.toString() === wallet
  const daysLeft   = subscription && currentLedger
    ? ledgersToTime(Number(subscription.expires_at) - currentLedger)
    : null

  if (needsSetup && wallet && CREATOR_ADDRESS === wallet) {
    return <SetupForm wallet={wallet} onSetup={loadData} />
  }

  return (
    <div className="app">
      {showSub && profile && (
        <SubscribePanel
          profile={profile}
          wallet={wallet}
          onSubscribed={handleSubscribed}
          onCancel={() => setShowSub(false)}
        />
      )}

      {/* ── Header ── */}
      <header className="header">
        <div className="brand">
          <div className="brand-lock">🔐</div>
          <div>
            <div className="brand-name">SubscribeX</div>
            <div className="brand-tag">on-chain paywall · stellar</div>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-btn ${tab === 'content' ? 'nav-active' : ''}`}
            onClick={() => setTab('content')}>
            Content
          </button>
          {isOwner && (
            <button className={`nav-btn ${tab === 'post' ? 'nav-active' : ''}`}
              onClick={() => setTab('post')}>
              + Post
            </button>
          )}
        </nav>

        <div className="header-right">
          {isSubscribed && daysLeft && (
            <div className="sub-badge">
              <span className="sub-badge-dot" />
              Subscribed · {daysLeft} left
            </div>
          )}
          {wallet
            ? <div className="wallet-pill"><span className="wdot" />{short(wallet)}</div>
            : <button className="btn-connect" onClick={handleConnect}>Connect Wallet</button>
          }
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      <main className="main">
        {/* ── Channel hero ── */}
        {profile && (
          <div className="channel-hero">
            <div className="ch-avatar">
              {profile.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="ch-info">
              <h1 className="ch-name">{profile.name}</h1>
              <div className="ch-meta">
                <span>{contentCount} posts</span>
                <span className="ch-dot">·</span>
                <span>{profile.subscriber_count?.toString()} subscribers</span>
                <span className="ch-dot">·</span>
                <span>{xlm(profile.price_per_month)} XLM/month</span>
              </div>
            </div>
            {!isOwner && (
              <div className="ch-cta">
                {isSubscribed ? (
                  <div className="ch-subscribed">✓ Subscribed</div>
                ) : (
                  <button className="btn-subscribe"
                    onClick={() => wallet ? setShowSub(true) : handleConnect()}>
                    {wallet ? `Subscribe · ${xlm(profile.price_per_month)} XLM/mo` : 'Connect to Subscribe'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Content tab ── */}
        {tab === 'content' && (
          loading ? (
            <div className="content-grid">
              {[1,2,3].map(i => <div key={i} className="content-skeleton" />)}
            </div>
          ) : contentMetas.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">📄</div>
              <p>No content posted yet.</p>
              {isOwner && <button className="btn-post-first" onClick={() => setTab('post')}>Post first content</button>}
            </div>
          ) : (
            <div className="content-grid">
              {contentMetas.map(meta => (
                <ContentCard
                  key={meta.id?.toString()}
                  meta={meta}
                  isSubscribed={isSubscribed}
                  wallet={wallet}
                  onReveal={showToast}
                />
              ))}
            </div>
          )
        )}

        {/* ── Post tab ── */}
        {tab === 'post' && isOwner && (
          <div className="post-wrap">
            <PostForm wallet={wallet} onPosted={handlePosted} />
          </div>
        )}
      </main>

      <footer className="footer">
        <span>SubscribeX · Stellar Testnet · Soroban</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </footer>
    </div>
  )
}
