// ---------------------------------------------------------------------------
// hero-search.js — <ne-hero-search> Web Component (Custom Element)
// ---------------------------------------------------------------------------
// Self-contained, framework-agnostic Hero Search widget.
// Part of the A2A Agent invention — loaded alongside motherbrain-chat.js.
//
// Pure SVG rendering in Shadow DOM with ResizeObserver geometry.
// Uses the Native Elements protocol — zero React, zero CSS layout.
//
// Usage:
//   <script src="hero-search.js"></script>
//   <ne-hero-search></ne-hero-search>
//
// Events dispatched (bubbling, composed):
//   hero-search-submit — { detail: { query: string } } when user presses Enter
//   hero-search-focus  — when the search input gains focus
//   hero-search-blur   — when the search input loses focus
// ---------------------------------------------------------------------------

(() => {
  "use strict";

  // ── Typewriter Suggestions (customizable via setSuggestions()) ───────────
  const DEFAULT_SUGGESTIONS = [
    "Dream it → Build it → Ship it! 👾",
    "Why are native apps better?",
    "✧ Sovereign Code-Forging",
    "✧ Local-First",
    "✧ Autonomous Ops",
    "✧ Full-Stack Engineering",
  ];

  // ── SVG Def Snippets (from design-library.ts) ─────────────────────────
  const SVG_DEF_SNIPPETS = {
    AMBER_BORDER: `
      <radialGradient id="hs-amberGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffbf00" stop-opacity="1" />
        <stop offset="40%" stop-color="#ff8c00" stop-opacity="1" />
        <stop offset="70%" stop-color="#ff4500" stop-opacity="1" />
        <stop offset="100%" stop-color="#8b0000" stop-opacity="1" />
        <animate attributeName="r" values="30%;70%;30%" dur="3s" repeatCount="indefinite" />
      </radialGradient>
      <filter id="hs-amberGlowFilter" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>`,
    FIRE_BORDER: `
      <linearGradient id="hs-fireGradient1" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"  stop-color="#ff4500" stop-opacity="1">
          <animate attributeName="stop-color" values="#ff4500;#ffa500;#ffff00;#ff8c00;#ff4500" dur="2s" repeatCount="indefinite" />
        </stop>
        <stop offset="25%" stop-color="#ffa500" stop-opacity="0.9">
          <animate attributeName="stop-color" values="#ffa500;#ffff00;#ff8c00;#ff4500;#ffa500" dur="2s" repeatCount="indefinite" />
        </stop>
        <stop offset="50%" stop-color="#ffff00" stop-opacity="0.8">
          <animate attributeName="stop-color" values="#ffff00;#ff8c00;#ff4500;#ffa500;#ffff00" dur="2s" repeatCount="indefinite" />
        </stop>
        <stop offset="75%" stop-color="#ff8c00" stop-opacity="0.9">
          <animate attributeName="stop-color" values="#ff8c00;#ff4500;#ffa500;#ffff00;#ff8c00" dur="2s" repeatCount="indefinite" />
        </stop>
        <stop offset="100%" stop-color="#ff4500" stop-opacity="1">
          <animate attributeName="stop-color" values="#ff4500;#ffa500;#ffff00;#ff8c00;#ff4500" dur="2s" repeatCount="indefinite" />
        </stop>
        <animateTransform attributeName="gradientTransform" type="rotate" values="0 0 0;360 0 0" dur="4s" repeatCount="indefinite" />
      </linearGradient>`,
  };

  function getSvgDefSnippet(id) {
    return SVG_DEF_SNIPPETS[id] || null;
  }

  // ── EnhancedTyped (from enhancedTyped.ts) ─────────────────────────────
  class EnhancedTyped {
    constructor(element, options) {
      this.el = element;
      this.strings = options.strings || [];
      this.typeSpeed = options.typeSpeed ?? 70;
      this.startDelay = options.startDelay ?? 0;
      this.loop = options.loop ?? false;
      this.currentStringIndex = 0;
      this.currentCharIndex = 0;
      this.typingTimeout = null;
      this.destroyed = false;
      this.isTyping = false;
      this.paused = false;
      this.onCharTypedCb = options.onCharTyped;

      if (typeof options.onBegin === "function") {
        setTimeout(() => options.onBegin && options.onBegin(), this.startDelay);
      }
      window.setTimeout(() => {
        if (!this.destroyed) this.begin();
      }, this.startDelay);
    }

    begin() {
      if (this.strings.length === 0 || this.destroyed || this.paused) return;
      this.isTyping = true;
      this.type();
    }

    type() {
      if (this.destroyed || this.paused) return;
      const current = this.strings[this.currentStringIndex] || "";
      if (this.currentCharIndex < current.length) {
        this.typeChar(current);
        this.typingTimeout = window.setTimeout(
          () => this.type(),
          this.typeSpeed,
        );
        return;
      }
      this.isTyping = false;
      if (this.loop && !this.destroyed) {
        this.typingTimeout = window.setTimeout(() => {
          if (!this.paused && !this.destroyed) {
            this.resetForNext();
            this.begin();
          }
        }, 1500);
      }
    }

    typeChar(current) {
      if (this.destroyed || this.paused) return;
      const nextValue = current.substring(0, this.currentCharIndex + 1);
      if (this.el instanceof HTMLInputElement) {
        this.simulateUserInput(nextValue);
      } else {
        this.el.textContent = nextValue;
      }
      try {
        this.onCharTypedCb && this.onCharTypedCb(nextValue);
      } catch {}
      this.currentCharIndex += 1;
    }

    simulateUserInput(newValue) {
      const input = this.el;
      try {
        input.dataset.enhancedFocus = "1";
        input.focus();
      } catch {}
      try {
        const beforeEvt = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: newValue.charAt(newValue.length - 1) || "",
        });
        input.dispatchEvent(beforeEvt);
      } catch {}
      input.value = newValue;
      try {
        input.setSelectionRange(newValue.length, newValue.length);
      } catch {}
      try {
        const inputEvt = new InputEvent("input", {
          bubbles: true,
          cancelable: false,
          inputType: "insertText",
        });
        input.dispatchEvent(inputEvt);
      } catch {}
      try {
        input.scrollLeft = input.scrollWidth;
      } catch {}
      try {
        queueMicrotask(() => {
          try {
            delete input.dataset.enhancedFocus;
          } catch {}
        });
      } catch {}
    }

    resetForNext() {
      this.currentStringIndex =
        (this.currentStringIndex + 1) % this.strings.length;
      this.currentCharIndex = 0;
      if (!this.destroyed) {
        if (this.el instanceof HTMLInputElement) {
          this.el.value = "";
          try {
            this.el.setSelectionRange(0, 0);
          } catch {}
        } else {
          this.el.textContent = "";
        }
      }
    }

    destroy(onComplete) {
      this.destroyed = true;
      this.isTyping = false;
      if (this.typingTimeout != null) {
        window.clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
      if (onComplete) onComplete();
    }

    pause() {
      if (this.destroyed) return;
      this.paused = true;
      this.isTyping = false;
      if (this.typingTimeout != null) {
        window.clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
    }

    resume() {
      if (this.destroyed) return;
      this.paused = false;
      this.begin();
    }

    isPaused() {
      return this.paused;
    }
  }

  // ── Octagon Geometry ──────────────────────────────────────────────────
  const W = 768;
  const H = 81.5;
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
    return "M " + p.map(([x, y]) => `${x} ${y}`).join(" L ") + " Z";
  }

  // ── Brain SVG Path (same as motherbrain-chat.js logo) ────────────────
  const MB_LOGO_PATH =
    "M7.93 1.47l.73.25c.11.04.19.12.23.23l.39 1.07a1.06 1.06 0 1 1-.01 2.12c-.59 0-1.06-.47-1.06-1.06 0-.32.15-.6.37-.79l-.33-.91-1.13-.39c-1.58.07-2.89 1.14-3.31 2.6l1.6.45a1.05 1.05 0 0 1 .92-.56c.59 0 1.06.47 1.06 1.06 0 .05-.02.09-.03.13l1.04.83h.58l2.04-1.49c.06-.05.14-.07.22-.07h2.01v-4A3.6 3.6 0 0 0 10.83 0c-1.19 0-2.24.58-2.9 1.47zM1.96 9.91s.1-.03.15-.03h1.83c.15-.4.53-.69.98-.69.06 0 .1.02.1.02l.77-2.77a1.03 1.03 0 0 1-.48-.65l-1.67-.47C2.08 5.73.93 7.13.93 8.82c0 .5.11.97.29 1.4l.73-.32zm7.36-2.73c-.06.05-.14.07-.22.07h-.83c-.08 0-.17-.03-.23-.08L7 6.34c-.13.11-.28.18-.45.21l-.83 2.99c.17.19.28.43.28.7 0 .17-.05.33-.12.47l1.36 1.01c.05.04.09.09.12.15l.74 1.68c.14-.05.29-.09.46-.09.57 0 1.05.37 1.24.88h2.4a.41.41 0 0 1 .29.13l.79.92v-4.88l-1.4-1.45-1.99.34c-.03.71-.61 1.27-1.32 1.27a1.35 1.35 0 0 1-1.33-1.33c0-.73.6-1.33 1.33-1.33.49 0 .9.27 1.13.67l2.25-.38c.13-.02.25.02.33.11l1 1.03V5.7h-1.89L9.35 7.19zM3.4 19.16l2.6.75c.07-.08.16-.15.25-.21l-1.89-4.06c-.12.04-.24.07-.37.07-.47 0-.87-.26-1.11-.63l-1.25.39L.37 17.2c-.06.26-.1.53-.1.81a3.64 3.64 0 0 0 1.71 3.08l.99-1.75c.08-.15.26-.22.43-.18zm6.41-4.07c-.14.59-.64 1.04-1.27 1.04a1.33 1.33 0 0 1-1.33-1.33c0-.29.11-.54.27-.76l-.78-1.76-1.4-1.04c-.12.04-.24.07-.37.07-.45 0-.83-.29-.98-.69H2.19l-1.34.59c-.53.63-.85 1.43-.85 2.31 0 .76.25 1.45.65 2.03l.45-.62a.38.38 0 0 1 .19-.14l1.37-.43c0-.73.6-1.32 1.33-1.32s1.33.6 1.33 1.33c0 .33-.13.62-.33.85l2.02 4.34c.48.1.85.51.85 1.02 0 .59-.47 1.06-1.06 1.06s-1.03-.46-1.05-1.03l-2.27-.65-.98 1.73c.27 1.53 1.48 2.73 3.03 2.95v-.97a.37.37 0 0 1 .14-.29L7.37 22c.07-.05.15-.08.24-.08H9.5a1.31 1.31 0 0 1 1.26-.96c.7 0 1.25.54 1.31 1.22l1.19.24v-1.89l-1.24-1.14h-1.76c-.15.4-.53.69-.98.69-.59 0-1.06-.47-1.06-1.06s.47-1.06 1.06-1.06c.45 0 .83.29.98.69h1.91c.09 0 .18.04.25.1l.84.77v-2.96l-1.24-1.45H9.83zm.94 8.53c-.6 0-1.09-.41-1.26-.96H7.73l-1.46 1.19v.83c.44 1.51 1.82 2.62 3.47 2.62s3.08-1.15 3.5-2.7v-1.43l-1.34-.27c-.22.42-.65.72-1.16.72zm10.98-10.73c-.45 0-.83.29-.98.69h-2.48c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.48c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06zm5.98.63c0-1.18-.57-2.21-1.44-2.88.31-.54.51-1.16.51-1.82 0-1.69-1.17-3.11-2.73-3.51-.15-1.87-1.7-3.35-3.6-3.35-.11 0-.22.02-.33.03-.6-1.18-1.81-2-3.23-2a3.6 3.6 0 0 0-2.42.94v23.66c.41 1.55 1.81 2.7 3.5 2.7s3.04-1.12 3.48-2.63c.08 0 .15.02.23.02 1.91 0 3.46-1.48 3.61-3.36 1.28-.56 2.17-1.84 2.17-3.32 0-.78-.25-1.49-.67-2.09.57-.64.93-1.48.93-2.4zM15.46 3.03H17l1.06 1-.61 1.04c-.06 0-.11-.03-.17-.03-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06 1.06-.47 1.06-1.06c0-.25-.1-.47-.24-.65l.91-1.55-1.71-1.62h-1.84v-.84a2.6 2.6 0 0 1 1.42-.43c.99 0 1.88.56 2.34 1.46l.31.61.68-.06c.05 0 .11-.01.16-.02h.08c.17 0 .34.02.51.05l-.49.99v.86c-.4.15-.69.53-.69.98 0 .59.47 1.06 1.06 1.06s1.06-.47 1.06-1.06c0-.45-.29-.83-.69-.98v-.77l.44-.83c.78.4 1.33 1.18 1.4 2.12l.06.71-1.06 1.89h-.86c-.14-.42-.53-.72-.99-.72s-.85.3-.99.72h-1.46l-.62.62h-1.67V3.03zm10.57 12.23l-.49.55h-.8c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69H26c.29.43.45.93.45 1.45 0 1.04-.62 1.98-1.57 2.41l-.54.24-1.08-1.51h-1.43c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h1.04l1.33 1.85c-.31 1.12-1.33 1.94-2.52 1.94h0c-.06 0-.11-.01-.17-.02l-.57-.04-.03-.06v-.31c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.4l.33.68v.04c-.33 1.12-1.37 1.91-2.53 1.91-1.04 0-1.96-.62-2.38-1.55h1.38l1.28-1.25v-.51c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.19l-.84.81h-1.19v-4.11h1.2c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-1.2v-1.82h3.54c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-3.54V9.33h1.98l.62-.62h1.17c.16.38.54.65.98.65s.82-.27.98-.65h1.31l1.36-2.43a2.62 2.62 0 0 1 1.93 2.52c0 .45-.12.9-.37 1.32l-.43.73h-.77c-.15-.4-.53-.69-.98-.69s-.83.29-.98.69h-2.54c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.54c.15.4.53.69.98.69s.83-.29.98-.69h1.65c.53.5.85 1.17.85 1.9 0 .81-.37 1.39-.68 1.74z";

  // ── <ne-hero-search> Custom Element ─────────────────────────────────
  class NeHeroSearch extends HTMLElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      this._shadow = shadow;
      this._autoTyping = false;
      this._lastQuery = "";
      this._customSuggestions = null;

      /* host baseline */
      const style = document.createElement("style");
      style.textContent = `:host {
        display:block;
        position:relative;
        width:100%;
        outline:none
      }`;
      shadow.appendChild(style);

      /* SVG visual */
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "75");
      svg.setAttribute("viewBox", "0 0 768 81.5");
      svg.setAttribute("overflow", "visible");
      this._svg = svg;

      const defs = document.createElementNS(ns, "defs");
      const clip = document.createElementNS(ns, "clipPath");
      clip.setAttribute("id", "text-clip");
      const clipPathShape = document.createElementNS(ns, "path");
      clip.appendChild(clipPathShape);
      const grad = document.createElementNS(ns, "linearGradient");
      grad.setAttribute("id", "theme-fill");
      grad.setAttribute("x1", "0%");
      grad.setAttribute("y1", "100%");
      grad.setAttribute("x2", "0%");
      grad.setAttribute("y2", "0%");
      const g1 = document.createElementNS(ns, "stop");
      g1.setAttribute("id", "gs1");
      g1.setAttribute("offset", "0%");
      const g2 = document.createElementNS(ns, "stop");
      g2.setAttribute("id", "gs2");
      g2.setAttribute("offset", "100%");
      grad.appendChild(g1);
      grad.appendChild(g2);
      defs.appendChild(clip);
      defs.appendChild(grad);
      svg.appendChild(defs);
      this._defs = defs;

      // Octagon background path
      const bg = document.createElementNS(ns, "path");
      bg.setAttribute("fill", "url(#theme-fill)");
      bg.setAttribute("d", octagonPath(W, H, 22));
      bg.setAttribute("stroke", "hsl(25 95% 53%)");
      bg.setAttribute("stroke-width", "4");
      bg.setAttribute("stroke-linejoin", "round");
      svg.appendChild(bg);
      this._bg = bg;

      // Apply default border style
      this._applyBorderStyle("AMBER_BORDER");

      // Brain icon (click to reset)
      const brain = document.createElementNS(ns, "svg");
      brain.setAttribute("width", "45");
      brain.setAttribute("height", "45");
      brain.setAttribute("viewBox", "0 0 50 50");
      brain.setAttribute("overflow", "visible");
      brain.setAttribute("fill", "hsl(25 95% 5%)");

      const oct = document.createElementNS(ns, "path");
      oct.setAttribute("d", octagonPath(60, 60, 18));
      oct.setAttribute("fill", "url(#hs-amberGlow)");
      oct.setAttribute("stroke", "hsl(25 95% 53% / 0)");
      oct.setAttribute("stroke-width", "0");

      const brainGroup = document.createElementNS(ns, "g");
      brainGroup.innerHTML = `<path d="${MB_LOGO_PATH}"/>`;
      brainGroup.setAttribute("transform", "translate(5 5) scale(1.8)");

      brain.appendChild(oct);
      brain.appendChild(brainGroup);
      brain.setAttribute("x", "700");
      brain.setAttribute("y", "10");
      brain.style.cursor = "pointer";
      this._brain = brain;
      svg.appendChild(brain);

      shadow.appendChild(svg);

      // foreignObject native input for editing
      const foreignObj = document.createElementNS(ns, "foreignObject");
      foreignObj.setAttribute("x", "0");
      foreignObj.setAttribute("y", "0");
      foreignObj.setAttribute("width", "100%");
      foreignObj.setAttribute("height", "75");
      this._foreignObj = foreignObj;

      const editor = document.createElement("input");
      editor.setAttribute("class", "hero-editor");
      editor.setAttribute("type", "text");
      editor.setAttribute("spellcheck", "false");
      editor.setAttribute("autocomplete", "off");
      editor.style.cssText =
        'width:100%;height:100%;font:42px "Departure Mono", monospace;background:transparent;border:none;margin:0;padding:0;color:white;outline:none;text-indent:30px;';
      this._editor = editor;

      foreignObj.appendChild(editor);
      svg.appendChild(foreignObj);

      // Apply theme colors
      const stop1 = defs.querySelector("#gs1");
      const stop2 = defs.querySelector("#gs2");
      const applyTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        const bgRaw = styles.getPropertyValue("--background").trim();
        const fgRaw = styles.getPropertyValue("--foreground").trim();
        const color = bgRaw ? `hsl(${bgRaw})` : "#000";
        const op1 =
          styles.getPropertyValue("--hero-search-stop1-opacity").trim() ||
          "0.2";
        const op2 =
          styles.getPropertyValue("--hero-search-stop2-opacity").trim() ||
          "0.4";
        stop1.setAttribute("stop-color", color);
        stop2.setAttribute("stop-color", color);
        stop1.setAttribute("stop-opacity", op1);
        stop2.setAttribute("stop-opacity", op2);
        if (fgRaw) editor.style.color = `hsl(${fgRaw})`;
      };
      applyTheme();

      const mo = new MutationObserver(applyTheme);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class", "style"],
      });
      this._themeObserver = mo;
    }

    connectedCallback() {
      const editor = this._editor;

      // Gemini-style event handlers
      editor.addEventListener("beforeinput", (e) => {
        if (this._autoTyping) e.stopPropagation();
      });
      editor.addEventListener("focusin", () => {});
      editor.addEventListener("focusout", () => {});

      // ESC key stops enhanced typing so user can edit
      editor.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this._stopSuggestions();
        }
      });

      // ★ ENTER key → dispatch hero-search-submit event
      editor.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const query = editor.value?.trim();
          if (query) {
            e.preventDefault();
            e.stopPropagation();
            this.dispatchEvent(
              new CustomEvent("hero-search-submit", {
                bubbles: true,
                composed: true,
                detail: { query },
              }),
            );
          }
        }
      });

      // When the user interacts with the editor, stop AI typing
      const onEditorTap = (e) => {
        if (this._autoTyping) {
          e.stopPropagation();
          this._stopSuggestions();
        }
      };
      editor.addEventListener("pointerdown", onEditorTap, { capture: true });
      editor.addEventListener("click", onEditorTap, { capture: true });
      editor.addEventListener("touchstart", onEditorTap, {
        capture: true,
        passive: true,
      });

      // Focus sets caret to end
      editor.addEventListener("focus", () => {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      });

      // Brain icon click → submit current query (same as Enter / old "Ask Mother" button)
      this._brain.addEventListener("click", (e) => {
        e.stopPropagation();
        const query = (this._lastQuery || editor.value || "").trim();
        if (query) {
          this._stopSuggestions();
          this.dispatchEvent(
            new CustomEvent("hero-search-submit", {
              bubbles: true,
              composed: true,
              detail: { query },
            }),
          );
        }
      });

      // Initial geometry
      this._updateGeometry(this.getBoundingClientRect().width);
      this._startSuggestions();

      // ResizeObserver
      this._resizeObserver = new ResizeObserver(
        ([
          {
            contentRect: { width },
          },
        ]) => {
          this._updateGeometry(width);
        },
      );
      this._resizeObserver.observe(this);

      // Click on host but miss input → stop suggestions
      this.addEventListener("pointerdown", (e) => {
        if (e.target === this && this._autoTyping) {
          this._stopSuggestions();
        }
      });

      // iOS touch support
      this.addEventListener("touchend", () => {
        setTimeout(() => {
          if (document.activeElement !== editor && !this._autoTyping) {
            editor.focus({ preventScroll: true });
          }
        }, 0);
      });
      this.addEventListener("touchstart", (e) => {
        if (!this._autoTyping) {
          editor.focus({ preventScroll: true });
          e.stopPropagation();
        }
      });

      // foreignObject pointer → stop suggestions
      this._foreignObj.addEventListener(
        "pointerdown",
        this._stopSuggestions.bind(this),
      );
    }

    _startSuggestions() {
      const editor = this._editor;
      editor.tabIndex = -1;
      editor.style.pointerEvents = "auto";
      editor.blur();
      this._originalEditorFocus = editor.focus;
      editor.focus = () => {};
      editor.value = "";
      this._lastQuery = "";
      this._enhanced?.destroy();
      this._autoTyping = true;
      const suggestions = this._customSuggestions || DEFAULT_SUGGESTIONS;
      this._enhanced = new EnhancedTyped(editor, {
        strings: suggestions,
        loop: true,
        onCharTyped: (v) => {
          editor.value = v;
          this._lastQuery = v;
        },
      });
    }

    _stopSuggestions() {
      if (this._autoTyping) {
        this._enhanced?.destroy();
        this._autoTyping = false;
        this._editor.value = "";
        if (this._originalEditorFocus) {
          this._editor.focus = this._originalEditorFocus;
        }
        this._editor.tabIndex = 0;
        this._editor.style.pointerEvents = "auto";
        requestAnimationFrame(() => {
          this._editor.focus();
        });
      }
    }

    _setClip(width) {
      const clip = this._svg.querySelector("#text-clip path");
      const bg = this._svg.querySelector("path");
      if (!clip || !bg) return;
      const HEIGHT = 75;
      const OUTER_C = 22;
      const d = octagonPath(width, HEIGHT, OUTER_C);
      this._svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
      bg.setAttribute("d", d);
      clip.removeAttribute("transform");
      clip.setAttribute("d", d);
    }

    _updateGeometry(width) {
      const HEIGHT = 75;
      const OUTER_C = 22;
      this._setClip(width);

      const availableWidth = width - OUTER_C * 2;
      this._foreignObj.setAttribute("width", String(availableWidth));
      this._editor.style.maxWidth = availableWidth + "px";

      this._svg.querySelectorAll("path").forEach((p) => {
        if (p.closest("defs")) return;
        try {
          if (p.getBBox().width < 100) return;
        } catch {
          return;
        }
        p.setAttribute("d", octagonPath(width, HEIGHT, OUTER_C));
      });

      this._brain.setAttribute("x", String(width - 45 - 24));
      const textMax = width - 45 - 32;
      this._foreignObj.setAttribute("width", String(textMax));
      this._editor.style.maxWidth = textMax + "px";
    }

    _applyBorderStyle(styleId) {
      if (!styleId) {
        this._bg.setAttribute("stroke", "hsl(25 95% 53%)");
        this._bg.removeAttribute("filter");
        return;
      }
      const snippet = getSvgDefSnippet(styleId);
      if (snippet) {
        if (!this._defs.querySelector(`[data-style-id="${styleId}"]`)) {
          const wrap = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          wrap.innerHTML = snippet;
          Array.from(wrap.children).forEach((n) => {
            n.setAttribute("data-style-id", styleId);
            this._defs.appendChild(n);
          });
        }
        const map = {
          AMBER_BORDER: {
            stroke: "url(#hs-amberGlow)",
            filter: "url(#hs-amberGlowFilter)",
          },
          FIRE_BORDER: { stroke: "url(#hs-fireGradient1)" },
        };
        const cfg = map[styleId];
        if (cfg) {
          this._bg.setAttribute("stroke", cfg.stroke);
          if (cfg.filter) this._bg.setAttribute("filter", cfg.filter);
          else this._bg.removeAttribute("filter");
        }
      }
    }

    disconnectedCallback() {
      this._enhanced?.destroy();
      this._resizeObserver?.disconnect();
      this._themeObserver?.disconnect();
    }

    // ── Public API ─────────────────────────────────────────────────────
    /** Get the current search query text */
    getQuery() {
      return this._editor?.value?.trim() || "";
    }

    /** Set custom typewriter suggestions */
    setSuggestions(suggestions) {
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        this._customSuggestions = suggestions;
      }
    }

    /** Focus the search input (stops suggestions) */
    focus() {
      this._stopSuggestions();
    }
  }

  // Register the custom element
  if (!customElements.get("ne-hero-search")) {
    customElements.define("ne-hero-search", NeHeroSearch);
  }
})();
