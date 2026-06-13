// ---------------------------------------------------------------------------
// A2A Agent — Fullscreen Chat Overlay Preview
// ---------------------------------------------------------------------------
// Renders a REAL preview of the Chat UI — a fullscreen overlay that
// collapses to a full-width bottom bar. Uses the cyberpunk theme from
// motherbrain.app. Connects to the actual Mother Brain chat API when
// an active model is configured.
// ---------------------------------------------------------------------------

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Minimize2, Maximize2, Loader2 } from "lucide-react";
import { BrainIcon } from "../frontend/components/svg/BrainIcon";
import FastMarkdown from "../../../components/FastMarkdown";

// ── Types ────────────────────────────────────────────────────────────────

interface A2aChatPreviewProps {
  invention: {
    settings: Record<string, unknown>;
  };
}

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  time: string;
  taskId?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    resultPreview?: string;
  }>;
  isWorking?: boolean; // true while the agent is processing
  thinking?: string; // current thinking/working label
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getSettings(settings: Record<string, unknown>) {
  return {
    agentName: (settings.agentName as string) || "Mother",
    agentDescription:
      (settings.agentDescription as string) ||
      "AI assistant powered by Mother Brain",
    agentUrl: (settings.agentUrl as string) || "",
    widgetColor: (settings.widgetColor as string) || "#39ff14",
    widgetBranding:
      (settings.widgetBranding as string) || "Powered by Mother Brain",
    logoUrl: (settings.logoUrl as string) || "",
  };
}

// BrainIcon is imported from ../frontend/components/svg/BrainIcon

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Dark theme (default) ───────────────────────────────────────────────

const T_DARK = {
  deepVoid: "#0a0a0f",
  darkMatter: "#13131f",
  neuralNode: "#1e1e2d",
  neonGreen: "#39ff14",
  hotPink: "#ff3d7f",
  bloodOrange: "#ff5500",
  electricCyan: "#38bdf8",
  text: "#e2e8f0",
  textMuted: "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Light theme ─────────────────────────────────────────────────────────

const T_LIGHT = {
  deepVoid: "#f9fafb",
  darkMatter: "#ffffff",
  neuralNode: "#e5e7eb",
  neonGreen: "#059669",
  hotPink: "#db2777",
  bloodOrange: "#ea580c",
  electricCyan: "#0284c7",
  text: "#111827",
  textMuted: "#6b7280",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Visitor ID (persisted in localStorage) ──────────────────────────
// Uses localStorage so the visitor ID survives page reloads and tab switches.
// This is the sessionless architecture — the ID persists indefinitely.

const PREVIEW_VISITOR_KEY = "motherbrain_preview_visitor_id";
const INITIAL_LOAD_LIMIT = 10;
const LOAD_MORE_LIMIT = 10;

function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(PREVIEW_VISITOR_KEY);
    if (existing) return existing;
    const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PREVIEW_VISITOR_KEY, id);
    return id;
  } catch {
    return `preview-${Date.now()}-temp`;
  }
}

function timeFromISO(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ── Supabase History Loading ─────────────────────────────────────────────

interface HistoryMessage {
  id: string;
  role: string;
  text: string;
  created_at: string;
  task_id: string;
}

async function fetchHistoryFromSupabase(
  supabaseUrl: string,
  supabaseKey: string,
  visitorId: string,
  limit: number,
  beforeCreatedAt?: string,
): Promise<{ messages: HistoryMessage[]; hasMore: boolean }> {
  try {
    const endpointUrl = "https://a2a.motherbrain.app";
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "visitor/history",
        id: Date.now(),
        params: {
          visitor_id: visitorId,
          limit: 20,
        },
      }),
    });

    if (!res.ok) return { messages: [], hasMore: false };

    const data = await res.json();
    if (data.error) return { messages: [], hasMore: false };

    const conversations: Array<{
      taskId: string;
      messages: Array<{ role: string; text: string }>;
      createdAt: string;
    }> = data.result?.conversations || [];

    const allMessages: HistoryMessage[] = [];
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        allMessages.push({
          id: `hist-${conv.taskId}-${allMessages.length}`,
          role: msg.role,
          text: msg.text,
          created_at: conv.createdAt,
          task_id: conv.taskId,
        });
      }
    }

    let filtered = allMessages;
    if (beforeCreatedAt) {
      filtered = allMessages.filter((m) => m.created_at < beforeCreatedAt);
    }

    const hasMore = filtered.length > limit;
    const sliced = filtered.slice(-limit);

    return { messages: sliced, hasMore };
  } catch (err) {
    console.warn("Failed to fetch history from Supabase:", err);
    return { messages: [], hasMore: false };
  }
}

// ── Persistence ──────────────────────────────────────────────────────────

function saveTaskId(id: string) {
  try {
    localStorage.setItem("motherbrain_preview_task_id", id);
  } catch {
    /* */
  }
}
function loadTaskId(): string | null {
  try {
    return localStorage.getItem("motherbrain_preview_task_id");
  } catch {
    return null;
  }
}

// ── Hero Search Web Component Registration ────────────────────────────────
// Registers <ne-hero-search> as a custom element matching the original
// nativeapps.io design: responsive SVG octagon, Shadow DOM, ResizeObserver,
// animated amber border, brain icon, and typewriter suggestions.
// This is self-contained — no external script file needed.

let heroSearchRegistered = false;

function octagonPath(w: number, h: number, c: number): string {
  c = Math.max(0, Math.min(c, Math.floor(Math.min(w, h) / 2)));
  const p = [
    [c, 0],
    [w - c, 0],
    [w, c],
    [w, h - c],
    [w - c, h],
    [c, h],
    [0, h - c],
    [0, c],
  ];
  return "M " + p.map(([x, y]) => `${x} ${y}`).join(" L ") + " Z";
}

