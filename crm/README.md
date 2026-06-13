# A2A Agent — CRM View

## Overview

The CRM View is an isolated Tauri window that gives the Mother Brain owner a real-time dashboard of their A2A Agent's conversations with website visitors. It operates independently from the main Mother Brain window — closing the main window does not affect the CRM.

## Purpose

When an A2A Agent is deployed and receiving chats from website visitors, the owner needs visibility into:

- Who is chatting and when
- What questions are being asked
- How the agent is responding
- Whether conversations need human escalation
- Usage patterns and skill utilization

## Planned Features

### Phase 1 — Core Dashboard
- **Active Conversations List**: Live list of ongoing visitor chats with status indicators (active, idle, completed)
- **Message History Viewer**: Scrollable message thread for any conversation, showing visitor messages, agent responses, and tool calls
- **Visitor Profiles**: Sidebar with visitor fingerprint, session count, first/last seen timestamps
- **Skill Usage Stats**: Breakdown of which A2A skills are being triggered most often

### Phase 2 — Analytics
- **Conversation Timeline**: Chart of chat volume over time (hourly, daily, weekly)
- **Response Quality Metrics**: Average response time, conversation length, escalation rate
- **Popular Topics**: Clustering of visitor questions by semantic similarity
- **Knowledge Gaps**: Detection of questions the agent couldn't answer well (low-confidence responses)

### Phase 3 — Interaction
- **Human Takeover**: Ability for the owner to inject into a live conversation and respond as a human
- **Canned Responses**: Pre-written responses the owner can trigger for common questions
- **Visitor Tagging**: Tag visitors for follow-up (e.g., "lead", "bug report", "enterprise inquiry")
- **Export**: Export conversation data as JSON or CSV

## Technical Architecture

```
crm/
├── README.md                ← You are here
├── CrmWindow.tsx            ← Tauri window root component
├── components/
│   ├── ConversationList.tsx     ← Active conversations sidebar
│   ├── MessageThread.tsx        ← Chat message viewer
│   ├── VisitorProfile.tsx       ← Visitor detail panel
│   ├── SkillStats.tsx           ← Skill usage chart
│   └── AnalyticsDashboard.tsx   ← Phase 2 analytics charts
├── hooks/
│   ├── useConversations.ts      ← Real-time conversation subscription (Supabase realtime)
│   └── useVisitorStats.ts       ← Visitor analytics aggregation
└── services/
    └── crm-api.ts               ← API client for invention-specific endpoints
```

## Data Source

The CRM reads from the A2A Agent's isolated chat database:

- **Local Postgres**: Real-time queries via Mother Brain's embedded PG
- **Supabase**: Cloud sync for remote access, with real-time subscriptions for live updates

Tables used: `agents`, `tasks`, `task_messages`, `artifacts`, `knowledge`, `rate_limits` (from `schema/001_initial.sql` and `schema/002_visitor_sessions.sql`).

## Window Lifecycle

1. Owner clicks "Open CRM" in the A2A Agent settings panel
2. Mother Brain spawns a new Tauri window loading the CRM component
3. CRM subscribes to Supabase real-time for live conversation updates
4. Window persists independently — closing main Mother Brain window does not close CRM
5. Multiple CRM windows can be open simultaneously if needed
