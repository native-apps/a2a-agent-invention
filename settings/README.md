# A2A Agent — Settings UI Components

## Overview

All setup and configuration for the A2A Agent invention lives in **Wizard 2** —
a step-by-step wizard with a perfect-circle canvas (Agent Identity at the
center, six satellite nodes on the orbit), real Finish & Verify diagnostics on
every node, and a recipe-grounded AI Setup Assistant.

The legacy screens (classic `A2aAgentSettings`, the original hub-and-spoke
`A2aWizard`, and `tabNav`) were removed in v1.2.157 — Wizard 2 fully replaces
them. Editing anywhere writes to the same shared invention config via the same
PATCH endpoint.

## Component Structure

```
settings/
├── README.md                ← You are here
├── A2aWizard2.tsx           ← Wizard 2 — the only setup UI (canvas + slide modals)
├── A2aChatPreview.tsx       ← Live chat preview against the endpoint
└── A2aReadme.tsx            ← In-app README screen
../shared/
└── supabaseConfig.ts        ← Shared Supabase credential helpers (localStorage fallback)
../crm/
├── A2aCrmView.tsx           ← Conversations (messages, tool calls)
└── EntitiesView.tsx         ← CRM entities
```

## Wizard 2 Architecture

- **Nodes** (all on one canvas): Agent Identity (center) · Deploy to Website ·
  Agent Cloud Mirror · MCP Server · Telegram · JWT Auth · License Keys.
- **Slides**: each node is a sequence of slides; the final slide is always
  *Finish & Verify* — REAL diagnostics (live network checks, never faked),
  animated line-by-line, red failure rows with remedies, and a SAVE button.
- **AI Assistant**: left panel inside each node modal; grounded in
  `recipes/a2a-setup.md` (the maintenance rule: whenever Wizard 2 changes,
  the recipe changes with it) + live project config (secrets masked).
- **Persistence**: every field saves to the shared invention config
  (debounced auto-save + `flushSave` on navigation); deployed values flow to
  the Worker as secrets via the MB app's deploy action.

## Registered Components (config.json)

| Key | File | Purpose |
|-----|------|---------|
| `Wizard 2` | `settings/A2aWizard2.tsx` | Setup & configuration |
| `Conversations` | `crm/A2aCrmView.tsx` | Chat CRM view |
| `Entities` | `crm/EntitiesView.tsx` | CRM entities |
| `preview` | `settings/A2aChatPreview.tsx` | Live chat preview |
| `readme` | `settings/A2aReadme.tsx` | In-app documentation |
