#!/usr/bin/env node
// ---------------------------------------------------------------------------
// deploy-to-mega.cjs — Package & Deploy A2A Agent Invention
// ---------------------------------------------------------------------------
// Usage:
//   node scripts/deploy-to-mega.cjs                    # Package only (no upload)
//   node scripts/deploy-to-mega.cjs --upload           # Package + upload (GH Releases + registry publish)
//   node scripts/deploy-to-mega.cjs --upload --bump    # Bump patch version first
//
// Environment variables (for --upload):
//   INVENTIONS_PUBLISH_KEY — API key for the Encore.dev publish endpoint
//   GH_REPO               — GitHub repo for releases (default: native-apps/a2a-agent-invention)
//
// Upload order: GitHub Releases (primary) → Encore registry publish
// Or use .env file in project root.
// (Mega S4 fallback removed 2026-08-23 — GitHub Releases is the sole download source.)
// ---------------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// ── Paths ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "config.json");
const ENV_PATH = path.join(ROOT, ".env");

// ── Load .env ────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, val] = match;
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
}

loadEnv();

// ── Config ───────────────────────────────────────────────────────────────

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ── Version Bumping ──────────────────────────────────────────────────────

function bumpPatch(version) {
  const parts = version.split(".");
  const patch = parseInt(parts[2] || "0", 10) + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

// ── Packaging ────────────────────────────────────────────────────────────

function getExcludes() {
  return [
    ".git",
    ".DS_Store",
    ".wrangler",
    "dist",
    ".env",
    ".env.local",
    ".env.example",
    ".motherbrain",
    ".cipherignore",
    "node_modules",
    "backend/node_modules",
    "frontend/node_modules",
    "*.log",
    "dist",
    "cf-worker-index.js",
    "worker.js", // stray deployed-bundle copy (diagnostic) — never ship
    "scripts/deploy-to-mega.cjs",
    // NEAR Rust contract — repo-only (it lives onchain); its target/ build
    // artifacts once ballooned the tarball from ~1MB to 1.6GB. Never ship.
    "near-contract",
    // Chat session exports contain credentials — never ship
    "A2A Agent Invention Deep Analysis and Setup.md",
    // Internal documents — AI coder notes, diagnostics, planning
    "GATEWAY-DIAGNOSIS.md",
    "PUBLIC-RELEASE-AUDIT.md",
    "mb-vmva.md",
    "raw-ai.md",
    "HANDOFF-TO-MB-CODER.md",
    "MB-CODER-CORRECTION-RE-PRODUCT-SCOPE.md",
    "docs/HANDOFF-VOICE-TO-A2A-INVENTION.md",
    "docs/VOICE-PERSONAL-ASSISTANT-FEATURE.md",
    "docs/AUDIT-PLAN.md",
    "docs/CLOUDFLARE-DEPLOYMENT-HEALTH-CHECKLIST.md",
    "docs/Experimental-A2A-Tool-for-MB-MCP.md",
    "docs/Neighbors-Feature-Plan.md",
    "docs/PREVIEW_BUNDLE_PARITY.md",
    "backend/src/New-A2A-Agent-Inventions-Settings-Screen.md",
    "imported/hero-search-bundle/docs",
    // Stale/dev artifacts and diagnostic reports — never ship
    "temp",
    "INVENTION-PROJECT-SEEDING-BUG-REPORT.md",
  ];
}

// ── Config Defaults ─────────────────────────────────────────────────────
// Ships a clean config.json with EMPTY settings so the Mother Brain app
// knows the invention has no project-specific settings yet — it will
// use DEFAULT_SETTINGS from the component code on first load.
// Only structural fields (id, name, version, type, components, etc.)
// ship with actual values.

function createCleanDefaults(config) {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    type: config.type,
    version: config.version,
    enabled: config.enabled,
    installedAt: "", // Set by Mother Brain on install
    updatedAt: "", // Set by Mother Brain on install/update
    projectIds: [],
    settings: {}, // EMPTY — project-specific settings live in projects/{projectId}/config.json
    database: config.database,
    tools: config.tools,
    routes: config.routes,
    icon: config.icon,
    author: config.author,
    homepage: config.homepage,
    components: config.components,
    actions: config.actions,
  };
}

// ── Mother Brain-Specific File Cleaning ──────────────────────────────────
// The repo contains MB-specific content ("Mother" identity, motherbrain.app
// URLs, project knowledge base). These are kept in the repo for OUR deployment
// but must be cleaned from the PUBLIC tarball so other users don't get our
// hardcoded identity.

const MB_FILES = {
  agentCard: path.join(ROOT, "backend/src/agent-card.json"),
  agentCardLegacy: path.join(ROOT, "backend/agent-card.json"),
  knowledgeBase: path.join(ROOT, "backend/src/knowledge-base.ts"),
  readme: path.join(ROOT, "README.md"),
};

