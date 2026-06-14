/**
 * Pack Knowledge Base — searches the current project for knowledge base docs
 * and generates a TypeScript module (backend/src/knowledge-base.ts) that
 * bundles them as string constants for the Cloudflare Worker.
 *
 * Usage:
 *   node scripts/pack-knowledge-base.cjs                          # auto-detect
 *   node scripts/pack-knowledge-base.cjs --source /path/to/project # explicit
 *   KB_SOURCE_DIR=/path/to/project node scripts/pack-knowledge-base.cjs
 *   node scripts/pack-knowledge-base.cjs --init                   # create templates
 *
 * ── File Discovery ──────────────────────────────────────────────────
 *
 * The packer searches for three knowledge base files in the project:
 *
 *   SOUL.md      — Agent personality, identity, product knowledge
 *   SKILLS.md    — Tool selection guidance, capability descriptions
 *   SECURITY.md  — Internal security directives (PRIVATE — server-side only)
 *
 * Search locations (in priority order):
 *   1. --source <dir> or KB_SOURCE_DIR env var
 *   2. Invention's own knowledge-base/ directory (local override)
 *   3. <project>/CF Worker/           (Obsidian vault convention)
 *   4. <project>/knowledge-base/      (standard convention)
 *   5. <project>/                     (root-level fallback)
 *
 * For SECURITY.md, also matches:
 *   - SECURITY.md, Security.md
 *   - *Security Directives*, *security-directives*
 *   - 🔒*Security* (Obsidian emoji convention)
 *
 * ── How It Works ────────────────────────────────────────────────────
 *
 * The generated knowledge-base.ts is committed to the repo and deployed
 * with the Worker. To UPDATE the knowledge base:
 *   1. Edit the source .md files in your project
 *   2. Re-run this script: node scripts/pack-knowledge-base.cjs --source /path/to/project
 *   3. Redeploy the Worker
 *
 * The generated module is a build artifact — do not edit it directly.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "backend", "src", "knowledge-base.ts");

// ── CLI Args ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    source: process.env.KB_SOURCE_DIR || null,
    init: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      result.source = args[i + 1];
      i++;
    } else if (args[i] === "--init") {
      result.init = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: node scripts/pack-knowledge-base.cjs [options]

Options:
  --source <dir>   Project directory to search for knowledge base files
  --init           Create template knowledge base files if they don't exist
  --help, -h       Show this help

Environment:
  KB_SOURCE_DIR    Same as --source

If no source is specified, the packer searches:
  1. The invention's own knowledge-base/ directory
  2. ~/Native Apps Dev/the-mother-brain/ (default Obsidian vault)
`);
      process.exit(0);
    }
  }

  return result;
}

// ── File Discovery ───────────────────────────────────────────────────

/**
 * Directories to search for knowledge base files (in priority order).
 */
function getSearchDirs(explicitSource) {
  const dirs = [];

  if (explicitSource) {
    dirs.push(explicitSource);
  }

  // Invention's own knowledge-base/ directory (local override)
  dirs.push(path.join(ROOT, "knowledge-base"));

  // Default Obsidian vault location (current convention for the-mother-brain)
  const defaultVault = path.join(
    os.homedir(),
    "Native Apps Dev",
    "the-mother-brain",
  );
  if (fs.existsSync(defaultVault)) {
    dirs.push(path.join(defaultVault, "CF Worker"));
    dirs.push(defaultVault);
  }

  return dirs;
}

/**
 * Search for a knowledge base file by trying multiple names and directories.
 * Returns { content, foundPath } or { content: "", foundPath: null }.
 */
