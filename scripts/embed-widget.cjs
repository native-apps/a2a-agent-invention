#!/usr/bin/env node
// ---------------------------------------------------------------------------
// embed-widget.cjs — Embed widget JS bundles as base64 in a TS module
// ---------------------------------------------------------------------------
// Run this after updating motherbrain-chat.js or hero-search.js:
//   node scripts/embed-widget.cjs
//
// This makes the widget download work WITHOUT any server endpoint.
// ---------------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const chatPath = path.join(ROOT, "frontend/bundle/motherbrain-chat.js");
const heroPath = path.join(ROOT, "frontend/bundle/hero-search-bundle/dist/hero-search.js");
const outPath = path.join(ROOT, "settings/widget-bundles.ts");

const chatJs = fs.readFileSync(chatPath);
const heroJs = fs.readFileSync(heroPath);

const chatB64 = chatJs.toString("base64");
const heroB64 = heroJs.toString("base64");

const output = `// Auto-generated from frontend/bundle/ — do not edit manually
// Regenerate with: node scripts/embed-widget.cjs
// Embedded so widget download works without a server resource endpoint

export const CHAT_WIDGET_B64 = "${chatB64}";
export const HERO_SEARCH_B64 = "${heroB64}";

export function getChatWidgetJS(): string {
  return atob(CHAT_WIDGET_B64);
}

export function getHeroSearchJS(): string {
  return atob(HERO_SEARCH_B64);
}
`;

fs.writeFileSync(outPath, output);

console.log("✅ Generated settings/widget-bundles.ts");
console.log("   Chat widget:", (chatJs.length / 1024).toFixed(1), "KB →", (chatB64.length / 1024).toFixed(1), "KB b64");
console.log("   Hero search:", (heroJs.length / 1024).toFixed(1), "KB →", (heroB64.length / 1024).toFixed(1), "KB b64");
