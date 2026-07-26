# A2A Agent Invention — Full Audit Plan

**Created:** July 24, 2026
**Objective:** Ensure the invention is secure, polished, and ready to ship to public users.

---

## Audit Scope (10 Categories)

### 1. Security Audit 🔒

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | **PUBLIC_ALLOWED_TOOLS** — Empty set, MCP tools blocked for anonymous | ❓ | Check deployed vs source |
| 1.2 | **SECURITY_PROMPT_SUFFIX** — Appended to all skills | ❓ | Check knowledge-base.ts |
| 1.3 | **JWT verification** — Fail-closed, HS256, constant-time comparison | ❓ | Check jwt-session.ts |
| 1.4 | **Input sanitization** — Message validation, XSS prevention | ❓ | Check security.ts |
| 1.5 | **Rate limiting** — In-memory vs KV, reset on deploy | ❓ | Current behavior |
| 1.6 | **Secrets in wrangler.toml [vars]** — No secrets exposed | ✅ | Already clean (post-rampage) |
| 1.7 | **CORS configuration** — Open origin (intentional for public invention) | ❓ | Confirm intentional |
| 1.8 | **filterResponse guardrails** — Redacting tokens/keys from AI output | ❓ | Check security.ts |
| 1.9 | **Telegram: skip media** — Security feature, text-only processing | ✅ | Confirmed working |
| 1.10 | **validateJsonRpcRequest allowlist** — Prevents unauthorized methods | ❓ | Check `ping` dead code |

### 2. Code Quality & Diagnostics

| # | Check | Notes |
|---|-------|-------|
| 2.1 | **All TypeScript files compile** — Run `npx tsc --noEmit` | Blocking if errors |
| 2.2 | **Dead code** — `ping` case unreachable, unused imports | Fix blocking methods |
| 2.3 | **Error handling** — All try/catch blocks log meaningful messages | |
| 2.4 | **Type safety** — Any/unknown usage in critical paths | |
| 2.5 | **Console.log vs console.error** — Proper error level usage | |
| 2.6 | **Async error propagation** — Promises caught where needed | |
| 2.7 | **Backward compatibility** — Old client requests still work | |

### 3. Telegram Integration

| # | Check | Status |
|---|-------|--------|
| 3.1 | **Webhook returns 200 for non-message updates** | ✅ Confirmed |
| 3.2 | **Webhook returns 200 for private text messages** | ✅ Confirmed |
| 3.3 | **Webhook returns 200 for non-private (ignored)** | ✅ Confirmed |
| 3.4 | **Markdown fallback** — Retry without formatting on parse error | ❓ |
| 3.5 | **Message splitting** — 4096 char limit handling | ❓ |
| 3.6 | **Error handling** — DB failures don't crash the handler | ❓ |
| 3.7 | **Typing indicator** — sendChatAction while processing | ❓ |
| 3.8 | **Todo: Group/channel support** — @mention detection | ❌ Not implemented |
| 3.9 | **Todo: Identity pairing** — Verification link + TOTP | ❌ Not implemented |

### 4. Gateway / AI Pipeline

| # | Check | Status |
|---|-------|--------|
| 4.1 | **Gateway reachable** — MOTHER_BRAIN_GATEWAY_TOKEN valid | ❓ |
| 4.2 | **Workers AI fallback** — GLM-4.7-Flash configured | ✅ |
| 4.3 | **FORCE_CF_WORKER mode** — Bypasses Gateway entirely | ❓ |
| 4.4 | **Fallback chain** — agenticChat → plain gateway → Workers AI → placeholder | ❓ |
| 4.5 | **Model configuration** — CF_WORKER_MODEL env var read correctly | ❓ |
| 4.6 | **AI binding** — `[ai]` in wrangler.toml, `AI: Ai` in types | ✅ |

### 5. Database Schema & Migrations

| # | Check | Status |
|---|-------|--------|
| 5.1 | **All migrations applied to Supabase** — 001 through 013 | ❓ Supabase was down |
| 5.2 | **telegram_links table** — Schema 011 exists but may not be deployed | ❓ |
| 5.3 | **customer_id TEXT vs INTEGER** — Aligned across all files | ❓ |
| 5.4 | **Backfill migration** — 013 backfills customer_id on existing tasks | ❓ |
| 5.5 | **RPC functions** — claim_anonymous_messages, upsert_entity exist | ❓ |
| 5.6 | **Migration order** — Numbers sequential, no gaps | ❓ |

