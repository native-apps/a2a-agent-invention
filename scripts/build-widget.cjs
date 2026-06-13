#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build-widget.js — Generate a customized motherbrain-chat.js bundle
// ---------------------------------------------------------------------------
// Reads the template bundle and replaces default values with the user's
// A2A Agent settings. Optionally inlines a custom logo as a data URL.
//
// Usage:
//   node build-widget.js --config '{"agentName":"Mother",...}'
//   node build-widget.js --config-file ../config.json
//   node build-widget.js --config-file ../config.json --logo ./logo.svg
//
// Output:
//   ../frontend/bundle/dist/motherbrain-chat.js
//   ../frontend/bundle/dist/motherbrain-chat.html
// ---------------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");

// ── Paths ────────────────────────────────────────────────────────────────
const TEMPLATE_PATH = path.resolve(
  __dirname,
  "..",
  "frontend",
  "bundle",
  "motherbrain-chat.js",
);
const DIST_DIR = path.resolve(__dirname, "..", "frontend", "bundle", "dist");
const OUTPUT_JS = path.join(DIST_DIR, "motherbrain-chat.js");
const OUTPUT_HTML = path.join(DIST_DIR, "motherbrain-chat.html");
const HERO_SEARCH_SRC = path.resolve(
  __dirname,
  "..",
  "frontend",
  "bundle",
  "hero-search-bundle",
  "dist",
  "hero-search.js",
);
const OUTPUT_HERO = path.join(DIST_DIR, "hero-search.js");

// ── Parse CLI args ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      args.config = argv[++i];
    } else if (argv[i] === "--config-file" && argv[i + 1]) {
      args.configFile = argv[++i];
    } else if (argv[i] === "--logo" && argv[i + 1]) {
      args.logo = argv[++i];
    } else if (argv[i] === "--output" && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

// ── Load config ──────────────────────────────────────────────────────────
function loadConfig(args) {
  if (args.config) {
    return JSON.parse(args.config);
  }
  if (args.configFile) {
    const resolved = path.resolve(args.configFile);
    if (!fs.existsSync(resolved)) {
      console.error(`Config file not found: ${resolved}`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  }
  // Fallback: try to load the invention config.json
  const defaultConfig = path.resolve(__dirname, "..", "config.json");
  if (fs.existsSync(defaultConfig)) {
    return JSON.parse(fs.readFileSync(defaultConfig, "utf-8"));
  }
  console.error("No config provided. Use --config or --config-file");
  process.exit(1);
}

// ── Read file as data URL ────────────────────────────────────────────────
function fileToDataUrl(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`Logo file not found: ${resolved}, skipping...`);
    return null;
  }
  const ext = path.extname(resolved).toLowerCase();
  const mimeMap = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".icns": "image/icns",
  };
  const mime = mimeMap[ext];
  if (!mime) {
    console.warn(`Unsupported logo format: ${ext}, skipping...`);
    return null;
  }
  if (ext === ".svg") {
    // SVG: encode as UTF-8 data URL (smaller than base64)
    const text = fs.readFileSync(resolved, "utf-8");
    return `data:${mime};utf8,${encodeURIComponent(text)}`;
  }
  // Binary: base64 data URL
  const buf = fs.readFileSync(resolved);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ── String replacements ──────────────────────────────────────────────────
function applyConfig(template, config, logoDataUrl) {
  let result = template;

  // Default endpoint
  const endpoint =
    config.endpoint || config.agentUrl || "https://a2a.motherbrain.app";
  result = result.replace(
    /return this\.getAttribute\("endpoint"\) \|\| "[^"]*"/,
    `return this.getAttribute("endpoint") || "${endpoint}"`,
  );

  // Default skill
  if (config.skill) {
    result = result.replace(
      /return this\.getAttribute\("skill"\) \|\| "[^"]*"/,
      `return this.getAttribute("skill") || "${config.skill}"`,
    );
  }

  // Default theme
  const theme = config.theme || "dark";
  result = result.replace(
    /return this\.getAttribute\("theme"\) \|\| "[^"]*"/,
    `return this.getAttribute("theme") || "${theme}"`,
  );

  // Default agent name
  const agentName = config.agentName || "MOTHER";
  result = result.replace(
    /return this\.getAttribute\("agent-name"\) \|\| "[^"]*"/,
    `return this.getAttribute("agent-name") || "${agentName}"`,
  );

  // Default agent description
  if (config.agentDescription) {
    result = result.replace(
      /return this\.getAttribute\("agent-description"\) \|\| "[^"]*"/,
      `return this.getAttribute("agent-description") || "${config.agentDescription}"`,
    );
  }

  // Default branding text
  const branding =
    config.branding || config.widgetBranding || "Powered by Mother Brain";
  result = result.replace(
    /return this\.getAttribute\("branding"\) \|\| "[^"]*"/,
    `return this.getAttribute("branding") || "${branding}"`,
  );

  // Default primary color
  const color = config.widgetColor || config.primaryColor || "#39ff14";
  result = result.replace(
    /return this\.getAttribute\("primary-color"\) \|\| "[^"]*"/,
    `return this.getAttribute("primary-color") || "${color}"`,
  );

  // Default logo URL — inline custom logo if provided
  const logoUrl = logoDataUrl || config.logoUrl || "";
  result = result.replace(
    /return this\.getAttribute\("logo-url"\) \|\| "[^"]*"/,
    `return this.getAttribute("logo-url") || "${logoUrl}"`,
  );

  return result;
}