function registerHeroSearch(): void {
  if (typeof window === "undefined") return;
  if (heroSearchRegistered) return;
  if (customElements.get("ne-hero-search")) {
    heroSearchRegistered = true;
    return;
  }

  class NeHeroSearchElement extends HTMLElement {
    private _shadow: ShadowRoot;
    private _svg!: SVGSVGElement;
    private _bg!: SVGPathElement;
    private _foreignObj!: SVGForeignObjectElement;
    private _brain!: SVGSVGElement;
    private _editor!: HTMLInputElement;
    private _defs!: SVGDefsElement;
    private _resizeObserver!: ResizeObserver;
    private _themeObserver!: MutationObserver;
    private _customSuggestions: string[] | null = null;
    private _typewriterTimer: ReturnType<typeof setTimeout> | null = null;
    private _suggestionIdx = 0;
    private _autoTyping = false;

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `:host{display:block;position:relative;width:100%;outline:none}`;
      this._shadow.appendChild(style);

      const ns = "http://www.w3.org/2000/svg";
      this._svg = document.createElementNS(ns, "svg");
      this._svg.setAttribute("width", "100%");
      this._svg.setAttribute("height", "75");
      this._svg.setAttribute("viewBox", "0 0 768 81.5");
      this._svg.setAttribute("overflow", "visible");

      // Defs: clip path + theme gradient + amber glow
      this._defs = document.createElementNS(ns, "defs");

      const clip = document.createElementNS(ns, "clipPath");
      clip.setAttribute("id", "hs-text-clip");
      const clipPathShape = document.createElementNS(ns, "path");
      clip.appendChild(clipPathShape);

      const grad = document.createElementNS(ns, "linearGradient");
      grad.setAttribute("id", "hs-theme-fill");
      grad.setAttribute("x1", "0%");
      grad.setAttribute("y1", "100%");
      grad.setAttribute("x2", "0%");
      grad.setAttribute("y2", "0%");
      const g1 = document.createElementNS(ns, "stop");
      g1.setAttribute("id", "hs-gs1");
      g1.setAttribute("offset", "0%");
      const g2 = document.createElementNS(ns, "stop");
      g2.setAttribute("id", "hs-gs2");
      g2.setAttribute("offset", "100%");
      grad.appendChild(g1);
      grad.appendChild(g2);

      // Stroke gradient + filter — green→purple (matches Brain logo branding)
      const amberWrap = document.createElementNS(ns, "svg");
      amberWrap.innerHTML = `
        <radialGradient id="hs-amberGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#00dc82" stop-opacity="1" />
          <stop offset="50%" stop-color="#00dc82" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#a78bfa" stop-opacity="1" />
          <animate attributeName="r" values="30%;70%;30%" dur="3s" repeatCount="indefinite" />
        </radialGradient>
        <filter id="hs-amberGlowFilter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>`;
      Array.from(amberWrap.children).forEach((n) => this._defs.appendChild(n));

      this._defs.appendChild(clip);
      this._defs.appendChild(grad);
      this._svg.appendChild(this._defs);

      // Octagon background path
      this._bg = document.createElementNS(ns, "path");
      this._bg.setAttribute("fill", "url(#hs-theme-fill)");
      this._bg.setAttribute("d", octagonPath(768, 81.5, 22));
      this._bg.setAttribute("stroke", "url(#hs-amberGlow)");
      this._bg.setAttribute("stroke-width", "4");
      this._bg.setAttribute("stroke-linejoin", "round");
      this._bg.setAttribute("filter", "url(#hs-amberGlowFilter)");
      this._svg.appendChild(this._bg);

      // Brain icon (Mother Brain logo — same full path as BrainIcon.tsx)
      this._brain = document.createElementNS(ns, "svg");
      this._brain.setAttribute("width", "45");
      this._brain.setAttribute("height", "45");
      this._brain.setAttribute("viewBox", "0 0 50 50");
      this._brain.setAttribute("overflow", "visible");

      // Brain gradient (green → purple, matches motherbrain.app branding)
      const brainGradWrap = document.createElementNS(ns, "svg");
      brainGradWrap.innerHTML = `
        <linearGradient id="hs-brainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00dc82" />
          <stop offset="100%" stop-color="#a78bfa" />
        </linearGradient>`;
      Array.from(brainGradWrap.children).forEach((n) =>
        this._defs.appendChild(n),
      );

      // Full brain path (both hemispheres) — cloned from motherbrain_app/favicon.svg
      const brainGroup = document.createElementNS(ns, "g");
      brainGroup.innerHTML = `<path fill="url(#hs-brainGrad)" d="M7.93 1.47l.73.25c.11.04.19.12.23.23l.39 1.07a1.06 1.06 0 1 1-.01 2.12c-.59 0-1.06-.47-1.06-1.06 0-.32.15-.6.37-.79l-.33-.91-1.13-.39c-1.58.07-2.89 1.14-3.31 2.6l1.6.45a1.05 1.05 0 0 1 .92-.56c.59 0 1.06.47 1.06 1.06 0 .05-.02.09-.03.13l1.04.83h.58l2.04-1.49c.06-.05.14-.07.22-.07h2.01v-4A3.6 3.6 0 0 0 10.83 0c-1.19 0-2.24.58-2.9 1.47zM1.96 9.91s.1-.03.15-.03h1.83c.15-.4.53-.69.98-.69.06 0 .1.02.1.02l.77-2.77a1.03 1.03 0 0 1-.48-.65l-1.67-.47C2.08 5.73.93 7.13.93 8.82c0 .5.11.97.29 1.4l.73-.32zm7.36-2.73c-.06.05-.14.07-.22.07h-.83c-.08 0-.17-.03-.23-.08L7 6.34c-.13.11-.28.18-.45.21l-.83 2.99c.17.19.28.43.28.7 0 .17-.05.33-.12.47l1.36 1.01c.05.04.09.09.12.15l.74 1.68c.14-.05.29-.09.46-.09.57 0 1.05.37 1.24.88h2.4a.41.41 0 0 1 .29.13l.79.92v-4.88l-1.4-1.45-1.99.34c-.03.71-.61 1.27-1.32 1.27a1.35 1.35 0 0 1-1.33-1.33c0-.73.6-1.33 1.33-1.33.49 0 .9.27 1.13.67l2.25-.38c.13-.02.25.02.33.11l1 1.03V5.7h-1.89L9.35 7.19zM3.4 19.16l2.6.75c.07-.08.16-.15.25-.21l-1.89-4.06c-.12.04-.24.07-.37.07-.47 0-.87-.26-1.11-.63l-1.25.39L.37 17.2c-.06.26-.1.53-.1.81a3.64 3.64 0 0 0 1.71 3.08l.99-1.75c.08-.15.26-.22.43-.18zm6.41-4.07c-.14.59-.64 1.04-1.27 1.04a1.33 1.33 0 0 1-1.33-1.33c0-.29.11-.54.27-.76l-.78-1.76-1.4-1.04c-.12.04-.24.07-.37.07-.45 0-.83-.29-.98-.69H2.19l-1.34.59c-.53.63-.85 1.43-.85 2.31 0 .76.25 1.45.65 2.03l.45-.62a.38.38 0 0 1 .19-.14l1.37-.43c0-.73.6-1.32 1.33-1.32s1.33.6 1.33 1.33c0 .33-.13.62-.33.85l2.02 4.34c.48.1.85.51.85 1.02 0 .59-.47 1.06-1.06 1.06s-1.03-.46-1.05-1.03l-2.27-.65-.98 1.73c.27 1.53 1.48 2.73 3.03 2.95v-.97a.37.37 0 0 1 .14-.29L7.37 22c.07-.05.15-.08.24-.08H9.5a1.31 1.31 0 0 1 1.26-.96c.7 0 1.25.54 1.31 1.22l1.19.24v-1.89l-1.24-1.14h-1.76c-.15.4-.53.69-.98.69-.59 0-1.06-.47-1.06-1.06s.47-1.06 1.06-1.06c.45 0 .83.29.98.69h1.91c.09 0 .18.04.25.1l.84.77v-2.96l-1.24-1.45H9.83zm.94 8.53c-.6 0-1.09-.41-1.26-.96H7.73l-1.46 1.19v.83c.44 1.51 1.82 2.62 3.47 2.62s3.08-1.15 3.5-2.7v-1.43l-1.34-.27c-.22.42-.65.72-1.16.72zm10.98-10.73c-.45 0-.83.29-.98.69h-2.48c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.48c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06zm5.98.63c0-1.18-.57-2.21-1.44-2.88.31-.54.51-1.16.51-1.82 0-1.69-1.17-3.11-2.73-3.51-.15-1.87-1.7-3.35-3.6-3.35-.11 0-.22.02-.33.03-.6-1.18-1.81-2-3.23-2a3.6 3.6 0 0 0-2.42.94v23.66c.41 1.55 1.81 2.7 3.5 2.7s3.04-1.12 3.48-2.63c.08 0 .15.02.23.02 1.91 0 3.46-1.48 3.61-3.36 1.28-.56 2.17-1.84 2.17-3.32 0-.78-.25-1.49-.67-2.09.57-.64.93-1.48.93-2.4zM15.46 3.03H17l1.06 1-.61 1.04c-.06 0-.11-.03-.17-.03-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06 1.06-.47 1.06-1.06c0-.25-.1-.47-.24-.65l.91-1.55-1.71-1.62h-1.84v-.84a2.6 2.6 0 0 1 1.42-.43c.99 0 1.88.56 2.34 1.46l.31.61.68-.06c.05 0 .11-.01.16-.02h.08c.17 0 .34.02.51.05l-.49.99v.86c-.4.15-.69.53-.69.98 0 .59.47 1.06 1.06 1.06s1.06-.47 1.06-1.06c0-.45-.29-.83-.69-.98v-.77l.44-.83c.78.4 1.33 1.18 1.4 2.12l.06.71-1.06 1.89h-.86c-.14-.42-.53-.72-.99-.72s-.85.3-.99.72h-1.46l-.62.62h-1.67V3.03zm10.57 12.23l-.49.55h-.8c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69H26c.29.43.45.93.45 1.45 0 1.04-.62 1.98-1.57 2.41l-.54.24-1.08-1.51h-1.43c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h1.04l1.33 1.85c-.31 1.12-1.33 1.94-2.52 1.94h0c-.06 0-.11-.01-.17-.02l-.57-.04-.03-.06v-.31c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.4l.33.68v.04c-.33 1.12-1.37 1.91-2.53 1.91-1.04 0-1.96-.62-2.38-1.55h1.38l1.28-1.25v-.51c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.19l-.84.81h-1.19v-4.11h1.2c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-1.2v-1.82h3.54c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-3.54V9.33h1.98l.62-.62h1.17c.16.38.54.65.98.65s.82-.27.98-.65h1.31l1.36-2.43a2.62 2.62 0 0 1 1.93 2.52c0 .45-.12.9-.37 1.32l-.43.73h-.77c-.15-.4-.53-.69-.98-.69s-.83.29-.98.69h-2.54c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.54c.15.4.53.69.98.69s.83-.29.98-.69h1.65c.53.5.85 1.17.85 1.9 0 .81-.37 1.39-.68 1.74z"/>`;
      brainGroup.setAttribute("transform", "translate(5 5) scale(1.8)");
      this._brain.appendChild(brainGroup);
      this._brain.setAttribute("x", "700");
      this._brain.setAttribute("y", "15");
      this._brain.style.cursor = "pointer";
      this._svg.appendChild(this._brain);

      this._shadow.appendChild(this._svg);

      // ForeignObject input
      this._foreignObj = document.createElementNS(ns, "foreignObject");
      this._foreignObj.setAttribute("x", "0");
      this._foreignObj.setAttribute("y", "0");
      this._foreignObj.setAttribute("width", "100%");
      this._foreignObj.setAttribute("height", "75");

      this._editor = document.createElement("input");
      this._editor.setAttribute("type", "text");
      this._editor.setAttribute("spellcheck", "false");
      this._editor.setAttribute("autocomplete", "off");
      this._editor.style.cssText =
        'width:100%;height:100%;font:42px "Departure Mono",monospace;background:transparent;border:none;margin:0;padding:0;color:#fff;outline:none;text-indent:30px;';

      this._foreignObj.appendChild(this._editor);
      this._svg.appendChild(this._foreignObj);

      // Theme application
      this._applyTheme();
      this._themeObserver = new MutationObserver(() => this._applyTheme());
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class", "style"],
      });
    }

    private _applyTheme() {
      const styles = getComputedStyle(document.documentElement);
      const bgRaw = styles.getPropertyValue("--background").trim();
      const fgRaw = styles.getPropertyValue("--foreground").trim();
      const color = bgRaw ? `hsl(${bgRaw})` : "#0b0b0b";
      const op1 =
        styles.getPropertyValue("--hero-search-stop1-opacity").trim() || "0.2";
      const op2 =
        styles.getPropertyValue("--hero-search-stop2-opacity").trim() || "0.4";
      const stop1 = this._defs.querySelector("#hs-gs1") as SVGStopElement;
      const stop2 = this._defs.querySelector("#hs-gs2") as SVGStopElement;
      if (stop1) {
        stop1.setAttribute("stop-color", color);
        stop1.setAttribute("stop-opacity", op1);
      }
      if (stop2) {
        stop2.setAttribute("stop-color", color);
        stop2.setAttribute("stop-opacity", op2);
      }
      if (fgRaw) this._editor.style.color = `hsl(${fgRaw})`;
    }

    /** Set custom typewriter suggestions */
    setSuggestions(suggestions: string[]) {
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        this._customSuggestions = suggestions;
        if (this._autoTyping) this._restartTypewriter();
      }
    }

    private _getSuggestions(): string[] {
      return (
        this._customSuggestions || [
          "Ask anything...",
          "How does this work?",
          "Get started",
        ]
      );
    }

    connectedCallback() {
      // Enter key → dispatch submit event
      this._editor.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const query = this._editor.value.trim();
          if (query) {
            e.preventDefault();
            e.stopPropagation();
            this._stopTypewriter();
            this.dispatchEvent(
              new CustomEvent("hero-search-submit", {
                bubbles: true,
                composed: true,
                detail: { query },
              }),
            );
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this._editor.value = "";
          this._startTypewriter();
        }
      });

      // Click on brain → reset
      this._brain.addEventListener("click", (e) => {
        e.stopPropagation();
        this._editor.blur();
        this._startTypewriter();
      });

      // Click anywhere in component → stop typewriter
      this._editor.addEventListener("pointerdown", () => {
        if (this._autoTyping) this._stopTypewriter();
      });

      // Initial geometry
      this._updateGeometry(this.getBoundingClientRect().width || 768);

      // Start typewriter
      this._startTypewriter();

      // ResizeObserver for responsive geometry
      this._resizeObserver = new ResizeObserver(
        ([
          {
            contentRect: { width },
          },
        ]) => this._updateGeometry(width),
      );
      this._resizeObserver.observe(this);
    }

    private _setClip(width: number) {
      const HEIGHT = 75;
      const OUTER_C = 22;
      const d = octagonPath(width, HEIGHT, OUTER_C);
      this._svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
      this._bg.setAttribute("d", d);
      const clip = this._defs.querySelector(
        "#hs-text-clip path",
      ) as SVGPathElement | null;
      if (clip) clip.setAttribute("d", d);
    }

    private _updateGeometry(width: number) {
      const HEIGHT = 75;
      const OUTER_C = 22;
      this._setClip(width);

      const availableWidth = width - OUTER_C * 2;
      this._foreignObj.setAttribute("width", String(availableWidth));
      this._editor.style.maxWidth = availableWidth + "px";

      // Update all large paths to match new width
      this._svg.querySelectorAll("path").forEach((p) => {
        if (p.closest("defs")) return;
        if (p.getBBox().width < 100) return;
        p.setAttribute("d", octagonPath(width, HEIGHT, OUTER_C));
      });

      // Brain icon position (right side, with padding, vertically centered)
      this._brain.setAttribute("x", String(width - 45 - 24));
      this._brain.setAttribute("y", "15"); // (75 - 45) / 2 = 15 → vertically centered

      // Constrain text width so it doesn't overlap icon
      const textMax = width - 45 - 32;
      this._foreignObj.setAttribute("width", String(textMax));
      this._editor.style.maxWidth = textMax + "px";
    }

    private _startTypewriter() {
      this._autoTyping = true;
      this._editor.tabIndex = -1;
      this._editor.value = "";
      this._restartTypewriter();
    }

    private _restartTypewriter() {
      if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
      this._suggestionIdx = 0;
      this._editor.value = "";
      this._typeNext(0);
    }

    private _stopTypewriter() {
      this._autoTyping = false;
      if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
      this._editor.value = "";
      this._editor.tabIndex = 0;
      requestAnimationFrame(() => this._editor.focus());
    }

    private _typeNext(charIdx: number) {
      if (!this._autoTyping) return;
      const suggestions = this._getSuggestions();
      const current = suggestions[this._suggestionIdx] || suggestions[0];
      if (charIdx <= current.length) {
        const nextValue = current.slice(0, charIdx);
        this._editor.value = nextValue;
        // Scroll trick: move caret to end + force scrollLeft so the input
        // auto-scrolls horizontally as the AI types (same behaviour as the
        // EnhancedTyped class in the hero-search-bundle).
        try {
          this._editor.setSelectionRange(nextValue.length, nextValue.length);
          this._editor.scrollLeft = this._editor.scrollWidth;
        } catch {}
        this._typewriterTimer = setTimeout(
          () => this._typeNext(charIdx + 1),
          50,
        );
      } else {
        this._typewriterTimer = setTimeout(() => {
          this._suggestionIdx = (this._suggestionIdx + 1) % suggestions.length;
          this._editor.value = "";
          this._typewriterTimer = setTimeout(() => this._typeNext(0), 200);
        }, 2500);
      }
    }

    disconnectedCallback() {
      if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
      this._resizeObserver?.disconnect();
      this._themeObserver?.disconnect();
    }
  }

  customElements.define("ne-hero-search", NeHeroSearchElement);
  heroSearchRegistered = true;
}