// Generic agent-card.json for public distribution
const GENERIC_AGENT_CARD = {
  name: "AI Assistant",
  description:
    "An AI assistant powered by Mother Brain. Configure your Sub-Agent identity in settings to customize.",
  version: "1.0.0",
  documentationUrl: "",
  iconUrl: "",
  provider: {
    organization: "",
    url: "",
  },
  supportedInterfaces: [
    {
      url: "",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
  },
  securitySchemes: {
    bearer: {
      httpAuthSecurityScheme: {
        scheme: "bearer",
      },
    },
  },
  security: [{ bearer: [] }],
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [
    {
      id: "general",
      name: "General Assistance",
      description: "Answer questions and provide helpful guidance",
      tags: ["general", "support"],
      examples: ["How can you help me?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain", "application/json"],
    },
  ],
};

/**
 * Save real files, swap in generic versions for the public tarball.
 * Returns a restore() function that puts the originals back.
 */
function cleanMbSpecificFiles() {
  const saved = {};

  // Save + clean agent-card.json files
  for (const [key, filePath] of Object.entries({
    agentCard: MB_FILES.agentCard,
    agentCardLegacy: MB_FILES.agentCardLegacy,
  })) {
    if (fs.existsSync(filePath)) {
      saved[key] = fs.readFileSync(filePath, "utf-8");
      fs.writeFileSync(
        filePath,
        JSON.stringify(GENERIC_AGENT_CARD, null, 2),
        "utf-8",
      );
    }
  }

  // Save + clean knowledge-base.ts (blank out SOUL_MD so the generic
  // fallback in buildSystemPrompt() is used when no Sub-Agent is selected)
  if (fs.existsSync(MB_FILES.knowledgeBase)) {
    saved.knowledgeBase = fs.readFileSync(MB_FILES.knowledgeBase, "utf-8");
    let cleaned = saved.knowledgeBase;
    // Replace the SOUL_MD content with an empty string so buildSystemPrompt()
    // falls through to the generic identity else-branch.
    // The regex matches: export const SOUL_MD: string = `...`;
    // (non-greedy, matches the closing backtick + semicolon)
    cleaned = cleaned.replace(
      /export const SOUL_MD: string = `[^`]*`;/s,
      'export const SOUL_MD: string = "";',
    );
    // Also scrub any real MCP API keys from SKILLS_MD (the packer may
    // include them from the source project's documentation).
    cleaned = cleaned.replace(
      /mb_mcp_[a-f0-9]{32}/g,
      "mb_mcp_YOUR_MCP_API_KEY",
    );
    // Blank SKILLS_MD for the public tarball (contains MB-specific tool docs)
    cleaned = cleaned.replace(
      /export const SKILLS_MD: string = `[^`]*`;/s,
      'export const SKILLS_MD: string = "";',
    );
    // Genericize SECURITY_DIRECTIVES — replace MB-specific references
    cleaned = cleaned.replace(/motherbrain\.app/g, "yourdomain.com");
    cleaned = cleaned.replace(/Mother Brain/g, "Your Product");
    cleaned = cleaned.replace(/Native Apps Dev/g, "Your Company");
    fs.writeFileSync(MB_FILES.knowledgeBase, cleaned, "utf-8");
  }

  // Save + clean README.md (replace motherbrain.app URLs with placeholders)
  if (fs.existsSync(MB_FILES.readme)) {
    saved.readme = fs.readFileSync(MB_FILES.readme, "utf-8");
    let cleaned = saved.readme;
    cleaned = cleaned.replace(
      /https:\/\/a2a\.motherbrain\.app/g,
      "https://a2a.yourdomain.com",
    );
    cleaned = cleaned.replace(
      /https:\/\/motherbrain\.app/g,
      "https://yourdomain.com",
    );
    fs.writeFileSync(MB_FILES.readme, cleaned, "utf-8");
  }

  return () => {
    for (const [key, content] of Object.entries(saved)) {
      const filePath =
        key === "agentCard"
          ? MB_FILES.agentCard
          : key === "agentCardLegacy"
            ? MB_FILES.agentCardLegacy
            : key === "knowledgeBase"
              ? MB_FILES.knowledgeBase
              : MB_FILES.readme;
      fs.writeFileSync(filePath, content, "utf-8");
    }
    console.log("   ✅ MB-specific files restored");
  };
}

function createTarball(config) {
  const version = config.version;
  const tarballName = `a2a-agent-v${version}.tar.gz`;
  const tarballPath = path.join(DIST, tarballName);

  // Ensure dist dir exists
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  // Remove old tarballs
  const existingTarballs = fs
    .readdirSync(DIST)
    .filter((f) => f.endsWith(".tar.gz"));
  for (const old of existingTarballs) {
    fs.unlinkSync(path.join(DIST, old));
  }

  // ── Settings Preservation ─────────────────────────────────────
  // Save the developer's real config, swap in clean defaults for the
  // tarball so users' settings are never overwritten on update.
  // The MB app should deep-merge config.json with existing settings.
  const realConfig = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cleanConfig = createCleanDefaults(config);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cleanConfig, null, 2), "utf-8");

  // ── MB-Specific File Cleaning ──────────────────────────────────
  // Save the creator's real files (agent-card.json with "Mother",
  // SOUL_MD, README with motherbrain.app URLs), swap in generic
  // versions for the public tarball, then restore after packaging.
  const restoreMbFiles = cleanMbSpecificFiles();

  // Build exclude args
  const excludeArgs = getExcludes()
    .map((e) => `--exclude='${e}'`)
    .join(" ");

  // Create tar.gz from the project root.
  // We use a two-step process:
  // 1. Create uncompressed tarball (tar -cf)
  // 2. Append backend/node_modules/hono (needed for wrangler deploy)
  // 3. gzip to final .tar.gz
  // This keeps the tarball small (~2.8MB for hono vs 238MB for all node_modules)
  const tarballBase = tarballPath.replace(/\.gz$/, "");
  const cmd = `tar -cf "${tarballBase}" ${excludeArgs} -C "${ROOT}" .`;

  console.log(`📦 Packaging invention v${version}...`);
  execSync(cmd, { stdio: "inherit" });

  // Append hono (the ONLY production dependency needed by wrangler)
  execSync(`tar -rf "${tarballBase}" -C "${ROOT}/backend" node_modules/hono`, { stdio: "inherit" });
  console.log(`   ✅ Appended backend/node_modules/hono (2.8MB) to tarball`);

  // Gzip the final tarball
  execSync(`gzip -f "${tarballBase}"`, { stdio: "inherit" });

  // Restore the developer's real config
  fs.writeFileSync(CONFIG_PATH, realConfig, "utf-8");
  // Restore the creator's real MB-specific files
  restoreMbFiles();

  // Compute SHA256
  const hash = crypto.createHash("sha256");
  const fileBuffer = fs.readFileSync(tarballPath);
  hash.update(fileBuffer);
  const sha256 = hash.digest("hex");

  const size = fs.statSync(tarballPath).size;

  console.log(`✅ Packaged: ${tarballName}`);
  console.log(`   Size: ${(size / 1024).toFixed(1)} KB`);
  console.log(`   SHA256: ${sha256}`);

  return { tarballPath, tarballName, sha256, size, version };
}

