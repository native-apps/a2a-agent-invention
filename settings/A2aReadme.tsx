import React from "react";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Bot,
  Globe,
  Send,
  Cloud,
  MonitorSmartphone,
  MessageSquare,
} from "lucide-react";

const A2aReadme: React.FC = () => {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Overview */}
      <div>
        <h2 className="text-lg font-mono font-semibold text-[#00dc82] mb-2">
          A2A Agent Invention
        </h2>
        <p className="text-sm font-mono text-gray-300 leading-relaxed">
          Deploy an AI Agent that answers using your project's knowledge base
          via MCP tools. The agent runs <strong>locally first</strong> — no
          website, no Cloudflare, no Supabase required to get started. Add
          deployments (Telegram, website, persistent 24/7) whenever you want.
        </p>
      </div>

      {/* Ways to Use — Minimum Requirements */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          Ways to Use Your Agent
        </h3>
        <p className="text-xs font-mono text-gray-500 mb-3">
          Pick the use case that fits you. Each shows its minimum requirements
          — nothing more.
        </p>
        <div className="space-y-2">
          <UseCase
            icon={<Bot size={14} className="text-[#00dc82]" />}
            title="Local Only (Preview)"
            desc="Test and chat with the agent from the Mother Brain app. Your laptop is the server."
            requirements={["Sub-Agent identity", "MCP Gateway + token", "Local chat database"]}
            note="No website · No Cloudflare · No Supabase"
          />
          <UseCase
            icon={<Globe size={14} className="text-[#00dc82]" />}
            title="Endpoint Only (Deployed)"
            desc="Reach your agent 24/7 at a public HTTPS URL. Free *.workers.dev URL — no custom domain needed."
            requirements={["Cloudflare Account ID", "Cloudflare API Token", "Worker name"]}
            note="No website · No custom domain · Free workers.dev URL"
          />
          <UseCase
            icon={<Send size={14} className="text-[#00dc82]" />}
            title="Telegram Bot"
            desc="People DM your agent on Telegram. No website, no domain — the free workers.dev URL satisfies Telegram's HTTPS webhook requirement."
            requirements={["Bot token from @BotFather", "Cloudflare Worker deployed", "Supabase chat DB (deployed path)"]}
            note="No website · No custom domain"
          />
          <UseCase
            icon={<Cloud size={14} className="text-[#00dc82]" />}
            title="Persistent (Always Online)"
            desc="Cloudflare + Supabase keep the agent answering even when your laptop sleeps."
            requirements={["Cloudflare Worker deployed", "Supabase chat database", "Gateway + project connected"]}
            note="No website · No custom domain"
          />
          <UseCase
            icon={<MonitorSmartphone size={14} className="text-[#00dc82]" />}
            title="Website Chat Widget"
            desc="Embed the chat UI on your site. The only use case that needs a website — the agent itself works without one."
            requirements={["Cloudflare Worker deployed", "React/Vite/TS website", "Supabase chat DB (deployed path)"]}
            note="Website required · Custom domain optional"
          />
        </div>
      </div>

      {/* Quick Start — Local First */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          Quick Start — Local First
        </h3>
        <ol className="space-y-2 text-xs font-mono text-gray-400">
          <li>
            <span className="text-[#00dc82] mr-2">1.</span>
            <strong className="text-gray-300">Configure Agent Identity</strong>{" "}
            — Set name, description, and Sub-Agent in Settings
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">2.</span>
            <strong className="text-gray-300">Select Knowledge Base</strong> —
            Choose which project's data the agent can access
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">3.</span>
            <strong className="text-gray-300">Start Local Database</strong> —
            Provisions the local Postgres chat DB automatically
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">4.</span>
            <strong className="text-gray-300">Deploy</strong> — Only when you
            want it online 24/7: Cloudflare Account ID + API Token + Worker
            name in Settings → Deploy
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">5.</span>
            <strong className="text-gray-300">Add channels</strong> — Telegram,
            website widget, or Persistent mode — each with its own Setup Guide
          </li>
        </ol>
      </div>

      {/* Architecture */}
      <div className="p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          Architecture
        </h3>
        <pre className="text-xs font-mono text-gray-500 leading-relaxed">
          {`Visitor → Chat UI / Telegram → A2A Endpoint (CF Worker) → MCP Gateway → Knowledge Base
                                          ↓
                                 Chat Database (Local PG ⇄ Supabase)`}
        </pre>
      </div>

      {/* What You Get */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          What You Get
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <Feature
            title="A2A Endpoint"
            description="Cloudflare Worker handling chat via JSON-RPC 2.0 (A2A Protocol)"
          />
          <Feature
            title="Chat UI Widget"
            description="Embeddable chat overlay for your website — dark & light mode"
          />
          <Feature
            title="Telegram Bot"
            description="DM your agent on Telegram via webhook"
          />
          <Feature
            title="Isolated Chat Database"
            description="Local Postgres + optional Supabase sync for conversation history"
          />
          <Feature
            title="CRM View"
            description="Monitor and manage visitor conversations"
          />
          <Feature
            title="MCP Tool Access"
            description="Agent uses your project's tools (search, memories, code index, etc.)"
          />
        </div>
      </div>

      {/* Supported Methods */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          A2A Protocol Methods
        </h3>
        <div className="space-y-1">
          {[
            ["message/send", "Send a message to the agent"],
            ["tasks/get", "Get task status"],
            ["tasks/cancel", "Cancel a task"],
            ["agent/getCard", "Agent discovery card"],
            ["visitor/history", "Visitor conversation history"],
          ].map(([method, desc]) => (
            <div
              key={method}
              className="flex items-center gap-3 text-xs font-mono"
            >
              <code className="text-[#00dc82] bg-[#00dc82]/10 px-2 py-0.5 rounded">
                {method}
              </code>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──

const UseCase: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  requirements: string[];
  note: string;
}> = ({ icon, title, desc, requirements, note }) => (
  <div className="p-3 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
    <div className="flex items-center gap-2 mb-1.5">
      {icon}
      <span className="text-xs font-mono font-semibold text-gray-200">
        {title}
      </span>
    </div>
    <p className="text-[10px] font-mono text-gray-500 mb-2">{desc}</p>
    <div className="flex flex-wrap gap-1.5 mb-2">
      {requirements.map((r) => (
        <span
          key={r}
          className="text-[10px] font-mono px-1.5 py-0.5 border border-[#00dc82]/20 bg-[#00dc82]/5 text-[#00dc82]/80"
        >
          {r}
        </span>
      ))}
    </div>
    <p className="text-[10px] font-mono text-gray-500">{note}</p>
  </div>
);

const Feature: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => (
  <div className="flex items-start gap-3 text-xs font-mono">
    <span className="text-[#00dc82] mt-0.5">▸</span>
    <div>
      <strong className="text-gray-300">{title}</strong>{" "}
      <span className="text-gray-500">— {description}</span>
    </div>
  </div>
);

export default A2aReadme;
