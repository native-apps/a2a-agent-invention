// ---------------------------------------------------------------------------
// hero-search.js — <ne-hero-search> Web Component (Custom Element)
// ---------------------------------------------------------------------------
// SOURCE OF TRUTH: settings/A2aChatPreview.tsx (NeHeroSearchElement class)
// This file is GENERATED from the preview. Do not edit separately.
// Any changes must be made in A2aChatPreview.tsx first, then synced here.
//
// Self-contained, framework-agnostic Hero Search widget.
// Pure SVG rendering in Shadow DOM with ResizeObserver geometry.
//
// Usage:
//   <script src="hero-search.js"></script>
//   <ne-hero-search
//     agent-description="AI assistant powered by Mother Brain"
//     branding="Powered by Mother Brain"
//     gradient-color-1="#00dc82"
//     gradient-color-2="#a78bfa"
//   ></ne-hero-search>
//
// Events dispatched (bubbling, composed):
//   hero-search-submit   — { detail: { query: string } } when user presses Enter or clicks brain
//   hero-search-continue — when user clicks "Continue paused conversation"
//   hero-search-focus    — when the search input gains focus
//   hero-search-blur     — when the search input loses focus
//
// Events listened for:
//   chat-history-available — { detail: { messageCount, lastMessage } } from motherbrain-chat.js
//
// Methods:
//   setSuggestions(string[]) — replace typewriter suggestions
// ---------------------------------------------------------------------------

