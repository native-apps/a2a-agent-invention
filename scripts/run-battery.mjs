#!/usr/bin/env node
/**
 * run-battery.mjs — surgical test battery runner (HANDOFF §8 Arm A + §14.3).
 * Reads a battery JSON (default: anakimota-battery.json), sends each prompt
 * via message/send JSON-RPC 2.0, prints each reply, and appends a run entry
 * to the battery's meta.runlog (labeled --tag, e.g. before|after).
 *
 * Usage: node scripts/run-battery.mjs [--tag before] [--battery scripts/anakimota-battery.json]
 */
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const tagIdx = args.indexOf("--tag");
const tag = tagIdx !== -1 ? args[tagIdx + 1] : `run-${Date.now()}`;
const batIdx = args.indexOf("--battery");
const batteryPath = new URL(batIdx !== -1 ? args[batIdx + 1] : "./anakimota-battery.json", import.meta.url);

const battery = JSON.parse(await readFile(batteryPath, "utf8"));
const { worker } = battery.meta;

function extractText(result) {
  if (!result) return "";
  const h = result.task?.history || [];
  const last = [...h].reverse().find((m) => m.role === "agent");
  return last?.parts?.map((p) => p.text || "").join(" ").trim() || "";
}

const results = [];
for (const p of battery.prompts) {
  const t0 = Date.now();
  try {
    const res = await fetch(worker, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `battery-${p.id}-${Date.now()}`,
        method: "message/send",
        params: {
          message: { role: "user", parts: [{ type: "text", text: p.text }] },
          metadata: { visitor_id: p.visitor },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.json().catch(() => ({}));
    const text = body.error ? `RPC ERROR: ${body.error.message}` : extractText(body.result);
    results.push({ id: p.id, category: p.category, ok: res.ok && !body.error, ms: Date.now() - t0, text });
    console.log(`\n=== [${p.id}] ${p.category} (${Date.now() - t0}ms) ===\n${text.slice(0, 700)}`);
  } catch (e) {
    results.push({ id: p.id, category: p.category, ok: false, ms: Date.now() - t0, text: `network error: ${e.message}` });
    console.log(`\n=== [${p.id}] ${p.category} FAILED: ${e.message} ===`);
  }
}

battery.meta.runlog.push({ tag, ranAt: new Date().toISOString(), results });
await writeFile(batteryPath, JSON.stringify(battery, null, 2));
console.log(`\nRun "${tag}" logged to ${batteryPath.pathname.split("/").pop()} (${results.length} prompts).`);
