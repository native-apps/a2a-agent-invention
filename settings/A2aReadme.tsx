import React from "react";
import { AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";

const A2aReadme: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Prerequisites Banner */}
      <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-yellow-500" />
          <span className="text-sm font-mono font-semibold text-yellow-500">
            Prerequisites Required
          </span>
        </div>
        <p className="text-xs font-mono text-gray-400 mb-3">
          Before using the A2A Agent, make sure you have these set up:
        </p>
        <div className="space-y-2">
          <Prerequisite
            done={false}
            title="MCP Gateway via Cloudflare"
            description="Your Mother Brain MCP Gateway must be deployed as a Cloudflare Worker. This routes agent requests to your knowledge base."
          />
          <Prerequisite
            done={false}
            title="Supabase Project for Chat DB"
            description="A dedicated Supabase project for storing A2A chat conversations. You'll need the Project URL and Service Role Key."
            link="https://supabase.com"
          />
          <Prerequisite
            done={false}
            title="Domain for A2A Endpoint"
            description="A domain or subdomain where the A2A Endpoint will be deployed (e.g., a2a.yourdomain.com). This is where the Chat UI connects."
          />
        </div>
      </div>

      {/* Overview */}
      <div>
        <h2 className="text-lg font-mono font-semibold text-[#00dc82] mb-2">
          A2A Agent Invention
        </h2>
        <p className="text-sm font-mono text-gray-300 leading-relaxed">
          Deploy an AI Agent from Mother Brain to your website. Visitors chat in
          real-time while the agent answers using your project's knowledge base
          via MCP tools.
        </p>
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
            title="Isolated Chat Database"
            description="Local Postgres + optional Supabase sync for conversation history"
          />
          <Feature
            title="CRM View"
            description="Monitor and manage visitor conversations from Mother Brain"
          />
          <Feature
            title="MCP Tool Access"
            description="Agent uses all Mother Brain tools (search, memories, code index, etc.)"
          />
        </div>
      </div>

      {/* Quick Setup */}
      <div>
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          Quick Setup
        </h3>
        <ol className="space-y-2 text-xs font-mono text-gray-400">
          <li>
            <span className="text-[#00dc82] mr-2">1.</span>
            <strong className="text-gray-300">Configure Agent Identity</strong>{" "}
            — Set name, description, and authentication in Settings
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">2.</span>
            <strong className="text-gray-300">Select Knowledge Base</strong> —
            Choose which project's data the agent can access
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">3.</span>
            <strong className="text-gray-300">Set Up Database</strong> —
            Provision local Postgres + Supabase for chat storage
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">4.</span>
            <strong className="text-gray-300">Customize Widget</strong> —
            Colors, branding, welcome message
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">5.</span>
            <strong className="text-gray-300">Deploy</strong> — Deploy to
            Cloudflare Workers
          </li>
          <li>
            <span className="text-[#00dc82] mr-2">6.</span>
            <strong className="text-gray-300">Embed</strong> — Add Chat UI to
            your website
          </li>
        </ol>
      </div>

      {/* Architecture */}
      <div className="p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
        <h3 className="text-sm font-mono font-semibold text-gray-200 mb-3">
          Architecture
        </h3>
        <pre className="text-xs font-mono text-gray-500 leading-relaxed">
{`Visitor → Chat UI Widget → A2A Endpoint (CF Worker) → MCP Gateway → Mother Brain
                                      ↓
                             Chat Database (PG + Supabase)`}
        </pre>
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

const Prerequisite: React.FC<{
  title: string;
  description: string;
  done?: boolean;
  link?: string;
}> = ({ title, description, done, link }) => (
  <div className="flex items-start gap-3 p-2 rounded bg-[#0a0a0a]/50">
    {done ? (
      <CheckCircle size={16} className="text-[#00dc82] mt-0.5 shrink-0" />
    ) : (
      <div className="w-4 h-4 mt-0.5 rounded-full border border-yellow-500/40 shrink-0" />
    )}
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-gray-300">
          {title}
        </span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-[#00dc82]"
          >
            <ExternalLink size={10} />
          </a>
        )}
      </div>
      <p className="text-[10px] font-mono text-gray-500 mt-0.5">{description}</p>
    </div>
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
