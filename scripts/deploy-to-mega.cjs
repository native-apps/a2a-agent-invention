#!/usr/bin/env node
// ---------------------------------------------------------------------------
// deploy-to-mega.cjs — Package & Deploy A2A Agent Invention to Mega S4
// ---------------------------------------------------------------------------
// Usage:
//   node scripts/deploy-to-mega.cjs                    # Package only (no upload)
//   node scripts/deploy-to-mega.cjs --upload           # Package + upload (GH Releases + Mega S4 + publish)
//   node scripts/deploy-to-mega.cjs --upload --bump    # Bump patch version first
//
// Environment variables (for --upload):
//   S4_ACCESS_KEY_ID      — Mega S4 access key (fallback)
//   S4_SECRET_ACCESS_KEY  — Mega S4 secret key (fallback)
//   S4_REGION             — Mega S4 region (default: eu-amsterdam)
//   S4_BUCKET             — Mega S4 bucket name (default: motherbrain-inventions)
//   INVENTIONS_PUBLISH_KEY — API key for the Encore.dev publish endpoint
//   GH_REPO               — GitHub repo for releases (default: native-apps/a2a-agent-invention)
//
// Upload order: GitHub Releases (primary) → Mega S4 (fallback) → Encore registry publish
// Or use .env file in project root.
// ---------------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
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
    "node_modules",
    ".wrangler",
    "dist",
    ".env",
    ".env.local",
    ".env.example",
    ".motherbrain",
    ".cipherignore",
    "backend/node_modules",
    "frontend/bundle/dist",
    "*.log",
    "dist",
    "scripts/deploy-to-mega.cjs",
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

  // Build exclude args
  const excludeArgs = getExcludes()
    .map((e) => `--exclude='${e}'`)
    .join(" ");

  // Create tar.gz from the project root
  const cmd = `tar -czf "${tarballPath}" ${excludeArgs} -C "${ROOT}" .`;

  console.log(`📦 Packaging invention v${version}...`);
  execSync(cmd, { stdio: "inherit" });

  // Restore the developer's real config
  fs.writeFileSync(CONFIG_PATH, realConfig, "utf-8");

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
  const region = process.env.S4_REGION || "eu-amsterdam";
  const bucket = process.env.S4_BUCKET || "motherbrain-inventions";
  const s4Key = `inventions/a2a-agent/v${tarballInfo.version}/a2a-agent.tar.gz`;

  return {
    id: config.id,
    name: config.name,
    version: tarballInfo.version,
    description: config.description,
    type: config.type,
    icon: config.icon || "MessageSquare",
    author: config.author || "Native Apps Dev",
    homepage: config.homepage || "",
    tarball: s4Key,
    // Primary: GitHub Releases (proper SSL, no auth needed, global CDN)
    downloadUrl: `https://github.com/${repo}/releases/download/v${tarballInfo.version}/${tarballInfo.tarballName}`,
    // Fallback: Mega S4 (requires auth, SSL issues)
    fallbackUrl: `https://s3.${region}.megas4.com/${bucket}/${s4Key}`,
    sha256: tarballInfo.sha256,
    size: tarballInfo.size,
    releasedAt: new Date().toISOString(),
  };
}

// ── Upload to Mega S4 ───────────────────────────────────────────────────

async function uploadToS4(tarballPath, s4Key) {
  // Dynamically import AWS SDK from Mother Brain's node_modules
  const mbNodeModules = path.join(
    os.homedir(),
    "Native Apps Dev/mother-brain/Mother-Brain/node_modules",
  );

  let S3Client, PutObjectCommand;
  try {
    const awsSdk = require(path.join(mbNodeModules, "@aws-sdk/client-s3"));
    S3Client = awsSdk.S3Client;
    PutObjectCommand = awsSdk.PutObjectCommand;
  } catch {
    console.error("❌ @aws-sdk/client-s3 not found.");
    console.error(
      "   Install it with: cd backend && npm install @aws-sdk/client-s3",
    );
    console.error("   Or point to Mother Brain's node_modules.");
    process.exit(1);
  }

  const region = process.env.S4_REGION || "eu-amsterdam";
  const bucket = process.env.S4_BUCKET || "motherbrain-inventions";
  const endpoint = process.env.S4_ENDPOINT || `https://s3.${region}.megas4.com`;
  const accessKeyId = process.env.S4_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S4_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    console.error("❌ Missing S4 credentials.");
    console.error("   Set S4_ACCESS_KEY_ID and S4_SECRET_ACCESS_KEY in .env");
    process.exit(1);
  }

  console.log(`\n☁️  Uploading to Mega S4...`);
  console.log(`   Region: ${region}`);
  console.log(`   Bucket: ${bucket}`);
  console.log(`   Key: ${s4Key}`);

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // Required for Mega S4
  });

  const fileStream = fs.readFileSync(tarballPath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s4Key,
    Body: fileStream,
    ContentType: "application/gzip",
    Metadata: {
      "invention-id": "a2a-agent",
      "invention-version": path
        .basename(tarballPath, ".tar.gz")
        .replace("a2a-agent-v", ""),
    },
  });

  await client.send(command);

  const downloadUrl = `${endpoint}/${bucket}/${s4Key}`;
  console.log(`✅ Uploaded successfully!`);
  console.log(`   URL: ${downloadUrl}`);

  return downloadUrl;
}

