# Shared Diagnosis: MCP Gateway Connection Failure (A2A Agent)

**Created:** June 27, 2026
**Participants:** A2A Agent Coder, Website Coder, MB App Coder, Project Owner
**Status:** Active — Gateway connection broken, Worker in offline fallback mode

---

## Symptom

The A2A Agent Worker is stuck in **offline fallback mode**. It cannot reach the Cloudflare MCP Gateway. Messages get placeholder/offline responses instead of real AI answers. This affects BOTH the website chat AND the MB app Preview screen.

## Timeline

- **Before mid-June 2026:** Gateway connection worked perfectly
- **Mid-June 2026:** Website auth system revamp (2FA, JWT, new security policies)
- **Late June 2026:** A2A Agent security hardening (P0-P2), dual-path auth, cross-device chat
- **Current:** Worker cannot reach Gateway — offline mode

## What the A2A Agent Worker Sends to the Gateway

The Worker (`backend/src/mcp.ts`) sends **4 Zero Trust headers** on every Gateway request:

```
Authorization: Bearer ${MOTHER_BRAIN_GATEWAY_TOKEN}
X-Mother-Brain-Source: a2a-agent
X-Mother-Brain-Invention: a2a-agent
X-Mother-Brain-User-Token: ${MOTHER_BRAIN_USER_TOKEN}  (optional)
```

Two endpoints are called:
1. `POST {GATEWAY_BASE_URL}` — MCP JSON-RPC (tools/list, tools/call)
2. `POST {GATEWAY_BASE_URL}/v1/chat/completions` — AI Router (OpenAI-compatible)

## Environment Variables the Worker Needs

| Variable | Purpose | Source |
|----------|---------|--------|
| `GATEWAY_BASE_URL` | Gateway Worker URL | Settings → MCP Gateway URL |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | Master/project API key (Bearer auth) | Settings → MCP Gateway Token |
| `MOTHER_BRAIN_USER_TOKEN` | Sub-Agent access token (Zero Trust attribution) | Settings → Access Token |

**If ANY of these are empty, the Worker falls back to offline mode.**

## Questions for Each Coder

### For the Website Coder

1. **Did the AI Router's Zero Trust policy change?** When you revamped the auth system, did you also change what credentials the AI Router accepts? Specifically:
   - Does it still accept `MOTHER_BRAIN_GATEWAY_TOKEN` (the master API key) as a Bearer token?
   - Did the `X-Mother-Brain-Invention` header requirements change?
   - Were new Zero Trust policies added that might block the A2A Agent?

2. **Is the Gateway Worker URL still valid?** The A2A Agent points to:
   ```
   https://mother-brain-gateway.nativeapps-cipher.workers.dev
   ```
   Is this still the correct Gateway endpoint? Did it move or change?

3. **What is the correct MCP Gateway Access Token?** The token stored in the A2A Agent settings may be stale. Can you confirm the current valid token?

4. **Did the AI Router add JWT verification?** If the AI Router now requires a JWT instead of the old gateway token, the A2A Agent's `Authorization: Bearer ${gatewayToken}` would fail.

### For the MB App Coder

1. **Are ALL deploy secrets being pushed?** The MB App coder confirmed the Deploy action re-reads config.json every time. But can you verify that after a Deploy, the Cloudflare Worker actually has these secrets set?
   - Check: Cloudflare Dashboard → Workers → motherbrain-a2a-endpoint → Settings → Variables and Secrets
   - Specifically verify: `GATEWAY_BASE_URL`, `MOTHER_BRAIN_GATEWAY_TOKEN`, `MOTHER_BRAIN_USER_TOKEN`

2. **Does the project config have the gateway token?** After re-saving settings, can you check `~/.mother-brain/inventions/a2a-agent/projects/{projectId}/config.json` and verify the `gatewayToken` field has a non-empty value?

### For the A2A Agent Coder (Self-Check)

1. **Code verification:** The Worker code correctly reads `c.env.MOTHER_BRAIN_GATEWAY_TOKEN` and passes it through. ✅
2. **Header construction:** `buildGatewayHeaders()` constructs all 4 Zero Trust headers correctly. ✅
3. **Offline trigger:** `if (!token)` at line 853 of task-handler.ts triggers offline mode when the token is empty. ✅
4. **Config mapping:** `"MOTHER_BRAIN_GATEWAY_TOKEN": "gatewayToken"` is in config.json deploy secrets. ✅
5. **Not a code issue:** The A2A Agent code is correct. The issue is either:
   - The token value is empty/not being pushed (MB App deploy issue), OR
   - The Gateway is rejecting the token (AI Router policy change)

## Diagnostic Steps (In Order)

### Step 1: Check Cloudflare Worker Secrets
Go to: Cloudflare Dashboard → Workers & Pages → motherbrain-a2a-endpoint → Settings → Variables and Secrets

Verify these secrets exist and have values:
- [ ] `GATEWAY_BASE_URL` = `https://mother-brain-gateway.nativeapps-cipher.workers.dev`
- [ ] `MOTHER_BRAIN_GATEWAY_TOKEN` = (should be the master/project API key)
- [ ] `MOTHER_BRAIN_USER_TOKEN` = (Sub-Agent access token)

If any are missing → **MB App deploy issue** (settings not being pushed)

### Step 2: Test the Gateway Directly
From terminal:
```bash
curl -X POST https://mother-brain-gateway.nativeapps-cipher.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GATEWAY_TOKEN" \
  -H "X-Mother-Brain-Source: a2a-agent" \
  -H "X-Mother-Brain-Invention: a2a-agent" \
  -d '{"model":"default","messages":[{"role":"user","content":"test"}]}'
```

If this fails → **Gateway/AI Router issue** (token rejected or endpoint changed)
If this works → The Gateway is fine; issue is the Worker not having the token

### Step 3: Check Worker Logs
Go to: Cloudflare Dashboard → Workers → motherbrain-a2a-endpoint → Logs

Send a test message from the Preview screen. Look for:
- `MOTHER_BRAIN_GATEWAY_TOKEN not set` → token not deployed
- `Gateway: Attempting agentic chat...` → token IS set, Gateway call happening
- `MCP agentic chat failed` → Gateway rejected the request

### Step 4: Check AI Router Logs (Website Coder)
If Step 2 fails, check the AI Router / Gateway Worker logs for:
- Zero Trust rejection messages
- Invalid token errors
- New policy enforcement that might block the A2A Agent

---

## Most Likely Root Cause (Hypothesis)

The user noted: *"I think it has stopped working since we enforced some new security authentication in the website's DB, the Chat DB, and the AI Router's policies."*

**Hypothesis:** The AI Router's Zero Trust layer was updated during the auth revamp. The new policies may:
1. Require JWT instead of the old gateway token, OR
2. Have stricter invention permission checks that reject the A2A Agent, OR
3. Changed the accepted token format

The A2A Agent still sends the old `MOTHER_BRAIN_GATEWAY_TOKEN` as a Bearer token. If the AI Router now expects something different, the request is rejected.

---

## Notes

- The A2A Agent code is NOT broken — it sends the correct headers in the correct format
- The config.json secrets mapping is correct
- The offline fallback was working as designed (graceful degradation)
- Cross-device chat works when manually configured (JWT_SECRET was set manually)
- The issue is specifically the Gateway connection — the Worker can't reach the AI Router
