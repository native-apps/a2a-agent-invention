# Agent URL Strategy

**Purpose:** How the A2A Agent discovers, verifies, and uses real website URLs — so it never hallucinates fake links or uses the wrong domain.

**Core Principle:** URLs must be **discovered dynamically** at runtime, never hardcoded in the Worker. Hardcoded URLs in the knowledge base mean a redeploy every time a page changes — unacceptable.

---

## 1. The Problem

The AI generates links like `a2a.yourdomain.com/features` instead of `motherbrain.app/features`. The agent's system prompt says "I live at `a2a.yourdomain.com`" and the AI uses that as the base for ALL links. The agent needs to know:

- **Website domain** (for page links): `motherbrain.app`
- **Agent endpoint** (for protocol references): `a2a.yourdomain.com`
- **What pages actually exist** (so it never links to `/nonexistent-page`)

---

## 2. URL Discovery Methods (by website type)

### Method A: Encore API / Website MCP (Database-Driven Sites)

**Best for:** Sites with a CMS/backend that stores pages in a database (e.g., motherbrain.app via Encore).

**How it works:**
- `website.list_pages` → returns all public page slugs and titles
- `website.read_page` → returns full page content by slug
- `website.navigate` → generates a clickable link for a known route

**The agent should:**
1. Call `website.list_pages` at conversation start to discover available pages
2. Use `website.read_page` to verify a page exists before linking to it
3. Use `website.navigate` to generate links (it returns absolute URLs with the correct domain)

**Status:** ✅ Already implemented. The 13 website MCP tools are wired up in `website-mcp.ts`.

**Limitation:** Only works for Encore-backed sites. Most users won't have Encore.

---

### Method B: Firecrawl (Static / Unknown Sites)

**Best for:** Static websites, SPAs, or sites without a CMS API.

**How it works:**
- `firecrawl_map` → discovers all URLs on a site
- `firecrawl_scrape` → reads page content
- `firecrawl_search` → searches for specific content

**The agent should:**
1. Use Firecrawl to crawl the website and build an in-memory URL map
2. Verify links exist before generating them
3. Cache results to avoid re-crawling on every request

**Implementation considerations:**
- Firecrawl API key required (per-user setting)
- Crawl results could be cached in Supabase (avoids re-crawling)
- Rate limits and crawl budgets need consideration
- Not real-time — pages added between crawls won't be known

---

### Method C: Sitemap Parsing

**Best for:** Any site with a `sitemap.xml` (most CMS platforms auto-generate these).

**How it works:**
- Fetch `{WEBSITE_URL}/sitemap.xml`
- Parse XML to extract all URLs
- Cache the URL list

**The agent should:**
1. Fetch and parse the sitemap periodically (not on every request)
2. Use it as a known-URL whitelist
3. Only link to URLs found in the sitemap

**Implementation considerations:**
- Sitemaps aren't always complete (some pages may be excluded)
- Sitemaps can be large (need pagination support for sitemap indexes)
- Cache TTL: daily refresh is usually sufficient

---

### Method D: Knowledge Base Front Matter (Manual / Curated)

**Best for:** Important pages that should ALWAYS be known, regardless of discovery method.

**How it works:**
- Markdown files in the project's knowledge base include YAML front matter with URLs
- The knowledge packer extracts these and bakes them into the Worker

**Example:**
```markdown
---
urls:
  - https://motherbrain.app/features
  - https://motherbrain.app/pricing
  - https://motherbrain.app/docs
---
# Page Title
```

**Limitation:** Requires redeploy when URLs change. Only for curated/critical pages.

---

## 3. Canonical Base URL

The `WEBSITE_URL` setting in the Settings UI is the **single source of truth** for the website's base domain.

| Setting | Value | Purpose |
|---------|-------|---------|
| `WEBSITE_URL` | `https://motherbrain.app` | Base URL for all website page links |
| `AGENT_URL` | `https://a2a.yourdomain.com` | Agent endpoint (protocol references only) |

**System prompt instruction:**
```
When linking to website pages, use the WEBSITE_URL domain.
When referencing the agent endpoint or agent card, use the AGENT_URL domain.
```

---

## 4. Runtime URL Verification

Before the agent includes a URL in its response, it should verify the page exists:

1. **Encore sites:** Call `website.read_page(slug)` — if it returns content, the page exists
2. **Static sites:** Check against cached sitemap or Firecrawl results
3. **Fallback:** If no verification method is available, only link to known pages (from knowledge base front matter)

**Never:** Generate a link to a URL the agent hasn't verified exists.

---

## 5. Implementation Phases

### Phase 1: Fix the immediate bug (Mother Brain only)
- Ensure `WEBSITE_URL` is properly used as the base for website links
- Add system prompt instruction distinguishing website domain from agent domain
- Use `website.list_pages` + `website.read_page` for URL verification (Encore-backed)

### Phase 2: Sitemap support (public users)
- Add sitemap URL discovery setting
- Periodically fetch and cache sitemap
- Use cached sitemap for URL verification

### Phase 3: Firecrawl integration (public users)
- Add Firecrawl API key setting
- On-demand crawling for URL discovery
- Cache crawl results in Supabase

### Phase 4: Knowledge base front matter
- Update knowledge packer to extract URL front matter
- Bake curated URLs into Worker bundle
- Use as fallback when no dynamic discovery is available

---

## 6. Settings UI Additions

| Field | Purpose | Required |
|-------|---------|----------|
| `WEBSITE_URL` | Base URL for website links | ✅ Yes |
| `sitemapUrl` | Sitemap URL (defaults to `{WEBSITE_URL}/sitemap.xml`) | No |
| `firecrawlApiKey` | Firecrawl API key for static site crawling | No |

---

## 7. Decision Log

| Decision | Rationale |
|----------|-----------|
| NO hardcoded `URLS.md` | URLs change too often. Would require Worker redeploy on every page change. Stupid. |
| Dynamic discovery preferred | Agent should ask the website what pages exist, not assume |
| `WEBSITE_URL` is the canonical base | Single source of truth. No deriving from agent URL. |
| Multiple discovery methods | Different sites have different architectures. One size doesn't fit all. |
