# A2A Agent — Settings UI Component

## Overview

The Settings UI is a purpose-built React component that renders inside the Mother Brain InventionsView detail panel. It replaces the generic JSON config editor with a structured, sectioned form tailored to the A2A Agent invention.

## Component Structure

```
settings/
├── README.md                    ← You are here
├── A2aAgentSettings.tsx         ← Main settings component (renders sections below)
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

## Future

- SOUL.md editor (markdown with preview) for customizing agent personality
- Agent Card live preview (renders the agent-card.json as a styled card)
- Test Connection button (sends a ping to the configured A2A endpoint)
- Deploy/Redeploy button with live Cloudflare Wrangler output