// ── Registry Entry ───────────────────────────────────────────────────────

function createRegistryEntry(config, tarballInfo) {
  const repo = process.env.GH_REPO || "native-apps/a2a-agent-invention";

  return {
    id: config.id,
    name: config.name,
    version: tarballInfo.version,
    description: config.description,
    type: config.type,
    icon: config.icon || "MessageSquare",
    author: config.author || "Native Apps Dev",
    homepage: config.homepage || "",
    screenshots: config.screenshots || [],
    // Download source: GitHub Releases (proper SSL, no auth needed, global CDN)
    downloadUrl: `https://github.com/${repo}/releases/download/v${tarballInfo.version}/${tarballInfo.tarballName}`,
    sha256: tarballInfo.sha256,
    size: tarballInfo.size,
    releasedAt: new Date().toISOString(),
  };
}

// ── Upload to GitHub Releases (primary) ─────────────────────────────────

async function uploadToGitHubReleases(tarballInfo) {
  const repo = process.env.GH_REPO || "native-apps/a2a-agent-invention";
  const tag = `v${tarballInfo.version}`;
  const assetName = tarballInfo.tarballName;

  console.log(`\n📦 Uploading to GitHub Releases (primary)...`);
  console.log(`   Repo: ${repo}`);
  console.log(`   Tag:  ${tag}`);

  // Use gh CLI to create release + upload asset
  const { execSync } = require("child_process");

  try {
    // Check if release already exists
    let releaseExists = false;
    try {
      execSync(`gh release view ${tag} --repo ${repo}`, {
        stdio: "pipe",
        encoding: "utf-8",
      });
      releaseExists = true;
    } catch {
      // Release doesn't exist yet
    }

    if (releaseExists) {
      // Upload asset to existing release
      console.log(`   Release exists, uploading asset...`);
      execSync(
        `gh release upload ${tag} "${tarballInfo.tarballPath}" --repo ${repo} --clobber`,
        { stdio: "inherit" },
      );
    } else {
      // Create new release with asset
      console.log(`   Creating new release...`);
      execSync(
        `gh release create ${tag} "${tarballInfo.tarballPath}" --repo ${repo} --title "${tag}" --notes "A2A Agent ${tag}"`,
        { stdio: "inherit" },
      );
    }

    const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
    console.log(`✅ Uploaded to GitHub Releases!`);
    console.log(`   URL: ${downloadUrl}`);
    return downloadUrl;
  } catch (err) {
    console.error(`⚠️  GitHub Releases upload failed: ${err.message}`);
    console.error(`   Fix the failure above and re-run — GitHub Releases is the sole download source.`);
    return null;
  }
}