// ── Upload Registry ──────────────────────────────────────────────────────

async function uploadRegistry(registryEntry) {
  const mbNodeModules = path.join(
    os.homedir(),
    "Native Apps Dev/mother-brain/Mother-Brain/node_modules",
  );

  let S3Client, PutObjectCommand, GetObjectCommand;
  try {
    const awsSdk = require(path.join(mbNodeModules, "@aws-sdk/client-s3"));
    S3Client = awsSdk.S3Client;
    PutObjectCommand = awsSdk.PutObjectCommand;
    GetObjectCommand = awsSdk.GetObjectCommand;
  } catch {
    console.error("❌ @aws-sdk/client-s3 not found.");
    process.exit(1);
  }

  const region = process.env.S4_REGION || "eu-amsterdam";
  const bucket = process.env.S4_BUCKET || "motherbrain-inventions";
  const endpoint = process.env.S4_ENDPOINT || `https://s3.${region}.megas4.com`;
  const accessKeyId = process.env.S4_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S4_SECRET_ACCESS_KEY;

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  // Try to fetch existing registry
  let existing = {
    version: "1.0",
    updatedAt: new Date().toISOString(),
    inventions: [],
  };
  try {
    const getCmd = new GetObjectCommand({
      Bucket: bucket,
      Key: "registry.json",
    });
    const response = await client.send(getCmd);
    const body = await streamToString(response.Body);
    existing = JSON.parse(body);
    console.log(
      `📋 Found existing registry with ${existing.inventions.length} invention(s)`,
    );
  } catch {
    console.log(`📋 No existing registry found, creating new one`);
  }

  // Update or add the invention entry
  const idx = existing.inventions.findIndex(
    (inv) => inv.id === registryEntry.id,
  );
  if (idx >= 0) {
    existing.inventions[idx] = registryEntry;
    console.log(
      `📋 Updated existing entry: ${registryEntry.id} v${registryEntry.version}`,
    );
  } else {
    existing.inventions.push(registryEntry);
    console.log(
      `📋 Added new entry: ${registryEntry.id} v${registryEntry.version}`,
    );
  }

  existing.updatedAt = new Date().toISOString();

  // Upload updated registry
  const registryBody = JSON.stringify(existing, null, 2);
  const putCmd = new PutObjectCommand({
    Bucket: bucket,
    Key: "registry.json",
    Body: registryBody,
    ContentType: "application/json",
  });

  await client.send(putCmd);
  console.log(`✅ Registry uploaded: ${endpoint}/${bucket}/registry.json`);

  // Also save locally for reference
  fs.writeFileSync(
    path.join(DIST, "registry-entry.json"),
    JSON.stringify(registryEntry, null, 2),
    "utf-8",
  );
  fs.writeFileSync(path.join(DIST, "registry.json"), registryBody, "utf-8");
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
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
    console.error(`   Falling back to Mega S4 only.`);
    return null;
  }
}

// ── Publish to Registry API (Encore.dev) ────────────────────────────────
// After uploading the tarball to Mega S4, call the Encore.dev publish endpoint
// to register the new version in the dynamic PostgreSQL-backed registry.
// This replaces manual SQL migrations.

const PUBLISH_API_URL = "https://api.motherbrain.app/api/inventions/publish";

async function publishToRegistry(registryEntry, config) {
  const apiKey = process.env.INVENTIONS_PUBLISH_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️  INVENTIONS_PUBLISH_KEY not set — skipping registry publish.",
    );
    console.warn(
      "   The tarball is on Mega S4 but won't appear in the dynamic registry.",
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
    // 1. Upload to GitHub Releases (primary download source)
    const ghUrl = await uploadToGitHubReleases(tarballInfo);

    // 2. Upload to Mega S4 (fallback)
    await uploadToS4(tarballInfo.tarballPath, registryEntry.tarball);

    // 3. Upload legacy registry.json to Mega S4 (backwards compat)
    await uploadRegistry(registryEntry);

    // 4. Publish to the dynamic Encore.dev registry API
    await publishToRegistry(registryEntry, config);

    console.log(`\n🎉 Deployment complete!`);
    console.log(`   Version: ${tarballInfo.version}`);
    console.log(`   Tarball: ${tarballInfo.tarballName}`);
    console.log(`   SHA256: ${tarballInfo.sha256}`);
    console.log(`   Download URL: ${registryEntry.downloadUrl}`);
    if (ghUrl) {
      console.log(`   GitHub: ✅ Primary download source`);
    }
    console.log(`   Mega S4: Fallback download source`);
    console.log(`\n   Registry: motherbrain.app/api/inventions/registry.json`);
  } else {
    console.log(`\n📦 Package ready: dist/${tarballInfo.tarballName}`);
    console.log(`   Registry entry: dist/registry-entry.json`);
    console.log(`\n   To upload to Mega S4, run:`);
    console.log(`   node scripts/deploy-to-mega.cjs --upload`);
    console.log(`\n   To bump version + upload:`);
    console.log(`   node scripts/deploy-to-mega.cjs --upload --bump`);
  }
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
