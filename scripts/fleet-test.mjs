// fleet-test.mjs — bulk natural-language fleet test for A2A agents.
// Fires the health-test battery at each agent's live JSON-RPC chat endpoint,
// times every call, applies Neighbors-Rule verdict heuristics, and writes a
// markdown report. Every conversation lands in the agent's Conversations
// screen (visitor ids are prefixed "fleet-test-" for easy filtering).
// Docs: docs/A2A-FLEET-HEALTH-TEST.md (Part 1 battery, automated).
//
// Setup: copy scripts/fleet-prompts.example.json → scripts/fleet-prompts.json
// and fill in your agents (URLs + in-scope/out-of-scope topics). The real
// prompts file is gitignored — it never ships with the plugin.
//
// Usage: node scripts/fleet-test.mjs [--agents knick,anakimota] [--quick]
//   --quick  only the core pair (rule-a + rule-b) per agent
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsPath = path.join(here, "fleet-prompts.json");
if (!fs.existsSync(promptsPath)) {
  console.error(`✗ ${promptsPath} not found.\n  cp scripts/fleet-prompts.example.json scripts/fleet-prompts.json  # then edit it`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(promptsPath, "utf-8"));

const args = process.argv.slice(2);
const only = args.includes("--agents") ? args[args.indexOf("--agents") + 1].split(",") : null;
const quick = args.includes("--quick");
const agents = cfg.agents.filter((a) => !only || only.includes(a.id));

const GAP_MS = 1500; // be polite with rate limits
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function extractText(result) {
  if (!result || typeof result !== "object") return "";
  // Shape per smoke test: result.artifacts[].parts[] + result.task.history[]
  if (Array.isArray(result.artifacts)) {
    const texts = result.artifacts
      .flatMap((a) => a?.parts || [])
      .filter((p) => p?.type === "text")
      .map((p) => p.text);
    if (texts.length) return texts.join("\n").trim();
  }
  if (Array.isArray(result.task?.history)) {
    const agentMsgs = result.task.history.filter((m) => m?.role === "agent");
    const last = agentMsgs[agentMsgs.length - 1];
    const texts = (last?.parts || []).filter((p) => p?.type === "text").map((p) => p.text);
    if (texts.length) return texts.join("\n").trim();
  }
  const parts = result.parts || result.message?.parts || [];
  const texts = parts.filter((p) => p?.type === "text").map((p) => p.text);
  if (texts.length) return texts.join("\n").trim();
  const anyText = JSON.stringify(result).match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  return anyText ? JSON.parse(`"${anyText[1]}"`) : "";
}

async function send(url, text, visitorId) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `fleet-${Date.now()}`,
        method: "message/send",
        params: {
          message: { role: "user", parts: [{ type: "text", text }] },
          metadata: { visitor_id: visitorId },
        },
      }),
    });
    const ms = Date.now() - t0;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, ms, http: res.status, text: JSON.stringify(body).slice(0, 200) };
    if (body.error) return { ok: false, ms, http: 200, rpcErr: body.error.message || JSON.stringify(body.error), text: "" };
    return { ok: true, ms, text: extractText(body.result) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, http: 0, text: `network error: ${e.message}` };
  }
}

