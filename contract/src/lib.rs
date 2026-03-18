#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_TITLE:    u32 = 80;
const MAX_HASH:     u32 = 100;   // IPFS CID or any content hash
const MAX_DESC:     u32 = 200;
const MAX_CONTENT:  u32 = 20;    // max content items per creator

// Subscription duration: 17,280 ledgers ≈ 1 day (5s/ledger)
// Monthly ≈ 518,400 ledgers
const MONTH_LEDGERS: u32 = 518_400;

#[contracttype]
#[derive(Clone)]
pub struct ContentItem {
    pub id:          u32,
    pub title:       String,
    pub description: String,
    pub hash:        String,    // IPFS CID or content hash — only visible to subscribers
    pub added_at:    u32,       // ledger sequence
}

#[contracttype]
#[derive(Clone)]
pub struct CreatorProfile {
    pub owner:           Address,
    pub name:            String,
    pub price_per_month: i128,   // XLM in stroops
    pub subscriber_count: u32,
    pub total_earned:    i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Subscription {
    pub subscriber:  Address,
    pub expires_at:  u32,       // ledger sequence
    pub last_paid:   u32,
}

#[contracttype]
pub enum DataKey {
    Profile,
    Content(u32),      // content_id → ContentItem
    ContentCount,
    Sub(Address),      // subscriber_address → Subscription
    SubCount,
}

#[contract]
pub struct SubscribeXContract;

#[contractimpl]
impl SubscribeXContract {
    /// Creator sets up their channel
    pub fn setup(
        env: Env,
        owner: Address,
        name: String,
        price_per_month: i128,
    ) {
        owner.require_auth();
        assert!(name.len() > 0 && name.len() <= MAX_TITLE, "Name 1–80 chars");
        assert!(price_per_month >= 1_000_000, "Min price 0.1 XLM/month");

        if let Some(existing) = env.storage().instance()
            .get::<DataKey, CreatorProfile>(&DataKey::Profile)
        {
            assert!(existing.owner == owner, "Not the owner");
        }

        let profile = CreatorProfile {
            owner,
            name,
            price_per_month,
            subscriber_count: 0,
            total_earned: 0,
        };
        env.storage().instance().set(&DataKey::Profile, &profile);
    }

    /// Creator posts a new content item (title + hash)
    pub fn post_content(
        env: Env,
        owner: Address,
        title: String,
        description: String,
        hash: String,
    ) -> u32 {
        owner.require_auth();
        assert!(title.len() > 0 && title.len() <= MAX_TITLE, "Title too long");
        assert!(description.len() <= MAX_DESC, "Desc too long");
        assert!(hash.len() > 0 && hash.len() <= MAX_HASH, "Hash required");

        let profile: CreatorProfile = env.storage().instance()
            .get(&DataKey::Profile).expect("Not set up");
        assert!(profile.owner == owner, "Not the owner");

        let count: u32 = env.storage().instance()
            .get(&DataKey::ContentCount).unwrap_or(0u32);
        assert!(count < MAX_CONTENT, "Content limit reached");
        let id = count + 1;

        let item = ContentItem {
            id,
            title,
            description,
            hash,
            added_at: env.ledger().sequence(),
        };
        env.storage().persistent().set(&DataKey::Content(id), &item);
        env.storage().instance().set(&DataKey::ContentCount, &id);
        env.events().publish((symbol_short!("posted"),), (id, owner));
        id
    }

    /// Subscriber pays for N months of access
    pub fn subscribe(
        env: Env,
        subscriber: Address,
        months: u32,
        xlm_token: Address,
    ) {
        subscriber.require_auth();
        assert!(months >= 1 && months <= 12, "1–12 months");

        let mut profile: CreatorProfile = env.storage().instance()
            .get(&DataKey::Profile).expect("Not set up");
        assert!(profile.owner != subscriber, "Owner cannot subscribe");

        let total_cost = profile.price_per_month * months as i128;
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&subscriber, &env.current_contract_address(), &total_cost);

        // Extend or create subscription
        let current = env.ledger().sequence();
        let duration = MONTH_LEDGERS * months;

        let new_expires = if let Some(existing) = env.storage().persistent()
            .get::<DataKey, Subscription>(&DataKey::Sub(subscriber.clone()))
        {
            // Extend from current expiry if still active, else from now
            let base = if existing.expires_at > current { existing.expires_at } else { current };
            base + duration
        } else {
            profile.subscriber_count += 1;
            current + duration
        };

        let sub = Subscription {
            subscriber: subscriber.clone(),
            expires_at: new_expires,
            last_paid: current,
        };
        env.storage().persistent().set(&DataKey::Sub(subscriber.clone()), &sub);

        // Immediately pay the creator
        token_client.transfer(&env.current_contract_address(), &profile.owner, &total_cost);

        profile.total_earned += total_cost;
        env.storage().instance().set(&DataKey::Profile, &profile);

        env.events().publish(
            (symbol_short!("subbed"),),
            (subscriber, months, new_expires),
        );
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_profile(env: Env) -> CreatorProfile {
        env.storage().instance().get(&DataKey::Profile).expect("Not set up")
    }

    /// Get content metadata (title + desc) — available to anyone
    pub fn get_content_meta(env: Env, content_id: u32) -> ContentItem {
        let mut item: ContentItem = env.storage().persistent()
            .get(&DataKey::Content(content_id)).expect("Not found");
        // Redact hash for non-subscribers
        item.hash = String::from_str(&env, "[subscribe to unlock]");
        item
    }

    /// Get full content including hash — only for active subscribers
    pub fn get_content(env: Env, subscriber: Address, content_id: u32) -> ContentItem {
        let sub: Subscription = env.storage().persistent()
            .get(&DataKey::Sub(subscriber.clone())).expect("No subscription");
        assert!(
            sub.expires_at >= env.ledger().sequence(),
            "Subscription expired"
        );
        env.storage().persistent()
            .get(&DataKey::Content(content_id)).expect("Not found")
    }

    pub fn get_subscription(env: Env, subscriber: Address) -> Option<Subscription> {
        env.storage().persistent().get(&DataKey::Sub(subscriber))
    }

    pub fn is_subscribed(env: Env, subscriber: Address) -> bool {
        if let Some(sub) = env.storage().persistent()
            .get::<DataKey, Subscription>(&DataKey::Sub(subscriber))
        {
            sub.expires_at >= env.ledger().sequence()
        } else {
            false
        }
    }

    pub fn content_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::ContentCount).unwrap_or(0)
    }
}
