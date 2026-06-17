# A2A Agent — Mother's Knowledge Base Document

> **Purpose:** This document gives Mother (the A2A Agent on motherbrain.app) a complete understanding of what she is, how she works, and what she's capable of. It serves as her self-awareness reference when answering visitor questions.
>
> **Audience:** The A2A Agent itself, developers, and anyone wanting to understand the system.
>
> **Last Updated:** June 2026 · **Version:** 1.1.32

---

## Table of Contents

1. [What Is the A2A Agent?](#1-what-is-the-a2a-agent)
2. [What Can Mother Do?](#2-what-can-mother-do)
3. [The Visitor Experience](#3-the-visitor-experience)
4. [Architecture Overview](#4-architecture-overview)
5. [The Hero Search Interface](#5-the-hero-search-interface)
6. [The Chat Experience](#6-the-chat-experience)
7. [The A2A Protocol Layer](#7-the-a2a-protocol-layer)
8. [Database & Memory](#8-database--memory)
9. [Security & Rate Limiting](#9-security--rate-limiting)
10. [The CRM Dashboard](#10-the-crm-dashboard)
11. [Build Widget — Website Deployment](#11-build-widget--website-deployment)
12. [Configuration & Customization](#12-configuration--customization)
13. [Deployment Pipeline](#13-deployment-pipeline)
14. [Roadmap](#14-roadmap)
15. [Frequently Asked Questions](#15-frequently-asked-questions)

---

## 1. What Is the A2A Agent?

The A2A Agent — known as **Mother** — is an intelligent conversational agent that lives on [motherbrain.app](https://motherbrain.app). She serves as the public-facing support and guidance agent for the Mother Brain platform.

Mother is built on the **A2A (Agent-to-Agent) Protocol**, an open standard that enables AI agents to communicate with each other and with human visitors via a standardized JSON-RPC interface. She isn't a simple chatbot — she's a protocol-compliant agent with a defined identity, skills, capabilities, and a persistent memory system.

**Key characteristics:**

- She has a **named identity** ("Mother"), a description, and a documented set of skills.
- She speaks the **A2A Protocol** — any agent or client that implements A2A can talk to her.
- She has **Total Recall** — she remembers every conversation she's had with every visitor, across sessions.
- She runs on **Cloudflare Workers** at the edge, giving her global low-latency response times.
- She is powered by **Mother Brain's core AI infrastructure**, routing through the Cloudflare Gateway to access AI models and knowledge bases.

**Who built her?** Native Apps Dev (nativeapps.io), the team behind Mother Brain.

---

## 2. What Can Mother Do?

Mother has five defined **skills** (capabilities) declared in her Agent Card:

### Product Information
Answers questions about Mother Brain's features, pricing, licensing, technology stack, and capabilities.
- *"What features does Mother Brain have?"*
- *"How much does Mother Brain cost?"*
- *"What AI models does Mother Brain support?"*

### Technical Support
Helps with installation, configuration, deployment, troubleshooting, and integration issues.
- *"Mother Brain won't launch on my Mac."*
- *"How do I configure the embedded PostgreSQL?"*
- *"My MCP server isn't connecting to Zed."*

### Developer Onboarding
Guides developers through getting started, project setup, MCP server configuration, and first deployment.
- *"How do I set up Mother Brain for my project?"*
- *"How do I connect Zed to Mother Brain's MCP server?"*
- *"How do I deploy the Cloudflare Gateway?"*

### A2A Integration Support
Helps external agents connect to Mother Brain's A2A endpoint, understand the protocol, and integrate with their systems.
- *"How do I connect my agent to Mother Brain via A2A?"*
- *"What authentication does the A2A endpoint require?"*
- *"What skills does the Mother agent support?"*

### Enterprise & Sales
Provides information for enterprise customers, volume licensing, custom deployments, and partnership inquiries.
- *"Do you offer volume licensing for teams?"*
- *"Can Mother Brain be deployed on-premises?"*
- *"How do I become a Mother Brain partner?"*

### AI-Generated Suggestions
Mother proactively generates suggested questions for visitors based on their visit context and history. These appear as animated typewriter text in the Hero Search bar, giving visitors inspiration for what to ask.

### Visitor Memory (Total Recall)
Mother remembers every conversation she has with each visitor. When a returning visitor comes back, she can recall details from any past conversation — not just the most recent one. This is powered by vectorized semantic search over all historical messages.

---

## 3. The Visitor Experience

When a visitor arrives at motherbrain.app, here's what happens:

### Step 1: Hero Search
The visitor sees a striking **octagonal search bar** — the Hero Search. Before they even type, Mother's AI-generated suggestions animate as typewriter text in the search field, cycling through questions the visitor might want to ask. The visitor can:

- **Click a suggestion** — The brain icon captures the currently displayed suggestion and submits it.
- **Type their own question** — The typewriter stops, and the visitor types freely.
- **Press Enter or click the brain icon** — Their query is submitted.

### Step 2: Chat Opens
When a query is submitted, a **fullscreen chat overlay** opens with the visitor's question pre-filled and sent. Mother processes the query and responds with streaming text, markdown formatting, and tool call results.

### Step 3: Conversation History
If the visitor has chatted before, a **"Continue paused conversation"** button appears below the Hero Search. Clicking it opens the chat with full history loaded — the visitor picks up right where they left off.

### Step 4: Persistent Identity
Each visitor gets an anonymous, auto-generated **Visitor ID** stored in their browser's localStorage. This ID links all their conversations together across visits. No login required, no personal data collected.

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    VISITOR'S BROWSER                      │
│                                                          │
│  ┌──────────────┐     ┌──────────────────────────────┐  │
│  │  Hero Search  │────▶│      Chat UI (React)          │  │
│  │ (Web Component│     │  - Markdown rendering         │  │
│  │  Shadow DOM)  │     │  - Streaming responses        │  │
│  └──────────────┘     │  - Visitor tracking           │  │
│                       │  - Conversation history        │  │
│                       └──────────┬───────────────────┘  │
│                                  │ JSON-RPC 2.0         │
└──────────────────────────────────┼──────────────────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  Cloudflare Workers  │
                        │  (A2A Endpoint)      │
                        │                      │
                        │  - Protocol routing  │
                        │  - Rate limiting     │
                        │  - Input validation  │
                        │  - Agent Card        │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Mother Brain Gateway       │
                    │   (Cloudflare Worker)        │
                    │                              │
                    │  - AI model routing          │
                    │  - Knowledge base access     │
                    │  - MCP tool execution        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │        Database Layer         │
                    │                               │
                    │  ┌─────────┐  ┌────────────┐ │
                    │  │ Embedded │  │  Supabase   │ │
                    │  │ Postgres │  │  (Cloud)    │ │
                    │  │ (Local)  │  │  - Sync     │ │
                    │  └─────────┘  └────────────┘ │
                    └───────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React + Vite + TypeScript | Chat UI, Hero Search host, settings, CRM |
| **Hero Search** | Vanilla TypeScript Web Component | Octagonal SVG search input with Shadow DOM |
| **Backend** | Cloudflare Workers (Hono framework) | A2A JSON-RPC endpoint, routing, validation |
| **AI Gateway** | Mother Brain Cloudflare Gateway | Model routing, knowledge base, MCP tools |
| **Database (Local)** | Embedded PostgreSQL | Local-first storage for development/standalone |
| **Database (Cloud)** | Supabase (PostgreSQL + pgvector) | Cloud sync, vector embeddings, persistent storage |
| **Embeddings** | Voyage AI | Vectorization of messages for semantic recall |
| **Protocol** | A2A Protocol v1.0 (JSON-RPC 2.0) | Standardized agent communication |
| **Hosting** | Cloudflare edge network | Global low-latency delivery |
| **Distribution** | GitHub Releases + Mega S4 | Invention package hosting and registry |

---

## 5. The Hero Search Interface

The Hero Search is the signature visual element of the A2A Agent. It's not just a text input — it's a **responsive octagonal SVG** with a brain icon, animated gradient borders, and an AI typewriter that suggests questions.

### Design

- **Octagonal shape** — The search bar is an octagon (8-sided polygon) rendered as an SVG path. The corners are dynamically calculated based on the container width.
- **Gradient stroke** — The border features a smooth gradient (default: neon green to purple) that can be customized per deployment.
- **Brain icon** — A stylized brain SVG sits at the right edge of the search bar, positioned responsively (always 24px from the right edge). Clicking the brain submits the query.
- **Dark theme** — Deep void background (`#050508`) with muted text colors, designed to match Mother Brain's aesthetic.

### Architecture

The Hero Search is a **Web Component** (Custom Element) — specifically `<ne-hero-search>`. This is a deliberate architectural choice:

- **Shadow DOM isolation** — All styling, geometry calculations, and typewriter logic run inside a Shadow DOM, completely isolated from the host page's CSS and JavaScript. This means the Hero Search looks and behaves identically regardless of what website it's embedded on.
- **ResizeObserver** — A ResizeObserver watches the host element and recalculates all SVG geometry (octagon paths, clip paths, brain icon position, text input width) whenever the container resizes. This happens entirely inside the Shadow DOM with zero React re-renders.
- **Vanilla TypeScript** — The web component is pure TypeScript, not React. React is only a thin wrapper that creates the `<ne-hero-search>` element and forwards events.

### Typewriter Suggestions

The typewriter animates AI-generated suggested questions in the search field:

- **AI-generated** — Suggestions are fetched from the `visitor/suggestions` JSON-RPC method, which generates contextual questions based on the visitor's history and the knowledge base.
- **Agent-name-aware defaults** — Before AI suggestions load (or if the endpoint fails), default suggestions are shown that include the agent's name (e.g., "Ask Mother anything...").
- **Session caching** — AI suggestions are cached in `sessionStorage` so page navigation doesn't trigger re-fetching.
- **Hover-pause** — When the visitor hovers over the search bar, the typewriter completes the current suggestion line, then pauses. This lets the visitor read and click the suggestion. When the mouse leaves, cycling resumes.
- **50ms type speed** — Each character appears every 50ms (faster than typical typewriter effects).
- **4500ms suggestion delay** — Each suggestion stays on screen for 4.5 seconds before cycling to the next.
- **Click to submit** — Clicking the brain icon captures the fully-typed suggestion and submits it.

### Mobile Support

- **Touch handlers** — `touchstart` and `touchend` events manage iOS keyboard behavior, ensuring the input focuses correctly on mobile devices.
- **Input suppression** — During auto-typing, `beforeinput` events are suppressed so the AI's typing doesn't bubble to the host document as user input.

### Customization

The Hero Search supports customization via HTML attributes and Shadow DOM queries:

- `gradient-color-1` — Top color of the gradient stroke and brain icon
- `gradient-color-2` — Bottom color of the gradient stroke and brain icon
- `setSuggestions(string[])` — Programmatically set custom suggestions

---

## 6. The Chat Experience

When a visitor submits a query, the **Chat UI** opens as a fullscreen overlay. Here's what happens:

### Message Flow

1. **Visitor sends a message** — The query is sent as a JSON-RPC `message/send` request to the A2A endpoint.
2. **Task resolution** — The endpoint checks if the visitor has an existing task (conversation). If yes, the message is appended to that task. If no, a new task is created.
3. **AI processing** — The message is routed through the Mother Brain Gateway to the AI model, along with recalled context from the visitor's conversation history.
4. **Streaming response** — The AI's response streams back character-by-character, creating a smooth typing effect in the chat UI.
5. **Tool calls** — If the AI invokes MCP tools (like knowledge base search), the tool call details are displayed inline in the chat.
6. **Persistence** — Both the visitor's message and the agent's response are stored in the database with vector embeddings for future recall.

### Chat Features

- **Markdown rendering** — A custom markdown renderer (no external dependencies) formats responses with headers, lists, code blocks, links, and inline formatting.
- **Streaming text** — Responses appear with a typewriter effect (character-by-character) for a natural conversational feel.
- **Tool call display** — When the agent uses MCP tools, the tool name, arguments, and result preview are shown in styled cards.
- **Thinking indicator** — While the agent is processing, an animated "thinking" indicator with a spinner is displayed.
- **Conversation history** — On return visits, the full conversation history loads automatically.
- **Error handling** — Network errors, rate limits, and agent failures are handled gracefully with helpful error messages.

### Visual Design

The chat UI uses Mother Brain's signature dark theme:

| Token | Color | Usage |
|-------|-------|-------|
| Deep Void | `#050508` | Background |
| Dark Matter | `#0d0d15` | Input areas, cards |
| Neural Node | `#13131f` | Secondary surfaces |
| Neon Green | `#00dc82` | Primary accent, agent indicators |
| Hot Pink | `#ff3e88` | User message indicators |
| Text | `#e4e4e7` | Primary text |
| Text Muted | `#a1a1aa` | Secondary text |

Font: Inter (with system-ui fallback).

---

## 7. The A2A Protocol Layer

Mother speaks the **A2A Protocol v1.0** — an open standard for agent-to-agent communication. The protocol uses **JSON-RPC 2.0** as its transport format.

### Agent Card

Mother's identity and capabilities are declared in an **Agent Card** — a standardized JSON document served at:

- `/.well-known/agent-card.json` (A2A v1.0 canonical URI)
- `/.well-known/agent.json` (legacy v0.3 backward compatibility)
- `/agent.json` (convenience root path)

The Agent Card contains:

- **Identity** — Name ("Mother"), description, version, documentation URL, icon
- **Provider** — Organization (nativeapps.io) and URL
- **Supported interfaces** — Endpoint URL, protocol binding (JSONRPC), protocol version
- **Capabilities** — Streaming (enabled), push notifications (disabled), extended agent card (disabled)
- **Security schemes** — Bearer token authentication
- **Skills** — The five skill definitions (see Section 2)
- **Input/output modes** — `text/plain` and `application/json`

### JSON-RPC Methods

The A2A endpoint accepts the following JSON-RPC methods:

| Method | Purpose |
|--------|---------|
| `ping` | Health check — returns `{ status: "ok" }` |
| `message/send` | Send a message to the agent (creates/appends to a task) |
| `tasks/get` | Retrieve the state of a task |
| `tasks/cancel` | Cancel an in-progress task |
| `tasks/getArtifacts` | Retrieve artifacts produced by a task |
| `visitor/suggestions` | Get AI-generated suggested questions for a visitor |
| `visitor/history` | Get a visitor's conversation history |

### Message Structure

Messages follow the A2A spec's multi-part structure:

- **role** — `"user"` or `"agent"`
- **parts** — Array of content parts (text, JSON data, etc.)
- **metadata** — Optional metadata (e.g., `visitor_id` for tracking)

### Task Lifecycle

Tasks follow the A2A spec's state machine:

```
submitted → working → completed
                ↘ input-required (agent needs more info)
                ↘ failed
                ↘ canceled
```

**Visitor task consolidation:** Each visitor gets ONE persistent task (conversation). All messages from a visitor are appended to this single task, rather than creating separate tasks per message. This ensures conversation continuity.

---

## 8. Database & Memory

The A2A Agent uses a **dual-database architecture** for reliability and performance.

### Local Database (Embedded PostgreSQL)

- Runs locally via Mother Brain's embedded PostgreSQL engine
- Used during development, standalone operation, and as a local-first store
- Collection name: `a2a_agent_chat`

### Cloud Database (Supabase)

- PostgreSQL with the `pgvector` extension for vector embeddings
- Provides cloud sync, persistent storage, and semantic search
- Schema includes four migrations:

#### Core Tables

| Table | Purpose |
|-------|---------|
| `agents` | Registry of connected A2A agents |
| `tasks` | Conversation containers (one per visitor) with status tracking and state history |
| `task_messages` | Individual messages within tasks (role, parts, metadata, embedding) |
| `artifacts` | Outputs produced by the agent (text, files, data) |
| `knowledge` | Knowledge base entries with vector embeddings for semantic search |
| `rate_limits` | Rate limiting tracking (per visitor and per IP) |

#### Total Recall (Visitor Memory)

The `task_messages` table includes a **vector embedding column** (1024 dimensions, Voyage AI). Every message — both visitor questions and agent responses — is vectorized and stored.

This enables two types of recall:

1. **Semantic recall** (`match_visitor_messages`) — Finds messages from a specific visitor by meaning, not just keywords. When a visitor asks a question, the agent searches all past messages from that visitor for semantically related context.
2. **Chronological recall** (`recall_visitor_history`) — Fetches the last N messages for a visitor across all tasks, providing recent conversation context.

The embeddings use an **HNSW index** (Hierarchical Navigable Small World) for fast approximate nearest neighbor search — ideal for live data that grows continuously.

#### Knowledge Base

The `knowledge` table stores reference material that Mother uses to answer questions:

- **Source** — Where the knowledge came from (product docs, pricing page, support docs, etc.)
- **Category** — Classification for filtering (product, pricing, support, etc.)
- **Content** — The actual text content
- **Embedding** — 1536-dimension vector for semantic search
- **Tags** — Array of tags for additional filtering

Semantic search is performed via the `match_knowledge` function, which uses cosine similarity to find the most relevant knowledge entries for a given query.

---

## 9. Security & Rate Limiting

### Authentication

- The A2A endpoint supports **Bearer token authentication** (declared in the Agent Card security schemes).
- The Cloudflare Gateway requires a `MOTHER_BRAIN_GATEWAY_TOKEN` secret for backend communication.
- Authentication is currently reserved for future use — visitor-facing endpoints operate without authentication to ensure frictionless access.

### Rate Limiting

Two layers of rate limiting protect the endpoint:

1. **IP-based** — Every request is rate-limited by client IP address.
2. **Visitor-based** — Messages with a `visitor_id` are additionally rate-limited per visitor.

Rate limits use a sliding window with configurable thresholds. When exceeded, the endpoint returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers.

### Input Validation

All incoming messages are validated and sanitized:

- JSON-RPC request structure validation
- Message role validation (`user` or `agent` only)
- Parts array validation
- Input sanitization to prevent injection attacks

### CORS

The endpoint allows cross-origin requests from any domain (`*`), enabling the Hero Search and Chat UI to be embedded on any website.

---

## 10. The CRM Dashboard

Mother Brain includes a **CRM view** for monitoring A2A Agent conversations. Accessible from the Mother Brain app's invention panel, the CRM provides:

- **Conversation list** — All visitor conversations, sorted by recency
- **Visitor grouping** — Messages grouped by visitor ID (not scattered across separate tasks)
- **Message inspection** — View individual messages, roles, timestamps, and metadata
- **Tool call visibility** — See which MCP tools were invoked during each conversation
- **Status tracking** — Task states (submitted, working, completed, failed)

The CRM component is defined at `crm/A2aCrmView.tsx` and registered as the `conversations` component in the invention configuration.

---

## 11. Build Widget — Website Deployment

The **Build Widget** feature allows Mother Brain license owners to export the Hero Search and Chat UI as source code components for deployment on their own websites.

### What You Get

A `motherbrain-widget.zip` containing **10 React/TypeScript source files**:

| File | Purpose |
|------|---------|
| `HeroSearchHost.tsx` | **Recommended** — All-in-one React wrapper that handles everything |
| `HeroSearchElement.ts` | The `<ne-hero-search>` web component (vanilla TS, Shadow DOM) |
| `useHeroSuggestions.ts` | AI suggestions hook (fetches + caches visitor/suggestions) |
| `ChatApp.tsx` | React chat overlay component (fullscreen, self-contained) |
| `BrainIcon.tsx` | Brain SVG logo with gradient |
| `markdown.ts` | Custom markdown-to-HTML renderer (no external deps) |
| `index.ts` | Entry point that re-exports all components |
| `package.json` | Dependencies: React 18+ only |
| `tsconfig.json` | TypeScript configuration |
| `README.md` | Integration guide with code examples |

### How It Works

1. The user clicks **Build Widget** in the A2A Agent settings screen.
2. Mother Brain fetches the source files from the `/resource/widget-build/` endpoint.
3. A ZIP is created client-side (STORE mode, zero dependencies) and downloaded.
4. The user unzips the files into their React/Vite/TypeScript project.
5. They import `HeroSearchHost` and `ChatApp` and wire them together.
6. An **AI agent prompt** is provided in the settings UI — the user can paste this into their IDE's AI assistant (Cursor, Zed, Claude) to help with integration.

### What's Included

The exported widget is a **complete experience** matching the Preview screen:

- ✅ AI-generated typewriter suggestions (fetched from `visitor/suggestions`)
- ✅ Agent-name-aware defaults
- ✅ SessionStorage caching for suggestions
- ✅ "Continue paused conversation" button
- ✅ Custom gradient colors
- ✅ Responsive octagonal SVG with Shadow DOM
- ✅ Fullscreen chat with markdown rendering
- ✅ Visitor tracking and history loading
- ✅ Hover-pause typewriter
- ✅ Mobile touch support

### Integration Approach

The recommended approach uses `HeroSearchHost` — a single React component that handles mounting the web component, fetching AI suggestions, applying gradient colors, and showing the continue button. The user only needs to manage the open/closed state of the chat overlay.

For advanced use cases, the raw `<ne-hero-search>` web component and `useHeroSuggestions()` hook can be used independently.

---

## 12. Configuration & Customization

The A2A Agent is highly configurable through the Mother Brain settings panel:

### Agent Identity

| Setting | Default | Description |
|---------|---------|-------------|
| Agent Name | "MOTHER" | Display name used in suggestions and chat |
| Agent Description | — | Shown above the Hero Search |
| Agent URL | `https://a2a.motherbrain.app` | The A2A JSON-RPC endpoint URL |
| Widget Branding | "Powered by Mother Brain" | Footer text |
| Logo URL | — | Custom logo image |

### Visual Customization

| Setting | Default | Description |
|---------|---------|-------------|
| Widget Color | `#39ff14` | Primary accent color |
| Hero Gradient Color 1 | `#00dc82` | Search bar stroke top color |
| Hero Gradient Color 2 | `#a78bfa` | Search bar stroke bottom color |

### AI Configuration

| Setting | Description |
|---------|-------------|
| Embedding API Key | Voyage AI API key for vectorization |
| AI Model | Which AI model to use (default: gateway default) |

### System Prompts

The agent's behavior is guided by customizable system prompts that define how Mother responds to different types of questions. These prompts are managed through the Mother Brain settings interface.

---

## 13. Deployment Pipeline

The A2A Agent has **two separate deployment targets** that must be deployed independently:

### 1. Invention Package (Frontend + Config)

**Script:** `deploy-to-mega.cjs --upload --bump`

This packages the invention (settings components, CRM view, preview, widget-build source, config.json) into a tarball and uploads to:

| Destination | Purpose |
|-------------|---------|
| **GitHub Releases** | Primary download source (versioned) |
| **Mega S4** (S3-compatible) | Fallback download source |
| **Registry JSON** | Backward-compatible registry |
| **Mother Brain Registry API** | Dynamic invention registry at `api.motherbrain.app` |

Each deployment bumps the patch version (e.g., 1.1.31 → 1.1.32), generates a SHA256 checksum, and publishes to all four destinations.

### 2. Cloudflare Worker (Backend)

**Command:** `cd backend && npx wrangler deploy`

This deploys the A2A endpoint (the JSON-RPC server) to Cloudflare Workers. The worker name is `motherbrain-a2a-endpoint` (defined in `wrangler.toml`).

**Critical:** Changes to backend code in `backend/src/` require a separate `wrangler deploy`. The invention package deploy does NOT update the Cloudflare Worker.

### Environment Variables

The Cloudflare Worker requires these secrets (set via `wrangler secret put`):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `MOTHER_BRAIN_GATEWAY_TOKEN` | Auth token for Mother Brain Gateway |

And these variables (in `wrangler.toml`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENVIRONMENT` | `production` | Runtime environment flag |
| `GATEWAY_BASE_URL` | Mother Brain Gateway URL | Where to route AI requests |
| `AI_MODEL` | `default` | AI model override |

---

## 14. Roadmap

### In Development

#### API MCP Connector
We are adding an **API MCP connector** to the A2A Agent. This will allow Mother to **control a website** directly. The website creates its own MCP server exposing its tools (create content, update pages, manage users, etc.), and Mother connects to it and uses those tools. This transforms Mother from a conversational agent into an **autonomous website operator** — visitors can ask her to make changes, and she executes them through the website's MCP tools.

#### Custom MCP Tool (Agent-to-Agent Task Delegation)
We are considering extending a **custom MCP Tool from Mother Brain's core** that would allow other AI agents to authenticate with the A2A Endpoint and send tasks to Mother. This creates an **agent-to-agent delegation pipeline**:

1. An external AI agent (e.g., a developer's coding assistant) authenticates with Mother Brain.
2. It sends a task to the A2A Endpoint (e.g., "Update the homepage hero text").
3. Mother receives the instructions.
4. Mother uses the website's MCP tools (via the API MCP Connector above) to execute the changes.

This enables scenarios like: A developer's AI assistant identifies a needed website update → delegates the task to Mother → Mother makes the change on the live website.

### Future Considerations

- **Focus Guard** — Prevent the Hero Search input from stealing keyboard focus from the host page during auto-typing (important for embedded deployments)
- **Multi-language support** — Agent responses in multiple languages
- **Proactive engagement** — Agent initiates conversation based on visitor behavior signals
- **Analytics dashboard** — Deeper insights into conversation quality, visitor satisfaction, and knowledge gaps

---

## 15. Frequently Asked Questions

### What is the A2A Protocol?

The A2A (Agent-to-Agent) Protocol is an open standard that defines how AI agents communicate. It uses JSON-RPC 2.0 as its transport format and defines standard methods for sending messages, managing tasks, and exchanging artifacts. Any agent that implements the A2A spec can communicate with any other A2A-compliant agent.

### Do visitors need to create an account?

No. Visitors are automatically assigned an anonymous Visitor ID (stored in localStorage). No registration, login, or personal information is required. The Visitor ID links conversations across visits.

### Does Mother remember past conversations?

Yes. Every message is vectorized (using Voyage AI embeddings) and stored in the database. When a returning visitor asks a question, Mother performs semantic search over all their past messages to find relevant context. This means she can recall details from any conversation, not just the most recent one.

### Can the Hero Search be embedded on other websites?

Yes. The Build Widget feature exports the complete Hero Search and Chat UI as React/TypeScript source components. License owners can integrate them into any React/Vite/TypeScript website. The web component uses Shadow DOM, so it's completely isolated from the host page's styles.

### What AI model powers Mother?

Mother routes through the Mother Brain Cloudflare Gateway, which provides access to multiple AI models. The specific model can be configured via the `AI_MODEL` setting. By default, the gateway's default model is used.

### Is the conversation data secure?

All communication uses HTTPS. The database uses row-level security via Supabase. Rate limiting protects against abuse. Input validation and sanitization prevent injection attacks. Bearer token authentication is available for API access (reserved for future use).

### Can other AI agents talk to Mother?

Yes. Any agent that implements the A2A Protocol can communicate with Mother via the JSON-RPC endpoint at `https://a2a.motherbrain.app`. The Agent Card at `/.well-known/agent-card.json` declares her capabilities and supported methods.

### What's the difference between the Preview and the deployed widget?

Nothing — they use the same source code. The Build Widget exports the exact same components that power the A2A Agent Preview screen in Mother Brain. Same Hero Search, same Chat UI, same AI suggestions, same "Continue paused conversation" button.

---

*This document is maintained as part of Mother Brain's A2A Agent invention. For technical details, deployment instructions, or source code, refer to the invention package in Mother Brain.*
