# `<ne-hero-search>` — Responsive Architecture Deep Dive

> **The core innovation**: The Hero Search calculates its own responsive geometry entirely inside the Shadow DOM using pure SVG attributes and `ResizeObserver`. The parent page **never** has to measure, recalculate, or pass width down via React state. There is zero layout thrash.

---

## The Problem We Solved

In a standard React approach, responsive SVG components work like this:

```
Parent Container → React measures width (useRef + ResizeObserver) 
  → React state update → re-render → pass width as prop → 
  → child recalculates SVG → browser re-layout
```

This causes:
- **Layout thrash** — React re-renders cascade through the tree
- **Janky resize** — state updates lag behind the browser's own layout pass
- **Performance cost** — the entire parent page participates in the resize calculation

## Our Solution

The Hero Search eliminates React from the resize loop entirely:

```
Parent Container (width: 100%)
  └─ <ne-hero-search> (Custom Element)
       └─ Shadow DOM (isolated)
            └─ ResizeObserver watches ITS OWN width
                 └─ updateGeometry() recalculates ALL SVG attributes
                      └─ Browser paints — NO React re-render, NO layout thrash
```

The parent's only job is to provide a width. Everything else is internal.

---

## Exact Data Flow

### Step 1: Parent Provides Width (Parent's ONLY job)

```tsx
// Hero.tsx — the parent page
<div className="w-full max-w-3xl">   {/* ← just give it a width */}
  <NeHeroSearch />                   {/* ← that's it */}
</div>
```

No `onResize`, no `useRef`, no `useState`, no `useEffect`, no `ResizeObserver` in React. The parent does nothing except exist as a sized container.

### Step 2: Host Element Fills Parent

Inside the Shadow DOM, the `:host` pseudo-class makes the custom element fill its parent:

```ts
// ne-hero-search.ts — constructor()
const style = document.createElement("style");
style.textContent = `:host {
  display:block;        /* ← block-level so width works */
  position:relative;    /* ← for any absolute children */
  width:100%;           /* ← fills whatever the parent gives it */
  outline:none           /* ← clean focus behavior */
}`;
```

The `<ne-hero-search>` element is now exactly as wide as its parent container.

### Step 3: SVG Fills the Host

The SVG element is created with `width="100%"`:

```ts
// ne-hero-search.ts — constructor()
this.svg = document.createElementNS(ns, "svg");
this.svg.setAttribute("width", "100%");     // ← fills host width
this.svg.setAttribute("height", "75");       // ← fixed height
this.svg.setAttribute("viewBox", "0 0 768 81.5");  // ← initial viewBox
this.svg.setAttribute("overflow", "visible");       // ← no clipping of glow effects
```

### Step 4: ResizeObserver Detects Width Changes (Inside Shadow DOM)

On `connectedCallback()`, the element observes **itself** — not the parent, not the window:

```ts
// ne-hero-search.ts — connectedCallback()
this.resizeObserver = new ResizeObserver(
  ([{ contentRect: { width } }]) => {
    // width = the ACTUAL rendered pixel width of <ne-hero-search>
    this.updateGeometry(width);
  }
);
this.resizeObserver.observe(this);  // ← observes the host element
```

This is the critical difference. The `ResizeObserver` fires at the **browser's native layout timing** — the same frame the browser resizes the element. There is no React state round-trip. The callback fires and SVG attributes are updated synchronously.

### Step 5: `updateGeometry(width)` — The Geometry Engine

This is where all the responsive math happens. Every SVG attribute is recalculated from the single `width` value:

```ts
private updateGeometry(width: number) {
  const HEIGHT = 75;       // Fixed height (never changes)
  const OUTER_C = 22;      // Corner radius for the octagon
  const INNER_C = 20;
  const PADDING = 24;
  const ICON_SPACE = 84;

  // 1. Recalculate the octagon clip path + background path + viewBox
  this.setClip(width);

  // 2. Size the <foreignObject> to fit inside the octagon corners
  const availableWidth = width - OUTER_C * 2;
  this.foreignObj.setAttribute("width", String(availableWidth));
  this.editor.style.maxWidth = availableWidth + "px";

  // 3. Update ALL non-defs paths to the new octagon geometry
  this.svg.querySelectorAll("path").forEach((p) => {
    if (p.closest("defs")) return;          // skip clipPath
    if (p.getBBox().width < 100) return;     // skip brain icon hit area
    p.setAttribute("d", octagonPath(width, HEIGHT, OUTER_C));
  });

  // 4. Reposition the brain icon to the right edge
  this.brain.setAttribute("x", String(width - 45 - 24));

  // 5. Constrain text width so it doesn't overlap the brain icon
  const textMax = width - 45 - 32;
  this.foreignObj.setAttribute("width", String(textMax));
  this.editor.style.maxWidth = textMax + "px";
}
```

### Step 6: `setClip(width)` — SVG Path Generation

The `octagonPath()` function generates the 8-pointed path string from pure math:

```ts
function octagonPath(w: number, h: number, c: number) {
  // Clamp corner radius so it can't exceed half the shortest dimension
  c = Math.max(0, Math.min(c, Math.floor(Math.min(w, h) / 2)));
  
  // 8 points: corners cut by 'c' pixels
  const p = [
    [c, 0],         // top-left after corner
    [w - c, 0],     // top-right after corner
    [w, c],         // right-top
    [w, h - c],     // right-bottom
    [w - c, h],     // bottom-right after corner
    [c, h],         // bottom-left after corner
    [0, h - c],     // left-bottom
    [0, c],         // left-top
  ];
  
  return "M " + p.map(([x, y]) => `${x} ${y}`).join(" L ") + " Z";
}
```

Then `setClip()` applies the SAME path to three places simultaneously:

```ts
private setClip(width: number) {
  const HEIGHT = 75;
  const OUTER_C = 22;

  const d = octagonPath(width, HEIGHT, OUTER_C);
  
  // 1. Update viewBox so the SVG coordinate system matches pixel dimensions
  this.svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
  
  // 2. Update background path (the visible octagon fill + stroke)
  bg.setAttribute("d", d);
  
  // 3. Update clip path (so text/foreignObject are clipped to octagon shape)
  clip.setAttribute("d", d);
}
```

**Key insight**: The viewBox is set to `0 0 ${width} ${HEIGHT}`. This means **1 SVG unit = 1 pixel**. There is no scaling, no aspect ratio distortion. The SVG coordinate space maps 1:1 to screen pixels.

---

## Why This Is So Fast

| Aspect | Standard React Approach | Our Native Element Approach |
|---|---|---|
| Width detection | `useRef` + `ResizeObserver` → `useState` | `ResizeObserver` on `this` (no React) |
| Resize reaction | Re-render component tree | Direct SVG attribute writes |
| Layout passes | 2+ (React commit + browser layout) | 1 (browser layout only) |
| Cascade cost | Parent + children all re-render | Zero — everything is in Shadow DOM |
| Timing | Next React frame (async) | Same frame as browser layout |

---

## The Complete Component Tree

