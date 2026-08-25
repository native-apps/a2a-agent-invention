//! # neighborly — NEAR Neighbors Registry
//!
//! The onchain phone book for A2A agents. Deliberately DUMB and
//! tamper-proof: entries + curated lists + heartbeats. No messaging, no
//! matching logic onchain — everything clever (search, ranking, spidering)
//! happens client-side where iteration is free.
//!
//! Design rules (docs/Neighbors-Feature-Plan.md — Step 1 spec):
//! - **Zero admin powers.** No owner methods, no pause, no delete-others.
//!   Upgrades = redeploy contract code to the account (needs the account's
//!   own key — the multisig/DAO path from fork F6).
//! - **Signer-scoped writes.** `env::predecessor_account_id()` is the only
//!   authority. The deployer can never edit someone else's entry.
//! - **Storage staking.** `register` requires a small deposit; `unregister`
//!   refunds it exactly.
//! - One agent entry per NEAR account. Curated lists per curator account
//!   with partner tiers (0 = listed, 1 = partner → unlocks richer knock
//!   skills at the target agent's discretion).

use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{UnorderedMap, Vector};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

// ============================================
// Constants & limits
// ============================================

/// Minimum deposit to register (0.01 Ⓝ), in yoctoNEAR. An entry is
/// ~500-800 bytes and storage stakes 100 KB per Ⓝ, so this covers the
/// entry with headroom.
pub const MIN_REGISTER_DEPOSIT_YOCTO: u128 = 10_000_000_000_000_000_000_000; // 0.01Ⓝ

/// Max members per curated list (MVP cap — raise via redeploy if needed).
pub const MAX_LIST_SIZE: u32 = 100;

// Field length limits (bytes) — keep state small and spam unattractive.
const MAX_NAME: usize = 64;
const MAX_DOMAIN: usize = 100;
const MAX_URL: usize = 200;
const MAX_DESCRIPTION: usize = 500;
const MAX_PARTNER_NOTE: usize = 200;
const MAX_CATEGORY: usize = 32;
const MAX_TAG_LEN: usize = 32;
const MAX_TAGS: usize = 8;
const MAX_CAP_LEN: usize = 40;
const MAX_CAPS: usize = 8;

pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_PAUSED: u8 = 1;

pub const TIER_LISTED: u8 = 0;
pub const TIER_PARTNER: u8 = 1;

// ============================================
// Types
// ============================================

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentEntry {
    pub name: String,
    pub domain: String,
    /// Full base URL of the agent endpoint, wherever it lives
    /// (subdomain or path — senders read this, never guess conventions).
    pub agent_url: String,
    pub website_url: String,
    pub description: String,
    pub tags: Vec<String>,
    pub category: String,
    /// Structed capability labels for matching ("ai-memory",
    /// "agent-deploy", "website-builder") — the "I need an app for X" feed.
    pub capabilities: Vec<String>,
    /// STATUS_ACTIVE | STATUS_PAUSED
    pub status: u8,
    /// ≤ 200 chars: how to partner with us (referrals, deals, co-content).
    pub partner_note: String,
    pub last_heartbeat: u64,
    pub registered_at: u64,
    pub updated_at: u64,
}

/// Flattened view output: { account, ...entry }
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentOut {
    pub account: AccountId,
    #[serde(flatten)]
    pub entry: AgentEntry,
}

/// Curated-list row output: the member + their partner tier on this list.
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct ListRowOut {
    pub account: AccountId,
    /// TIER_LISTED | TIER_PARTNER
    pub tier: u8,
    #[serde(flatten)]
    pub entry: AgentEntry,
}

/// Patch for `update` — every field optional; only Some fields change.
#[derive(Serialize, Deserialize, Default)]
#[serde(crate = "near_sdk::serde")]
pub struct EntryPatch {
    pub name: Option<String>,
    pub domain: Option<String>,
    pub agent_url: Option<String>,
    pub website_url: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub capabilities: Option<Vec<String>>,
    pub partner_note: Option<String>,
}

