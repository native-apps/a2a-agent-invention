// ---------------------------------------------------------------------------
// Knick — the NEAR Neighbors Network discovery agent. "Go Knick Knocking!"
// ---------------------------------------------------------------------------
// Pure matching engine (no React, no RPC). A Knick Knock run crawls the
// onchain registry + the network's PUBLISHED curator lists against the
// owner's ENABLED goals and lands matches in a separate DISCOVERED pool.
//
// THE HARD RULE (v1.2.211 guardrail): discovered ≠ approved. The pool is
// CRM-visible and suggestible, but NEVER mentionable by the agent until the
// owner tags a neighbor into a list — neighbors_search reads ONLY published
// onchain lists, so the discovered pool is invisible to the agent by
// construction. No guardrail code needed here; the architecture enforces it.
//
// Scoring is deterministic and explainable — every match carries the reasons:
//   +3  strong — a neighbor tag or capability token matches a goal #tag/word
//        (capped at 9 per goal)
//   +1  weak   — a goal keyword appears in the neighbor's name/description/
//        category (capped at 5 per goal)
//   +2  network signal — the neighbor sits on another curator's PUBLISHED
//        list (capped at +6): discovery THROUGH other neighbors, the "crawl"
//   ≥3  threshold to become a discovery
// ---------------------------------------------------------------------------

export interface KnickCandidate {
  account?: string;
  name: string;
  domain: string;
  description?: string;
  tags?: string[];
  category?: string;
  capabilities?: string[];
  status: number; // 0 = active, 1 = paused (opted out — never discovered)
}

export interface KnickGoalInput {
  id: string;
  title: string;
  body: string; // markdown — the intent brief
}

/** What a run produces per neighbor (before timestamps are stamped). */
export interface KnickMatch {
  domain: string;
  score: number;
  reasons: string[]; // human-readable, explainable — shown on the card
  matchedGoals: string[]; // goal titles that hit
  listedBy: string[]; // curator accounts whose published lists include them
}

/** A stamped discovery — what actually lands in the owner's pool (prefs). */
export interface KnickDiscovery extends KnickMatch {
  discoveredAt: string; // ISO — first time Knick found them
  updatedAt: string; // ISO — last run that matched them (sort key)
  // Registry snapshot at discovery time — the Discovery List renders from
  // these without re-reading the chain (future PGrust/Postgres store shape).
  name?: string;
  tags?: string[];
  capabilities?: string[];
  category?: string;
  // Relay discoveries (SOP Doctrine & Relays §5): set when a network relay
  // — not a Knick run — surfaced this neighbor. Renders a "vouched by" badge.
  vouchedBy?: string;
}

export interface KnickRunSummary {
  matches: KnickMatch[]; // sorted best-first
  considered: number; // active, non-known candidates scored
  skippedKnown: number; // favorites/watched/tagged/dismissed/self
}

// Compact stopword list — goal boilerplate words carry no search signal.
const STOPWORDS = new Set(
  (
    "a an the and or but for with to of in on at by from up about into over " +
    "after is are was were be been being have has had do does did will " +
    "would should could can may might must shall our we us you your they " +
    "them their this that these those it its as if then than so not no yes " +
    "more most other some any each few all both get got make made want " +
    "wants find finding looking seek seeking need needs new also out who " +
    "what when where why how via per one two use using help helps goal " +
    "goals business"
  ).split(" "),
);

/** Goal text → search words (lowercase, ≥3 chars, stopwords dropped). */
function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*[a-z0-9]*/g) || [];
  for (const raw of matches) {
    const t = raw.replace(/^[-.]+|[-.]+$/g, "");
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/** Explicit #tags in a goal — matched exactly against neighbor tags/caps. */
function hashTagsOf(text: string): Set<string> {
  const out = new Set<string>();
  const matches = text.toLowerCase().match(/#([a-z0-9-]+)/g) || [];
  for (const m of matches) out.add(m.slice(1));
  return out;
}

interface ParsedGoal {
  title: string;
  tags: Set<string>;
  words: Set<string>;
}

/** Tag/capability normalization: "AI-Memory" → {"ai","memory"} (≥2 chars). */
function tokenSet(items: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const item of items || []) {
    for (const t of item.toLowerCase().split(/[-_/\s]+/)) {
      if (t.length >= 2) out.add(t);
    }
  }
  return out;
}

/**
 * Go Knick Knocking — score every active, not-yet-known candidate against
 * the enabled goals. Pure: same inputs → same discoveries, no IO, no clock.
 */
export function knockKnock(opts: {
  candidates: KnickCandidate[];
  goals: KnickGoalInput[];
  /** favorites/watched/tagged/dismissed/self — skipped entirely. */
  knownDomains: Set<string>;
  /** domain → curator accounts whose published lists include that domain. */
  listedBy: Map<string, string[]>;
}): KnickRunSummary {
  const parsedGoals: ParsedGoal[] = [];
  for (const g of opts.goals) {
    const text = `${g.title || ""}\n${g.body || ""}`;
    const tags = hashTagsOf(text);
    const words = wordsOf(text);
    if (tags.size || words.size) parsedGoals.push({ title: g.title || "Goal", tags, words });
  }

  const matches: KnickMatch[] = [];
  let considered = 0;
  let skippedKnown = 0;

  for (const c of opts.candidates) {
    if (!c.domain) continue;
    if (c.status !== 0) continue; // paused neighbors opted out of discovery
    if (opts.knownDomains.has(c.domain)) {
      skippedKnown += 1;
      continue;
    }
    considered += 1;

    let score = 0;
    const reasons: string[] = [];
    const matchedTitles = new Set<string>();

    const tagTokens = tokenSet(c.tags);
    const capTokens = tokenSet(c.capabilities);
    const hay = `${c.name || ""} ${c.description || ""} ${c.category || ""}`.toLowerCase();

    for (const g of parsedGoals) {
      let gs = 0;
      const strong: string[] = [];

      for (const t of tagTokens) {
        if (g.tags.has(t) || g.words.has(t)) {
          gs += 3;
          strong.push(`tag '${t}'`);
        }
      }
      for (const t of capTokens) {
        if (g.tags.has(t) || g.words.has(t)) {
          gs += 3;
          strong.push(`capability '${t}'`);
        }
      }
      if (gs > 9) gs = 9; // per-goal strong cap

      let weak = 0;
      const weakHits: string[] = [];
      for (const w of g.words) {
        if (hay.includes(w)) {
          weak += 1;
          weakHits.push(w);
          if (weak >= 5) break;
        }
      }
      gs += Math.min(weak, 5);

      if (gs > 0) {
        matchedTitles.add(g.title);
        if (strong.length)
          reasons.push(`${strong.slice(0, 2).join(" · ")} ⇢ ${g.title}`);
        if (weakHits.length)
          reasons.push(
            `keywords ${weakHits.slice(0, 3).map((w) => `'${w}'`).join(", ")} ⇢ ${g.title}`,
          );
      }
      score += gs;
    }

    // Network signal: discovered THROUGH other neighbors' published lists.
    const lst = opts.listedBy.get(c.domain) || [];
    if (lst.length) {
      score += Math.min(6, lst.length * 2);
      reasons.push(`on ${lst.length} published list(s) — approved by other curators`);
    }

    if (score >= 3) {
      matches.push({
        domain: c.domain,
        score,
        reasons: Array.from(new Set(reasons)).slice(0, 6),
        matchedGoals: Array.from(matchedTitles),
        listedBy: lst,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
  return { matches, considered, skippedKnown };
}