### 6. Supabase Connectivity

| # | Check | Status |
|---|-------|--------|
| 6.1 | **Supabase is reachable** — Free plan limit status | ❓ |
| 6.2 | **Tables exist** — tasks, task_messages, entities, telegram_links | ❓ |
| 6.3 | **Storage mode** — Both (local + remote sync) | ❓ |
| 6.4 | **Chat history accessible** — Conversations screen loads data | ❓ |

### 7. Deployment Pipeline

| # | Check | Status |
|---|-------|--------|
| 7.1 | **config.json secrets mapping** — All 18 secrets mapped correctly | ❓ |
| 7.2 | **Secrets actually pushed** — MB app `wrangler secret put` fails silently | ❌ Known bug |
| 7.3 | **wrangler.toml [vars]** — No TELEGRAM_BOT_TOKEN or other secrets | ✅ Confirmed |
| 7.4 | **[ai] binding present** — Required for Workers AI fallback | ✅ Confirmed |
| 7.5 | **Public tarball cleaning** — deploy-to-mega.cjs strips MB-specific content | ❓ |
| 7.6 | **Registry & GitHub Releases** — Version tagging, release notes | ❓ |

### 8. Widget Bundle (Chat UI)

| # | Check | Status |
|---|-------|--------|
| 8.1 | **Broprint.js removed** — crypto.randomUUID() in place | ✅ Confirmed |
| 8.2 | **Scroll behavior fixes** — Wheel listener, scroll-lock during streaming | ✅ Confirmed |
| 8.3 | **Link absolutization** — websiteUrl prop, yourdomain.com replacement | ❓ Deployed version? |
| 8.4 | **History fetch** — Plain headers (no JWT), limit 10 | ✅ Confirmed |
| 8.5 | **Widget bundle build** — Settings "Build Widget Bundle" button works | ❓ |
| 8.6 | **Visitor identity** — localStorage vid_ format, backward compatible | ✅ Confirmed |

### 9. Documentation

| # | Check | Status |
|---|-------|--------|
| 9.1 | **README.md** — Accurate setup instructions | ❓ |
| 9.2 | **INTEGRATION.md** — Walkthrough for third-party users | ❓ |
| 9.3 | **Settings UI help text** — Tooltips, labels, placeholders | ❓ |
| 9.4 | **Telegram setup guide** — BotFather instructions, webhook curl command | ❓ |
| 9.5 | **Telegram identity pairing docs** — This document | ✅ Created |

### 10. Configuration & Graceful Degradation

| # | Check | Status |
|---|-------|--------|
| 10.1 | **All optional features degrade gracefully** | ❓ Test each |
| 10.2 | **Defaults work out of the box** — New user installs get working agent | ❓ |
| 10.3 | **Error states handled** — Missing config shows helpful messages | ❓ |
| 10.4 | **Settings UI saves correctly** — All fields persist | ❓ |

---

## Audit Execution Plan

The audit will be performed in 4 phases:

### Phase 1: Static Analysis (No Deployments)
- Read every backend source file
- Check TypeScript compilation
- Identify dead code, type errors, missing error handling
- Review security.txt and index.ts route handlers
- **Estimate: 1 session**

### Phase 2: Runtime Verification
- Test Gateway connectivity (message/send with test message)
- Test Workers AI fallback
- Verify Supabase is reachable
- Test Telegram webhook with real message
- Test ping (debug: expected to fail due to dead code)
- **Estimate: 1 session**

### Phase 3: Schema & Data Integrity
- Check Supabase migration status (001-013)
- Verify telegram_links table exists
- Check customer_id TEXT status
- Verify RPC functions exist
- **Estimate: 1 session**

### Phase 4: Fix Implementation
- Fix all issues found in Phases 1-3
- Deploy clean version
- Post-deploy verification
- **Estimate: 1-2 sessions**

---

## ⚠️ Known Issues (Pre-Flight)

1. **`ping` method blocked by `validateJsonRpcRequest` allowlist** — Dead code, doesn't affect functionality
2. **MB app `wrangler secret put` fails silently** — Secrets must be set via terminal CLI. Document workaround.
3. **Supabase may be down** — Free plan limit. Check status.
4. **telegram_links table (schema 011) not deployed** — Never ran migration.
5. **Yourdomain.com fix not deployed** — Code change done in prev session, not pushed to Worker.
6. **v1.2.29 is the deployed version** — Needs clean upgrade.
