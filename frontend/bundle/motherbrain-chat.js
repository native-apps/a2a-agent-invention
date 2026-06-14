// ---------------------------------------------------------------------------
// motherbrain-chat.js — <motherbrain-chat> Web Component (Custom Element)
// ---------------------------------------------------------------------------
// A framework-agnostic, single-file chat widget that wraps the A2A Agent UI.
// Uses Shadow DOM for style encapsulation. No build step, no dependencies.
//
// Usage:
//   <script src="motherbrain-chat.js"></script>
//   <motherbrain-chat endpoint="https://a2a.motherbrain.app" skill="product-info">
//   </motherbrain-chat>
// ---------------------------------------------------------------------------

(() => {
  "use strict";

  // ── Brain Icon SVG Path (Mother Brain official logo) ──────────────────
  // Full brain SVG path — both hemispheres (from brain-icon-gradient.svg)
  const MB_LOGO_PATH =
    "M7.93 1.47l.73.25c.11.04.19.12.23.23l.39 1.07a1.06 1.06 0 1 1-.01 2.12c-.59 0-1.06-.47-1.06-1.06 0-.32.15-.6.37-.79l-.33-.91-1.13-.39c-1.58.07-2.89 1.14-3.31 2.6l1.6.45a1.05 1.05 0 0 1 .92-.56c.59 0 1.06.47 1.06 1.06 0 .05-.02.09-.03.13l1.04.83h.58l2.04-1.49c.06-.05.14-.07.22-.07h2.01v-4A3.6 3.6 0 0 0 10.83 0c-1.19 0-2.24.58-2.9 1.47zM1.96 9.91s.1-.03.15-.03h1.83c.15-.4.53-.69.98-.69.06 0 .1.02.1.02l.77-2.77a1.03 1.03 0 0 1-.48-.65l-1.67-.47C2.08 5.73.93 7.13.93 8.82c0 .5.11.97.29 1.4l.73-.32zm7.36-2.73c-.06.05-.14.07-.22.07h-.83c-.08 0-.17-.03-.23-.08L7 6.34c-.13.11-.28.18-.45.21l-.83 2.99c.17.19.28.43.28.7 0 .17-.05.33-.12.47l1.36 1.01c.05.04.09.09.12.15l.74 1.68c.14-.05.29-.09.46-.09.57 0 1.05.37 1.24.88h2.4a.41.41 0 0 1 .29.13l.79.92v-4.88l-1.4-1.45-1.99.34c-.03.71-.61 1.27-1.32 1.27a1.35 1.35 0 0 1-1.33-1.33c0-.73.6-1.33 1.33-1.33.49 0 .9.27 1.13.67l2.25-.38c.13-.02.25.02.33.11l1 1.03V5.7h-1.89L9.35 7.19zM3.4 19.16l2.6.75c.07-.08.16-.15.25-.21l-1.89-4.06c-.12.04-.24.07-.37.07-.47 0-.87-.26-1.11-.63l-1.25.39L.37 17.2c-.06.26-.1.53-.1.81a3.64 3.64 0 0 0 1.71 3.08l.99-1.75c.08-.15.26-.22.43-.18zm6.41-4.07c-.14.59-.64 1.04-1.27 1.04a1.33 1.33 0 0 1-1.33-1.33c0-.29.11-.54.27-.76l-.78-1.76-1.4-1.04c-.12.04-.24.07-.37.07-.45 0-.83-.29-.98-.69H2.19l-1.34.59c-.53.63-.85 1.43-.85 2.31 0 .76.25 1.45.65 2.03l.45-.62a.38.38 0 0 1 .19-.14l1.37-.43c0-.73.6-1.32 1.33-1.32s1.33.6 1.33 1.33c0 .33-.13.62-.33.85l2.02 4.34c.48.1.85.51.85 1.02 0 .59-.47 1.06-1.06 1.06s-1.03-.46-1.05-1.03l-2.27-.65-.98 1.73c.27 1.53 1.48 2.73 3.03 2.95v-.97a.37.37 0 0 1 .14-.29L7.37 22c.07-.05.15-.08.24-.08H9.5a1.31 1.31 0 0 1 1.26-.96c.7 0 1.25.54 1.31 1.22l1.19.24v-1.89l-1.24-1.14h-1.76c-.15.4-.53.69-.98.69-.59 0-1.06-.47-1.06-1.06s.47-1.06 1.06-1.06c.45 0 .83.29.98.69h1.91c.09 0 .18.04.25.1l.84.77v-2.96l-1.24-1.45H9.83zm.94 8.53c-.6 0-1.09-.41-1.26-.96H7.73l-1.46 1.19v.83c.44 1.51 1.82 2.62 3.47 2.62s3.08-1.15 3.5-2.7v-1.43l-1.34-.27c-.22.42-.65.72-1.16.72zm10.98-10.73c-.45 0-.83.29-.98.69h-2.48c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.48c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06zm5.98.63c0-1.18-.57-2.21-1.44-2.88.31-.54.51-1.16.51-1.82 0-1.69-1.17-3.11-2.73-3.51-.15-1.87-1.7-3.35-3.6-3.35-.11 0-.22.02-.33.03-.6-1.18-1.81-2-3.23-2a3.6 3.6 0 0 0-2.42.94v23.66c.41 1.55 1.81 2.7 3.5 2.7s3.04-1.12 3.48-2.63c.08 0 .15.02.23.02 1.91 0 3.46-1.48 3.61-3.36 1.28-.56 2.17-1.84 2.17-3.32 0-.78-.25-1.49-.67-2.09.57-.64.93-1.48.93-2.4zM15.46 3.03H17l1.06 1-.61 1.04c-.06 0-.11-.03-.17-.03-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06 1.06-.47 1.06-1.06c0-.25-.1-.47-.24-.65l.91-1.55-1.71-1.62h-1.84v-.84a2.6 2.6 0 0 1 1.42-.43c.99 0 1.88.56 2.34 1.46l.31.61.68-.06c.05 0 .11-.01.16-.02h.08c.17 0 .34.02.51.05l-.49.99v.86c-.4.15-.69.53-.69.98 0 .59.47 1.06 1.06 1.06s1.06-.47 1.06-1.06c0-.45-.29-.83-.69-.98v-.77l.44-.83c.78.4 1.33 1.18 1.4 2.12l.06.71-1.06 1.89h-.86c-.14-.42-.53-.72-.99-.72s-.85.3-.99.72h-1.46l-.62.62h-1.67V3.03zm10.57 12.23l-.49.55h-.8c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69H26c.29.43.45.93.45 1.45 0 1.04-.62 1.98-1.57 2.41l-.54.24-1.08-1.51h-1.43c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h1.04l1.33 1.85c-.31 1.12-1.33 1.94-2.52 1.94h0c-.06 0-.11-.01-.17-.02l-.57-.04-.03-.06v-.31c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.4l.33.68v.04c-.33 1.12-1.37 1.91-2.53 1.91-1.04 0-1.96-.62-2.38-1.55h1.38l1.28-1.25v-.51c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.19l-.84.81h-1.19v-4.11h1.2c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-1.2v-1.82h3.54c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-3.54V9.33h1.98l.62-.62h1.17c.16.38.54.65.98.65s.82-.27.98-.65h1.31l1.36-2.43a2.62 2.62 0 0 1 1.93 2.52c0 .45-.12.9-.37 1.32l-.43.73h-.77c-.15-.4-.53-.69-.98-.69s-.83.29-.98.69h-2.54c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.54c.15.4.53.69.98.69s.83-.29.98-.69h1.65c.53.5.85 1.17.85 1.9 0 .81-.37 1.39-.68 1.74z";

  // ── Inline SVG Icon helpers (replaces lucide-react icons) ────────────
  function svgIcon(paths, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }
  const ICON_CLOSE = svgIcon(
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  );
  const ICON_MINIMIZE = svgIcon(
    '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
  );
  const ICON_MAXIMIZE = svgIcon(
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  );
  const ICON_SPINNER = `<svg class="mb-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  const ICON_SEND = `<span style="font-size:18px;line-height:1">⏎</span>`;

  // ── Tool Call Display Labels ─────────────────────────────────────────
  const TOOL_LABELS = {
    search_chat_history: "Searching chat history...",
    search_memories: "Searching memories...",
    search_codebase: "Searching codebase...",
    vmva_search: "Running deep search...",
    search_git_history: "Searching git history...",
    list_indexed_files: "Listing indexed files...",
    list_images: "Listing images...",
    get_project_stats: "Getting project stats...",
    get_file_content: "Reading file...",
    add_memory: "Storing memory...",
  };

  // ── Theme Definitions ──────────────────────────────────────────────────
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
    font: "'Departure Mono', 'JetBrains Mono', 'Courier New', monospace",
  };

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
    font: "'Departure Mono', 'JetBrains Mono', 'Courier New', monospace",
  };

  // ── Broprint.js (inlined from @rajesh896/broprint.js v2.x) ───────────
  // MUST be inlined — not loaded via CDN — so fingerprints match the
  // live website exactly. Broprint.js combines canvas + audio context
  // fingerprinting. A custom canvas-only fallback produces different hashes.
  // ── @rajesh896/broprint.js (inlined, tree-shaken bundle) ───────────
  // The function x() below IS getCurrentBrowserFingerPrint.
  // Dependencies: l=cyrb53 hash, d=getCanvasFingerprint, m=getAudioFingerprint,
  // C=async wrapper, w=isCanvasSupported, f=audio param helper.
  // Combined canvas + audio fingerprinting → same hashes as the website.
  var g = Object.defineProperty;
  var h = Object.getOwnPropertyDescriptor;
  var b = Object.getOwnPropertyNames;
  var y = Object.prototype.hasOwnProperty;
  var A = (r, e) => {
      for (var t in e) g(r, t, { get: e[t], enumerable: !0 });
    },
    v = (r, e, t, o) => {
      if ((e && typeof e == "object") || typeof e == "function")
        for (let n of b(e))
          !y.call(r, n) &&
            n !== t &&
            g(r, n, {
              get: () => e[n],
              enumerable: !(o = h(e, n)) || o.enumerable,
            });
      return r;
    };
  var O = (r) => v(g({}, "__esModule", { value: !0 }), r);
  var C = (r, e, t) =>
    new Promise((o, n) => {
      var i = (s) => {
          try {
            u(t.next(s));
          } catch (c) {
            n(c);
          }
        },
        a = (s) => {
          try {
            u(t.throw(s));
          } catch (c) {
            n(c);
          }
        },
        u = (s) => (s.done ? o(s.value) : Promise.resolve(s.value).then(i, a));
      u((t = t.apply(r, e)).next());
    });
  var P = {};
  A(P, {
    cyrb53: () => l,
    getAudioFingerprint: () => m,
    getCanvasFingerprint: () => d,
    getCurrentBrowserFingerPrint: () => x,
    isCanvasSupported: () => w,
  });
  var l = (r, e = 0) => {
    let t = 3735928559 ^ e,
      o = 1103547991 ^ e;
    for (let n = 0; n < r.length; n++) {
      let i = r.charCodeAt(n);
      ((t = Math.imul(t ^ i, 2654435761)), (o = Math.imul(o ^ i, 1597334677)));
    }
    return (
      (t =
        Math.imul(t ^ (t >>> 16), 2246822507) ^
        Math.imul(o ^ (o >>> 13), 3266489909)),
      (o =
        Math.imul(o ^ (o >>> 16), 2246822507) ^
        Math.imul(t ^ (t >>> 13), 3266489909)),
      4294967296 * (2097151 & o) + (t >>> 0)
    );
  };
  var w = () => {
      let r = document.createElement("canvas");
      return !!(r.getContext && r.getContext("2d"));
    },
    d = () => {
      if (!w()) return "broprint.js";
      let r = document.createElement("canvas"),
        e = r.getContext("2d"),
        t = "BroPrint.65@345876";
      return (
        (e.textBaseline = "top"),
        (e.font = "14px 'Arial'"),
        (e.textBaseline = "alphabetic"),
        (e.fillStyle = "#f60"),
        e.fillRect(125, 1, 62, 20),
        (e.fillStyle = "#069"),
        e.fillText(t, 2, 15),
        (e.fillStyle = "rgba(102, 204, 0, 0.7)"),
        e.fillText(t, 4, 17),
        r.toDataURL()
      );
    };
  var f = (r, e, t, o) => {
      let n = r[e];
      n && typeof n.setValueAtTime == "function" && n.setValueAtTime(t, o);
    },
    m = () =>
      new Promise((r, e) => {
        try {
          let t =
            typeof window != "undefined"
              ? window.OfflineAudioContext || window.webkitOfflineAudioContext
              : void 0;
          if (!t) {
            e(new Error("OfflineAudioContext is not supported"));
            return;
          }
          let o = new t(1, 44100, 44100),
            n = o.currentTime,
            i = o.createOscillator();
          ((i.type = "triangle"), i.frequency.setValueAtTime(1e4, n));
          let a = o.createDynamicsCompressor();
          (f(a, "threshold", -50, n),
            f(a, "knee", 40, n),
            f(a, "ratio", 12, n),
            f(a, "attack", 0, n),
            f(a, "release", 0.25, n),
            i.connect(a),
            a.connect(o.destination),
            i.start(0),
            (o.oncomplete = (u) => {
              let s = 0,
                c = u.renderedBuffer.getChannelData(0);
              for (let p = 4500; p < 5e3; p++) s += Math.abs(c[p]);
              (a.disconnect(), r(s.toString()));
            }),
            o.startRendering());
        } catch (t) {
          e(t);
        }
      });
  function x() {
    return C(this, arguments, function* (r = {}) {
      let { useAudio: e = !0, useCanvas: t = !0, seed: o = 0 } = r;
      if (!e && !t)
        throw new Error("at least one of useAudio or useCanvas must be true");
      if (e)
        try {
          let n = yield m(),
            i = t ? window.btoa(n) + d() : window.btoa(n);
          return l(i, o).toString();
        } catch (n) {
          if (!t) throw n;
        }
      try {
        return l(d(), o).toString();
      } catch (n) {
        throw new Error("Failed to generate fingerprint");
      }
    });
  }

  // ── Visitor ID Persistence (matches website's visitor-identity.ts exactly) ──
  const VISITOR_KEY = "motherbrain_visitor_id";
  const TASK_ID_KEY = "motherbrain_chat_task_id";

  // Broprint.js is inlined directly above — x() is getCurrentBrowserFingerPrint.
  // No CDN loading, no new Function() eval — just call x() directly.

  async function getVisitorId() {
    // 1. Check localStorage first
    try {
      const stored = localStorage.getItem(VISITOR_KEY);
      if (stored) return stored;
    } catch {
      /* noop */
    }

    // 2. Generate via Broprint.js (inlined as x)
    try {
      const fingerprint = await x();
      const visitorId = `vid_${fingerprint}`;
      try {
        localStorage.setItem(VISITOR_KEY, visitorId);
      } catch {
        /* noop */
      }
      return visitorId;
    } catch {
      /* noop */
    }

    // 3. Fallback if Broprint.js fails (canvas/audio blocked)
    try {
      const fallbackId = `vid_${crypto.randomUUID().replace(/-/g, "")}`;
      try {
        localStorage.setItem(VISITOR_KEY, fallbackId);
      } catch {
        /* noop */
      }
      return fallbackId;
    } catch {
      /* noop */
    }

    // 4. Final fallback
    return `vid_${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function saveTaskId(id) {
    try {
      localStorage.setItem(TASK_ID_KEY, id);
    } catch {
      /* noop */
    }
  }

  function loadTaskId() {
    try {
      return localStorage.getItem(TASK_ID_KEY);
    } catch {
      return null;
    }
  }

  // ── Lightweight Markdown → HTML Converter ──────────────────────────────
  // Supports: bold, italic, code blocks, inline code, links, headers,
  // unordered/ordered lists, blockquotes, tables, horizontal rules, line breaks.
  // Strips dangerous HTML to prevent XSS.

  function sanitizeHtml(html) {
    // Remove <script> tags and their content
    html = html.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
    // Remove on* event attributes
    html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // Remove javascript: URLs
    html = html.replace(
      /href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
      'href="#"',
    );
    // Remove <iframe>, <object>, <embed>, <form> tags
    html = html.replace(
      /<(iframe|object|embed|form|input|button|meta|link|base)[^>]*>/gi,
      "",
    );
    return html;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(source) {
    if (!source) return "";
    let html = source;

    // Extract and protect code blocks
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre class="mb-code-block"><code>${escapeHtml(code.trim())}</code></pre>`,
      );
      return `\x00CODEBLOCK${idx}\x00`;
    });

    // Extract and protect inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(
        `<code class="mb-inline-code">${escapeHtml(code)}</code>`,
      );
      return `\x00INLINE${idx}\x00`;
    });

    // Horizontal rules
    html = html.replace(/^(---|\*\*\*|___)\s*$/gm, "<hr>");

    // Headers (must come before bold/italic)
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    // GFM Tables
    html = html.replace(
      /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
      (_, headerRow, sepRow, bodyRows) => {
        const headers = headerRow
          .split("|")
          .filter((c) => c.trim())
          .map((c) => `<th>${c.trim()}</th>`)
          .join("");
        const rows = bodyRows
          .trim()
          .split("\n")
          .map((row) => {
            const cells = row
              .split("|")
              .filter((c) => c.trim())
              .map((c) => `<td>${c.trim()}</td>`)
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        return `<table class="mb-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
      },
    );

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, "\x00LI\x00$1\x00/LI\x00");
    html = html.replace(
      /(\x00LI\x00[\s\S]*?\x00\/LI\x00(?:\n)?)+/g,
      (match) => {
        const items = match.replace(/\x00LI\x00|\x00\/LI\x00/g, "").trim();
        const lis = items
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => `<li>${l.trim()}</li>`)
          .join("");
        return `<ul>${lis}</ul>`;
      },
    );

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, "\x00OLI\x00$1\x00/OLI\x00");
    html = html.replace(
      /(\x00OLI\x00[\s\S]*?\x00\/OLI\x00(?:\n)?)+/g,
      (match) => {
        const items = match.replace(/\x00OLI\x00|\x00\/OLI\x00/g, "").trim();
        const lis = items
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => `<li>${l.trim()}</li>`)
          .join("");
        return `<ol>${lis}</ol>`;
      },
    );

    // Bold (must come before italic)
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

    // Line breaks (double newline → paragraph break, single newline → <br>)
    html = html.replace(/\n\n+/g, "\n</p><p>\n");
    html = html.replace(/\n/g, "<br>");

    // Restore inline code
    html = html.replace(/\x00INLINE(\d+)\x00/g, (_, idx) => inlineCodes[idx]);
    // Restore code blocks
    html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[idx]);

    // Wrap in paragraph
    html = `<p>${html}</p>`;
    // Clean up empty paragraphs and paragraphs wrapping block elements
    html = html.replace(
      /<p>\s*<(h[1-6]|ul|ol|pre|blockquote|hr|table)/g,
      "<$1",
    );
    html = html.replace(
      /<\/(h[1-6]|ul|ol|pre|blockquote|table)>\s*<\/p>/g,
      "</$1>",
    );
    html = html.replace(/<p>\s*<\/p>/g, "");
    html = html.replace(/<p>\s*<hr\s*\/?>\s*<\/p>/g, "<hr>");

    return sanitizeHtml(html);
  }

  // ── Time Formatting ────────────────────────────────────────────────────
  function timeNow() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function timeFromISO(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  // ── JSON-RPC Helpers ───────────────────────────────────────────────────
  let _rpcId = 0;

  async function rpcPost(url, method, params) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: ++_rpcId,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "RPC error");
    return data;
  }

  // ── Shadow DOM CSS ─────────────────────────────────────────────────────
  const STYLES = `
    /* Font loading with fallback */
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
    @font-face {
      font-family: 'Departure Mono';
      src: url('https://motherbrain.app/fonts/DepartureMono-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    @keyframes mbSpin {
      to { transform: rotate(360deg); }
    }
    @keyframes mbPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @keyframes mbFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      --deep-void: #0a0a0f;
      --dark-matter: #13131f;
      --neural-node: #1e1e2d;
      --neon-green: #39ff14;
      --hot-pink: #ff3d7f;
      --blood-orange: #ff5500;
      --electric-cyan: #38bdf8;
      --text: #e2e8f0;
      --text-muted: #64748b;
      --font: 'Departure Mono', 'JetBrains Mono', 'Courier New', monospace;
      display: block;
      font-family: var(--font);
    }

    :host([theme="light"]) {
      --deep-void: #f9fafb;
      --dark-matter: #ffffff;
      --neural-node: #e5e7eb;
      --neon-green: #059669;
      --hot-pink: #db2777;
      --blood-orange: #ea580c;
      --electric-cyan: #0284c7;
      --text: #111827;
      --text-muted: #6b7280;
    }

    /* Hidden state */
    .mb-hidden { display: none !important; }

    /* Spinner */
    .mb-spinner { animation: mbSpin 1s linear infinite; }

    /* ── Overlay (Fullscreen Chat) ─────────────────────────── */
    .mb-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      background-color: var(--deep-void);
      font-family: var(--font);
      color: var(--text);
      animation: mbFadeIn 0.15s ease-out;
    }

    /* ── Header ─────────────────────────────────────────────── */
    .mb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--neural-node);
      padding: 12px 20px;
      flex-shrink: 0;
    }
    .mb-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .mb-header-left svg, .mb-msg-agent-label svg {
      overflow: visible;
      flex-shrink: 0;
    }
    .mb-msg-agent-label img, .mb-header-left img {
      object-fit: contain;
      flex-shrink: 0;
    }
    .mb-header-name {
      font-size: 16px;
      font-weight: bold;
      color: var(--neon-green);
      letter-spacing: 0.05em;
    }
    .mb-header-status {
      font-size: 10px;
      color: var(--text-muted);
    }
    .mb-header-actions {
      display: flex;
      gap: 4px;
    }
    .mb-btn-icon {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .mb-btn-icon:hover {
      background: var(--neural-node);
      color: var(--text);
    }

    /* ── Messages Area ──────────────────────────────────────── */
    .mb-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    .mb-messages-inner {
      max-width: 780px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .mb-messages::-webkit-scrollbar { width: 6px; }
    .mb-messages::-webkit-scrollbar-track { background: transparent; }
    .mb-messages::-webkit-scrollbar-thumb { background: var(--neural-node); border-radius: 3px; }

    /* ── Individual Message ──────────────────────────────────── */
    .mb-msg-wrapper {
      display: flex;
      justify-content: flex-start;
      animation: mbFadeIn 0.2s ease-out;
    }
    .mb-msg-wrapper.mb-msg-user { justify-content: flex-end; }

    .mb-msg-bubble {
      max-width: 80%;
      border: 1px solid color-mix(in srgb, var(--neon-green) 8%, transparent);
      background-color: var(--dark-matter);
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.6;
      border-radius: 2px;
    }
    .mb-msg-user .mb-msg-bubble {
      border-color: color-mix(in srgb, var(--hot-pink) 19%, transparent);
      background-color: color-mix(in srgb, var(--hot-pink) 6%, transparent);
    }

    .mb-msg-agent-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 10px;
      color: var(--neon-green);
    }
    .mb-msg-agent-label span:first-child {
      font-size: 12px;
    }

    /* Thinking indicator */
    .mb-thinking {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
    }
    .mb-thinking .mb-spinner { color: var(--neon-green); }
    .mb-thinking span { font-size: 12px; }

    /* Tool calls (expandable) */
    .mb-tool-calls { margin-bottom: 8px; }
    .mb-tool-call {
      border-radius: 4px;
      border: 1px solid var(--neural-node);
      background-color: color-mix(in srgb, var(--deep-void) 50%, transparent);
      margin-bottom: 4px;
    }
    .mb-tool-call summary {
      display: flex;
      cursor: pointer;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--text-muted);
      overflow: hidden;
      list-style: none;
    }
    .mb-tool-call summary::-webkit-details-marker { display: none; }
    .mb-tool-call summary::before {
      content: "▸";
      color: var(--text-muted);
      flex-shrink: 0;
      transition: transform 0.15s;
    }
    .mb-tool-call[open] summary::before {
      transform: rotate(90deg);
    }
    .mb-tool-name {
      color: var(--neon-green);
      flex-shrink: 0;
      font-weight: 600;
    }
    .mb-tool-args {
      color: var(--text-muted);
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mb-tool-result {
      border-top: 1px solid var(--neural-node);
      padding: 6px 10px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .mb-tool-result-label {
      font-weight: 600;
      color: var(--blood-orange);
      margin-bottom: 2px;
    }
    .mb-tool-result pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      font-family: var(--font);
      font-size: 11px;
    }

    /* Message text content */
    .mb-msg-text {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .mb-msg-cursor {
      color: var(--neon-green);
      animation: mbPulse 1s infinite;
    }

    /* Rendered markdown content */
    .mb-markdown { font-size: 13px; line-height: 1.6; }
    .mb-markdown h1 { font-size: 18px; font-weight: bold; margin: 12px 0 6px; color: var(--neon-green); }
    .mb-markdown h2 { font-size: 16px; font-weight: bold; margin: 10px 0 4px; color: var(--neon-green); }
    .mb-markdown h3 { font-size: 14px; font-weight: bold; margin: 8px 0 4px; color: var(--neon-green); }
    .mb-markdown strong { color: var(--neon-green); }
    .mb-markdown em { font-style: italic; }
    .mb-markdown a { color: var(--electric-cyan); text-decoration: underline; }
    .mb-markdown .mb-code-block {
      background: var(--deep-void);
      border: 1px solid var(--neural-node);
      border-radius: 4px;
      padding: 10px 12px;
      margin: 8px 0;
      overflow-x: auto;
      font-size: 12px;
    }
    .mb-markdown .mb-code-block code {
      font-family: var(--font);
      color: var(--text);
    }
    .mb-markdown .mb-inline-code {
      background: var(--deep-void);
      border: 1px solid var(--neural-node);
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 12px;
      font-family: var(--font);
      color: var(--neon-green);
    }
    .mb-markdown ul, .mb-markdown ol { padding-left: 20px; margin: 6px 0; }
    .mb-markdown li { margin: 2px 0; }
    .mb-markdown blockquote {
      border-left: 3px solid var(--neon-green);
      padding-left: 12px;
      margin: 8px 0;
      color: var(--text-muted);
    }
    .mb-markdown hr {
      border: none;
      border-top: 1px solid var(--neural-node);
      margin: 12px 0;
    }
    .mb-markdown table {
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
    }
    .mb-markdown th, .mb-markdown td {
      border: 1px solid var(--neural-node);
      padding: 6px 10px;
      text-align: left;
    }
    .mb-markdown th {
      background: var(--dark-matter);
      color: var(--neon-green);
      font-weight: 600;
    }

    .mb-msg-time {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 6px;
      text-align: left;
    }
    .mb-msg-user .mb-msg-time { text-align: right; }

    /* Loading older messages indicator */
    .mb-load-more {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ── Input Bar ──────────────────────────────────────────── */
    .mb-input-bar {
      border-top: 1px solid var(--neural-node);
      padding: 12px 20px;
      flex-shrink: 0;
    }
    .mb-input-form {
      max-width: 780px;
      margin: 0 auto;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .mb-input {
      flex: 1;
      background: var(--dark-matter);
      border: 1px solid var(--neural-node);
      padding: 12px 14px;
      font-size: 13px;
      font-family: var(--font);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
      border-radius: 2px;
    }
    .mb-input::placeholder { color: var(--text-muted); }
    .mb-input:focus { border-color: var(--neon-green); }
    .mb-input:disabled { opacity: 0.6; }

    .mb-send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--neon-green);
      background: color-mix(in srgb, var(--neon-green) 6%, transparent);
      color: var(--neon-green);
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.2s, border-color 0.2s, background 0.2s;
      border-radius: 2px;
      padding: 0;
    }
    .mb-send-btn:disabled {
      opacity: 0.3;
      cursor: default;
      border-color: var(--electric-cyan);
      background: color-mix(in srgb, var(--electric-cyan) 6%, transparent);
      color: var(--electric-cyan);
    }
    .mb-send-btn:not(:disabled):hover {
      background: color-mix(in srgb, var(--neon-green) 15%, transparent);
    }

    .mb-branding {
      text-align: center;
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 8px;
      letter-spacing: 0.05em;
    }

    /* ── Bar Mode (minimized) ────────────────────────────────── */
    .mb-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      z-index: 2147483647;
      border-top: 1px solid color-mix(in srgb, var(--neon-green) 25%, transparent);
      background-color: color-mix(in srgb, var(--deep-void) 96%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font-family: var(--font);
      animation: mbFadeIn 0.15s ease-out;
    }
    .mb-bar-inner {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
    }
    .mb-bar-preview {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: 13px;
      color: var(--neon-green);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .mb-bar-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }
    .mb-bar-btn:hover { color: var(--text); }
    /* ── Bar brain icon (clickable — triggers host menu) ─────── */
    .mb-bar-brain {
      position: relative;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      padding: 0;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      transition: transform 0.2s;
    }
    .mb-bar-brain:hover { transform: scale(1.12); }
    .mb-bar-led {
      position: absolute;
      top: -2px;
      right: -2px;
      display: flex;
      height: 10px;
      width: 10px;
    }
    .mb-bar-led-inner {
      position: absolute;
      display: inline-flex;
      height: 100%;
      width: 100%;
      border-radius: 50%;
      background: var(--neon-green);
      opacity: 0.4;
      animation: mb-led-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .mb-bar-led-dot {
      position: relative;
      display: inline-flex;
      height: 10px;
      width: 10px;
      border-radius: 50%;
      border: 2px solid var(--deep-void);
      background: var(--neon-green);
    }
    @keyframes mb-led-ping {
      75%, 100% { transform: scale(2); opacity: 0; }
    }
  `;

  // ── <motherbrain-chat> Custom Element ──────────────────────────────────
  class MotherbrainChat extends HTMLElement {
    // ── Observed attributes ──
    static get observedAttributes() {
      return [
        "endpoint",
        "skill",
        "theme",
        "agent-name",
        "agent-description",
        "branding",
        "primary-color",
        "hero-search",
        "logo-url",
      ];
    }

    // ── Public config getters ──
    get endpoint() {
      return this.getAttribute("endpoint") || "https://a2a.motherbrain.app";
    }
    get skill() {
      return this.getAttribute("skill") || "product-info";
    }
    get theme() {
      return this.getAttribute("theme") || "dark";
    }
    get agentName() {
      return this.getAttribute("agent-name") || "MOTHER";
    }
    get agentDescription() {
      return this.getAttribute("agent-description") || "";
    }
    get brandingText() {
      return this.getAttribute("branding") || "Powered by Mother Brain";
    }
    get primaryColor() {
      return this.getAttribute("primary-color") || "#39ff14";
    }
    get heroSearch() {
      return this.getAttribute("hero-search") === "true";
    }
    get logoUrl() {
      return this.getAttribute("logo-url") || "";
    }

    // ── Internal state ──
    #shadow;
    #mode = "hidden"; // hidden | overlay | bar
    #messages = [];
    #input = "";
    #sending = false;
    #isStreaming = false;
    #currentTaskId = null;
    #visitorId;
    #streamTimer = null;
    #isLoadingHistory = false;
    #hasMoreHistory = false;
    #rpcIdCounter = 0;

    constructor() {
      super();
      this.#shadow = this.attachShadow({ mode: "open" });
      // Generate visitor ID via Broprint.js (async — uses localStorage sync fallback if needed)
      this.#visitorId = (() => {
        try {
          return localStorage.getItem(VISITOR_KEY) || "";
        } catch {
          return "";
        }
      })();
      getVisitorId().then((id) => {
        this.#visitorId = id;
      });
      this.#currentTaskId = loadTaskId();

      // Create the style element
      const style = document.createElement("style");
      style.textContent = STYLES;
      this.#shadow.appendChild(style);

      // Create container for dynamic content
      const container = document.createElement("div");
      container.id = "mb-root";
      container.className = "mb-hidden";
      this.#shadow.appendChild(container);
    }

    connectedCallback() {
      // Setup hero-search listener
      if (this.heroSearch) {
        this.#setupHeroSearch();
      }
      // Auto-load chat history on connect (so page refresh restores messages)
      // Await visitor ID to avoid race condition with async Broprint.js fingerprinting
      getVisitorId().then((id) => {
        this.#visitorId = id;
        if (this.#messages.length === 0) {
          this.#loadHistory();
        }
      });
    }

    disconnectedCallback() {
      if (this.#streamTimer) clearTimeout(this.#streamTimer);
      this.#removeHeroSearch();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal) return;
      // Re-apply theme if it changed
      if (name === "theme" || name === "primary-color") {
        this.#applyThemeOverrides();
      }
      // Setup/teardown hero-search
      if (name === "hero-search") {
        if (newVal === "true") this.#setupHeroSearch();
        else this.#removeHeroSearch();
      }
      // Re-render if visible
      if (this.#mode !== "hidden") this.#render();
    }

    // ── Theme Overrides ──
    #applyThemeOverrides() {
      const host = this.#shadow.host;
      // If primary-color is set and not the default, override --neon-green
      if (this.primaryColor !== "#39ff14") {
        host.style.setProperty("--neon-green", this.primaryColor);
      }
    }

    // ── Hero Search ──
    #heroHandler = null;
    #heroSearchHandler = null;
    #setupHeroSearch() {
      if (this.#heroHandler && this.#heroSearchHandler) return;

      // Legacy: listen for Enter on <input type="search"> (backward compat)
      if (!this.#heroHandler) {
        this.#heroHandler = (e) => {
          if (
            e.key === "Enter" &&
            e.target.tagName === "INPUT" &&
            e.target.type === "search"
          ) {
            e.preventDefault();
            const query = e.target.value?.trim();
            this.openChat(query || undefined);
          }
        };
        document.addEventListener("keydown", this.#heroHandler);
      }

      // Native: listen for hero-search-submit from <ne-hero-search> custom element
      if (!this.#heroSearchHandler) {
        this.#heroSearchHandler = (e) => {
          const query = e.detail?.query?.trim();
          if (query) {
            this.openChat(query);
          }
        };
        document.addEventListener(
          "hero-search-submit",
          this.#heroSearchHandler,
        );
      }
    }
    #removeHeroSearch() {
      if (this.#heroHandler) {
        document.removeEventListener("keydown", this.#heroHandler);
        this.#heroHandler = null;
      }
      if (this.#heroSearchHandler) {
        document.removeEventListener(
          "hero-search-submit",
          this.#heroSearchHandler,
        );
        this.#heroSearchHandler = null;
      }
    }

    // ── Public API ──
    async openChat(initialMessage) {
      // Ensure visitor ID is resolved before loading history
      if (!this.#visitorId) {
        this.#visitorId = await getVisitorId();
      }

      this.#mode = "overlay";
      this.#applyThemeOverrides();
      this.#render();
      this.dispatchEvent(
        new CustomEvent("chat-open", { bubbles: true, composed: true }),
      );

      // Load history if first open (visitor ID now guaranteed)
      if (this.#messages.length === 0) {
        this.#loadHistory();
      }

      // Focus input after render
      requestAnimationFrame(() => {
        const input = this.#shadow.getElementById("mb-input");
        if (input) setTimeout(() => input.focus(), 200);
      });

      // Send initial message if provided
      if (initialMessage) {
        setTimeout(() => this.#handleSend(initialMessage), 300);
      }
    }

    closeChat() {
      this.#mode = "hidden";
      this.#render();
      this.dispatchEvent(
        new CustomEvent("chat-close", { bubbles: true, composed: true }),
      );
    }

    minimizeChat() {
      this.#mode = "bar";
      this.#render();
      this.dispatchEvent(
        new CustomEvent("chat-bar-show", { bubbles: true, composed: true }),
      );
    }

    // ── Render ──
    #render() {
      const root = this.#shadow.getElementById("mb-root");
      if (!root) return;

      if (this.#mode === "hidden") {
        root.className = "mb-hidden";
        root.innerHTML = "";
        return;
      }

      root.className = "";
      root.innerHTML =
        this.#mode === "bar" ? this.#renderBar() : this.#renderOverlay();

      this.#bindEvents();
    }

    #renderOverlay() {
      const msgs = this.#messages
        .map((msg, i) => this.#renderMessage(msg, i))
        .join("");
      const placeholder = this.#sending
        ? `${this.agentName} is thinking...`
        : `Ask ${this.agentName} anything...`;

      return `
        <div class="mb-overlay">
          <div class="mb-header">
            <div class="mb-header-left">
              ${this.#renderBrainIcon(28)}
              <div>
                <div class="mb-header-name">${escapeHtml(this.agentName.toUpperCase())}</div>
                <div class="mb-header-status">online</div>
              </div>
            </div>
            <div class="mb-header-actions">
              <button class="mb-btn-icon" data-action="minimize" title="Minimize">
                ${ICON_MINIMIZE}
              </button>
              <button class="mb-btn-icon" data-action="close" title="Close">
                ${ICON_CLOSE}
              </button>
            </div>
          </div>

          <div class="mb-messages" id="mb-messages">
            <div class="mb-messages-inner">
              ${msgs}
              <div id="mb-scroll-anchor"></div>
            </div>
          </div>

          <div class="mb-input-bar">
            <form class="mb-input-form" id="mb-form">
              <input
                type="text"
                class="mb-input"
                id="mb-input"
                placeholder="${escapeHtml(placeholder)}"
                ${this.#sending ? "disabled" : ""}
                autocomplete="off"
              />
              <button
                type="submit"
                class="mb-send-btn"
                id="mb-send"
                ${this.#sending ? "disabled" : ""}
              >
                ${this.#sending ? ICON_SPINNER : ICON_SEND}
              </button>
            </form>
            <div class="mb-branding">${escapeHtml(this.brandingText)}</div>
          </div>
        </div>
      `;
    }

    #renderBar() {
      const lastAgent = [...this.#messages]
        .reverse()
        .find((m) => m.role === "agent");
      const preview = lastAgent
        ? lastAgent.text.replace(/\*\*/g, "").slice(0, 120)
        : "Click to expand chat";
      const hasMessages = this.#messages.length > 0;

      return `
        <div class="mb-bar">
          <div class="mb-bar-inner">
            <button class="mb-bar-brain" data-action="menu" title="Open menu">
              ${this.#renderBrainIcon(40)}
              ${
                hasMessages
                  ? `
                <span class="mb-bar-led">
                  <span class="mb-bar-led-inner"></span>
                  <span class="mb-bar-led-dot"></span>
                </span>
              `
                  : ""
              }
            </button>
            <div class="mb-bar-preview">${escapeHtml(preview)}</div>
            <button class="mb-bar-btn" data-action="expand" title="Expand">
              ${ICON_MAXIMIZE}
            </button>
            <button class="mb-bar-btn" data-action="close-bar" title="Close">
              ${ICON_CLOSE}
            </button>
          </div>
        </div>
      `;
    }

    #renderMessage(msg, index) {
      const isUser = msg.role === "user";
      const wrapperClass = isUser
        ? "mb-msg-wrapper mb-msg-user"
        : "mb-msg-wrapper";

      let content = "";

      if (!isUser) {
        // Agent label
        content += `
          <div class="mb-msg-agent-label">
            ${this.#renderBrainIcon(12)}
            <span style="letter-spacing:0.05em">${escapeHtml(this.agentName.toUpperCase())}</span>
          </div>
        `;

        // Tool calls (above everything else — before thinking and response text)
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          content += `<div class="mb-tool-calls">`;
          for (const tc of msg.toolCalls) {
            const argsStr = Object.entries(tc.args || {})
              .map(
                ([k, v]) =>
                  `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
              )
              .join(", ");
            content += `
              <details class="mb-tool-call">
                <summary>
                  <span style="color:var(--neon-green);flex-shrink:0">⟡</span>
                  <span class="mb-tool-name">${escapeHtml(tc.name)}</span>
                  <span class="mb-tool-args">${escapeHtml(argsStr)}</span>
                </summary>
                <div class="mb-tool-result">
                  <div class="mb-tool-result-label">Result:</div>
                  <pre>${escapeHtml(tc.resultPreview || "(no result)")}</pre>
                </div>
              </details>
            `;
          }
          content += `</div>`;
        }

        // Thinking indicator (shows below tool calls, above response text)
        if (msg.isWorking && !msg.text) {
          content += `
            <div class="mb-thinking">
              ${ICON_SPINNER}
              <span>${escapeHtml(msg.thinking || "Thinking...")}</span>
            </div>
          `;
        }
      }

      // Message text
      // For agent messages, always render during streaming (even if empty)
      const isStreamingLast =
        !isUser && this.#isStreaming && index === this.#messages.length - 1;

      if (msg.text || isStreamingLast) {
        if (isUser) {
          content += `<div class="mb-msg-text">${escapeHtml(msg.text)}</div>`;
        } else if (isStreamingLast) {
          content += `<div class="mb-msg-text" data-streaming="true">${escapeHtml(msg.text)}<span class="mb-msg-cursor">▌</span></div>`;
        } else {
          content += `<div class="mb-markdown">${renderMarkdown(msg.text)}</div>`;
        }
      }

      // Timestamp
      content += `<div class="mb-msg-time">${escapeHtml(msg.time || "")}</div>`;

      return `
        <div class="${wrapperClass}">
          <div class="mb-msg-bubble">${content}</div>
        </div>
      `;
    }

    #renderBrainIcon(size) {
      if (this.logoUrl) {
        return `<img src="${escapeHtml(this.logoUrl)}" alt="Logo" width="${size}" height="${size}" style="object-fit:contain;display:block;flex-shrink:0" />`;
      }
      // Gradient brain icon — matches Mother Brain app + website FAB + ChatOverlay
      const uid = `bg${size}-${Math.random().toString(36).slice(2, 6)}`;
      return `
        <svg width="${size}" height="${Math.round(size * 0.985)}" viewBox="0 0 27.71 27.3" overflow="visible" preserveAspectRatio="xMidYMid meet">
          <defs><linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00dc82"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient></defs>
          <path fill="url(#${uid})" d="${MB_LOGO_PATH}"/>
        </svg>
      `;
    }

    // ── Event Binding ──
    #bindEvents() {
      // Action buttons
      this.#shadow.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const action = btn.getAttribute("data-action");
          if (action === "minimize") this.minimizeChat();
          else if (action === "close") this.closeChat();
          else if (action === "menu") {
            this.dispatchEvent(
              new CustomEvent("chat-menu-request", {
                bubbles: true,
                composed: true,
              }),
            );
          } else if (action === "expand") {
            this.#mode = "overlay";
            this.dispatchEvent(
              new CustomEvent("chat-open", { bubbles: true, composed: true }),
            );
            this.#render();
          } else if (action === "close-bar") {
            this.#mode = "hidden";
            this.dispatchEvent(
              new CustomEvent("chat-bar-hide", {
                bubbles: true,
                composed: true,
              }),
            );
            this.#render();
          }
        });
      });

      // Form submit
      const form = this.#shadow.getElementById("mb-form");
      if (form) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const input = this.#shadow.getElementById("mb-input");
          const text = input?.value?.trim();
          if (text) this.#handleSend(text);
        });
      }

      // Input tracking
      const inputEl = this.#shadow.getElementById("mb-input");
      if (inputEl) {
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const text = inputEl.value?.trim();
            if (text) this.#handleSend(text);
          }
        });
      }

      // Scroll handler for loading older messages
      const messagesEl = this.#shadow.getElementById("mb-messages");
      if (messagesEl) {
        messagesEl.addEventListener("scroll", () => {
          if (
            messagesEl.scrollTop < 50 &&
            !this.#isLoadingHistory &&
            this.#hasMoreHistory
          ) {
            this.#loadOlderMessages();
          }
        });
      }

      // Scroll to bottom on new messages
      this.#scrollToBottom();
    }

    #scrollToBottom() {
      requestAnimationFrame(() => {
        const anchor = this.#shadow.getElementById("mb-scroll-anchor");
        if (anchor) anchor.scrollIntoView({ behavior: "smooth" });
      });
    }

    // ── Load History ──
    async #loadHistory() {
      this.#isLoadingHistory = true;
      try {
        const data = await rpcPost(this.endpoint, "visitor/history", {
          visitor_id: this.#visitorId,
          limit: 20,
        });

        const conversations = data.result?.conversations || [];
        const allMsgs = [];
        for (const conv of conversations) {
          for (const msg of conv.messages || []) {
            allMsgs.push({
              id: `hist-${conv.taskId}-${allMsgs.length}`,
              role: msg.role === "user" ? "user" : "agent",
              text: msg.text,
              time: timeFromISO(conv.createdAt),
              taskId: conv.taskId,
            });
          }
        }

        if (allMsgs.length > 0) {
          const sliced = allMsgs.slice(-20);
          this.#messages = sliced;
          this.#hasMoreHistory = allMsgs.length > 20;

          const lastMsg = sliced[sliced.length - 1];
          if (lastMsg?.taskId) {
            this.#currentTaskId = lastMsg.taskId;
            saveTaskId(lastMsg.taskId);
          }

          // Auto-show in bar mode when previous conversation exists
          if (this.#mode === "hidden") {
            this.#mode = "bar";
            const lastAgentMsg = [...sliced]
              .reverse()
              .find((m) => m.role === "agent");
            this.dispatchEvent(
              new CustomEvent("chat-bar-show", {
                bubbles: true,
                composed: true,
                detail: { lastMessage: lastAgentMsg?.text || null },
              }),
            );
          }
        }
      } catch (err) {
        console.warn("[motherbrain-chat] Failed to load history:", err);
      }
      this.#isLoadingHistory = false;
      this.#render();
    }

    async #loadOlderMessages() {
      if (this.#isLoadingHistory || !this.#hasMoreHistory) return;
      this.#isLoadingHistory = true;

      const messagesEl = this.#shadow.getElementById("mb-messages");
      const prevScrollHeight = messagesEl?.scrollHeight || 0;

      try {
        const beforeCursor = this.#messages[0]?.time;
        // Use a before timestamp filter if available
        const params = {
          visitor_id: this.#visitorId,
          limit: 20,
        };

        const data = await rpcPost(this.endpoint, "visitor/history", params);
        const conversations = data.result?.conversations || [];

        const allMsgs = [];
        for (const conv of conversations) {
          for (const msg of conv.messages || []) {
            allMsgs.push({
              id: `hist-old-${conv.taskId}-${allMsgs.length}`,
              role: msg.role === "user" ? "user" : "agent",
              text: msg.text,
              time: timeFromISO(conv.createdAt),
              taskId: conv.taskId,
            });
          }
        }

        // Filter to only messages older than what we already have
        let older = allMsgs;
        if (beforeCursor) {
          older = allMsgs.filter((m) => m.time < beforeCursor);
        }

        if (older.length > 0) {
          const sliced = older.slice(-20);
          this.#messages = [...sliced, ...this.#messages];
          this.#hasMoreHistory = older.length > 20;

          // Preserve scroll position
          requestAnimationFrame(() => {
            if (messagesEl) {
              const newScrollHeight = messagesEl.scrollHeight;
              messagesEl.scrollTop = newScrollHeight - prevScrollHeight;
            }
          });
        } else {
          this.#hasMoreHistory = false;
        }
      } catch {
        // silently fail
      }

      this.#isLoadingHistory = false;
      this.#render();
    }

    // ── Typewriter Streaming ──
    #streamText(fullText, messageIndex) {
      this.#isStreaming = true;
      let charIndex = 0;
      const speed = 12; // 12ms per character

      const tick = () => {
        charIndex++;
        const visibleText = fullText.slice(0, charIndex);
        if (this.#messages[messageIndex]) {
          this.#messages[messageIndex].text = visibleText;
          this.#updateMessageDOM(messageIndex);
        }
        if (charIndex < fullText.length) {
          this.#streamTimer = setTimeout(tick, speed);
        } else {
          this.#isStreaming = false;
          this.#render(); // Final render to switch from streaming to markdown
        }
      };

      // Start with empty text
      if (this.#messages[messageIndex]) {
        this.#messages[messageIndex].text = "";
      }
      this.#render();
      this.#streamTimer = setTimeout(tick, speed);
    }

    #streamToolCalls(toolCalls, messageIndex, onComplete) {
      if (!toolCalls || toolCalls.length === 0) {
        onComplete();
        return;
      }
      this.#isStreaming = true;
      let callIndex = 0;
      const delay = 400;

      const showNext = () => {
        if (callIndex >= toolCalls.length) {
          onComplete();
          return;
        }
        const tc = toolCalls[callIndex];
        const callsSoFar = toolCalls.slice(0, callIndex + 1);
        if (this.#messages[messageIndex]) {
          this.#messages[messageIndex].toolCalls = callsSoFar;
          this.#messages[messageIndex].thinking =
            TOOL_LABELS[tc.name] || `Running ${tc.name}...`;
          this.#render();
        }
        callIndex++;
        this.#streamTimer = setTimeout(showNext, delay);
      };
      showNext();
    }

    // Lightweight DOM update for streaming (avoids full re-render per character)
    #updateMessageDOM(index) {
      const msg = this.#messages[index];
      if (!msg) return;
      const textEl = this.#shadow.querySelector('[data-streaming="true"]');
      if (textEl) {
        textEl.textContent = msg.text;
        const cursor = document.createElement("span");
        cursor.className = "mb-msg-cursor";
        cursor.textContent = "▌";
        textEl.appendChild(cursor);
      }
      this.#scrollToBottom();
    }

    // ── Send Message ──
    async #handleSend(text) {
      text = (text || "").trim();
      if (!text || this.#sending) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        role: "user",
        text,
        time: timeNow(),
      };

      const agentId = `a-${Date.now()}`;
      const workingMsg = {
        id: agentId,
        role: "agent",
        text: "",
        time: timeNow(),
        isWorking: true,
        thinking: "Thinking...",
      };

      this.#messages.push(userMsg, workingMsg);
      this.#sending = true;
      this.#render();

      this.dispatchEvent(
        new CustomEvent("message-sent", {
          bubbles: true,
          composed: true,
          detail: { text },
        }),
      );

      try {
        const data = await rpcPost(this.endpoint, "message/send", {
          taskId: this.#currentTaskId || undefined,
          message: {
            role: "user",
            parts: [{ type: "text", text }],
          },
          metadata: { visitor_id: this.#visitorId },
        });

        const task = data.result?.task;
        if (task?.taskId) {
          this.#currentTaskId = task.taskId;
          saveTaskId(task.taskId);
        }

        let agentText = "";
        let toolCalls = [];

        // Extract text from agent history
        if (task?.history && Array.isArray(task.history)) {
          const agentEvents = task.history.filter((e) => e.role === "agent");
          const lastAgent = agentEvents[agentEvents.length - 1];
          if (lastAgent?.parts) {
            agentText = lastAgent.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .join("");
          }
        }

        // Extract tool calls from artifacts
        const artifacts = data.result?.artifacts;
        if (artifacts && Array.isArray(artifacts)) {
          const lastArtifact = artifacts[artifacts.length - 1];
          if (
            lastArtifact?.metadata?.toolCalls &&
            Array.isArray(lastArtifact.metadata.toolCalls)
          ) {
            toolCalls = lastArtifact.metadata.toolCalls.map((tc) => ({
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
        }

        if (!agentText && !toolCalls.length) {
          agentText = "No response received.";
        }

        // Mark as no longer working
        const agentIdx = this.#messages.findIndex((m) => m.id === agentId);
        if (agentIdx !== -1) {
          this.#messages[agentIdx].isWorking = false;
          this.#messages[agentIdx].thinking = undefined;
        }

        // Stream the response
        setTimeout(() => {
          const idx = this.#messages.findIndex((m) => m.id === agentId);
          if (idx === -1) return;

          if (toolCalls.length > 0) {
            this.#streamToolCalls(toolCalls, idx, () => {
              this.#streamText(agentText, idx);
            });
          } else {
            this.#streamText(agentText, idx);
          }
        }, 50);

        this.dispatchEvent(
          new CustomEvent("message-received", {
            bubbles: true,
            composed: true,
            detail: { text: agentText },
          }),
        );
      } catch (err) {
        const agentIdx = this.#messages.findIndex((m) => m.id === agentId);
        if (agentIdx !== -1) {
          this.#messages[agentIdx].text =
            `⚠ Connection error: ${err instanceof Error ? err.message : "Network error"}`;
          this.#messages[agentIdx].isWorking = false;
          this.#messages[agentIdx].thinking = undefined;
        }
        this.#render();
      } finally {
        this.#sending = false;
        // Re-enable input
        const inputEl = this.#shadow.getElementById("mb-input");
        const sendBtn = this.#shadow.getElementById("mb-send");
        if (inputEl) inputEl.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
      }
    }
  }

  // ── Register the custom element ──
  if (!customElements.get("motherbrain-chat")) {
    customElements.define("motherbrain-chat", MotherbrainChat);
  }
})();