// ── Publish to Registry API (Encore.dev) ────────────────────────────────
// After uploading the tarball to GitHub Releases, call the Encore.dev publish
// endpoint to register the new version in the dynamic PostgreSQL-backed
// registry. This replaces manual SQL migrations.

const PUBLISH_API_URL = "https://api.motherbrain.app/api/inventions/publish";

async function publishToRegistry(registryEntry, config) {
  const apiKey = process.env.INVENTIONS_PUBLISH_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️  INVENTIONS_PUBLISH_KEY not set — skipping registry publish.",
    );
    console.warn(
      "   The tarball is on GitHub Releases but won't appear in the dynamic registry.",
    );
    console.warn("   Add INVENTIONS_PUBLISH_KEY to .env to enable.");
    return false;
  }

  const payload = {
    inventionId: registryEntry.id,
    name: registryEntry.name,
    version: registryEntry.version,
    description: registryEntry.description,
    type: registryEntry.type,
    icon: registryEntry.icon,
    author: registryEntry.author,
    homepage: registryEntry.homepage,
    screenshots: registryEntry.screenshots || [],
    downloadUrl: registryEntry.downloadUrl,
    checksum: registryEntry.sha256,
    downloadSize: registryEntry.size,
    releasedAt: registryEntry.releasedAt,
    apiKey: apiKey,
  };

  console.log(`\n📡 Publishing to Inventions Registry API...`);
  console.log(`   ${PUBLISH_API_URL}`);
  console.log(`   Version: ${registryEntry.version}`);

  try {
    const response = await fetch(PUBLISH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "<no body>");
      console.error(
        `❌ Registry publish failed: ${response.status} ${response.statusText}`,
      );
      console.error(`   Response: ${body}`);
      return false;
    }

    const result = await response.json().catch(() => ({}));
    console.log(`✅ Published to registry!`);
    if (result.version) {
      console.log(`   Registry version: ${result.version}`);
    }
    return true;
  } catch (err) {
    console.error(`❌ Registry publish error: ${err.message}`);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const shouldUpload = args.includes("--upload");
  const shouldBump = args.includes("--bump");

  // Read config
  const config = readConfig();
  console.log(`\n🧠 A2A Agent Invention — Deploy Script`);
  console.log(`   Current version: ${config.version}`);

  // Bump version if requested
  if (shouldBump) {
    const newVersion = bumpPatch(config.version);
    config.version = newVersion;
    config.updatedAt = new Date().toISOString();
    writeConfig(config);
    console.log(`   Bumped to: ${newVersion}`);
  }

  // Package
  const tarballInfo = createTarball(config);

  // Create registry entry
  const registryEntry = createRegistryEntry(config, tarballInfo);

  // Save registry entry locally
  fs.writeFileSync(
    path.join(DIST, "registry-entry.json"),
    JSON.stringify(registryEntry, null, 2),
    "utf-8",
  );

  if (shouldUpload) {
    // 1. Upload to GitHub Releases (sole download source)
    const ghUrl = await uploadToGitHubReleases(tarballInfo);

    // 2. Publish to the dynamic Encore.dev registry API (CRITICAL — makes the
    //    version visible in the Inventions > Labs screen).
    await publishToRegistry(registryEntry, config);

    console.log(`\n🎉 Deployment complete!`);
    console.log(`   Version: ${tarballInfo.version}`);
    console.log(`   Tarball: ${tarballInfo.tarballName}`);
    console.log(`   SHA256: ${tarballInfo.sha256}`);
    console.log(`   Download URL: ${registryEntry.downloadUrl}`);
    if (ghUrl) {
      console.log(`   GitHub: ✅ Download source`);
    }
  } else {
    console.log(`\n📦 Package ready: dist/${tarballInfo.tarballName}`);
    console.log(`   Registry entry: dist/registry-entry.json`);
    console.log(`\n   To upload (GitHub Releases + registry publish), run:`);
    console.log(`   node scripts/deploy-to-mega.cjs --upload`);
    console.log(`\n   To bump version + upload:`);
    console.log(`   node scripts/deploy-to-mega.cjs --upload --bump`);
  }
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