function findKnowledgeFile(searchDirs, candidates) {
  for (const dir of searchDirs) {
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8").trim();
          if (content) {
            return { content, foundPath: fullPath };
          }
        } catch {
          // File exists but can't be read — skip
        }
      }
    }
  }

  // Fallback: recursive search for filename patterns
  for (const dir of searchDirs.slice(0, 3)) {
    // Only search first 3 dirs to avoid deep recursion
    if (!fs.existsSync(dir)) continue;
    try {
      const files = findFilesRecursive(dir, candidates, 3);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8").trim();
        if (content) {
          return { content, foundPath: file };
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  return { content: "", foundPath: null };
}

/**
 * Recursively search for files matching candidate names.
 * Matches by exact filename OR by pattern (for files like "*Security Directives*").
 */
function findFilesRecursive(dir, candidates, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const results = [];
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Skip noise directories
  const skipDirs = new Set([
    "node_modules",
    ".git",
    ".wrangler",
    "dist",
    ".obsidian",
    ".smtcmp_json_db",
    "__pycache__",
    ".next",
    ".nuxt",
  ]);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      results.push(
        ...findFilesRecursive(fullPath, candidates, maxDepth, currentDepth + 1),
      );
    } else if (entry.isFile()) {
      // Check exact matches
      if (candidates.includes(entry.name)) {
        results.push(fullPath);
        continue;
      }

      // Check pattern matches (for files like "🔒 Mother — Internal Security Directives (PRIVATE).md")
      for (const candidate of candidates) {
        if (candidate.includes("*")) {
          // Convert glob to regex
          const regex = new RegExp(
            "^" +
              candidate
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*/g, ".*") +
              "$",
            "i",
          );
          if (regex.test(entry.name)) {
            results.push(fullPath);
            break;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Discover all knowledge base files.
 */
function discoverKnowledgeFiles(searchDirs) {
  // SOUL.md — exact name only
  const soul = findKnowledgeFile(searchDirs, ["SOUL.md", "soul.md"]);

  // SKILLS.md — exact name only
  const skills = findKnowledgeFile(searchDirs, ["SKILLS.md", "skills.md"]);

  // Security directives (PRIVATE) — multiple name patterns
  const securityDirectives = findKnowledgeFile(searchDirs, [
    "SECURITY.md",
    "Security.md",
    "🔒 Mother — Internal Security Directives (PRIVATE).md",
    "*Security*Directives*",
    "*security*directives*",
    "*Internal*Security*",
  ]);

  // Public security docs — from Knowledge Base directory specifically
  let publicSecurity = { content: "", foundPath: null };
  for (const dir of searchDirs) {
    const kbDir = path.join(path.dirname(dir), "Knowledge Base");
    const candidate = path.join(kbDir, "Security.md");
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, "utf-8").trim();
        if (content) {
          publicSecurity = { content, foundPath: candidate };
          break;
        }
      } catch {
        // skip
      }
    }
  }

  return { soul, skills, securityDirectives, publicSecurity };
}

// ── Template Generation (--init) ─────────────────────────────────────

const TEMPLATES = {
  "SOUL.md": `# 🧠 Agent — SOUL.md

> *Define your agent's personality, identity, and knowledge here.*

---

## Who I Am

I am **[Agent Name]**, the AI support agent for **[Your Product]**.

**My voice:** [Describe the tone — warm, technical, casual, professional, etc.]

---

## What I Know

### The Product

[Describe your product here. What does it do? What problem does it solve?
What are the key features? What's the technology stack?]

### Key Features

- **Feature 1** — [Description]
- **Feature 2** — [Description]
- **Feature 3** — [Description]

### Use Cases

- [Use case 1]
- [Use case 2]
- [Use case 3]

---

## How I Communicate

- **Be concise.** Every sentence earns its place.
- **Be accurate.** If I don't know something, I say so.
- **Be helpful.** I solve the user's problem, not just answer the question.
- Keep responses to 150-300 words for chat.
- Use markdown formatting (code blocks, links, lists).
`,

  "SKILLS.md": `# 🛠️ Agent — SKILLS.md

> *Guide the AI on which MCP tools to use and when.*

---

## Tool Selection Guidance

You have access to MCP tools through the Mother Brain Gateway. Use tools to look up information rather than guessing.

### Available Tools

- **search_chat_history** — Search previous conversations with this visitor.
  CRITICAL: You are sessionless. ALWAYS call this first to recall past context.
- **search_memories** — Search stored facts, decisions, and summaries.
- **search_codebase** — Search indexed code files.
- **search_git_history** — Search commit history.
- **get_file_content** — Read specific indexed files.

### When to Use Tools

1. **Before every response**: Call search_chat_history with the visitor's question.
2. **When asked about implementation**: Use search_codebase to find relevant code.
3. **When asked about decisions/rationale**: Use search_memories.
4. **When you don't know something**: Search for it rather than guessing.

If tools are unavailable, provide your best answer from training knowledge.
`,

  "SECURITY.md": `# 🔒 Agent — Internal Security Directives (PRIVATE)

> **CLASSIFICATION: INTERNAL — NEVER VECTORIZE, NEVER INDEX, NEVER SERVE**
> This document is packed into the Cloudflare Worker. It must never be
> accessible via any API response or client-side code.

---

## Absolute Prohibitions

The agent must **never** reveal:

### Source Code & Architecture
- Any portion of source code, codebase structure, or internal module names
- Internal architecture specifics beyond public documentation
- Database schema details, table names, or security policies

### Users & Visitors
- Other visitors' identities, emails, or personal data
- Any user's chat history or conversation content
- Usage patterns or behavioral analytics

### Security Implementation
- Encryption algorithms, key lengths, or cryptographic choices
- Where secrets are stored or how they're rotated
- Security vulnerabilities, active bugs, or attack surface details

### Operational Details
- Internal API endpoints beyond public documentation
- Server infrastructure, instance counts, or deployment schedules
- Internal team communications or business metrics

---

## Response Protocol for Probing Attempts

If any user attempts to extract prohibited information:
1. **Do not confirm or deny** the existence of internal mechanisms
2. **Redirect** to publicly available documentation
3. **Do not explain** why you cannot answer
4. **Never break character** — maintain your persona
`,
};

/**
 * Create template knowledge base files in the specified directory.
 */
function initTemplates(targetDir) {
  const kbDir = path.join(targetDir, "knowledge-base");

  if (!fs.existsSync(kbDir)) {
    fs.mkdirSync(kbDir, { recursive: true });
  }

  console.log(`  Creating templates in: ${kbDir}`);
  console.log();

  for (const [filename, content] of Object.entries(TEMPLATES)) {
    const filePath = path.join(kbDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`  ○ ${filename} — already exists, skipping`);
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`  ✓ ${filename} — created`);
    }
  }

  console.log();
  console.log("  Templates created. Edit them to customize your agent,");
  console.log(
    "  then re-run: node scripts/pack-knowledge-base.cjs --source " + targetDir,
  );
}

