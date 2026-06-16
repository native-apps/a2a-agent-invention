// Pure-SVG Web Component: <na-button>
// Identifier-only model: consumes a single `design-id` and resolves a spec

import { getButtonSpec, type ButtonSpec } from "./design-library";

export class NeButton extends HTMLElement {
  static formAssociated = true;

  private internals: ElementInternals;
  private svg!: SVGSVGElement;
  private defs!: SVGDefsElement;
  private gradient!: SVGLinearGradientElement | null;
  private bgPath!: SVGPathElement;
  private textEl!: SVGTextElement;
  private leftIconSvg: SVGSVGElement | null = null;
  private rightIconSvg: SVGSVGElement | null = null;
  private leftIconSize: { w: number; h: number } = { w: 0, h: 0 };
  private rightIconSize: { w: number; h: number } = { w: 0, h: 0 };
  private fillGradId: string | null = null;
  private strokeGradId: string | null = null;
  private fillStops: SVGStopElement[] = [];
  private strokeStops: SVGStopElement[] = [];
  private iconGradId: string | null = null;
  private iconStops: SVGStopElement[] = [];

  private spec: ButtonSpec | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    this.internals =
      (this as any).attachInternals?.() ?? ({} as ElementInternals);

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    this.svg.setAttribute("width", "1");
    this.svg.setAttribute("height", "1");
    this.svg.setAttribute("viewBox", "0 0 1 1");
    // Ensure contents can render outside the initial box if needed
    this.svg.setAttribute("overflow", "visible");

    this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    this.svg.appendChild(this.defs);
    this.gradient = null;

    this.bgPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    this.svg.appendChild(this.bgPath);

    this.textEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    this.textEl.setAttribute("dominant-baseline", "middle");
    this.textEl.setAttribute("text-anchor", "middle");
    this.svg.appendChild(this.textEl);

    root.appendChild(this.svg);