```
<ne-hero-search>                          ← Custom Element (host)
│  :host { display:block; width:100% }
│
└─ #shadow-root (open)
   │
   ├─ <style>                             ← Only :host baseline styles
   │
   └─ <svg width="100%" height="75">
      │
      ├─ <defs>
      │  ├─ <clipPath id="text-clip">
      │  │  └─ <path d="octagonPath(...)"/>    ← Updated on resize
      │  ├─ <linearGradient id="theme-fill">
      │  │  ├─ <stop id="gs1" />               ← Theme background color
      │  │  └─ <stop id="gs2" />               ← Theme background color
      │  └─ [injected AMBER_BORDER defs]       ← From design-library.ts
      │
      ├─ <path> (= bg)                         ← Octagon fill + stroke
      │     d="octagonPath(...)"               ← Updated on resize
      │     fill="url(#theme-fill)"
      │     stroke="url(#amberGlow)"
      │
      ├─ <foreignObject>                       ← SVG/HTML bridge
      │  width="..."                           ← Updated on resize
      │  └─ <input type="text" class="hero-editor">
      │     style="maxWidth: ...px"            ← Updated on resize
      │
      └─ <svg> (brain icon)                    ← Click to reset AI typing
         x="..."                               ← Updated on resize
         viewBox="0 0 50 50"
         └─ <path d="octagonPath(60,60,18)"/>  ← Hit area (fixed)
         └─ <g> <path d="...brain svg..."/>    ← Brain shape (fixed)
```

---

## React Integration (Minimal Wrapper)

The React wrapper does almost nothing — it just renders the custom element tag and forwards a ref. No logic, no state, no hooks:

```tsx
// NeHeroSearch.tsx
import React, { forwardRef } from 'react';
import '@/web-components/ne-hero-search';

const NeHeroSearch = forwardRef<HTMLElement>((props, ref) => {
  return <ne-hero-search ref={ref} />;
});

NeHeroSearch.displayName = 'NeHeroSearch';
export default NeHeroSearch;
```

This is the entire React integration. The component is **framework-agnostic**. It works identically in React, Vue, Svelte, or vanilla HTML.

---

## What the Parent Page Must Provide

**Only two things:**

1. **A width container** — Any element that gives the `<ne-hero-search>` a width. A `div` with `max-width`, `width`, or flex/grid sizing.

2. **CSS custom properties** (optional) — If you want theme integration:
   ```css
   :root {
     --background: 0 0% 100%;
     --foreground: 224 14% 20%;
     --hero-search-stop1-opacity: 0.2;
     --hero-search-stop2-opacity: 0.4;
   }
   .dark {
     --background: 25 17% 13%;
     --foreground: 0 0% 95%;
   }
   ```

**That's it.** No event callbacks, no width props, no resize handlers.

---

## Theme System

The component reads CSS variables from `document.documentElement` and applies them to SVG gradient stops:

```ts
const applyTheme = () => {
  const styles = getComputedStyle(document.documentElement);
  const bgRaw = styles.getPropertyValue("--background").trim();
  const fgRaw = styles.getPropertyValue("--foreground").trim();
  
  // Apply background color to gradient stops
  const color = bgRaw ? `hsl(${bgRaw})` : "#000";
  stop1.setAttribute("stop-color", color);
  stop2.setAttribute("stop-color", color);
  
  // Apply foreground color to the input text
  if (fgRaw) this.editor.style.color = `hsl(${fgRaw})`;
};

// Watch for theme changes (e.g., toggling .dark class)
const mo = new MutationObserver(applyTheme);
mo.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme", "class", "style"],
});
```

When you toggle `.dark` on `<html>` or `<body>`, the gradient fills and text color update automatically — no React state needed.

---

## Importing Into a New Project

The component needs **zero runtime dependencies**. The only requirements:

1. **TypeScript build** — the files use `.ts`/`.tsx`. Compatible with Vite, Webpack, esbuild.
2. **Import path aliasing** — the core file uses `@/utils/` and `@/web-components/` import paths. Either:
   - Set up `@` as a path alias in your tsconfig/vite config, OR
   - Change the two import lines at the top of `ne-hero-search.ts` to relative paths:
     ```ts
     import { EnhancedTyped } from "../utils/enhancedTyped";
     import { getSvgDefSnippet } from "./design-library";
     ```

3. **Font file** — copy `DepartureMono-Regular.woff2` to your public/fonts directory and add the `@font-face` rule from `required-css.css`.

4. **Register the element** — import it once early in your app:
   ```ts
   import "./web-components/ne-hero-search";
   ```
