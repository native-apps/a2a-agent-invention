// Minimal rewritten custom element
import { EnhancedTyped } from "@/utils/enhancedTyped";
import { getSvgDefSnippet } from "@/web-components/design-library";

const suggestions = [
  "Dream it → Build it → Ship it! 👾",
  "Why are native apps better?",
  "✧ Sovereign Code-Forging",
  "✧ Local-First",
  "✧ Autonomous Ops",
  "✧ Full-Stack Engineering",
];

const W = 768;
const H = 81.5;
function octagonPath(w: number, h: number, c: number) {
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

class NeHeroSearch extends HTMLElement {
  private shadow: ShadowRoot;
  private svg!: SVGSVGElement;
  // private textEl!: SVGTextElement;
  private bg!: SVGPathElement;
  private foreignObj!: SVGForeignObjectElement;
  private brain!: SVGSVGElement;
  private enhanced!: EnhancedTyped;
  private autoTyping = false;
  private editor!: HTMLInputElement;
  private resizeObserver!: ResizeObserver;
  private themeObserver!: MutationObserver;
  private defs!: SVGDefsElement;
  private backgroundPath!: SVGPathElement;
  private borderPath!: SVGPathElement;
  private originalEditorFocus?: (options?: FocusOptions) => void;
  private onEditorTap = (e: Event) => {
    if (this.autoTyping) {
      e.stopPropagation();
      this.stopSuggestions();
    }
  };

  // Gemini-style handlers for focus and event bubbling
  private handleBeforeInput(event: Event) {
    // While AI is typing, prevent the event from bubbling up to the main document
    if (this.autoTyping) {
      event.stopPropagation();
    }
  }

  private handleFocusIn() {
    // Optional: Add logic when the search input gains focus.
    // For now, we'll just log to confirm it's firing correctly within the shadow DOM.
    // console.log('HeroSearch input focused internally.');
  }

  private handleFocusOut() {
    // Optional: Add logic when the search input loses focus.
    // console.log('HeroSearch input unfocused internally.');
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    /* host baseline */
    const style = document.createElement("style");
    style.textContent = `:host {
      display:block;
      position:relative;
      width:100%;
      outline:none
    }`;
    /*
    style.textContent += `svg {
      width:100%;
      height:75px;
      preserveAspectRatio:none
    }`;
    style.textContent += `.editable-wrapper::selection {
      background:transparent;
      color:transparent
      }`;
    */
    this.shadow.appendChild(style);

    /* SVG visual */
    const ns = "http://www.w3.org/2000/svg";
    this.svg = document.createElementNS(ns, "svg");
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "75");
    this.svg.setAttribute("viewBox", "0 0 768 81.5");
    this.svg.setAttribute("overflow", "visible");

    this.defs = document.createElementNS(ns, "defs") as SVGDefsElement;
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
    this.defs.appendChild(clip);
    this.defs.appendChild(grad);
    this.svg.appendChild(this.defs);

    // Octagon background path
    this.bg = document.createElementNS(ns, "path");
    this.bg.setAttribute("fill", "url(#theme-fill)");
    this.bg.setAttribute("d", octagonPath(W, H, 22));
    this.bg.setAttribute("stroke", "hsl(25 95% 53%)");
    this.bg.setAttribute("stroke-width", "4");
    this.bg.setAttribute("stroke-linejoin", "round");
    this.svg.appendChild(this.bg);

    // Outline path injected by border style
    this.borderPath = this.bg; // default until applyBorderStyle overrides

    // Apply default border style immediately after background path exists
    this.applyBorderStyle("AMBER_BORDER");

    /*
    Text element
    this.textEl = document.createElementNS(ns, 'text');
    this.textEl.setAttribute('x', '24');
    this.textEl.setAttribute('y', '50%');
    this.textEl.setAttribute('dy', '0.35em');
    this.textEl.setAttribute('font-size', '32px');
    this.textEl.setAttribute('fill', 'white');
    this.textEl.setAttribute('clip-path', 'url(#text-clip)');
    this.textEl.setAttribute('text-anchor', 'start');
    this.svg.appendChild(this.textEl);
    */

    // Caret
    /*
    const caret = document.createElementNS(ns, 'line');
    caret.setAttribute('x1', '0');
    caret.setAttribute('x2', '0');
    caret.setAttribute('y1', '15');
    caret.setAttribute('y2', '65');
    caret.setAttribute('stroke', 'hsl(25 95% 53%)');
    caret.setAttribute('stroke-width', '8');
    const blink = document.createElementNS(ns, 'animate');
    blink.setAttribute('attributeName', 'opacity');
    blink.setAttribute('values', '1;0;1');
    blink.setAttribute('dur', '.7s');
    blink.setAttribute('repeatCount', 'indefinite');
    caret.appendChild(blink);
    this.svg.appendChild(caret);
    */

    // Brain icon (click to reset)
    this.brain = document.createElementNS(ns, "svg");
    this.brain.setAttribute("width", "45");
    this.brain.setAttribute("height", "45");
    this.brain.setAttribute("viewBox", "0 0 50 50");
    this.brain.setAttribute("overflow", "visible");
    // this.brain.setAttribute('fill', 'hsl(25 95% 53%)');
    this.brain.setAttribute("fill", "hsl(25 95% 5%)");

    // octagon hit-area behind the brain, uses same hue as search bg
    const oct = document.createElementNS(ns, "path");
    oct.setAttribute("d", octagonPath(60, 60, 18));
    oct.setAttribute("fill", "url(#amberGlow)");
    // oct.setAttribute('fill', 'hsl(25 95% 53% / 0.1)');
    // oct.setAttribute('fill', 'hsl(25 95% 53%)');
    // oct.setAttribute('stroke', 'hsl(25 95% 53%)');
    oct.setAttribute("stroke", "hsl(25 95% 53% / 0)");
    // oct.setAttribute('stroke-width', '2');
    oct.setAttribute("stroke-width", "0");
    // oct.setAttribute('stroke-linejoin', 'round');

    // inline brain SVG paths
    const brainGroup = document.createElementNS(ns, "g");
    brainGroup.innerHTML = `<path d="M7.93 1.47l.73.25c.11.04.19.12.23.23l.39 1.07a1.06 1.06 0 1 1-.01 2.12c-.59 0-1.06-.47-1.06-1.06 0-.32.15-.6.37-.79l-.33-.91-1.13-.39c-1.58.07-2.89 1.14-3.31 2.6l1.6.45a1.05 1.05 0 0 1 .92-.56c.59 0 1.06.47 1.06 1.06 0 .05-.02.09-.03.13l1.04.83h.58l2.04-1.49c.06-.05.14-.07.22-.07h2.01v-4A3.6 3.6 0 0 0 10.83 0c-1.19 0-2.24.58-2.9 1.47zM1.96 9.91s.1-.03.15-.03h1.83c.15-.4.53-.69.98-.69.06 0 .1.02.1.02l.77-2.77a1.03 1.03 0 0 1-.48-.65l-1.67-.47C2.08 5.73.93 7.13.93 8.82c0 .5.11.97.29 1.4l.73-.32zm7.36-2.73c-.06.05-.14.07-.22.07h-.83c-.08 0-.17-.03-.23-.08L7 6.34c-.13.11-.28.18-.45.21l-.83 2.99c.17.19.28.43.28.7 0 .17-.05.33-.12.47l1.36 1.01c.05.04.09.09.12.15l.74 1.68c.14-.05.29-.09.46-.09.57 0 1.05.37 1.24.88h2.4a.41.41 0 0 1 .29.13l.79.92v-4.88l-1.4-1.45-1.99.34c-.03.71-.61 1.27-1.32 1.27a1.35 1.35 0 0 1-1.33-1.33c0-.73.6-1.33 1.33-1.33.49 0 .9.27 1.13.67l2.25-.38c.13-.02.25.02.33.11l1 1.03V5.7h-1.89L9.35 7.19zM3.4 19.16l2.6.75c.07-.08.16-.15.25-.21l-1.89-4.06c-.12.04-.24.07-.37.07-.47 0-.87-.26-1.11-.63l-1.25.39L.37 17.2c-.06.26-.1.53-.1.81a3.64 3.64 0 0 0 1.71 3.08l.99-1.75c.08-.15.26-.22.43-.18zm6.41-4.07c-.14.59-.64 1.04-1.27 1.04a1.33 1.33 0 0 1-1.33-1.33c0-.29.11-.54.27-.76l-.78-1.76-1.4-1.04c-.12.04-.24.07-.37.07-.45 0-.83-.29-.98-.69H2.19l-1.34.59c-.53.63-.85 1.43-.85 2.31 0 .76.25 1.45.65 2.03l.45-.62a.38.38 0 0 1 .19-.14l1.37-.43c0-.73.6-1.32 1.33-1.32s1.33.6 1.33 1.33c0 .33-.13.62-.33.85l2.02 4.34c.48.1.85.51.85 1.02 0 .59-.47 1.06-1.06 1.06s-1.03-.46-1.05-1.03l-2.27-.65-.98 1.73c.27 1.53 1.48 2.73 3.03 2.95v-.97a.37.37 0 0 1 .14-.29L7.37 22c.07-.05.15-.08.24-.08H9.5a1.31 1.31 0 0 1 1.26-.96c.7 0 1.25.54 1.31 1.22l1.19.24v-1.89l-1.24-1.14h-1.76c-.15.4-.53.69-.98.69-.59 0-1.06-.47-1.06-1.06s.47-1.06 1.06-1.06c.45 0 .83.29.98.69h1.91c.09 0 .18.04.25.1l.84.77v-2.96l-1.24-1.45H9.83zm.94 8.53c-.6 0-1.09-.41-1.26-.96H7.73l-1.46 1.19v.83c.44 1.51 1.82 2.62 3.47 2.62s3.08-1.15 3.5-2.7v-1.43l-1.34-.27c-.22.42-.65.72-1.16.72zm10.98-10.73c-.45 0-.83.29-.98.69h-2.48c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.48c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06zm5.98.63c0-1.18-.57-2.21-1.44-2.88.31-.54.51-1.16.51-1.82 0-1.69-1.17-3.11-2.73-3.51-.15-1.87-1.7-3.35-3.6-3.35-.11 0-.22.02-.33.03-.6-1.18-1.81-2-3.23-2a3.6 3.6 0 0 0-2.42.94v23.66c.41 1.55 1.81 2.7 3.5 2.7s3.04-1.12 3.48-2.63c.08 0 .15.02.23.02 1.91 0 3.46-1.48 3.61-3.36 1.28-.56 2.17-1.84 2.17-3.32 0-.78-.25-1.49-.67-2.09.57-.64.93-1.48.93-2.4zM15.46 3.03H17l1.06 1-.61 1.04c-.06 0-.11-.03-.17-.03-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06 1.06-.47 1.06-1.06c0-.25-.1-.47-.24-.65l.91-1.55-1.71-1.62h-1.84v-.84a2.6 2.6 0 0 1 1.42-.43c.99 0 1.88.56 2.34 1.46l.31.61.68-.06c.05 0 .11-.01.16-.02h.08c.17 0 .34.02.51.05l-.49.99v.86c-.4.15-.69.53-.69.98 0 .59.47 1.06 1.06 1.06s1.06-.47 1.06-1.06c0-.45-.29-.83-.69-.98v-.77l.44-.83c.78.4 1.33 1.18 1.4 2.12l.06.71-1.06 1.89h-.86c-.14-.42-.53-.72-.99-.72s-.85.3-.99.72h-1.46l-.62.62h-1.67V3.03zm10.57 12.23l-.49.55h-.8c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69H26c.29.43.45.93.45 1.45 0 1.04-.62 1.98-1.57 2.41l-.54.24-1.08-1.51h-1.43c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h1.04l1.33 1.85c-.31 1.12-1.33 1.94-2.52 1.94h0c-.06 0-.11-.01-.17-.02l-.57-.04-.03-.06v-.31c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.4l.33.68v.04c-.33 1.12-1.37 1.91-2.53 1.91-1.04 0-1.96-.62-2.38-1.55h1.38l1.28-1.25v-.51c.4-.15.69-.53.69-.98 0-.59-.47-1.06-1.06-1.06s-1.06.47-1.06 1.06c0 .45.29.83.69.98v.19l-.84.81h-1.19v-4.11h1.2c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-1.2v-1.82h3.54c.15.4.53.69.98.69.59 0 1.06-.47 1.06-1.06s-.47-1.06-1.06-1.06c-.45 0-.83.29-.98.69h-3.54V9.33h1.98l.62-.62h1.17c.16.38.54.65.98.65s.82-.27.98-.65h1.31l1.36-2.43a2.62 2.62 0 0 1 1.93 2.52c0 .45-.12.9-.37 1.32l-.43.73h-.77c-.15-.4-.53-.69-.98-.69s-.83.29-.98.69h-2.54c-.15-.4-.53-.69-.98-.69-.59 0-1.06.47-1.06 1.06s.47 1.06 1.06 1.06c.45 0 .83-.29.98-.69h2.54c.15.4.53.69.98.69s.83-.29.98-.69h1.65c.53.5.85 1.17.85 1.9 0 .81-.37 1.39-.68 1.74z"/>`;

    brainGroup.setAttribute("transform", "translate(5 5) scale(1.8)");

    this.brain.appendChild(oct);
    this.brain.appendChild(brainGroup);
    this.brain.setAttribute("x", "700");
    this.brain.setAttribute("y", "10");
    this.brain.style.cursor = "pointer";
    this.svg.appendChild(this.brain);

    this.shadow.appendChild(this.svg);

    /* foreignObject native input for editing */
    this.foreignObj = document.createElementNS(ns, "foreignObject");
    this.foreignObj.setAttribute("x", "0");
    this.foreignObj.setAttribute("y", "0");
    this.foreignObj.setAttribute("width", "100%");
    this.foreignObj.setAttribute("height", "75");

    this.editor = document.createElement("input");
    this.editor.setAttribute("class", "hero-editor");
    this.editor.setAttribute("type", "text");
    this.editor.setAttribute("spellcheck", "false");
    this.editor.setAttribute("autocomplete", "off");
    this.editor.style.cssText =
      'width:100%;height:100%;font:42px "Departure Mono", monospace;background:transparent;border:none;margin:0;padding:0;color:white;outline:none;text-indent:30px;';

    this.foreignObj.appendChild(this.editor);
    this.svg.appendChild(this.foreignObj);

    // Add click listener to foreignObject for direct input interaction
    this.foreignObj.addEventListener(
      "pointerdown",
      this.stopSuggestions.bind(this),
    );

    // Update width on input (no caret)
    this.editor.addEventListener("input", () => {
      // nothing extra for now
    });

    // initial geometry will be set in connectedCallback after width is known

    // Apply theme background color to gradient stops
    const stop1 = this.defs.querySelector("#gs1") as SVGStopElement;
    const stop2 = this.defs.querySelector("#gs2") as SVGStopElement;
    const applyTheme = () => {
      const styles = getComputedStyle(document.documentElement);
      const bgRaw = styles.getPropertyValue("--background").trim();
      const fgRaw = styles.getPropertyValue("--foreground").trim();
      const color = bgRaw ? `hsl(${bgRaw})` : "#000";
      const op1 =
        styles.getPropertyValue("--hero-search-stop1-opacity").trim() || "0.2";
      const op2 =
        styles.getPropertyValue("--hero-search-stop2-opacity").trim() || "0.4";
      stop1.setAttribute("stop-color", color);
      stop2.setAttribute("stop-color", color);
      stop1.setAttribute("stop-opacity", op1);
      stop2.setAttribute("stop-opacity", op2);
      // update input text color to foreground
      if (fgRaw) {
        this.editor.style.color = `hsl(${fgRaw})`;
      }
    };
    applyTheme();
    // Watch for theme mode attribute change
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    this.themeObserver = mo as any;
  }

  connectedCallback() {
    // Add Gemini-style event listeners to the editor input
    this.editor.addEventListener(
      "beforeinput",
      this.handleBeforeInput.bind(this),
    );
    this.editor.addEventListener("focusin", this.handleFocusIn.bind(this));
    this.editor.addEventListener("focusout", this.handleFocusOut.bind(this));

    // ESC key triggers brain reset
    this.editor.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.brain.dispatchEvent(new PointerEvent("click"));
      }
    });

    // When the user interacts with the editor, stop the AI so they can take over.
    this.editor.addEventListener("pointerdown", this.onEditorTap, {
      capture: true,
    });
    this.editor.addEventListener("click", this.onEditorTap, { capture: true });
    this.editor.addEventListener("touchstart", this.onEditorTap, {
      capture: true,
      passive: true,
    });

    // focus sets caret to end
    this.editor.addEventListener("focus", () => {
      const r = document.createRange();
      r.selectNodeContents(this.editor);
      r.collapse(false);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    });

    // REMOVED: The blur event listener that was causing focus hijacking.
    // The new logic makes this unnecessary.

    // click resets suggestion typing
    this.brain.addEventListener("click", (e) => {
      e.stopPropagation();
      // Blur any active editing so on-screen keyboard hides
      this.editor.blur();
      this.startSuggestions();
      // Ensure caret visible at start until first char types
      // this.updateCaret(); // removed caret logic
    });

    // initial geometry based on current width
    this.updateGeometry(this.getBoundingClientRect().width);

    this.startSuggestions();

    // no caret now

    // resize observer to adjust clip and wrapper width
    this.resizeObserver = new ResizeObserver(
      ([
        {
          contentRect: { width },
        },
      ]) => {
        this.updateGeometry(width);
      },
    );
    this.resizeObserver.observe(this);

    // If the user clicks on the host but misses the input, also stop suggestions.
    this.addEventListener("pointerdown", (e) => {
      if (e.target === this && this.autoTyping) {
        this.stopSuggestions();
      }
    });

    // iOS: ensure keyboard stays – refocus on touchend if it closed
    this.addEventListener("touchend", () => {
      setTimeout(() => {
        if (document.activeElement !== this.editor && !this.autoTyping) {
          this.editor.focus({ preventScroll: true });
        }
      }, 0);
    });

    // ensure focus on touchstart too (prevents quick tap blur)
    this.addEventListener("touchstart", (e) => {
      if (!this.autoTyping) {
        this.editor.focus({ preventScroll: true });
        e.stopPropagation();
      }
    });

    // (already applied in constructor)
  }

  private startSuggestions() {
    // Make the editor non-interactive and unfocusable
    this.editor.tabIndex = -1;
    // Keep pointer events ON so first tap can stop AI immediately
    this.editor.style.pointerEvents = "auto";
    this.editor.blur(); // Ensure it doesn't hold focus

    // Override focus to prevent scroll-jacking
    this.originalEditorFocus = this.editor.focus;
    this.editor.focus = () => {
      /* No-op */
    };

    this.editor.value = "";
    // no SVG text
    this.enhanced?.destroy();
    this.autoTyping = true;
    this.enhanced = new EnhancedTyped(this.editor, {
      strings: suggestions,
      loop: true,
      onCharTyped: (v) => {
        this.editor.value = v;
        // input already updated
      },
    });
  }

  private stopSuggestions() {
    if (this.autoTyping) {
      this.enhanced?.destroy();
      this.autoTyping = false;
      this.editor.value = "";

      // Restore native focus behavior
      if (this.originalEditorFocus) {
        this.editor.focus = this.originalEditorFocus;
      }

      // Make the editor interactive and focusable again
      this.editor.tabIndex = 0;
      this.editor.style.pointerEvents = "auto";

      // Use requestAnimationFrame to ensure focus happens after the click event flow
      requestAnimationFrame(() => {
        this.editor.focus(); // Give focus to the user
      });
    }
  }

  /*
  private updateCaret() {
    const bbox = this.textEl.getBBox();
    const x = bbox.x + bbox.width + 4;
    const caret = this.svg.querySelector('line') as SVGLineElement;
    caret.setAttribute('x1', x.toString());
    caret.setAttribute('x2', x.toString());

    // overflow: keep caret visible inside clip area (24 padding, 52 brain icon)
    const viewW = 768;
    const rightLimit = viewW - 84;
    if (x > rightLimit) {
      this.textEl.setAttribute('text-anchor', 'end');
      this.textEl.setAttribute('x', rightLimit.toString());
    } else {
      this.textEl.setAttribute('text-anchor', 'start');
      this.textEl.setAttribute('x', '24');
    }
  }
  */

  // Adjust the clipPath horizontally to match current component width
  private setClip(width: number) {
    const clip = this.svg.querySelector(
      "#text-clip path",
    ) as SVGPathElement | null;
    const bg = this.svg.querySelector("path") as SVGPathElement | null;
    if (!clip || !bg) return;

    const HEIGHT = 75;
    const OUTER_C = 22;

    // viewBox and both paths share EXACT same geometry
    const d = octagonPath(width, HEIGHT, OUTER_C);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
    bg.setAttribute("d", d);
    clip.removeAttribute("transform");
    clip.setAttribute("d", d);
  }

  private updateGeometry(width: number) {
    const HEIGHT = 75;
    const OUTER_C = 22;
    const INNER_C = 20;
    const PADDING = 24;
    const ICON_SPACE = 84;

    // Sync both background and clip paths to exact same geometry
    this.setClip(width);

    // Ensure the foreignObject/input match available width so the caret and clipping stay inside
    const availableWidth = width - OUTER_C * 2;
    this.foreignObj.setAttribute("width", String(availableWidth));
    this.editor.style.maxWidth = availableWidth + "px";

    // Update all non-defs <path> elements that form the octagon (outline + fill)
    this.svg.querySelectorAll("path").forEach((p) => {
      // Skip paths inside <defs> (clipPath) since we already updated it, and skip the brain icon hit area (<path> width < 100)
      if (p.closest("defs")) return;
      if (p.getBBox().width < 100) return;
      p.setAttribute("d", octagonPath(width, HEIGHT, OUTER_C));
    });

    // --- Brain icon positioning ---
    this.brain.setAttribute("x", String(width - 45 - 24));

    // --- Constrain text/foreignObject width so it doesn't overlap icon ---
    const textMax = width - 45 - 32;
    this.foreignObj.setAttribute("width", String(textMax));
    this.editor.style.maxWidth = textMax + "px";

    // removed caret logic
  }

  private applyBorderStyle(styleId: string | null) {
    if (!styleId) {
      this.bg.setAttribute("stroke", "hsl(25 95% 53%)");
      this.bg.removeAttribute("filter");
      return;
    }

    const snippet = getSvgDefSnippet(styleId);
    if (snippet) {
      // inject once
      if (!this.defs.querySelector(`[data-style-id="${styleId}"]`)) {
        const wrap = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        wrap.innerHTML = snippet;
        Array.from(wrap.children).forEach((n) => {
          (n as Element).setAttribute("data-style-id", styleId);
          this.defs.appendChild(n);
        });
      }
      // Map known ids to gradient/filter ids
      const map: Record<string, { stroke: string; filter?: string }> = {
        AMBER_BORDER: {
          stroke: "url(#amberGlow)",
          filter: "url(#amberGlowFilter)",
        },
        FIRE_BORDER: { stroke: "url(#fireGradient1)" },
      };
      const cfg = map[styleId];
      if (cfg) {
        this.bg.setAttribute("stroke", cfg.stroke);
        if (cfg.filter) this.bg.setAttribute("filter", cfg.filter);
        else this.bg.removeAttribute("filter");
      }
    }
  }

  disconnectedCallback() {
    // Clean up the Gemini-style listeners
    this.editor.removeEventListener(
      "beforeinput",
      this.handleBeforeInput.bind(this),
    );
    this.editor.removeEventListener("focusin", this.handleFocusIn.bind(this));
    this.editor.removeEventListener("focusout", this.handleFocusOut.bind(this));
    this.editor.removeEventListener("pointerdown", this.onEditorTap, {
      capture: true,
    } as any);
    this.editor.removeEventListener("click", this.onEditorTap, {
      capture: true,
    } as any);
    this.editor.removeEventListener("touchstart", this.onEditorTap, {
      capture: true,
    } as any);

    this.enhanced?.destroy();
    this.resizeObserver.disconnect();
    (this.themeObserver as MutationObserver)?.disconnect();
  }
}

customElements.define("ne-hero-search", NeHeroSearch);
