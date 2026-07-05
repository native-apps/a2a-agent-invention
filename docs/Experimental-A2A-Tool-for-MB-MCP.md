> I jotted this idea down here: [@ROADMAP.md (157:161)](file:///Users/nativeapps/Native%20Apps%20Dev/motherbrain-inventions/a2a-agent-invention/ROADMAP.md#L157:161).
>
> What do you think? Since we have the A2A Agent deployed, and the invention can extend Mother Brain's core MCP Tools. So, is this actually realistic or proper way for the AI to send requests to the site, via the A2A Protocol?
> 
>Or, another way? Like, if the website has an MCP Server, I can connect to that directly and use it?
>
>However, I like this idea of extending a new MCP Tool for A2A Agent — because then we send prompts, requests, tasks, to "Mother", and she performs the changes on the website.
>
>Give me your thoughts about this.

---

Good question — let me give you an honest architectural assessment. Let me first quickly verify how the A2A Agent currently routes to Mother Brain's MCP tools, so I'm grounding my answer in the actual code.

Now I have the full picture. The A2A Agent (`task-handler.ts` L857-870) already routes to Mother Brain's MCP Gateway via `agenticChat()` — so Mother already has full MCP tool access. This is key to my answer.

Here's my honest take:

---

## Yes, it's realistic. But the A2A Protocol is the wrong tool for the Obsidian case.

Your A2A Agent on the CF Worker already calls `agenticChat()` → Mother Brain MCP Gateway → full MCP tool access (search_codebase, search_memories, get_file_content, etc.). So the routing infrastructure already exists. The question is just **which protocol to enter through.**

There are two distinct scenarios hiding in your idea, and they have different answers:

### Scenario 1: Obsidian Smart Composer → website (your example)

```
Obsidian Smart Composer → Mother Brain MCP Server → website MCP tool → Website
```

**This doesn't need A2A at all.** Smart Composer is already an MCP client connected to Mother Brain. If you register the website's MCP Server as a connection in Mother Brain (or build a `website_mcp` tool), Smart Composer's AI can use it directly. No round-trip through the CF Worker.

Going A2A for this would be **circular**: Smart Composer → Mother Brain MCP → A2A CF Worker → Mother Brain MCP Gateway → website MCP. You'd leave Mother Brain just to come back in.

### Scenario 2: External client → website (the real A2A use case)

```
Website visitor / third-party app / mobile app → A2A Endpoint → Mother → website MCP tools → Website
```

**This is where A2A shines.** An external client that doesn't have MCP access can send a high-level task to Mother ("update the docs page about the fallback feature"), and Mother autonomously plans and executes it using her MCP tools. The A2A Protocol is the right boundary here — it's stateless, HTTP-based, and gives Mother the agentic loop.

---

## What I'd actually build

**One thing, not two.** Register the website's MCP Server as a connection in Mother Brain's core. This single registration gives you both paths automatically:

| Client | Path |
|--------|------|
| Obsidian Smart Composer | Direct MCP → website tools (fastest, no A2A detour) |
| Website visitor via Chat UI | A2A → CF Worker → MCP Gateway → website tools |
| Zed, Claude Desktop, any MCP client | Direct MCP → website tools |
| Third-party HTTP client | A2A → CF Worker → MCP Gateway → website tools |

The A2A Agent doesn't need a **new** tool — it already has access to all MCP tools via `agenticChat()`. You just add the website MCP Server to Mother Brain, and the A2A Agent picks it up automatically.

---

## On the "extendable MCP Tool" idea specifically

Your roadmap says "a new MCP Tool in Mother Brain's core that is extendable." I'd reframe this:

- **Don't build a custom MCP tool** that proxies to the website. That's an extra layer to maintain.
- **Do register the website's MCP Server** as an MCP server connection in Mother Brain (same way you'd connect any stdio/HTTP MCP server). Mother Brain's MCP Gateway already supports multiple server connections.
- The website's MCP Server would expose tools like `create_page`, `update_page`, `delete_page`, `list_pages`, etc.
- Mother Brain's AI model sees these tools automatically — whether accessed via Smart Composer, A2A Agent, or Zed.

The only thing you'd need to build is **the website's MCP Server itself** — the server that can read/write the website's content/CMS. Everything else (routing, tool access, agentic execution) already works.

---

## Bottom line

| Question | Answer |
|----------|--------|
| Is this realistic? | Yes — the routing already exists. You just need the website MCP Server. |
| Is A2A the right protocol? | For external clients: **yes.** For Obsidian Smart Composer: **no** — direct MCP is simpler and faster. |
| Direct MCP vs A2A? | Register the website MCP Server in Mother Brain once. Both paths get it automatically. A2A is for clients that can't do MCP. |
| What to build first? | The website's MCP Server (the actual read/write content tools). Everything else is wiring. |

The one caveat: the A2A Agent runs on Cloudflare Workers (V8 isolate). If the website's MCP Server is stdio-based, the CF Worker can't connect to it directly. But it doesn't need to — it goes through Mother Brain's MCP Gateway, which CAN spawn stdio processes. So this works as long as the Mother Brain MCP Gateway is running when the A2A Agent needs it.
