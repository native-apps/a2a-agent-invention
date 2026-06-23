// ── Hero Search Web Component ──────────────────────────────────────────
// Extracted from settings/A2aChatPreview.tsx — exact same code.
// Self-contained vanilla TS web component with Shadow DOM + ResizeObserver.
// No React dependency. Registers <ne-hero-search> custom element.

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

export class NeHeroSearchElement extends HTMLElement {
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
  private _completedQuery = "";
  private _hoverPaused = false;

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
    // Invisible click wrapper — brain path has hollow areas; rect makes full icon clickable
    const clickRect = document.createElementNS(ns, "rect");
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

    // Also re-apply when the user's device theme changes (prefers-color-scheme).
    // This covers websites that don't set --background/--foreground CSS vars.
    if (typeof window !== "undefined") {
      const mql = window.matchMedia("(prefers-color-scheme: light)");
      mql.addEventListener("change", () => this._applyTheme());
    }
  }

  private _applyTheme() {
    const styles = getComputedStyle(document.documentElement);
    const bgRaw = styles.getPropertyValue("--background").trim();
    const fgRaw = styles.getPropertyValue("--foreground").trim();

    // If the host website provides --background/--foreground CSS variables,
    // use them (e.g. motherbrain.app, shadcn/ui, Tailwind themes).
    // Otherwise, fall back to prefers-color-scheme so the widget works on
    // any website that follows the user's device theme.
    let color: string;
    let fgColor: string | null = null;
    if (bgRaw) {
      color = `hsl(${bgRaw})`;
      if (fgRaw) fgColor = `hsl(${fgRaw})`;
    } else {
      const prefersLight =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
      color = prefersLight ? "#f9fafb" : "#0b0b0b";
      fgColor = prefersLight ? "#111827" : "#ffffff";
    }

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
    if (fgColor) this._editor.style.color = fgColor;
  }

  /** Set custom typewriter suggestions */
  setSuggestions(suggestions: string[]) {
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      this._customSuggestions = suggestions;
      if (this._autoTyping) this._restartTypewriter();
    }
  }

  private _getSuggestions(): string[] {
    // No built-in fallbacks — returns [] until AI suggestions are provided
    // via setSuggestions(). The host shows a "Thinking…" indicator while empty.
    return this._customSuggestions || [];
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

    // Suppress beforeinput during auto-typing so AI typing doesn't
    // bubble up to the host document as user input
    this._editor.addEventListener("beforeinput", (e) => {
      if (this._autoTyping) {
        e.stopPropagation();
      }
    });

    // Brain icon click → submit current query (replaces old "Ask Mother" button)
    this._brain.addEventListener("click", (e) => {
      e.stopPropagation();
      // If autoTyping: use _completedQuery (last fully-typed suggestion)
      // If user typed their own: use editor.value
      const query = this._autoTyping
        ? (this._completedQuery || "").trim()
        : (this._editor.value || "").trim();
      if (query) {
        this._stopTypewriter();
        this.dispatchEvent(
          new CustomEvent("hero-search-submit", {
            bubbles: true,
            composed: true,
            detail: { query },
          }),
        );
      }
    });

    // Click anywhere in component → stop typewriter
    this._editor.addEventListener("pointerdown", () => {
      if (this._autoTyping) this._stopTypewriter();
    });

    // Hover-pause: let current line finish typing, then pause before
    // the next suggestion starts (so user can read/click it)
    this.addEventListener("mouseenter", () => {
      if (this._autoTyping && !this._hoverPaused) {
        this._hoverPaused = true;
        const current = this._getSuggestions()[this._suggestionIdx] || "";
        // Only clear timer if current line is already fully typed
        // (i.e. we're in the 4500ms transition delay between suggestions)
        // If mid-typing, leave the timer running so the line finishes
        if (this._editor.value === current && this._typewriterTimer) {
          clearTimeout(this._typewriterTimer);
          this._typewriterTimer = null;
        }
      }
    });
    this.addEventListener("mouseleave", () => {
      if (this._autoTyping && this._hoverPaused) {
        this._hoverPaused = false;
        const current = this._getSuggestions()[this._suggestionIdx] || "";
        if (this._editor.value === current) {
          // Line fully typed — start the transition delay to next suggestion
          const sugg = this._getSuggestions();
          this._typewriterTimer = setTimeout(() => {
            this._suggestionIdx = (this._suggestionIdx + 1) % sugg.length;
            this._editor.value = "";
            this._typewriterTimer = setTimeout(() => this._typeNext(0), 200);
          }, 4500);
        }
        // If mid-typing, the existing timer is still running and will
        // complete the line, then _typeNext's else branch handles
        // the transition (hoverPaused is false now)
      }
    });

    // Mobile touch support (iOS keyboard management)
    // Refocus on touchend if keyboard got dismissed by a quick tap
    this.addEventListener("touchend", () => {
      setTimeout(() => {
        if (document.activeElement !== this._editor && !this._autoTyping) {
          this._editor.focus({ preventScroll: true });
        }
      }, 0);
    });
    // Prevent quick-tap blur on touchstart
    this.addEventListener("touchstart", (e) => {
      if (!this._autoTyping) {
        this._editor.focus({ preventScroll: true });
        e.stopPropagation();
      }
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
    this._brain.setAttribute("y", "11");

    // Constrain text width so it doesn't overlap icon
    const textMax = width - 45 - 32;
    this._foreignObj.setAttribute("width", String(textMax));
    this._editor.style.maxWidth = textMax + "px";
  }

  private _startTypewriter() {
    this._autoTyping = true;
    this._editor.tabIndex = -1;
    this._editor.value = "";
    this._completedQuery = "";
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
    // Idle until suggestions arrive (host shows "Thinking…" meanwhile).
    if (suggestions.length === 0) return;
    const current = suggestions[this._suggestionIdx] || suggestions[0];
    if (charIdx <= current.length) {
      const nextValue = current.slice(0, charIdx);
      this._editor.value = nextValue;
      // SHARP: update _completedQuery the exact moment the last char is typed
      if (charIdx === current.length) {
        this._completedQuery = nextValue;
      }
      // Scroll trick: move caret to end + force scrollLeft so the input
      // auto-scrolls horizontally as the AI types (same behaviour as the
      // EnhancedTyped class in the hero-search-bundle).
      try {
        this._editor.setSelectionRange(nextValue.length, nextValue.length);
        this._editor.scrollLeft = this._editor.scrollWidth;
      } catch {
        // setSelectionRange can throw on some input types (e.g. type=email);
        // the typewriter continues regardless — this is non-fatal.
      }
      this._typewriterTimer = setTimeout(() => this._typeNext(charIdx + 1), 50);
    } else {
      // Current line fully typed — check hover-pause before transitioning
      if (this._hoverPaused) return; // Stay paused until mouseleave
      this._typewriterTimer = setTimeout(() => {
        this._suggestionIdx = (this._suggestionIdx + 1) % suggestions.length;
        this._editor.value = "";
        this._typewriterTimer = setTimeout(() => this._typeNext(0), 200);
      }, 4500);
    }
  }

  disconnectedCallback() {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
    this._resizeObserver?.disconnect();
    this._themeObserver?.disconnect();
  }
}

/** Registers <ne-hero-search> custom element (idempotent). */
export function registerHeroSearch(): void {
  if (typeof window === "undefined") return;
  if (customElements.get("ne-hero-search")) return;
  customElements.define("ne-hero-search", NeHeroSearchElement);
}