// ── HeroSearchHost: React wrapper for <ne-hero-search> web component ──────

interface HeroSearchHostProps {
  agentName: string;
  agentDescription: string;
  logoUrl?: string;
  branding?: string;
  suggestions: string[];
  onSubmit: (query: string) => void;
  onOpenChat?: () => void;
  messageCount: number;
  lastMessagePreview?: string;
  theme: typeof T_DARK;
}

const HeroSearchHost: React.FC<HeroSearchHostProps> = ({
  agentName,
  agentDescription,
  logoUrl,
  branding,
  suggestions,
  onSubmit,
  onOpenChat,
  messageCount,
  lastMessagePreview,
  theme: T,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroElRef = useRef<HTMLElement | null>(null);

  // Register the web component once
  useEffect(() => {
    registerHeroSearch();
  }, []);

  // Create the <ne-hero-search> element and wire up events
  useEffect(() => {
    if (!containerRef.current) return;
    if (!customElements.get("ne-hero-search")) return;

    // Clear previous content
    containerRef.current.innerHTML = "";

    // Create the custom element
    const el = document.createElement("ne-hero-search") as HTMLElement;
    heroElRef.current = el;

    // Set custom suggestions
    const neEl = el as any;
    if (typeof neEl.setSuggestions === "function") {
      neEl.setSuggestions(suggestions);
    }

    // Listen for submit events
    const handleSubmit = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.query) {
        onSubmit(detail.query);
      }
    };
    el.addEventListener("hero-search-submit", handleSubmit);

    containerRef.current.appendChild(el);

    // Set suggestions again after connectedCallback runs
    setTimeout(() => {
      if (typeof neEl.setSuggestions === "function") {
        neEl.setSuggestions(suggestions);
      }
    }, 100);

    return () => {
      el.removeEventListener("hero-search-submit", handleSubmit);
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "400px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.deepVoid,
        fontFamily: T.font,
        color: T.text,
        padding: "24px",
      }}
    >
      {/* Agent Description */}
      <div
        style={{
          fontSize: 12,
          color: T.textMuted,
          marginBottom: 24,
          textAlign: "center",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        {agentDescription}
      </div>

      {/* <ne-hero-search> web component — full width, responsive SVG */}
      <div
        style={{
          width: "100%",
          maxWidth: 768,
          padding: "0 8px",
        }}
      >
        <div ref={containerRef} style={{ width: "100%" }} />
      </div>

      {/* Ask Button */}
      <button
        onClick={() => {
          // The web component handles Enter internally; this button is for mouse users
          const neEl = heroElRef.current as any;
          if (neEl) {
            const input = neEl.shadowRoot?.querySelector("input");
            if (input && input.value.trim()) {
              onSubmit(input.value.trim());
            }
          }
        }}
        style={{
          marginTop: 16,
          padding: "10px 32px",
          fontSize: 13,
          fontFamily: T.font,
          fontWeight: "bold",
          color: T.deepVoid,
          background: T.neonGreen,
          border: "none",
          cursor: "pointer",
          clipPath:
            "polygon(6% 0%, 94% 0%, 100% 50%, 94% 100%, 6% 100%, 0% 50%)",
          transition: "background 0.2s, color 0.2s, opacity 0.2s",
        }}
      >
        Ask {agentName}
      </button>

      {/* If chat history exists, show a "Continue paused conversation" box */}
      {onOpenChat && messageCount > 0 && (
        <button
          onClick={onOpenChat}
          style={{
            marginTop: 20,
            width: "100%",
            maxWidth: 480,
            background: T.darkMatter,
            border: `1px solid ${T.neonGreen}33`,
            borderRadius: 12,
            padding: "14px 18px",
            cursor: "pointer",
            fontFamily: T.font,
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left",
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 8,
              background: `${T.neonGreen}1a`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Maximize2 size={16} color={T.neonGreen} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: "bold",
                color: T.text,
                marginBottom: 2,
              }}
            >
              Continue paused conversation
            </div>
            {lastMessagePreview && (
              <div
                style={{
                  fontSize: 11,
                  color: T.textMuted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {lastMessagePreview}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: T.textMuted,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {messageCount} msgs
          </div>
        </button>
      )}

      {/* Branding */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          fontSize: 10,
          color: T.textMuted,
          letterSpacing: "0.05em",
        }}
      >
        {branding}
      </div>
    </div>
  );
};

// ── Component ────────────────────────────────────────────────────────────

const A2aChatPreview: React.FC<A2aChatPreviewProps> = ({ invention }) => {
  const cfg = getSettings(invention.settings);
  const endpointUrl = cfg.agentUrl || "https://a2a.motherbrain.app";
  const [mode, setMode] = useState<"overlay" | "bar" | "hero">("hero");
  const [heroInput, setHeroInput] = useState("");
  const [heroSuggestionIdx, setHeroSuggestionIdx] = useState(0);
  const [heroDisplayed, setHeroDisplayed] = useState("");
  const heroInputRef = useRef<HTMLInputElement>(null);
  const heroTypewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(
    loadTaskId(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef(getOrCreateVisitorId());
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Light/dark mode detection ──
  // Detects the user's device preference AND the Mother Brain app's light mode.
  // The MB app sets `document.body.classList.contains('light')`.
  // For the standalone Chat UI package, it falls back to `prefers-color-scheme`.
  const [isLightMode, setIsLightMode] = useState(() => {
    if (
      typeof document !== "undefined" &&
      document.body.classList.contains("light")
    ) {
      return true;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    // Listen for Mother Brain app theme changes (body class)
    const check = () => {
      const bodyLight = document.body.classList.contains("light");
      const deviceLight = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;
      setIsLightMode(bodyLight || deviceLight);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    // Also listen for device theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", check);
    check();
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", check);
    };
  }, []);

  // Select theme based on mode
  const T = isLightMode ? T_LIGHT : T_DARK;

  // Auto-scroll to bottom
  // Instant scroll to bottom whenever messages change or panel opens.
  // Uses useLayoutEffect (fires before paint) + a delayed setTimeout
  // fallback to catch async content (FastMarkdown rendering, etc.).
  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, mode]);

  useEffect(() => {
    const tid = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }, 60);
    return () => clearTimeout(tid);
  }, [messages, mode]);

  // Focus input when overlay opens
  useEffect(() => {
    if (mode === "overlay") {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [mode]);

  // ── Hero Search: Handle submit from the hero screen ──
  // Sets the query as input, switches to overlay mode, and sends
  const handleHeroSubmit = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setInput(trimmed);
    setMode("overlay");
    // Send after state settles
    setTimeout(() => {
      inputRef.current?.focus();
      handleSendRef.current(trimmed);
    }, 300);
  };

  // ── Load chat history from Supabase on mount ──
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const supabaseUrl = (invention.settings.supabaseUrl as string) || "";
        const supabaseKey =
          (invention.settings.supabaseServiceKey as string) || "";
        const { messages: historyMsgs, hasMore } =
          await fetchHistoryFromSupabase(
            supabaseUrl,
            supabaseKey,
            visitorIdRef.current,
            INITIAL_LOAD_LIMIT,
          );

        if (historyMsgs.length > 0) {
          const chatMsgs: ChatMessage[] = historyMsgs.map((hm) => ({
            id: hm.id,
            role: (hm.role === "user" ? "user" : "agent") as "user" | "agent",
            text: hm.text,
            time: timeFromISO(hm.created_at),
            taskId: hm.task_id,
          }));

          setMessages(chatMsgs);
          setHasMoreHistory(hasMore);

          const lastMsg = chatMsgs[chatMsgs.length - 1];
          if (lastMsg?.taskId) {
            setCurrentTaskId(lastMsg.taskId);
            saveTaskId(lastMsg.taskId);
          }
        } else {
          // No history — start with empty chat
          setMessages([]);
        }
      } catch {
        setMessages([]);
      }
      setIsLoadingHistory(false);
    };

    loadHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more history on scroll-up ──
  const loadOlderMessages = async () => {
    if (isLoadingHistory || !hasMoreHistory) return;
    setIsLoadingHistory(true);

    const prevScrollHeight = scrollContainerRef.current?.scrollHeight || 0;

    try {
      const beforeCursor = messages[0]?.time;
      const supabaseUrl = (invention.settings.supabaseUrl as string) || "";
      const supabaseKey =
        (invention.settings.supabaseServiceKey as string) || "";

      const { messages: olderMsgs, hasMore } = await fetchHistoryFromSupabase(
        supabaseUrl,
        supabaseKey,
        visitorIdRef.current,
        LOAD_MORE_LIMIT,
        beforeCursor,
      );

      if (olderMsgs.length > 0) {
        const chatMsgs: ChatMessage[] = olderMsgs.map((hm) => ({
          id: hm.id,
          role: (hm.role === "user" ? "user" : "agent") as "user" | "agent",
          text: hm.text,
          time: timeFromISO(hm.created_at),
          taskId: hm.task_id,
        }));

        setMessages((prev) => [...chatMsgs, ...prev]);
        setHasMoreHistory(hasMore);

        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasMoreHistory(false);
      }
    } catch {
      // Silently fail
    }
    setIsLoadingHistory(false);
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingHistory || !hasMoreHistory) return;
    if (container.scrollTop < 50) {
      loadOlderMessages();
    }
  };

  // Cleanup streaming timers
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
      }
    };
  }, []);

  // ── Typewriter streaming (matches website Chat UI) ──
  const streamText = useCallback((fullText: string, messageIndex: number) => {
    setIsStreaming(true);
    let charIndex = 0;
    const speed = 12; // 12ms per character

    const tick = () => {
      charIndex++;
      const visibleText = fullText.slice(0, charIndex);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, text: visibleText } : m,
        ),
      );
      if (charIndex < fullText.length) {
        streamTimerRef.current = setTimeout(tick, speed);
      } else {
        setIsStreaming(false);
      }
    };

    setMessages((prev) =>
      prev.map((m, i) => (i === messageIndex ? { ...m, text: "" } : m)),
    );
    streamTimerRef.current = setTimeout(tick, speed);
  }, []);

  const streamToolCalls = useCallback(
    (
      toolCalls: ChatMessage["toolCalls"],
      messageIndex: number,
      onComplete: () => void,
    ) => {
      if (!toolCalls || toolCalls.length === 0) {
        onComplete();
        return;
      }
      setIsStreaming(true);
      let callIndex = 0;
      const delay = 400;

      const showNext = () => {
        if (callIndex >= toolCalls.length) {
          onComplete();
          return;
        }
        const callsSoFar = toolCalls.slice(0, callIndex + 1);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex ? { ...m, toolCalls: callsSoFar } : m,
          ),
        );
        callIndex++;
        streamTimerRef.current = setTimeout(showNext, delay);
      };
      showNext();
    },
    [],
  );

  // ── Send message to live A2A endpoint via JSON-RPC 2.0 ──
  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      time: timeNow(),
    };

    const agentId = `a-${Date.now()}`;
    const workingMsg: ChatMessage = {
      id: agentId,
      role: "agent",
      text: "",
      time: timeNow(),
      isWorking: true,
      thinking: "Thinking...",
    };

    setMessages((prev) => [...prev, userMsg, workingMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "message/send",
          params: {
            taskId: currentTaskId || undefined,
            message: {
              role: "user",
              parts: [{ type: "text", text }],
            },
            metadata: { visitor_id: visitorIdRef.current },
          },
          id: Date.now(),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentId
              ? {
                  ...m,
                  text: `⚠ Connection error: ${data.error.message || "Unknown error"}`,
                  isWorking: false,
                  thinking: undefined,
                }
              : m,
          ),
        );
        return;
      }

      const task = data.result?.task;
      if (task?.taskId) {
        setCurrentTaskId(task.taskId);
        saveTaskId(task.taskId);
      }

      let agentText = "";
      let toolCalls: ChatMessage["toolCalls"] = [];

      if (task?.history && Array.isArray(task.history)) {
        const agentEvents = task.history.filter(
          (e: { role: string }) => e.role === "agent",
        );
        const lastAgent = agentEvents[agentEvents.length - 1];
        if (lastAgent?.parts) {
          agentText = lastAgent.parts
            .filter((p: { type: string }) => p.type === "text")
            .map((p: { text?: string }) => p.text || "")
            .join("");
        }
      }

      // Extract tool calls from artifacts metadata
      // Log the full response for debugging
      console.log(
        "[preview] A2A response:",
        JSON.stringify(data.result, null, 2)?.slice(0, 2000),
      );

      const artifacts = data.result?.artifacts;
      if (artifacts && Array.isArray(artifacts)) {
        // Use the LAST artifact (matches website a2a.ts logic)
        const lastArtifact = artifacts[artifacts.length - 1];
        if (
          lastArtifact?.metadata?.toolCalls &&
          Array.isArray(lastArtifact.metadata.toolCalls)
        ) {
          toolCalls = lastArtifact.metadata.toolCalls.map((tc: any) => ({
            name: tc.name || tc.toolName || "unknown",
            args: tc.args || tc.arguments || {},
            resultPreview: tc.resultPreview
              ? tc.resultPreview
              : tc.result
                ? typeof tc.result === "string"
                  ? tc.result.slice(0, 500)
                  : JSON.stringify(tc.result).slice(0, 500)
                : undefined,
          }));
        }
        console.log(
          "[preview] Extracted tool calls:",
          toolCalls.length,
          toolCalls.map((tc: any) => tc.name),
        );
      } else {
        console.log(
          "[preview] No artifacts in response. data.result keys:",
          data.result ? Object.keys(data.result) : "no result",
        );
      }

      if (!agentText && !toolCalls.length) {
        agentText = "No response received.";
      }

      // Mark as no longer working
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, isWorking: false, thinking: undefined }
            : m,
        ),
      );

      // Get current index of the agent message and stream into it
      // Use a small setTimeout to ensure state update has applied
      setTimeout(() => {
        setMessages((current) => {
          const idx = current.findIndex((m) => m.id === agentId);
          if (idx === -1) return current;

          if (toolCalls.length > 0) {
            streamToolCalls(toolCalls, idx, () => {
              streamText(agentText, idx);
            });
          } else {
            streamText(agentText, idx);
          }
          return current;
        });
      }, 50);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error";
      const isLoadFailed =
        errMsg === "Load failed" ||
        errMsg === "Failed to fetch" ||
        errMsg.includes("NetworkError");
      const helpfulMsg = isLoadFailed
        ? `⚠ Could not reach the A2A endpoint at ${endpointUrl}. The agent server may be offline, or the request was blocked. Check the endpoint URL in Settings.`
        : `⚠ Failed to reach agent at ${endpointUrl}. ${errMsg}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? {
                ...m,
                text: helpfulMsg,
                isWorking: false,
                thinking: undefined,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keep a ref to handleSend so handleHeroSubmit can call it without stale closure
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  // ── Hero Search: Typewriter suggestions ──
  const heroSuggestions = [
    `Ask ${cfg.agentName} anything...`,
    "How does Mother Brain work?",
    "What are the pricing plans?",
    "Help me get started",
  ];

  useEffect(() => {
    if (mode !== "hero" || heroInput) return;
    const current = heroSuggestions[heroSuggestionIdx];
    let charIdx = 0;
    setHeroDisplayed("");

    const tick = () => {
      if (charIdx <= current.length) {
        setHeroDisplayed(current.slice(0, charIdx));
        charIdx++;
        heroTypewriterRef.current = setTimeout(tick, 50);
      } else {
        heroTypewriterRef.current = setTimeout(() => {
          setHeroSuggestionIdx((prev) => (prev + 1) % heroSuggestions.length);
        }, 2500);
      }
    };
    heroTypewriterRef.current = setTimeout(tick, 500);

    return () => {
      if (heroTypewriterRef.current) clearTimeout(heroTypewriterRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroSuggestionIdx, heroInput, mode]);

  // Get last agent message for the bar preview
  // Strip leading --- (horizontal rules) that agents often prepend
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === "agent");
  const barPreviewRaw = lastAgentMsg
    ? lastAgentMsg.text.replace(/^\s*-{3,}\s*\n?/, "").slice(0, 200)
    : "";

  // ── HERO MODE (Hero Search — uses actual <ne-hero-search> web component) ──
  if (mode === "hero") {
    return (
      <HeroSearchHost
        agentName={cfg.agentName}
        agentDescription={cfg.agentDescription}
        logoUrl={cfg.logoUrl}
        branding={cfg.widgetBranding}
        suggestions={heroSuggestions}
        onSubmit={handleHeroSubmit}
        onOpenChat={messages.length > 0 ? () => setMode("overlay") : undefined}
        messageCount={messages.length}
        lastMessagePreview={
          messages.length > 0
            ? (messages[messages.length - 1]?.text || "")
                .replace(/^\s*-{3,}\s*\n?/, "")
                .replace(/\*\*/g, "")
                .slice(0, 100)
            : undefined
        }
        theme={T}
      />
    );
  }

  // ── BAR MODE (collapsed full-width bottom bar) ──
  if (mode === "bar") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          zIndex: 1000,
          borderTop: `1px solid ${T.neonGreen}40`,
          backgroundColor: T.deepVoid + "f5",
          backdropFilter: "blur(12px)",
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
          }}
        >
          {/* Brain icon */}
          <BrainIcon size={24} logoUrl={cfg.logoUrl} />
          {/* Preview text — rendered with FastMarkdown like the chat UI */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              fontSize: 13,
              color: T.neonGreen,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxHeight: 20,
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <FastMarkdown content={barPreviewRaw} variant="chat" />
            </div>
          </div>
          {/* Expand button */}
          <button
            onClick={() => setMode("overlay")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <Maximize2 size={16} />
          </button>
          {/* Close button */}
          <button
            onClick={() => setMode("overlay")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── OVERLAY MODE (fullscreen chat) ──
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "500px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: T.deepVoid,
        fontFamily: T.font,
        color: T.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${T.neuralNode}`,
          padding: "12px 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrainIcon size={28} logoUrl={cfg.logoUrl} />
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: T.neonGreen,
                letterSpacing: "0.05em",
              }}
            >
              {cfg.agentName.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>online</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMode("bar")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <Minimize2 size={18} />
          </button>
          <button
            onClick={() => setMode("hero")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}
      >
        <div
          style={{
            maxWidth: 780,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  border: `1px solid ${
                    msg.role === "user" ? T.hotPink + "30" : T.neonGreen + "15"
                  }`,
                  backgroundColor:
                    msg.role === "user" ? T.hotPink + "10" : T.darkMatter,
                  padding: "12px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {msg.role === "agent" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                      fontSize: 10,
                      color: T.neonGreen,
                    }}
                  >
                    <span>⟡</span>
                    <span style={{ letterSpacing: "0.05em" }}>
                      {cfg.agentName.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Thinking indicator */}
                {msg.role === "agent" && msg.isWorking && !msg.text && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: T.textMuted,
                    }}
                  >
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: T.neonGreen }}
                    />
                    <span style={{ fontSize: 12 }}>
                      {msg.thinking || "Thinking..."}
                    </span>
                  </div>
                )}

                {/* Tool calls (expandable) */}
                {msg.role === "agent" &&
                  msg.toolCalls &&
                  msg.toolCalls.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {msg.toolCalls.map((tc, j) => (
                        <details
                          key={j}
                          style={{
                            borderRadius: 4,
                            border: `1px solid ${T.neuralNode}`,
                            backgroundColor: T.deepVoid + "80",
                            marginBottom: 4,
                          }}
                        >
                          <summary
                            style={{
                              display: "flex",
                              cursor: "pointer",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 10px",
                              fontSize: 11,
                              color: T.textMuted,
                              overflow: "hidden",
                            }}
                          >
                            <span style={{ color: T.neonGreen, flexShrink: 0 }}>
                              ⟡
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: T.neonGreen,
                                flexShrink: 0,
                              }}
                            >
                              {tc.name}
                            </span>
                            <span
                              style={{
                                color: T.textMuted,
                                fontSize: 10,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {Object.entries(tc.args)
                                .map(
                                  ([k, v]) =>
                                    `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
                                )
                                .join(", ")}
                            </span>
                          </summary>
                          <div
                            style={{
                              borderTop: `1px solid ${T.neuralNode}`,
                              padding: "6px 10px",
                              fontSize: 11,
                              color: T.textMuted,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                color: T.bloodOrange,
                                marginBottom: 2,
                              }}
                            >
                              Result:
                            </div>
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                margin: 0,
                              }}
                            >
                              {tc.resultPreview || "(no result)"}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                {/* Message text */}
                {msg.text &&
                  (msg.role === "user" ? (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                    </div>
                  ) : isStreaming && i === messages.length - 1 ? (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                      <span
                        style={{
                          color: T.neonGreen,
                          animation: "pulse 1s infinite",
                        }}
                      >
                        ▌
                      </span>
                    </div>
                  ) : (
                    <FastMarkdown content={msg.text} variant="chat" />
                  ))}

                <div
                  style={{
                    fontSize: 9,
                    color: T.textMuted,
                    marginTop: 6,
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  {msg.time}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: `1px solid ${T.neuralNode}`,
          padding: "12px 20px",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            maxWidth: 780,
            margin: "0 auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder={
              sending ? "Mother is thinking..." : "Ask Mother anything..."
            }
            style={{
              flex: 1,
              background: T.darkMatter,
              border: `1px solid ${T.neuralNode}`,
              padding: "12px 14px",
              fontSize: 13,
              fontFamily: T.font,
              color: T.text,
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = T.neonGreen + "60")
            }
            onBlur={(e) => (e.currentTarget.style.borderColor = T.neuralNode)}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              border: `1px solid ${sending ? T.electricCyan : T.neonGreen}`,
              background: sending ? T.electricCyan + "10" : T.neonGreen + "10",
              color: sending ? T.electricCyan : T.neonGreen,
              cursor: input.trim() && !sending ? "pointer" : "default",
              flexShrink: 0,
              opacity: input.trim() || sending ? 1 : 0.3,
              transition: "opacity 0.2s, border-color 0.2s",
            }}
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <span style={{ fontSize: 18, lineHeight: 1 }}>⏎</span>
            )}
          </button>
        </form>
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: T.textMuted,
            marginTop: 8,
            letterSpacing: "0.05em",
          }}
        >
          {cfg.widgetBranding}
        </div>
      </div>
    </div>
  );
};

export default A2aChatPreview;
