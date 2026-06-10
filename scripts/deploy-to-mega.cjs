#!/usr/bin/env node
// ---------------------------------------------------------------------------
// deploy-to-mega.cjs — Package & Deploy A2A Agent Invention to Mega S4
// ---------------------------------------------------------------------------
// Usage:
//   node scripts/deploy-to-mega.cjs                    # Package only (no upload)
//   node scripts/deploy-to-mega.cjs --upload           # Package + upload to Mega S4
//   node scripts/deploy-to-mega.cjs --upload --bump    # Bump patch version first
//
// Environment variables (for --upload):
//   S4_ACCESS_KEY_ID     — Mega S4 access key
//   S4_SECRET_ACCESS_KEY — Mega S4 secret key
//   S4_REGION            — Mega S4 region (default: eu-amsterdam)
//   S4_BUCKET            — Mega S4 bucket name (default: motherbrain-inventions)
//
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

  // Build exclude args
  const excludeArgs = getExcludes()
    .map((e) => `--exclude='${e}'`)
    .join(" ");

  // Create tar.gz from the project root
  const cmd = `tar -czf "${tarballPath}" ${excludeArgs} -C "${ROOT}" .`;

  console.log(`📦 Packaging invention v${version}...`);
  execSync(cmd, { stdio: "inherit" });

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
    downloadUrl: `https://s3.${region}.megas4.com/${bucket}/${s4Key}`,
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
    // Upload tarball
    await uploadToS4(tarballInfo.tarballPath, registryEntry.tarball);

    // Upload registry
    await uploadRegistry(registryEntry);

    console.log(`\n🎉 Deployment complete!`);
    console.log(`   Version: ${tarballInfo.version}`);
    console.log(`   Tarball: ${tarballInfo.tarballName}`);
    console.log(`   SHA256: ${tarballInfo.sha256}`);
    console.log(`   Download URL: ${registryEntry.downloadUrl}`);
    console.log(`\n   Next: Give the download URL to the website AI coder`);
    console.log(`   to add to motherbrain.app/api/inventions/registry.json`);
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