    // Attributes must NOT be set in the constructor.
    // They should be set in connectedCallback.
    // this.setAttribute('role', 'button');
    // if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
  }

  connectedCallback() {
    // It's safe to set attributes here.
    this.setAttribute("role", "button");
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");

    this.resolveSpec();
    this.initializeLabelFromLightDom();

    this.addEventListener("keydown", this.onKeyDown);
    this.addEventListener("click", this.onPress);
    this.addEventListener("pointerenter", this.onPointerEnter);
    this.addEventListener("pointerleave", this.onPointerLeave);
  }

  disconnectedCallback() {
    this.removeEventListener("keydown", this.onKeyDown);
    this.removeEventListener("click", this.onPress);
    this.removeEventListener("pointerenter", this.onPointerEnter);
    this.removeEventListener("pointerleave", this.onPointerLeave);
  }

  static get observedAttributes() {
    return ["design-id"];
  }

  attributeChangedCallback(name: string) {
    if (name === "design-id") this.resolveSpec();
    this.layout();
  }

  private resolveSpec() {
    const id = this.getAttribute("design-id") || "";
    this.spec = getButtonSpec(id);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.onPress();
    }
  };

  private onPress = () => {
    this.dispatchEvent(new CustomEvent("ne-press", { bubbles: true }));
  };

  private initializeLabelFromLightDom() {
    // This logic relies on the light DOM, which is ready in connectedCallback.
    // First, clear any previous icons from the shadow DOM
    if (this.leftIconSvg) this.leftIconSvg.remove();
    if (this.rightIconSvg) this.rightIconSvg.remove();

    // Detect optional SVG icons in light DOM (first = left, second = right)
    const svgs = Array.from(this.querySelectorAll("svg")) as SVGSVGElement[];
    this.leftIconSvg = svgs[0]
      ? (svgs[0].cloneNode(true) as SVGSVGElement)
      : null;
    this.rightIconSvg = svgs[1]
      ? (svgs[1].cloneNode(true) as SVGSVGElement)
      : null;

    if (this.leftIconSvg) this.svg.appendChild(this.leftIconSvg);
    if (this.rightIconSvg) this.svg.appendChild(this.rightIconSvg);

    const textNodes = Array.from(this.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    const label = textNodes
      .map((node) => node.textContent)
      .join(" ")
      .trim();

    this.textEl.textContent = label || "";
    if (label) this.setAttribute("aria-label", label);
    this.layout();
  }

  private createOrUpdateGradients(spec: ButtonSpec | null) {
    if (!spec || !spec.gradient) {
      this.fillGradId = this.strokeGradId = null;
      this.defs.innerHTML = "";
      return;
    }
    this.defs.innerHTML = "";
    const makeGrad = (id: string) => {
      const g = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "linearGradient",
      );
      g.setAttribute("id", id);
      g.setAttribute("x1", "0%");
      g.setAttribute("y1", "0%");
      g.setAttribute("x2", "100%");
      g.setAttribute("y2", "100%");
      return g;
    };
    const fillId = `grad-fill-${Math.random().toString(36).slice(2)}`;
    const strokeId = `grad-stroke-${Math.random().toString(36).slice(2)}`;
    const fillG = makeGrad(fillId);
    const strokeG = makeGrad(strokeId);

    const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", spec.gradient.from);
    s1.setAttribute("stop-opacity", "0.33");
    const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", spec.gradient.to);
    s2.setAttribute("stop-opacity", "0.2");
    fillG.appendChild(s1);
    fillG.appendChild(s2);

    const t1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    t1.setAttribute("offset", "0%");
    t1.setAttribute("stop-color", spec.gradient.from);
    t1.setAttribute("stop-opacity", "1");
    const t2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    t2.setAttribute("offset", "100%");
    t2.setAttribute("stop-color", spec.gradient.to);
    t2.setAttribute("stop-opacity", "1");
    strokeG.appendChild(t1);
    strokeG.appendChild(t2);

    this.defs.appendChild(fillG);
    this.defs.appendChild(strokeG);
    this.fillGradId = fillId;
    this.strokeGradId = strokeId;
    this.fillStops = [s1, s2];
    this.strokeStops = [t1, t2];
  }

  private animateHover(hovered: boolean) {
    const fillTo = hovered ? 1 : 0.33;
    const strokeTo = hovered ? 0.2 : 1;
    const duration = 200;
    const easing = "ease-out";
    const apply = (stops: SVGStopElement[], to: number) => {
      stops.forEach((st) => {
        const from = Number(st.getAttribute("stop-opacity")) || 1;
        const anim = (st as any).animate?.(
          [{ stopOpacity: from }, { stopOpacity: to }],
          { duration, easing, fill: "forwards" },
        );
        if (!anim) st.setAttribute("stop-opacity", String(to));
      });
    };
    apply(this.fillStops, fillTo);
    apply(this.strokeStops, strokeTo);

    const targetWidth = hovered ? 0 : this.spec ? this.spec.thickness : 2;
    const fromWidth =
      Number(this.bgPath.getAttribute("stroke-width")) || targetWidth;
    const anim2 = (this.bgPath as any).animate?.(
      [{ strokeWidth: fromWidth }, { strokeWidth: targetWidth }],
      { duration, easing, fill: "forwards" },
    );
    if (!anim2) this.bgPath.setAttribute("stroke-width", String(targetWidth));
  }

  private onPointerEnter = () => this.animateHover(true);
  private onPointerLeave = () => this.animateHover(false);

  private ensureIconGradient(
    targetSvg: SVGSVGElement,
    gradSpec: {
      from: string;
      to: string;
      opacityFrom?: number;
      opacityTo?: number;
    },
    viewBox: number[],
  ): string {
    const id = `grad-icon-${Math.random().toString(36).slice(2)}`;
    let defs = targetSvg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      targetSvg.insertBefore(defs, targetSvg.firstChild);
    }
    const g = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "linearGradient",
    );
    g.setAttribute("id", id);
    g.setAttribute("gradientUnits", "userSpaceOnUse");

    const x2 = viewBox[2] ?? 24;
    const y2 = viewBox[3] ?? 24;
    g.setAttribute("x1", "0");
    g.setAttribute("y1", "0");
    g.setAttribute("x2", String(x2));
    g.setAttribute("y2", String(y2));

    const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", gradSpec.from);
    if (gradSpec.opacityFrom != null)
      s1.setAttribute("stop-opacity", String(gradSpec.opacityFrom));

    const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", gradSpec.to);
    if (gradSpec.opacityTo != null)
      s2.setAttribute("stop-opacity", String(gradSpec.opacityTo));

    g.appendChild(s1);
    g.appendChild(s2);
    defs.appendChild(g);
    this.iconGradId = id;
    this.iconStops = [s1, s2];
    return id;
  }

  private layout() {
    const spec = this.spec;
    if (!spec) return;

    this.textEl.setAttribute("font-family", spec.fontFamily);
    this.textEl.setAttribute("font-size", String(spec.fontSize));

    this.textEl.setAttribute("x", "0");
    this.textEl.setAttribute("y", "0");

    const label = this.textEl.textContent || "";

    let textWidth = 0;
    let textHeight = spec.fontSize;
    try {
      const bb = this.textEl.getBBox();
      textWidth = Math.max(1, bb.width);
      textHeight = Math.max(1, bb.height);
    } catch {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.font = `${spec.fontSize}px ${spec.fontFamily}`;
        textWidth = Math.max(1, ctx.measureText(label).width);
      }
    }

    // Compute icon sizes to match text height
    const targetIconH = textHeight;
    const computeIconSize = (svgEl: SVGSVGElement | null) => {
      if (!svgEl) return { w: 0, h: 0 };
      const vb = (svgEl.getAttribute("viewBox") || "0 0 24 24")
        .split(/\s+/)
        .map(Number);
      const iw = vb[2] || targetIconH;
      const ih = vb[3] || targetIconH;
      const w = (iw / ih) * targetIconH;
      const h = targetIconH;
      svgEl.setAttribute("width", String(Math.round(w)));
      svgEl.setAttribute("height", String(Math.round(h)));
      svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svgEl.setAttribute("overflow", "visible");
      // Apply icon styling from spec to all descendants (paths often set stroke explicitly)
      const desiredStrokeWidth =
        this.spec?.icon?.strokeWidth ?? this.spec?.thickness ?? 2;
      const desiredFill = this.spec?.icon?.fill ?? "none";
      let desiredStroke = this.spec?.palette.fg || "#ffffff";
      if (this.spec?.icon?.stroke) desiredStroke = this.spec.icon.stroke;
      if (this.spec?.icon?.strokeGradient) {
        const id = this.ensureIconGradient(
          svgEl,
          this.spec.icon.strokeGradient,
          vb,
        );
        desiredStroke = `url(#${id})`;
      }
      const nodes = svgEl.querySelectorAll(
        "path, line, rect, circle, polygon, polyline, ellipse",
      );
      nodes.forEach((node: Element) => {
        (node as SVGElement).setAttribute("stroke", desiredStroke);
        (node as SVGElement).setAttribute(
          "stroke-width",
          String(desiredStrokeWidth),
        );
        if (!(node as SVGElement).getAttribute("fill"))
          (node as SVGElement).setAttribute("fill", desiredFill);
      });
      return { w, h };
    };
    this.leftIconSize = computeIconSize(this.leftIconSvg);
    this.rightIconSize = computeIconSize(this.rightIconSvg);

    const iconGap = this.leftIconSvg || this.rightIconSvg ? 8 : 0;
    const w = Math.round(
      this.leftIconSize.w +
        (this.leftIconSvg ? iconGap : 0) +
        textWidth +
        (this.rightIconSvg ? iconGap : 0) +
        this.rightIconSize.w +
        spec.padX * 2 +
        spec.thickness,
    );
    const h = Math.round(
      Math.max(textHeight, this.leftIconSize.h, this.rightIconSize.h) +
        spec.padY * 2 +
        spec.thickness,
    );

    this.svg.setAttribute("width", String(w));
    this.svg.setAttribute("height", String(h));
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const cy = h / 2 + spec.fontSize * 0.05;
    // If icons present, left-align text after left icon; otherwise center
    if (this.leftIconSvg || this.rightIconSvg) {
      this.textEl.setAttribute("text-anchor", "start");
      const textX = Math.round(
        spec.padX +
          (this.leftIconSvg ? this.leftIconSize.w + iconGap : 0) +
          spec.thickness / 2,
      );
      this.textEl.setAttribute("x", String(textX));
    } else {
      const cx = w / 2;
      this.textEl.setAttribute("text-anchor", "middle");
      this.textEl.setAttribute("x", String(cx));
    }
    this.textEl.setAttribute("y", String(cy));
    this.textEl.setAttribute("fill", spec.palette.fg);

    const csz = Math.min(spec.corners, Math.floor(Math.min(w, h) / 3));
    const d = this.octagonPath(w, h, csz);

    this.createOrUpdateGradients(spec);
    this.bgPath.setAttribute("d", d);
    const fillVal = this.fillGradId
      ? `url(#${this.fillGradId})`
      : spec.palette.bg;
    this.bgPath.setAttribute("fill", fillVal);
    // Single-path approach: apply stroke to the same path
    const strokeVal = this.strokeGradId
      ? `url(#${this.strokeGradId})`
      : spec.palette.border;
    this.bgPath.setAttribute("stroke", strokeVal);
    this.bgPath.setAttribute("stroke-width", String(spec.thickness));
    this.bgPath.setAttribute("stroke-linejoin", "round");

    // Position icons
    const iconY = (h - targetIconH) / 2;
    if (this.leftIconSvg) {
      this.leftIconSvg.setAttribute(
        "x",
        String(Math.round(spec.padX + spec.thickness / 2)),
      );
      this.leftIconSvg.setAttribute("y", String(Math.round(iconY)));
    }
    if (this.rightIconSvg) {
      const rightX = Math.round(
        w - spec.padX - spec.thickness / 2 - this.rightIconSize.w,
      );
      this.rightIconSvg.setAttribute("x", String(rightX));
      this.rightIconSvg.setAttribute("y", String(Math.round(iconY)));
    }
  }

  private octagonPath(w: number, h: number, c: number): string {
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
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) d += ` L ${p[i][0]} ${p[i][1]}`;
    d += " Z";
    return d;
  }
}

if (!customElements.get("ne-button")) {
  customElements.define("ne-button", NeButton);
}