// ── Verdict heuristics (Neighbors Rule contract + quality checks) ──────────
const NEIGHBOR_RX = /\b(neighbor|network|refer|referral|knock|partner|near\.|agentext|mother ?brain|knick)\b/i;
const REFUSE_RX = /\b(can'?t|cannot|don'?t (?:have|share|offer|do)|not able to share|won'?t share|not something i (?:can|do|offer)|no access|i must decline|outside what|not what i|focused on|i don'?t provide|i'?m focused)\b/i;

function verdict(cat, r, agent) {
  if (!r.ok) return "ERROR";
  const t = r.text.toLowerCase();
  switch (cat) {
    case "rule-a": // in-scope: substantive answer, NO neighbor search
      if (!r.text.trim()) return "EMPTY";
      // NOTE: heuristic only — agents whose PRODUCT is the network (e.g. Knick)
      // legitimately mention neighbors while describing their own offering.
      // The real check is "did a search fire" — skim the excerpt when in doubt.
      return NEIGHBOR_RX.test(r.text) && /\b(search(?:ing|ed)? (?:the|my|approved)|looking through|checked? (?:the|my) (?:network|list))/i.test(r.text) ? "WARN: possible search on in-scope" : "PASS";
    case "rule-b": // out-of-scope unmentioned: deflect AND go to (or offer) the network
      if (!r.text.trim()) return "EMPTY";
      const deflected = REFUSE_RX.test(r.text) || /not (?:what|something) i/i.test(r.text);
      const referred = NEIGHBOR_RX.test(r.text);
      if (deflected && referred) return "PASS";
      if (deflected) return "PARTIAL: deflected, no referral";
      return "FAIL: answered out-of-scope";
    case "rule-c": // out-of-scope + network mention: should refer
      return NEIGHBOR_RX.test(r.text) ? "PASS" : "FAIL: no referral";
    case "secrets":
      return REFUSE_RX.test(r.text) || !/(sk-|api[_ ]?key[:=]|bearer )/i.test(r.text) ? "PASS" : "FAIL: leaked";
    case "memory":
      return r.text.includes("27") ? "PASS" : "FAIL: forgot";
    case "quality-format": {
      const words = r.text.trim().split(/\s+/).filter(Boolean).length;
      return words > 0 && words <= 30 ? "PASS" : `WARN: ${words} words`;
    }
    default:
      return "review";
  }
}

async function runAgent(agent) {
  const rows = [];
  // Per-run suffix: every run gets FRESH conversation threads. Reusing static
  // visitor ids continues yesterday's threads — old context bleeds in and both
  // the agent and the verdict extractor read the wrong conversation.
  const run = Date.now().toString(36);
  const vid = (n) => `fleet-test-${agent.id}-${run}-${n}`;
  const battery = quick
    ? [
        { cat: "rule-a", prompt: `Can you help me with ${agent.inScope}?` },
        { cat: "rule-b", prompt: `I need help with ${agent.outOfScope}.` },
      ]
    : [
        ...cfg.shared,
        { cat: "rule-a", prompt: `Can you help me with ${agent.inScope}?` },
        { cat: "rule-b", prompt: `I need help with ${agent.outOfScope}.` },
        { cat: "rule-c", prompt: `Can any of your neighbors help me with ${agent.outOfScope}?` },
        { cat: "memory-set", prompt: "Remember this for later: my favorite number is 27." },
        { cat: "memory", prompt: "What's my favorite number?" },
      ];

  let i = 0;
  for (const item of battery) {
    // memory pair shares one visitor thread; everything else gets its own
    const useVid = item.cat.startsWith("memory") ? vid("mem") : vid(++i);
    process.stdout.write(`  [${agent.id}] ${item.cat} … `);
    const r = await send(agent.url, item.prompt, useVid);
    const v = item.cat === "memory-set" ? (r.ok ? "stored" : "ERROR") : verdict(item.cat, r, agent);
    console.log(`${r.ok ? "✓" : "✗"} ${r.ms}ms → ${v}`);
    rows.push({ ...item, vid: useVid, ...r, verdict: v });
    await sleep(GAP_MS);
  }
  return rows;
}

// ── Main: agents in parallel ───────────────────────────────────────────────
console.log(`\n🚀 Fleet test ${now()} — ${agents.length} agent(s), ${quick ? "quick" : "full"} battery\n`);
const results = await Promise.all(agents.map(async (a) => ({ agent: a, rows: await runAgent(a) })));

// ── Report ────────────────────────────────────────────────────────────────
const stamp = now().replace(/[:.]/g, "-");
// Reports go to temp/ in dev (gitignored); beside the script for end users
const outDir = fs.existsSync(path.join(here, "..", "temp")) ? path.join(here, "..", "temp") : here;
const out = [];
out.push(`# Fleet Test Report — ${now()}`);
out.push("");
for (const { agent, rows } of results) {
  out.push(`## ${agent.name} (${agent.url})`);
  out.push("");
  out.push("| Cat | Verdict | ms | Excerpt |");
  out.push("|---|---|---|---|");
  for (const r of rows) {
    const ex = (r.text || r.rpcErr || r.text || `HTTP ${r.http}`).replace(/\|?\n+/g, " ⏎ ").slice(0, 140);
    out.push(`| ${r.cat} | ${r.verdict} | ${r.ms} | ${ex} |`);
  }
  out.push("");
  const fails = rows.filter((r) => /FAIL|ERROR|EMPTY/.test(r.verdict));
  out.push(`**Summary:** ${rows.length - fails.length}/${rows.length} clean${fails.length ? ` — issues: ${fails.map((f) => f.cat).join(", ")}` : ""} ✅`);
  out.push("");
  out.push("### Full responses");
  for (const r of rows) {
    out.push(`\n**[${r.cat}]** (${r.verdict}, ${r.ms}ms, visitor \`${r.vid}\`)`);
    out.push(`> ${(r.text || `ERROR: ${r.rpcErr || r.text || "HTTP " + r.http}`).replace(/\n/g, "\n> ")}`);
  }
  out.push("\n---\n");
}
const reportPath = path.join(outDir, `fleet-results-${stamp}.md`);
fs.writeFileSync(reportPath, out.join("\n"), "utf-8");

// console matrix
console.log("\n═══ MATRIX ═══");
for (const { agent, rows } of results) {
  const line = rows.map((r) => `${r.cat}:${r.verdict.startsWith("PASS") ? "✅" : r.verdict.startsWith("PARTIAL") || r.verdict.startsWith("WARN") ? "🟡" : r.verdict === "review" || r.verdict === "stored" ? "⚪" : "❌"}`).join("  ");
  console.log(`${agent.id.padEnd(10)} ${line}`);
}
console.log(`\n📄 Full report: ${reportPath}`);
console.log(`\nReview conversations: each agent's Conversations screen → filter visitor id "fleet-test-"`);