// ============================================
// Contract
// ============================================

#[near(contract_state)]
pub struct Contract {
    /// account → entry (the signer IS the owner)
    pub agents: UnorderedMap<AccountId, AgentEntry>,
    /// Registration order for stable pagination
    pub accounts: Vector<AccountId>,
    /// curator → member accounts (curated lists: "partners we like")
    pub lists: UnorderedMap<AccountId, Vec<AccountId>>,
    /// "{curator}:{member}" → partner tier
    pub list_meta: UnorderedMap<String, u8>,
}

// near-sdk requires Default on the contract state (fresh-state case).
// Delegate to the same construction as `new()` so both paths agree.
impl Default for Contract {
    fn default() -> Self {
        Self::new()
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            agents: UnorderedMap::new(b"a"),
            accounts: Vector::new(b"o"),
            lists: UnorderedMap::new(b"l"),
            list_meta: UnorderedMap::new(b"m"),
        }
    }

    // ── Registration ──────────────────────────────────────────────

    /// Register the calling account's agent. Requires 0.01Ⓝ attached
    /// (refunded on unregister). One entry per account.
    #[payable]
    pub fn register(
        &mut self,
        name: String,
        domain: String,
        agent_url: String,
        website_url: String,
        description: String,
        tags: Vec<String>,
        category: String,
        capabilities: Vec<String>,
        partner_note: String,
    ) -> AgentEntry {
        let account = env::predecessor_account_id();
        require!(
            env::attached_deposit().as_yoctonear() >= MIN_REGISTER_DEPOSIT_YOCTO,
            "Attach at least 0.01 NEAR to cover storage staking"
        );
        require!(
            self.agents.get(&account).is_none(),
            "Account already registered — use update()"
        );

        let entry = AgentEntry {
            name: valid_str(&name, MAX_NAME, "name"),
            domain: valid_str(&domain, MAX_DOMAIN, "domain"),
            agent_url: valid_str(&agent_url, MAX_URL, "agent_url"),
            website_url: valid_str(&website_url, MAX_URL, "website_url"),
            description: valid_str(&description, MAX_DESCRIPTION, "description"),
            tags: valid_tags(tags, MAX_TAGS, MAX_TAG_LEN),
            category: valid_str(&category, MAX_CATEGORY, "category"),
            capabilities: valid_tags(capabilities, MAX_CAPS, MAX_CAP_LEN),
            status: STATUS_ACTIVE,
            partner_note: valid_str_or_empty(&partner_note, MAX_PARTNER_NOTE),
            last_heartbeat: env::block_timestamp(),
            registered_at: env::block_timestamp(),
            updated_at: env::block_timestamp(),
        };

        self.agents.insert(&account, &entry);
        self.accounts.push(&account);
        env::log_str(&format!(
            "EVENT register {} {} {}",
            account, entry.domain, entry.name
        ));
        entry
    }

    /// Update the calling account's entry (owner only — enforced by
    /// keying on the signer). Designed for scoped function-call access
    /// keys: agents can maintain their own entry without fund access.
    pub fn update(&mut self, patch: EntryPatch) -> AgentEntry {
        let account = env::predecessor_account_id();
        let mut entry = self
            .agents
            .get(&account)
            .expect("Not registered — call register() first");

        if let Some(v) = patch.name {
            entry.name = valid_str(&v, MAX_NAME, "name");
        }
        if let Some(v) = patch.domain {
            entry.domain = valid_str(&v, MAX_DOMAIN, "domain");
        }
        if let Some(v) = patch.agent_url {
            entry.agent_url = valid_str(&v, MAX_URL, "agent_url");
        }
        if let Some(v) = patch.website_url {
            entry.website_url = valid_str(&v, MAX_URL, "website_url");
        }
        if let Some(v) = patch.description {
            entry.description = valid_str(&v, MAX_DESCRIPTION, "description");
        }
        if let Some(v) = patch.tags {
            entry.tags = valid_tags(v, MAX_TAGS, MAX_TAG_LEN);
        }
        if let Some(v) = patch.category {
            entry.category = valid_str(&v, MAX_CATEGORY, "category");
        }
        if let Some(v) = patch.capabilities {
            entry.capabilities = valid_tags(v, MAX_CAPS, MAX_CAP_LEN);
        }
        if let Some(v) = patch.partner_note {
            entry.partner_note = valid_str_or_empty(&v, MAX_PARTNER_NOTE);
        }
        entry.updated_at = env::block_timestamp();
        self.agents.insert(&account, &entry);
        env::log_str(&format!("EVENT update {}", account));
        entry
    }

    /// Remove the calling account's entry and refund the storage deposit.
    pub fn unregister(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        require!(self.agents.get(&account).is_some(), "Not registered");

        self.agents.remove(&account);
        // Remove from the ordering vector (O(n) scan; n is small MVP-scale).
        if let Some(i) = self.accounts.iter().position(|a| a == account) {
            self.accounts.swap_remove(i as u64);
        }
        // Curators keep their lists; references to unregistered accounts
        // resolve to "gone" in get_list.

        env::log_str(&format!("EVENT unregister {}", account));
        // Refund the minimum deposit to the owner.
        Promise::new(account).transfer(NearToken::from_yoctonear(MIN_REGISTER_DEPOSIT_YOCTO))
    }

    /// Cheap liveness ping (≈0.001Ⓝ gas). Callable by the owner — which
    /// includes a scoped function-call key held by the agent's worker.
    pub fn heartbeat(&mut self, status: Option<u8>) {
        let account = env::predecessor_account_id();
        let mut entry = self
            .agents
            .get(&account)
            .expect("Not registered — call register() first");
        if let Some(s) = status {
            require!(
                s <= STATUS_PAUSED,
                "status must be 0 (active) or 1 (paused)"
            );
            entry.status = s;
        }
        entry.last_heartbeat = env::block_timestamp();
        self.agents.insert(&account, &entry);
        env::log_str(&format!("EVENT heartbeat {} {}", account, entry.status));
    }

    // ── Curated lists ─────────────────────────────────────────────

    /// Add a registered agent to the CALLER's list ("partners we like").
    pub fn add_to_list(&mut self, account: AccountId) {
        let curator = env::predecessor_account_id();
        require!(
            self.agents.get(&account).is_some(),
            "That account has no registered agent"
        );
        let mut list = self.lists.get(&curator).unwrap_or_default();
        require!(list.len() < MAX_LIST_SIZE as usize, "List is full (100)");
        require!(!list.contains(&account), "Already on the list");
        list.push(account.clone());
        self.lists.insert(&curator, &list);
        let meta_key = format!("{}:{}", curator, account);
        self.list_meta.insert(&meta_key, &TIER_LISTED);
        env::log_str(&format!("EVENT list_add {} {}", curator, account));
    }

    pub fn remove_from_list(&mut self, account: AccountId) {
        let curator = env::predecessor_account_id();
        let mut list = self.lists.get(&curator).unwrap_or_default();
        if let Some(i) = list.iter().position(|a| *a == account) {
            list.swap_remove(i);
            self.lists.insert(&curator, &list);
            let meta_key = format!("{}:{}", curator, account);
            self.list_meta.remove(&meta_key);
            env::log_str(&format!("EVENT list_remove {} {}", curator, account));
        }
    }

    /// Set a member's tier on the CALLER's list. Tier 1 (partner) is the
    /// curator's approval — target agents can unlock richer knock skills
    /// for accounts flagged as partners on the curator's list.
    pub fn set_partner(&mut self, account: AccountId, tier: u8) {
        let curator = env::predecessor_account_id();
        require!(
            tier <= TIER_PARTNER,
            "tier must be 0 (listed) or 1 (partner)"
        );
        let list = self.lists.get(&curator).unwrap_or_default();
        require!(
            list.contains(&account),
            "Not on the list — add_to_list first"
        );
        let meta_key = format!("{}:{}", curator, account);
        self.list_meta.insert(&meta_key, &tier);
        env::log_str(&format!(
            "EVENT set_partner {} {} {}",
            curator, account, tier
        ));
    }

    // ── Views (FREE public RPC reads) ─────────────────────────────

    /// Paginate the registry in registration order. Client-side filters
    /// on tags/capabilities (entries are small; cache + filter is the
    /// intended pattern at MVP scale).
    pub fn get_agents(&self, from_index: u64, limit: u64) -> Vec<AgentOut> {
        let total = self.accounts.len();
        let mut out = Vec::new();
        let mut i = from_index;
        while i < total && out.len() < limit as usize {
            if let Some(account) = self.accounts.get(i) {
                if let Some(entry) = self.agents.get(&account) {
                    out.push(AgentOut { account, entry });
                }
            }
            i += 1;
        }
        out
    }

    pub fn get_agent(&self, account: AccountId) -> Option<AgentEntry> {
        self.agents.get(&account)
    }

    /// A curator's list with partner tiers — the "subscription feed"
    /// any site can render. References to unregistered accounts are
    /// skipped (their entries are gone).
    pub fn get_list(&self, curator: AccountId) -> Vec<ListRowOut> {
        let list = self.lists.get(&curator).unwrap_or_default();
        list.into_iter()
            .filter_map(|account| {
                self.agents.get(&account).map(|entry| ListRowOut {
                    tier: self
                        .list_meta
                        .get(&format!("{}:{}", curator, account))
                        .unwrap_or(TIER_LISTED),
                    account,
                    entry,
                })
            })
            .collect()
    }

    /// Counts for UI dashboards.
    pub fn get_stats(&self) -> (u64, u64) {
        (self.accounts.len(), self.lists.len())
    }
}