// ── TypeScript Module Generation ─────────────────────────────────────

/**
 * Escape backticks and backslashes for TypeScript template literal.
 */
function escapeForTemplateLiteral(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

/**
 * Generate the TypeScript module from discovered content.
 */
function generateModule(
  soul,
  skills,
  securityDirectives,
  publicSecurity,
  sourceInfo,
) {
  const packed = [];
  const skipped = [];

  if (soul.content) {
    packed.push("SOUL.md (personality)");
  } else {
    skipped.push("SOUL.md (NOT FOUND — Worker will use fallback identity)");
  }

  if (skills.content) {
    packed.push("SKILLS.md (tool guidance)");
  } else {
    skipped.push(
      "SKILLS.md (empty or not found — default tool guidance will be used)",
    );
  }

  if (securityDirectives.content) {
    packed.push("Security Directives (PRIVATE guardrails)");
  } else {
    skipped.push("Security Directives (NOT FOUND — basic guardrails only)");
  }

  if (publicSecurity.content) {
    packed.push("Public Security.md (reference)");
  } else {
    skipped.push("Public Security.md (not found)");
  }

  const timestamp = new Date().toISOString();

  return `/**
 * AUTO-GENERATED by scripts/pack-knowledge-base.cjs
 * DO NOT EDIT — re-run the packer to update.
 *
 * Generated: ${timestamp}
${sourceInfo}
 *
 * Packed: ${packed.join(", ") || "NONE"}
 * ${skipped.length ? "Skipped: " + skipped.join(", ") : ""}
 *
 * SECURITY: The SECURITY_DIRECTIVES constant contains PRIVATE internal rules.
 * It is server-side ONLY — never expose in client bundles, API responses,
 * or agent cards. It is injected into the system prompt to enforce guardrails.
 */

// ═══════════════════════════════════════════════════════════════
//  Knowledge Base Content (packed from project files)
// ═══════════════════════════════════════════════════════════════

/**
 * SOUL.md — Agent's personality, identity, product knowledge.
 * This defines WHO the agent is, what it knows, and how it communicates.
 *
 * Source: ${soul.foundPath || "NOT FOUND"}
 */
export const SOUL_MD: string = \`${escapeForTemplateLiteral(soul.content)}\`;

/**
 * SKILLS.md — Tool selection guidance and capability descriptions.
 * Informs the AI about which MCP tools to use and when.
 *
 * Source: ${skills.foundPath || "NOT FOUND (empty)"}
 */
export const SKILLS_MD: string = \`${escapeForTemplateLiteral(skills.content)}\`;

/**
 * Security Directives (PRIVATE) — Internal security rules.
 *
 * CLASSIFICATION: INTERNAL — NEVER VECTORIZE, NEVER INDEX, NEVER SERVE
 * This is injected into the system prompt to enforce what the agent must
 * NEVER reveal. It must never appear in client-side code or API responses.
 *
 * Source: ${securityDirectives.foundPath || "NOT FOUND"}
 */
export const SECURITY_DIRECTIVES: string = \`${escapeForTemplateLiteral(securityDirectives.content)}\`;

/**
 * Public Security.md — Customer-facing security documentation.
 * Available as reference for product-info and technical-support skills.
 *
 * Source: ${publicSecurity.foundPath || "NOT FOUND"}
 */
export const PUBLIC_SECURITY_MD: string = \`${escapeForTemplateLiteral(publicSecurity.content)}\`;

// ═══════════════════════════════════════════════════════════════
//  System Prompt Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Skill-specific role context. These are SHORTENED because SOUL.md
 * already defines the full identity, personality, and product knowledge.
 * Each skill just specifies the active ROLE for this conversation.
 */
const SKILL_ROLES: Record<string, string> = {
  "product-info": [
    "## Your Active Role: Website Sales & Conversion",
    "",
    "You are serving as the website chat agent on motherbrain.app.",
    "A visitor is talking to you. Focus on:",
    "- Explaining Mother Brain in plain language",
    "- Matching features to their specific use case",
    "- Sharing relevant use cases from your knowledge",
    "- Guiding them toward signup/purchase",
    "- Handling objections with confidence and data",
    "",
    "Available site pages for linking:",
    "[Home](/) | [Features](/features) | [Pricing](/pricing) | [Why Us](/why-us) | [About](/about) | [License](/license) | [Docs](/docs) | [Getting Started](/docs) | [Cerebellum Functions](/docs/cerebellum-functions)",
  ].join("\\n"),

  "technical-support": [
    "## Your Active Role: Product Support",
    "",
    "You are helping a Mother Brain user with installation, configuration,",
    "deployment, troubleshooting, or integration issues.",
    "Provide step-by-step guidance when appropriate.",
    "Assume technical competence but adjust if they are not technical.",
  ].join("\\n"),

  "developer-onboarding": [
    "## Your Active Role: Developer Onboarding",
    "",
    "You are guiding a developer through getting started with Mother Brain.",
    "Cover project setup, MCP server configuration, Total Recall, ROMs,",
    "Skills Registry, and first deployment. Be encouraging and thorough.",
  ].join("\\n"),

  "a2a-integration": [
    "## Your Active Role: A2A Integration Support",
    "",
    "You are helping an external agent connect to Mother Brain's A2A endpoint.",
    "Explain the protocol, Agent Cards, task lifecycle, JSON-RPC methods,",
    "and integration patterns.",
  ].join("\\n"),

  "enterprise-sales": [
    "## Your Active Role: Enterprise & Sales",
    "",
    "You are handling enterprise and sales inquiries for Mother Brain.",
    "Provide information on volume licensing, custom deployments,",
    "partnerships, and enterprise features. Be professional and consultative.",
  ].join("\\n"),
};

const DEFAULT_SKILL_ROLE = SKILL_ROLES["product-info"];

/**
 * Default tool selection guidance (used when SKILLS.md is empty).
 * Informs the AI about available MCP tools and when to use them.
 */
const DEFAULT_TOOL_GUIDANCE = [
  "## Tool Selection Guidance",
  "",
  "You have access to MCP tools through the Mother Brain Gateway.",
  "Use tools to look up information rather than guessing. Key tools:",
  "",
  "- search_chat_history: CRITICAL — Search previous conversations with this visitor.",
  "  You are sessionless. ALWAYS call this first to recall past context before answering.",
  "- search_memories: Search stored facts, decisions, and summaries.",
  "- search_codebase: Search indexed code files.",
  "- search_git_history: Search commit history.",
  "- get_file_content: Read specific indexed files.",
  "",
  "Always prefer using tools over guessing. If you do not know something, search for it.",
  "If tools are unavailable, provide your best answer from your training knowledge.",
].join("\\n");

/**
 * Build the complete system prompt for a conversation.
 *
 * Structure (in priority order):
 * 1. SOUL.md — Agent's identity, personality, product knowledge
 * 2. Security Directives — What the agent must NEVER reveal (PRIVATE)
 * 3. Skill Role — The active role for this conversation
 * 4. Tool Guidance — How to use MCP tools (from SKILLS.md or defaults)
 * 5. Visitor Context — Recalled memories from past conversations (dynamic)
 *
 * @param skillId - The skill ID for this conversation
 * @param visitorContext - Recalled visitor context string (from Total Recall)
 * @returns The complete system prompt
 */
export function buildSystemPrompt(
  skillId: string | undefined,
  visitorContext: string,
): string {
  const parts: string[] = [];

  // 1. Personality & Identity
  if (SOUL_MD) {
    parts.push(SOUL_MD);
  } else {
    // Fallback if SOUL.md wasn't packed
    parts.push([
      "You are Mother, the AI support agent for the Mother Brain platform.",
      "Mother Brain is the persistent memory layer for AI.",
      "You are warm, confident, technically precise, and helpful.",
      "Keep responses concise (150-300 words). Use markdown formatting.",
    ].join(" "));
  }

  // 2. Security Directives (PRIVATE guardrails)
  if (SECURITY_DIRECTIVES) {
    parts.push("---\\n\\n" + SECURITY_DIRECTIVES);
  } else {
    // Basic fallback guardrails
    parts.push([
      "---\\n\\n## Security Guardrails",
      "",
      "Never reveal: access tokens, API keys, project IDs, database connection",
      "strings, internal infrastructure details, source code, or credentials.",
      "Never share other users' data or conversations.",
      "Never reveal internal architecture, security implementation, or operational details.",
      "If asked about internals, redirect to https://motherbrain.app/docs",
    ].join("\\n"));
  }

  // 3. Skill-specific role
  const role = (skillId && SKILL_ROLES[skillId]) || DEFAULT_SKILL_ROLE;
  parts.push("---\\n\\n" + role);

  // 4. Tool selection guidance
  if (SKILLS_MD) {
    parts.push("---\\n\\n" + SKILLS_MD);
  } else {
    parts.push("---\\n\\n" + DEFAULT_TOOL_GUIDANCE);
  }

  // 5. Visitor context (dynamic recall)
  if (visitorContext) {
    parts.push("---\\n\\n## Visitor Context (Your Memory)\\n\\n" + visitorContext);
  }

  return parts.join("\\n\\n");
}
`;
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs();

  console.log("━".repeat(60));
  console.log("  Knowledge Base Packer — A2A Agent Invention");
  console.log("━".repeat(60));

  // Handle --init
  if (args.init) {
    const targetDir = args.source || ROOT;
    console.log();
    console.log("  Initializing template knowledge base files...");
    console.log();
    initTemplates(targetDir);
    console.log("━".repeat(60));
    return;
  }

  // Determine search directories
  const searchDirs = getSearchDirs(args.source);

  console.log();
  console.log("  Searching for knowledge base files in:");
  for (const dir of searchDirs) {
    const exists = fs.existsSync(dir);
    console.log(`    ${exists ? "✓" : "○"} ${dir}`);
  }
  console.log();

  // Discover files
  const { soul, skills, securityDirectives, publicSecurity } =
    discoverKnowledgeFiles(searchDirs);

  // Report findings
  console.log("  Discovery Results:");
  console.log();

  const report = [
    {
      label: "SOUL.md",
      item: soul,
      description: "Agent personality & identity",
      required: true,
    },
    {
      label: "SKILLS.md",
      item: skills,
      description: "Tool selection guidance",
      required: false,
    },
    {
      label: "Security Directives",
      item: securityDirectives,
      description: "Internal guardrails (PRIVATE)",
      required: true,
    },
    {
      label: "Public Security.md",
      item: publicSecurity,
      description: "Customer-facing docs",
      required: false,
    },
  ];

  let totalBytes = 0;
  const missing = [];

  for (const entry of report) {
    const size = Buffer.byteLength(entry.item.content, "utf-8");
    totalBytes += size;

    if (entry.item.content) {
      console.log(
        `  ✓ ${entry.label.padEnd(22)} ${(size / 1024).toFixed(1)}KB`.padEnd(
          36,
        ) + ` ← ${path.relative(os.homedir(), entry.item.foundPath)}`,
      );
    } else {
      console.log(
        `  ✗ ${entry.label.padEnd(22)} ${entry.required ? "MISSING (required)" : "missing (optional)"}`.padEnd(
          36,
        ) + ` ${entry.description}`,
      );
      if (entry.required) {
        missing.push(entry.label);
      }
    }
  }

  console.log();
  console.log(`  Total packed: ${(totalBytes / 1024).toFixed(1)}KB`);
  console.log();

  // Warn about missing required files
  if (missing.length > 0) {
    console.log("  ⚠ MISSING REQUIRED FILES:");
    console.log();
    for (const name of missing) {
      console.log(`    • ${name}`);
    }
    console.log();
    console.log("  The Worker will use fallback content for missing files,");
    console.log("  but the agent's personality and security guardrails");
    console.log("  will be limited.");
    console.log();
    console.log("  To create template files, run:");
    console.log("    node scripts/pack-knowledge-base.cjs --init");
    console.log();
  }

  // Build source info for the generated header
  const sourceInfo = soul.foundPath
    ? ` * Source project: ${path.dirname(soul.foundPath)}`
    : " * Source: (no project directory detected)";

  // Generate the module
  const output = generateModule(
    soul,
    skills,
    securityDirectives,
    publicSecurity,
    sourceInfo,
  );

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, output, "utf-8");

  const outputSize = Buffer.byteLength(output, "utf-8");
  console.log(
    `  ✓ Generated: backend/src/knowledge-base.ts (${(outputSize / 1024).toFixed(1)}KB)`,
  );
  console.log();
  console.log("  Done. Redeploy the Worker to apply changes.");
  console.log("━".repeat(60));
}

main();