// ── Generate example HTML ────────────────────────────────────────────────
function generateHtml(config) {
  const endpoint =
    config.endpoint || config.agentUrl || "https://a2a.motherbrain.app";
  const agentName = config.agentName || "MOTHER";
  const theme = config.theme || "dark";
  const color = config.widgetColor || config.primaryColor || "#39ff14";
  const branding =
    config.branding || config.widgetBranding || "Powered by Mother Brain";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${agentName} — Chat Widget</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      background: #0a0a0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    h1 {
      font-size: 20px;
      color: #39ff14;
      letter-spacing: 0.05em;
    }
    p {
      font-size: 12px;
      color: #666;
      max-width: 500px;
      text-align: center;
      line-height: 1.6;
    }
    .trigger-btn {
      background: ${color}22;
      color: ${color};
      border: 1px solid ${color}44;
      padding: 10px 24px;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .trigger-btn:hover { background: ${color}33; }
    .hero-search-container {
      width: 100%;
      max-width: 768px;
      padding: 0 16px;
    }
  </style>
</head>
<body>
  <h1>${agentName}</h1>
  <p>
    This is a preview of the <strong>${agentName}</strong> chat widget with Hero Search.
    Type in the Hero Search and press Enter to start a chat.
  </p>
  <div class="hero-search-container">
    <ne-hero-search></ne-hero-search>
  </div>
  <button class="trigger-btn" onclick="document.querySelector('motherbrain-chat').openChat()">
    Open Chat
  </button>

  <script src="./hero-search.js"></script>
  <script src="./motherbrain-chat.js"></script>
  <motherbrain-chat
    endpoint="${endpoint}"
    theme="${theme}"
    agent-name="${agentName}"
    primary-color="${color}"
    branding="${branding}"
    hero-search="true"
  ></motherbrain-chat>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig(args);

  console.log("Building customized motherbrain-chat.js...");
  console.log(`  Agent:    ${config.agentName || "MOTHER"}`);
  console.log(
    `  Endpoint: ${config.endpoint || config.agentUrl || "https://a2a.motherbrain.app"}`,
  );
  console.log(`  Theme:    ${config.theme || "dark"}`);
  console.log(
    `  Color:    ${config.widgetColor || config.primaryColor || "#39ff14"}`,
  );

  // Read template
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  // Process logo
  let logoDataUrl = null;
  if (args.logo) {
    logoDataUrl = fileToDataUrl(args.logo);
    if (logoDataUrl) {
      console.log(`  Logo:     Inlined from ${args.logo}`);
    }
  } else if (config.logoUrl && config.logoUrl.startsWith("data:")) {
    // Already a data URL in config
    logoDataUrl = config.logoUrl;
    console.log("  Logo:     Using data URL from config");
  }

  // Apply config
  const output = applyConfig(template, config, logoDataUrl);

  // Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // Write output
  const outputPath = args.output ? path.resolve(args.output) : OUTPUT_JS;
  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`  Output:   ${outputPath}`);

  // Copy Hero Search bundle to dist
  if (fs.existsSync(HERO_SEARCH_SRC)) {
    fs.copyFileSync(HERO_SEARCH_SRC, OUTPUT_HERO);
    console.log(`  Hero:     ${OUTPUT_HERO}`);
  } else {
    console.warn(
      `  Hero:     hero-search.js not found at ${HERO_SEARCH_SRC}, skipping...`,
    );
  }

  // Write example HTML (always in dist dir)
  const html = generateHtml(config);
  fs.writeFileSync(OUTPUT_HTML, html, "utf-8");
  console.log(`  HTML:     ${OUTPUT_HTML}`);

  console.log("Done!");
}

main();