// ============================================
// Validation helpers
// ============================================

fn valid_str(v: &str, max: usize, field: &str) -> String {
    let trimmed = v.trim();
    require!(
        !trimmed.is_empty() && trimmed.len() <= max,
        format!("{} must be 1-{} bytes", field, max)
    );
    trimmed.to_string()
}

fn valid_str_or_empty(v: &str, max: usize) -> String {
    let trimmed = v.trim();
    require!(
        trimmed.len() <= max,
        format!("field must be ≤ {} bytes", max)
    );
    trimmed.to_string()
}

fn valid_tags(tags: Vec<String>, max_count: usize, max_len: usize) -> Vec<String> {
    require!(
        tags.len() <= max_count,
        format!("at most {} items", max_count)
    );
    tags.into_iter()
        .map(|t| {
            let t = t.trim().to_lowercase();
            require!(
                !t.is_empty() && t.len() <= max_len,
                format!("each item must be 1-{} bytes", max_len)
            );
            t
        })
        .collect()
}

// `require!` macro from the SDK (used by the helpers above).

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ALICE: &str = "alice.near";
    const BOB: &str = "bob.near";
    const CAROL: &str = "carol.near";

    fn ctx(account: &str, deposit_yocto: u128) -> near_sdk::VMContext {
        VMContextBuilder::new()
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .build()
    }

    fn fresh_contract() -> Contract {
        testing_env!(ctx(ALICE, 0));
        Contract::new()
    }

    fn sample_args() -> (
        String,
        String,
        String,
        String,
        String,
        Vec<String>,
        String,
        Vec<String>,
        String,
    ) {
        (
            "Mother Brain".into(),
            "motherbrain.app".into(),
            "https://a2a.motherbrain.app".into(),
            "https://motherbrain.app".into(),
            "The memory engine for AI agents.".into(),
            vec!["ai".into(), "devtools".into()],
            "startup".into(),
            vec!["ai-memory".into(), "agent-deploy".into()],
            "Open to referrals.".into(),
        )
    }

    /// Register with the sample args (tuples don't auto-splat into fn args).
    fn do_register(c: &mut Contract) {
        let (
            name,
            domain,
            agent_url,
            website_url,
            description,
            tags,
            category,
            capabilities,
            partner_note,
        ) = sample_args();
        c.register(
            name,
            domain,
            agent_url,
            website_url,
            description,
            tags,
            category,
            capabilities,
            partner_note,
        );
    }

    #[test]
    fn register_and_get_agent() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);

        testing_env!(ctx(BOB, 0));
        let got = c.get_agent(ALICE.parse().unwrap());
        assert!(got.is_some());
        assert_eq!(got.unwrap().capabilities, vec!["ai-memory", "agent-deploy"]);
        let agents = c.get_agents(0, 10);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].account.to_string(), ALICE);
    }

    #[test]
    #[should_panic(expected = "Attach at least 0.01 NEAR")]
    fn register_requires_deposit() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, 0));
        do_register(&mut c);
    }

    #[test]
    #[should_panic(expected = "already registered")]
    fn double_register_panics() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);
    }

    #[test]
    fn update_and_heartbeat_by_owner() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);

        testing_env!(ctx(ALICE, 0));
        let patch = EntryPatch {
            description: Some("Updated description.".into()),
            tags: Some(vec!["saas".into()]),
            ..Default::default()
        };
        let e = c.update(patch);
        assert_eq!(e.description, "Updated description.");
        assert_eq!(e.tags, vec!["saas"]);

        c.heartbeat(Some(STATUS_PAUSED));
        let e = c.get_agent(ALICE.parse().unwrap()).unwrap();
        assert_eq!(e.status, STATUS_PAUSED);
    }

    #[test]
    #[should_panic(expected = "Not registered")]
    fn update_by_stranger_panics() {
        let mut c = fresh_contract();
        testing_env!(ctx(BOB, 0));
        c.update(EntryPatch::default());
    }

    #[test]
    fn lists_and_partner_tiers() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);
        testing_env!(ctx(BOB, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);
        testing_env!(ctx(CAROL, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);

        // Alice curates: lists Bob (listed) and Carol (partner)
        testing_env!(ctx(ALICE, 0));
        c.add_to_list(BOB.parse().unwrap());
        c.add_to_list(CAROL.parse().unwrap());
        c.set_partner(CAROL.parse().unwrap(), TIER_PARTNER);

        let rows = c.get_list(ALICE.parse().unwrap());
        assert_eq!(rows.len(), 2);
        let carol_row = rows
            .iter()
            .find(|r| r.account.to_string() == CAROL)
            .unwrap();
        assert_eq!(carol_row.tier, TIER_PARTNER);
        let bob_row = rows.iter().find(|r| r.account.to_string() == BOB).unwrap();
        assert_eq!(bob_row.tier, TIER_LISTED);

        // Remove works
        c.remove_from_list(BOB.parse().unwrap());
        let rows = c.get_list(ALICE.parse().unwrap());
        assert_eq!(rows.len(), 1);

        let (agents, lists) = c.get_stats();
        assert_eq!(agents, 3);
        assert_eq!(lists, 1);
    }

    #[test]
    fn unregister_removes_entry() {
        let mut c = fresh_contract();
        testing_env!(ctx(ALICE, MIN_REGISTER_DEPOSIT_YOCTO));
        do_register(&mut c);

        testing_env!(ctx(ALICE, 0));
        c.unregister();
        testing_env!(ctx(BOB, 0));
        assert!(c.get_agent(ALICE.parse().unwrap()).is_none());
        assert_eq!(c.get_agents(0, 10).len(), 0);
    }
}
