# A2A Agent — Settings UI Component

## Overview

The Settings UI is a purpose-built React component that renders inside the Mother Brain InventionsView detail panel. It replaces the generic JSON config editor with a structured, sectioned form tailored to the A2A Agent invention.

## Component Structure

```
settings/
├── README.md                    ← You are here
├── A2aAgentSettings.tsx         ← Main settings component (renders sections below)
├── A2aWizard.tsx                ← Original Setup Wizard (hub & spoke) — kept as-is
├── A2aWizard2.tsx               ← Wizard 2 — the newer, step-by-step wizard (Agent Identity first)
├── tabNav.ts                    ← Helper to switch InventionsView tabs from invention components
├── sections/
│   ├── AgentIdentitySection.tsx     ← Agent name, description, SOUL.md preview
│   ├── EndpointSection.tsx          ← Agent URL, agent card JSON preview
│   ├── AuthenticationSection.tsx    ← Access token, bot user email, gateway token
│   ├── ProjectAccessSection.tsx     ← Primary + additional project pickers
│   ├── DatabaseSection.tsx          ← Local PG status, Supabase config, sync toggle
│   ├── WidgetSection.tsx            ← Position, color picker, welcome message, branding
│   ├── DeploySection.tsx            ← Cloudflare account, worker name, deploy button, status
│   └── EmbeddingSection.tsx         ← Embedding provider, model, API key, dimensions
```

## How It Renders

The main `A2aAgentSettings.tsx` component receives the invention's `config.json` as props and renders each section as an accordion or tab panel. Each section reads/writes to the invention config via the Inventions Store API (`PATCH /api/inventions/a2a-agent`).

## Integration with InventionsView

The core `InventionsView.tsx` detects `type: "a2a-agent"` and dynamically loads this settings component instead of the generic JSON editor. This is the generic extendability hook — no A2A-specific code exists in Mother Brain's core.

## Data Flow

1. User edits a field in the settings UI
2. Component calls `updateInvention("a2a-agent", { settings: { ...updatedSettings } })`
3. Inventions Store writes to `config.json` on disk
4. If the worker is deployed, a redeploy may be triggered for settings that affect the worker environment

## Wizard 2 (`A2aWizard2.tsx`)

The reorganized wizard, built one step at a time. Registered in `config.json` as
`components."Wizard 2"` (the original `Wizard` screen is untouched).

- **Step 1 — Agent Identity**: the exact same fields as Settings → Agent Identity &
  Authentication (Bot User, Agent Name, Description, Provider, Access Token). They
  are true mirrors — both screens read/write the same invention settings via the
  same PATCH endpoint, so edits sync both ways. Nothing is stored twice.
- **AI Setup Assistant**: the old left-side Setup Guide markdown reader is replaced
  by a chat thread powered by the default chat LLM (MCP Gateway
  `/v1/chat/completions`). Every message injects full context: the Wizard step map
  with the current step marked, the identity checklist, the project's live
  config.json snapshot (fetched via the inventions API, secrets masked), and
  `recipes/a2a-setup.md`. It can pre-fill fields — `[[SET:field=value]]` suggestions
  render as one-click Apply buttons. The recipe carries a MAINTENANCE RULE: it is
  updated in the same change whenever Wizard 2 steps change.
- **Canvas**: same SVG octagonal-node canvas, currently showing one centered node
  ("Agent Identity"). More steps join the canvas as the wizard is reorganized.

## Future

- SOUL.md editor (markdown with preview) for customizing agent personality
- Agent Card live preview (renders the agent-card.json as a styled card)
- Test Connection button (sends a ping to the configured A2A endpoint)
- Deploy/Redeploy button with live Cloudflare Wrangler output
