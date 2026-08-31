// ── Redeploy indicator (shared) ── These settings ship to the Cloudflare
// Worker as secrets (config.json actions.deploy.secrets — keep in sync).
// Changing ANY of them (or updating the invention's code) means the deployed
// worker is stale until the next Deploy. Both the Wizard banner and the
// Neighbors screen banner fingerprint these and show "Redeploy needed"
// when they drift.
//
// Keys 1-23: worker/wizard-owned settings (original list).
// Keys 24-32: CRM-owned settings (Neighbors + Conversations screens) that
// also deploy as secrets but were missing from the original list — without
// them, CRM changes (goals, targets, heartbeat, SOPs, relay dials, autonomy,
// standing instructions, NEAR curator) never tripped the banner.
export const DEPLOY_AFFECTING_SETTINGS = [
  "embeddingApiKey",
  "supabaseUrl",
  "supabaseServiceKey",
  "mbSupabaseUrl",
  "mbSupabaseServiceKey",
  "mbProjectId",
  "gatewayToken",
  "gatewayBaseUrl",
  "agentName",
  "agentDescription",
  "agentUrl",
  "agentSkillsJson",
  "agentProvider",
  "accessToken",
  "mcpBaseUrl",
  "mcpApiKey",
  "websiteUrl",
  "encoreApiUrl",
  "encoreApiKey",
  "jwtSecret",
  "telegramBotToken",
  "mcpCloudUrl",
  "forceCloudMcp",
  // CRM-owned (Neighbors / Conversations):
  "neighborGoalsJson",
  "neighborTargetsJson",
  "heartbeatEnabled",
  "heartbeatScheduleJson",
  "neighborSopsJson",
  "relaySettingsJson",
  "neighborAutonomy",
  "neighborInstructionsJson",
  "nearAccountId",
];

/** Stable fingerprint (FNV-1a x2) of the deploy-affecting settings. */
export function deployFingerprint(s: Record<string, unknown>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const key of DEPLOY_AFFECTING_SETTINGS) {
    const str = key + "=" + String(s[key] ?? "") + "\u0001";
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
    }
  }
  return h1.toString(36) + "-" + h2.toString(36);
}