(() => {
  "use strict";

  // ── Default Suggestions ──────────────────────────────────────────────────
  // Matches the preview's _getSuggestions() fallback.
  // NO nativeapps.io taglines — these are generic defaults.
  const DEFAULT_SUGGESTIONS = [
    "Ask anything...",
    "How does this work?",
    "Get started",
  ];

  // ── Brain Icon SVG Path (Mother Brain official logo — both hemispheres) ──
  const MB_LOGO_PATH =
    "M7.93 1.47l.73.25c.11.04.19.12.23.23l.39 1.07a1.06 1.06 0 1 1-.01 2.12c-.59 0-1.06-.47-1.06-1.06 0-.32.15-.6.37-.79l-.33-.91-1.13-.39c-1.58.07-2.89 1.14-3.31 2.6l1.6.45a1.05 1.05 0 0 1 .92-.56c.59 0 1.06.47 1.06 1.06 0 .05-.02.09-.03.13l1.04.83h.58l2.04-1.49c.06-.05.14-.07.22-.07h2.01v-4A3.6 3.6 0 0 0 10.83 0c-1.19 0-2.24.58-2.9 1.47zM1.96 9.91s.1-.03.15-.03h1.83c.15-.4.53-.69.98-.69.06 0 .1.02.1.02l.77-2.77a1.03 1.03 0 0 1-.48-.65l-1.67-.47C2.08 5.73.93 7.13.93 8.82c0 .5.11.97.29 1.4l.73-.32zm7.36-2.73c-.06.05-.14.07-.22.07h-.83c-.08 0-.17-.03-.23-.08L7 6.34c-.13.11-.28.18-.45.21l-.83 2.99c.17.19.28.43.28.7 0 .17-.05.33-.12.47l1.36 1.01c.05.04.09.09.12.15l.74 1.68c.14-.05.29-.09.46-.09.57 0 1.05.37 1.24.88h2.4a.41.41 0 0 1 .29.13l.79.92v-4.88l-1.4-1.45-1.99.34c-.03.71-.61 1.27-1.32 1.27a1.35 1.35 0 0 1-1.33-1.33c0-.73.6-1.33 1.33-1.33.49 0 .9.27 1.13.67l2.25-.38c.13-.02.25.02.33.11l1 1.03V5.7h-1.89L9.35 7.19zM3.4 19.16l2.6.75c.07-.08.16-.15.25-.21l-1.89-4.06c-.12.04-.24.07-.37.07-.47 0-.87-.26-1.11-.63l-1.25.39L.37 17.2c-.06.26-.1.53-.1.81a3.64 3.64 0 0 0 1.71 3.08l.99-1.75c.08-.15.26-.22.43-.18zm6.41-4.07c-.14.59-.64 1.04-1.27 1.04a1.33 1.33 0 0 1-1.33-1.33c0-.29.11-.54.27-.76l-.78-1.76-1.4-1.04c-.12.04-.24.07-.37.07-.45 0-.83-.29-.98-.69H2.19l-1.34.59c-.53.63-.85 1.43-.85 2.31 0 .76.25 1.45.65 2.03l.45-.62a.38.38 0 0 1 .19-.14l1.37-.43c0-.73.6-1.32 1.33-1.32s1.33.6 1.33 1.33c0 .33-.13.62-.33.85l2.02 4.34c.48.1.85.51.85 1.02 0 .59-.47 1.06-1.06 1.06s-1.03-.46-1.05-1.03l-2.27-.65-.98 1.73c.27 1.53 1.48 2.73 3.03 2.95v-.97a.37.37 0 0 1 .14-.29L7.37 22c.07-.05.15-.08.24-.08H9.5a1.31 1.31 0 0 1 1.26-.96c.7 0 1.25.54 1.31 1.22l1.19.24v-1.89l-1.24-1.14h-1.76c-.15.4-.53.69-.98.69-.59 0-1.06-.47-1.06-1.06s.47-1.06 1.06-1.06c.45 0 .83.29.98.69h1.91c.09 0 .18.04.25.1l.84.77v-2.96l-1.24-1.45H9.83zm.94 8.53c-.6 0-1.09-.41-1.26-.96H7.73l-1.46 1.19v.83c.44 1.51 1.82 2.62 3.47 2.62s3.08-1.15 3.5-2.7v-1.43l-1.34-.27c-.22.42-.65.72-1.16.72zm10.98-10.73c-.45 0-.83.29-.98.69h-2.48c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.48c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06zm5.98.63c0-1.18-.57-2.21-1.44-2.88.31-.54.51-1.16.51-1.82 0-1.69-1.17-3.11-2.73-3.51-.15-1.87-1.7-3.35-3.6-3.35-.11 0-.22.02-.33.03-.6-1.18-1.81-2-3.23-2a3.6 3.6 0 0 0-2.42.94v23.66c.41 1.55 1.81 2.7 3.5 2.7s3.04-1.12 3.48-2.63c.08 0 .15.02.23.02 1.91 0 3.46-1.48 3.61-3.36 1.28-.56 2.17-1.84 2.17-3.32 0-.78-.25-1.49-.67-2.09.57-.64.93-1.48.93-2.4zM15.46 3.03H17l1.06 1-.61 1.04c-.06 0-.11-.03-.17-.03-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06 1.06-.47 1.06-1.06c0-.25-.1-.47-.24-.65l.91-1.55-1.71-1.62h-1.84v-.84a2.6 2.6 0 0 1 1.42-.43c.99 0 1.88.56 2.34 1.46l.31.61.68-.06c.05 0 .11-.01.16-.02h.08c.17 0 .34.02.51.05l-.49.99v.86c-.4.15-.69.53-.69.98 0 .59.47 1.06 1.06 1.06s1.06-.47 1.06-1.06c0-.45-.29-.83-.69-.98v-.77l.44-.83c.78.4 1.33 1.18 1.4 2.12l.06.71-1.06 1.89h-.86c-.14-.42-.53-.72-.99-.72s-.85.3-.99.72h-1.46l-.62.62h-1.67V3.03zm10.57 12.23l-.49.55h-.8c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69H26c.29.43.45.93.45 1.45 0 1.04-.62 1.98-1.57 2.41l-.54.24-1.08-1.51h-1.43c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h1.04l1.33 1.85c-.31 1.12-1.33 1.94-2.52 1.94h0c-.06 0-.11-.01-.17-.02l-.57-.04-.03-.06v-.31c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.4l.33.68v.04c-.33 1.12-1.37 1.91-2.53 1.91-1.04 0-1.96-.62-2.38-1.55h1.38l1.28-1.25v-.51c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.19l-.84.81h-1.19v-4.11h1.2c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-1.2v-1.82h3.54c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-3.54V9.33h1.98l.62-.62h1.17c.16.38.54.65.98.65s.82-.27.98-.65h1.31l1.36-2.43a2.62 2.62 0 0 1 1.93 2.52c0 .45-.12.9-.37 1.32l-.43.73h-.77c-.15-.4-.53-.69-.98-.69s-.83.29-.98.69h-2.54c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.54c.15.4.53.69.98.69s.83-.29.98-.69h1.65c.53.5.85 1.17.85 1.9 0 .81-.37 1.39-.68 1.74z";

  // ── Octagon Path Generator (exact copy from preview) ─────────────────────
  function octagonPath(w, h, c) {
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
    return (
      "M " +
      p
        .map(function (_a) {
          var x = _a[0],
            y = _a[1];
          return x + " " + y;
        })
        .join(" L ") +
      " Z"
    );
  }

  // ── Theme colors (matches preview's T_DARK / T_LIGHT) ────────────────────
  var THEME_DARK = {
    deepVoid: "#0a0a0f",
    darkMatter: "#13131f",
    neuralNode: "#1e1e2d",
    neonGreen: "#39ff14",
    text: "#e2e8f0",
    textMuted: "#64748b",
    font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
  };
  var THEME_LIGHT = {
    deepVoid: "#f9fafb",
    darkMatter: "#ffffff",
    neuralNode: "#e5e7eb",
    neonGreen: "#059669",
    text: "#111827",
    textMuted: "#6b7280",
    font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
  };

  function detectLightMode() {
    if (
      typeof document !== "undefined" &&
      document.body &&
      document.body.classList.contains("light")
    )
      return true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    )
      return true;
    return false;
  }

  // ── <ne-hero-search> Web Component ───────────────────────────────────────
  // EXACT extraction of NeHeroSearchElement from settings/A2aChatPreview.tsx
  // Lines 247-633 — converted from TypeScript to vanilla JS.
  // Includes HeroSearchHost layout (agent description, branding, continue button)
  // integrated as attributes so the deployed widget matches the preview 100%.

  var heroSearchRegistered = false;

  function registerHeroSearch() {
    if (typeof window === "undefined") return;
    if (heroSearchRegistered) return;
    if (customElements.get("ne-hero-search")) {
      heroSearchRegistered = true;
      return;
    }

    class NeHeroSearch extends HTMLElement {
      constructor() {
        super();
        var self = this;
        this._shadow = this.attachShadow({ mode: "open" });

        // ── Private fields (matches preview exactly) ──
        this._customSuggestions = null;
        this._typewriterTimer = null;
        this._suggestionIdx = 0;
        this._autoTyping = false;
        this._lastQuery = "";
        this._completedQuery = "";
        this._hoverPaused = false;
        this._gradientColor1 = null;
        this._gradientColor2 = null;
        this._agentDescription = "";
        this._branding = "";
        this._themeMode = detectLightMode() ? "light" : "dark";

        var ns = "http://www.w3.org/2000/svg";

        // ── Container (matches HeroSearchHost layout) ──
        var container = document.createElement("div");
        container.className = "hs-container";
        container.style.cssText =
          "position:relative;width:100%;height:100%;min-height:400px;" +
          "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
          "padding:24px;";

        // ── Search bar wrapper ──
        var searchWrapper = document.createElement("div");
        searchWrapper.style.cssText =
          "width:100%;max-width:768px;padding:0 8px;";

        // ── SVG (matches preview constructor lines 274-330) ──
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "75");
        svg.setAttribute("viewBox", "0 0 768 81.5");
        svg.setAttribute("overflow", "visible");
        this._svg = svg;

        // ── Defs: clip path + theme gradient + stroke gradient ──
        var defs = document.createElementNS(ns, "defs");

        // Clip path (preview uses "hs-text-clip")
        var clip = document.createElementNS(ns, "clipPath");
        clip.setAttribute("id", "hs-text-clip");
        var clipPathShape = document.createElementNS(ns, "path");
        clip.appendChild(clipPathShape);

        // Theme fill gradient (preview uses "hs-theme-fill")
        var grad = document.createElementNS(ns, "linearGradient");
        grad.setAttribute("id", "hs-theme-fill");
        grad.setAttribute("x1", "0%");
        grad.setAttribute("y1", "100%");
        grad.setAttribute("x2", "0%");
        grad.setAttribute("y2", "0%");
        var g1 = document.createElementNS(ns, "stop");
        g1.setAttribute("id", "hs-gs1");
        g1.setAttribute("offset", "0%");
        var g2 = document.createElementNS(ns, "stop");
        g2.setAttribute("id", "hs-gs2");
        g2.setAttribute("offset", "100%");
        grad.appendChild(g1);
        grad.appendChild(g2);

        // Stroke gradient + filter — green→purple (matches Brain logo branding)
        // Preview lines 303-316
        var strokeGradWrap = document.createElementNS(ns, "svg");
        strokeGradWrap.innerHTML =
          '<radialGradient id="hs-amberGlow" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#00dc82" stop-opacity="1" />' +
          '<stop offset="50%" stop-color="#00dc82" stop-opacity="0.8" />' +
          '<stop offset="100%" stop-color="#a78bfa" stop-opacity="1" />' +
          '<animate attributeName="r" values="30%;70%;30%" dur="3s" repeatCount="indefinite" />' +
          "</radialGradient>" +
          '<filter id="hs-amberGlowFilter" x="-50%" y="-50%" width="200%" height="200%">' +
          '<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="coloredBlur" />' +
          '<feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>' +
          "</filter>";
        Array.from(strokeGradWrap.children).forEach(function (n) {
          defs.appendChild(n);
        });

        defs.appendChild(clip);
        defs.appendChild(grad);
        svg.appendChild(defs);
        this._defs = defs;

        // ── Octagon background path ──
        var W = 768;
        var H = 75;
        this._bg = document.createElementNS(ns, "path");
        this._bg.setAttribute("fill", "url(#hs-theme-fill)");
        this._bg.setAttribute("d", octagonPath(W, H, 22));
        this._bg.setAttribute("stroke", "url(#hs-amberGlow)");
        this._bg.setAttribute("stroke-width", "4");
        this._bg.setAttribute("stroke-linejoin", "round");
        this._bg.setAttribute("filter", "url(#hs-amberGlowFilter)");
        svg.appendChild(this._bg);

        // ── Brain icon (Mother Brain logo — same as BrainIcon.tsx) ──
        this._brain = document.createElementNS(ns, "svg");
        this._brain.setAttribute("width", "45");
        this._brain.setAttribute("height", "45");
        this._brain.setAttribute("viewBox", "0 0 50 50");
        this._brain.setAttribute("overflow", "visible");

        // Brain gradient (green → purple, matches preview lines 339-348)
        var brainGradWrap = document.createElementNS(ns, "svg");
        brainGradWrap.innerHTML =
          '<linearGradient id="hs-brainGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
          '<stop offset="0%" stop-color="#00dc82" />' +
          '<stop offset="100%" stop-color="#a78bfa" />' +
          "</linearGradient>";
        Array.from(brainGradWrap.children).forEach(function (n) {
          defs.appendChild(n);
        });

        // Full brain path (both hemispheres)
        var brainGroup = document.createElementNS(ns, "g");
        brainGroup.innerHTML =
          '<path fill="url(#hs-brainGrad)" d="' + MB_LOGO_PATH + '"/>';
        brainGroup.setAttribute("transform", "translate(5 5) scale(1.8)");

        // Invisible click wrapper — brain path has hollow areas; rect makes full icon clickable
        var clickRect = document.createElementNS(ns, "rect");
        clickRect.setAttribute("x", "-5");
        clickRect.setAttribute("y", "-5");
        clickRect.setAttribute("width", "65");
        clickRect.setAttribute("height", "65");
        clickRect.setAttribute("fill", "transparent");
        clickRect.setAttribute("pointer-events", "all");

        this._brain.appendChild(clickRect);
        this._brain.appendChild(brainGroup);
        this._brain.setAttribute("x", "700");
        this._brain.setAttribute("y", "11");
        this._brain.style.cursor = "pointer";
        svg.appendChild(this._brain);

        searchWrapper.appendChild(svg);

        // ── Continue Paused Conversation Button ──
        // Matches HeroSearchHost lines 791-860 (React component → vanilla JS)
        var continueBtn = document.createElement("button");
        continueBtn.className = "hs-continue-btn";
        continueBtn.style.cssText =
          "margin-top:20px;width:100%;max-width:480px;" +
          "border-radius:12px;padding:14px 18px;cursor:pointer;" +
          "display:none;align-items:center;gap:12px;text-align:left;" +
          "transition:border-color 0.2s, background 0.2s;font-family:inherit;";
        continueBtn.innerHTML =
          '<div class="hs-continue-icon"></div>' +
          '<div class="hs-continue-info" style="flex:1;min-width:0;">' +
          '<div class="hs-continue-title" style="font-size:13px;font-weight:bold;margin-bottom:2px;">Continue paused conversation</div>' +
          '<div class="hs-continue-preview" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>' +
          "</div>" +
          '<div class="hs-continue-count" style="font-size:10px;flex-shrink:0;white-space:nowrap;"></div>';
        this._continueBtn = continueBtn;

        // ── Branding text (matches HeroSearchHost lines 864-874) ──
        var brandingEl = document.createElement("div");
        brandingEl.style.cssText =
          "position:absolute;bottom:16px;font-size:10px;letter-spacing:0.05em;";
        this._brandingEl = brandingEl;

        container.appendChild(searchWrapper);
        container.appendChild(continueBtn);
        container.appendChild(brandingEl);

        // ── ForeignObject input (matches preview lines 371-386) ──
        this._foreignObj = document.createElementNS(ns, "foreignObject");
        this._foreignObj.setAttribute("x", "0");
        this._foreignObj.setAttribute("y", "0");
        this._foreignObj.setAttribute("width", "100%");
        this._foreignObj.setAttribute("height", "75");

        var editor = document.createElement("input");
        editor.setAttribute("type", "text");
        editor.setAttribute("spellcheck", "false");
        editor.setAttribute("autocomplete", "off");
        editor.style.cssText =
          'width:100%;height:100%;font:42px "Departure Mono",monospace;' +
          "background:transparent;border:none;margin:0;padding:0;" +
          "color:#fff;outline:none;text-indent:30px;";
        this._editor = editor;

        this._foreignObj.appendChild(editor);
        svg.appendChild(this._foreignObj);

        this._shadow.appendChild(container);

        // ── Apply initial theme ──
        this._applyTheme();

        // ── Theme observer (matches preview lines 390-394) ──
        this._themeObserver = new MutationObserver(function () {
          self._applyTheme();
        });
        this._themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme", "class", "style"],
        });

        // Also listen for body class changes (light mode toggle in Mother Brain app)
        if (document.body) {
          this._bodyObserver = new MutationObserver(function () {
            self._applyTheme();
          });
          this._bodyObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ["class"],
          });
        }
      }

      // ── Apply Theme (matches preview _applyTheme lines 397-417) ──
      _applyTheme() {
        var isLight = detectLightMode();
        this._themeMode = isLight ? "light" : "dark";
        var T = isLight ? THEME_LIGHT : THEME_DARK;

        // Container colors
        var container = this._shadow.querySelector(".hs-container");
        if (container) {
          container.style.backgroundColor = T.deepVoid;
          container.style.color = T.text;
          container.style.fontFamily = T.font;
        }

        // Agent description — NOT displayed (metadata only)

        // Continue button
        if (this._continueBtn) {
          this._continueBtn.style.background = T.darkMatter;
          this._continueBtn.style.border = "1px solid " + T.neonGreen + "33";
          this._continueBtn.style.color = T.text;

          var iconBox = this._continueBtn.querySelector(".hs-continue-icon");
          if (iconBox) {
            iconBox.style.cssText =
              "width:36px;height:36px;flex-shrink:0;border-radius:8px;" +
              "background:" +
              T.neonGreen +
              "1a;display:flex;align-items:center;justify-content:center;";
            // Maximize2 icon (matches preview line 823)
            iconBox.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' +
              T.neonGreen +
              '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
              '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>' +
              "</svg>";
          }

          var preview = this._continueBtn.querySelector(".hs-continue-preview");
          if (preview) preview.style.color = T.textMuted;

          var count = this._continueBtn.querySelector(".hs-continue-count");
          if (count) count.style.color = T.textMuted;
        }

        // Branding
        if (this._brandingEl) {
          this._brandingEl.style.color = T.textMuted;
          this._brandingEl.textContent = this._branding || "";
        }

        // CSS variables from page (matches preview _applyTheme)
        var styles = getComputedStyle(document.documentElement);
        var bgRaw = styles.getPropertyValue("--background").trim();
        var fgRaw = styles.getPropertyValue("--foreground").trim();
        var color = bgRaw ? "hsl(" + bgRaw + ")" : "#0b0b0f";
        var op1 =
          styles.getPropertyValue("--hero-search-stop1-opacity").trim() ||
          "0.2";
        var op2 =
          styles.getPropertyValue("--hero-search-stop2-opacity").trim() ||
          "0.4";

        var stop1 = this._defs.querySelector("#hs-gs1");
        var stop2 = this._defs.querySelector("#hs-gs2");
        if (stop1) {
          stop1.setAttribute("stop-color", color);
          stop1.setAttribute("stop-opacity", op1);
        }
        if (stop2) {
          stop2.setAttribute("stop-color", color);
          stop2.setAttribute("stop-opacity", op2);
        }
        if (fgRaw) this._editor.style.color = "hsl(" + fgRaw + ")";
      }

      // ── Apply gradient colors from attributes (matches HeroSearchHost lines 712-730) ──
      _applyGradientColors() {
        if (!this._gradientColor1) return;
        var shadow = this._shadow;
        if (!shadow) return;

        // Stroke gradient
        var strokeStops = shadow.querySelectorAll("#hs-amberGlow stop");
        if (strokeStops.length >= 2) {
          strokeStops[0].setAttribute("stop-color", this._gradientColor1);
          strokeStops[strokeStops.length - 1].setAttribute(
            "stop-color",
            this._gradientColor2 || this._gradientColor1,
          );
        }

        // Brain gradient
        var brainStops = shadow.querySelectorAll("#hs-brainGrad stop");
        if (brainStops.length >= 2) {
          brainStops[0].setAttribute("stop-color", this._gradientColor1);
          brainStops[1].setAttribute(
            "stop-color",
            this._gradientColor2 || this._gradientColor1,
          );
        }
      }

      // ── Set custom typewriter suggestions (matches preview lines 420-425) ──
      setSuggestions(suggestions) {
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          this._customSuggestions = suggestions;
          if (this._autoTyping) this._restartTypewriter();
        }
      }

      // ── Get suggestions (matches preview _getSuggestions lines 427-435) ──
      _getSuggestions() {
        return this._customSuggestions || DEFAULT_SUGGESTIONS;
      }

      // ── Read attributes ──
      static get observedAttributes() {
        return [
          "agent-description",
          "branding",
          "gradient-color-1",
          "gradient-color-2",
        ];
      }

      attributeChangedCallback(name, oldVal, newVal) {
        if (name === "agent-description") {
          this._agentDescription = newVal || "";
        } else if (name === "branding") {
          this._branding = newVal || "";
          if (this._brandingEl) this._brandingEl.textContent = this._branding;
        } else if (name === "gradient-color-1") {
          this._gradientColor1 = newVal;
          this._applyGradientColors();
        } else if (name === "gradient-color-2") {
          this._gradientColor2 = newVal;
          this._applyGradientColors();
        }
      }

      // ── Connected Callback (matches preview lines 437-533) ──
      connectedCallback() {
        var self = this;

        // Read attributes
        this._agentDescription = this.getAttribute("agent-description") || "";
        this._branding = this.getAttribute("branding") || "";
        this._gradientColor1 = this.getAttribute("gradient-color-1");
        this._gradientColor2 = this.getAttribute("gradient-color-2");

        // Enter key → dispatch submit event (matches preview lines 439-460)
        this._editor.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var query = self._editor.value.trim();
            if (query) {
              e.preventDefault();
              e.stopPropagation();
              self._stopTypewriter();
              self.dispatchEvent(
                new CustomEvent("hero-search-submit", {
                  bubbles: true,
                  composed: true,
                  detail: { query: query },
                }),
              );
            }
          }
          if (e.key === "Escape") {
            e.preventDefault();
            self._editor.value = "";
            self._startTypewriter();
          }
        });

        // Brain icon click → submit current query (matches preview lines 462-480)
        this._brain.addEventListener("click", function (e) {
          e.stopPropagation();
          // If autoTyping: use _completedQuery (last fully-typed suggestion)
          // If user typed their own: use editor.value
          var query = self._autoTyping
            ? (self._completedQuery || "").trim()
            : (self._editor.value || "").trim();
          if (query) {
            self._stopTypewriter();
            self.dispatchEvent(
              new CustomEvent("hero-search-submit", {
                bubbles: true,
                composed: true,
                detail: { query: query },
              }),
            );
          }
        });

        // Click anywhere in component → stop typewriter (matches preview lines 482-485)
        this._editor.addEventListener("pointerdown", function () {
          if (self._autoTyping) self._stopTypewriter();
        });

        // Hover-pause (matches preview lines 487-516)
        this.addEventListener("mouseenter", function () {
          if (self._autoTyping && self._typewriterTimer && !self._hoverPaused) {
            self._hoverPaused = true;
            clearTimeout(self._typewriterTimer);
            self._typewriterTimer = null;
          }
        });
        this.addEventListener("mouseleave", function () {
          if (self._autoTyping && self._hoverPaused) {
            self._hoverPaused = false;
            // Resume from where we left off
            var current = self._getSuggestions()[self._suggestionIdx] || "";
            var resumeIdx = self._editor.value.length;
            if (resumeIdx >= current.length) {
              // Suggestion was complete — restart the delay timer
              self._typewriterTimer = setTimeout(function () {
                self._typeNext(current.length + 1);
              }, 100);
            } else {
              // Mid-typing — continue from current position
              self._typewriterTimer = setTimeout(function () {
                self._typeNext(resumeIdx);
              }, 50);
            }
          }
        });

        // Initial geometry
        this._updateGeometry(this.getBoundingClientRect().width || 768);

        // Start typewriter
        this._startTypewriter();

        // ResizeObserver for responsive geometry (matches preview lines 524-532)
        this._resizeObserver = new ResizeObserver(function (entries) {
          var width = entries[0].contentRect.width;
          self._updateGeometry(width);
        });
        this._resizeObserver.observe(this);

        // Apply gradient colors from attributes
        setTimeout(function () {
          self._applyGradientColors();
        }, 100);

        // ── Continue conversation: listen for history from motherbrain-chat.js ──
        document.addEventListener("chat-history-available", function (e) {
          var detail = (e && e.detail) || {};
          var messageCount = detail.messageCount || 0;
          var lastMessage = detail.lastMessage || "";
          if (messageCount > 0) {
            var btn = self._continueBtn;
            var previewEl = btn.querySelector(".hs-continue-preview");
            var countEl = btn.querySelector(".hs-continue-count");
            if (previewEl) previewEl.textContent = lastMessage;
            if (countEl)
              countEl.textContent =
                messageCount + (messageCount === 1 ? " msg" : " msgs");
            btn.style.display = "flex";
          }
        });

        // Continue conversation click → tell motherbrain-chat to open
        this._continueBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.dispatchEvent(
            new CustomEvent("hero-search-continue", {
              bubbles: true,
              composed: true,
            }),
          );
        });

        // Re-apply theme on body class change
        this._applyTheme();
      }

      // ── Set Clip (matches preview _setClip lines 535-545) ──
      _setClip(width) {
        var HEIGHT = 75;
        var OUTER_C = 22;
        var d = octagonPath(width, HEIGHT, OUTER_C);
        this._svg.setAttribute("viewBox", "0 0 " + width + " " + HEIGHT);
        this._bg.setAttribute("d", d);
        var clip = this._defs.querySelector("#hs-text-clip path");
        if (clip) clip.setAttribute("d", d);
      }

      // ── Update Geometry (matches preview _updateGeometry lines 547-571) ──
      _updateGeometry(width) {
        var HEIGHT = 75;
        var OUTER_C = 22;
        this._setClip(width);

        var availableWidth = width - OUTER_C * 2;
        this._foreignObj.setAttribute("width", String(availableWidth));
        this._editor.style.maxWidth = availableWidth + "px";

        // Update all large paths to match new width
        this._svg.querySelectorAll("path").forEach(function (p) {
          if (p.closest("defs")) return;
          if (p.getBBox().width < 100) return;
          p.setAttribute("d", octagonPath(width, HEIGHT, OUTER_C));
        });

        // Brain icon position (right side, with padding, vertically centered)
        // EXACT match to preview line 564: this._brain.setAttribute("x", String(width - 45 - 24));
        this._brain.setAttribute("x", String(width - 45 - 24));
        this._brain.setAttribute("y", "11");

        // Constrain text width so it doesn't overlap icon
        var textMax = width - 45 - 32;
        this._foreignObj.setAttribute("width", String(textMax));
        this._editor.style.maxWidth = textMax + "px";
      }

      // ── Start Typewriter (matches preview _startTypewriter lines 573-579) ──
      _startTypewriter() {
        this._autoTyping = true;
        this._editor.tabIndex = -1;
        this._editor.value = "";
        this._completedQuery = "";
        this._restartTypewriter();
      }

      // ── Restart Typewriter (matches preview _restartTypewriter lines 581-586) ──
      _restartTypewriter() {
        if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
        this._suggestionIdx = 0;
        this._editor.value = "";
        this._typeNext(0);
      }

      // ── Stop Typewriter (matches preview _stopTypewriter lines 588-594) ──
      _stopTypewriter() {
        this._autoTyping = false;
        if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
        this._editor.value = "";
        this._editor.tabIndex = 0;
        var self = this;
        requestAnimationFrame(function () {
          self._editor.focus();
        });
      }

      // ── Type Next (matches preview _typeNext lines 596-625) ──
      // 50ms per character, 4500ms between suggestions — EXACT preview timing
      _typeNext(charIdx) {
        if (!this._autoTyping) return;
        var self = this;
        var suggestions = this._getSuggestions();
        var current = suggestions[this._suggestionIdx] || suggestions[0];
        if (charIdx <= current.length) {
          var nextValue = current.slice(0, charIdx);
          this._editor.value = nextValue;
          this._lastQuery = nextValue;
          // SHARP: update _completedQuery the exact moment the last char is typed
          if (charIdx === current.length) {
            this._completedQuery = nextValue;
          }
          // Scroll trick: move caret to end + force scrollLeft
          try {
            this._editor.setSelectionRange(nextValue.length, nextValue.length);
            this._editor.scrollLeft = this._editor.scrollWidth;
          } catch (e) {}
          this._typewriterTimer = setTimeout(function () {
            self._typeNext(charIdx + 1);
          }, 50); // ← EXACT preview timing: 50ms per char
        } else {
          this._typewriterTimer = setTimeout(function () {
            self._suggestionIdx =
              (self._suggestionIdx + 1) % suggestions.length;
            self._editor.value = "";
            self._typewriterTimer = setTimeout(function () {
              self._typeNext(0);
            }, 200);
          }, 4500); // ← EXACT preview timing: 4500ms between suggestions
        }
      }

      // ── Disconnected Callback (matches preview lines 628-632) ──
      disconnectedCallback() {
        if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this._themeObserver) this._themeObserver.disconnect();
        if (this._bodyObserver) this._bodyObserver.disconnect();
      }

      // ── Public API ──

      getQuery() {
        return (
          this._autoTyping ? this._completedQuery : this._editor.value || ""
        ).trim();
      }

      focus() {
        if (this._editor) this._editor.focus();
      }
    }

    customElements.define("ne-hero-search", NeHeroSearch);
    heroSearchRegistered = true;
  }

  // Auto-register when in browser
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", registerHeroSearch);
    } else {
      registerHeroSearch();
    }
  }
})();
