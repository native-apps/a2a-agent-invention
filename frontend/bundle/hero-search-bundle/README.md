# Hero Search Bundle — Native Element `<ne-hero-search>`

A fully self-contained, portable bundle of the **Hero Search** component built with the **Native Elements protocol** — pure SVG rendering inside a Shadow DOM Custom Element with responsive geometry via `ResizeObserver`, a typewriter effect, and zero React-width detection overhead.

---

## What's Inside

```
hero-search-bundle/
├── web-components/
│   ├── ne-hero-search.ts      # ★ The core Custom Element (pure SVG + Shadow DOM)
│   ├── design-library.ts      # SVG defs registry (gradients, filters, border styles)
│   ├── ne-button.ts           # Companion button element (used alongside in Hero)
│   └── index.ts               # Registration entry point
├── utils/
│   └── enhancedTyped.ts       # Typewriter engine (supports HTMLInputElement & SVGTextElement)
├── react/
│   ├── NeHeroSearch.tsx        # React wrapper (forwardRef, renders <ne-hero-search>)
│   ├── NeButton.tsx           # React wrapper for <ne-button>
│   └── Hero.tsx               # Example usage: full Hero section with search + buttons
├── fonts/
│   ├── DepartureMono-Regular.woff
│   └── DepartureMono-Regular.woff2
├── docs/
│   ├── HERO_FLEXSEARCH_ANALYSIS.md   # Architecture deep-dive & sequence diagrams
│   └── Native Apps Components.md     # Full Native Elements protocol reference
├── required-css.css           # CSS you must include in your project
└── README.md                  # This file
```

---

## Quick Start

### 1. Copy Files Into Your Project

Copy the following directories into your project:

- `web-components/` → your source dir (e.g., `src/web-components/`)
- `utils/` → your source dir (e.g., `src/utils/`)
- `react/` → your components dir (e.g., `src/components/`)
- `fonts/` → your public assets dir (e.g., `public/fonts/`)

### 2. Register the Custom Element

Import the registration file early in your app (e.g., `main.tsx` or `App.tsx`):

```ts
import "./web-components/ne-hero-search";
// Optional: if you also need the button
import "./web-components/ne-button";
```

### 3. Add Required CSS

Include the contents of `required-css.css` in your global CSS. At minimum:

```css
@font-face {
  font-family: "Departure Mono";
  src:
    url("./fonts/DepartureMono-Regular.woff2") format("woff2"),
    url("./fonts/DepartureMono-Regular.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### 4. Use in React

```tsx
import NeHeroSearch from "./components/NeHeroSearch";

function MyPage() {
  return (
    <div style={{ maxWidth: "768px", margin: "0 auto" }}>
      <NeHeroSearch />
    </div>
  );
}
```

### 5. Use Without React (Vanilla HTML/JS)

```html
<script type="module">
  import "./web-components/ne-hero-search.ts";
</script>

<ne-hero-search></ne-hero-search>
```

---

## Architecture: Why It's Fast

The Hero Search achieves **zero-layout-thrash responsiveness** through:

1. **Pure SVG Container** — The octagonal background, border, gradient fills, and brain icon are all SVG elements. No CSS borders, no CSS backgrounds.

2. **`octagonPath()` Geometry** — A single function generates the octagonal clip path and background path from `(width, height, corner)`. On resize, both paths are recalculated and applied simultaneously.

3. **`ResizeObserver` (not React width detection)** — The element observes its own width via `ResizeObserver` inside the Shadow DOM. When the host resizes, `updateGeometry()` fires and:
   - Recalculates the viewBox
   - Updates background path `d` attribute
   - Updates clip path `d` attribute
   - Repositions the brain icon
   - Constrains the `<foreignObject>` / `<input>` width

4. **`<foreignObject>` Bridge** — A real `<input type="text">` lives inside an SVG `<foreignObject>`, giving us:
   - Native keyboard events (IME, mobile keyboards)
   - Native caret and text selection
   - Native horizontal scroll for long text
   - No custom caret logic needed

5. **Shadow DOM Isolation** — All styles are scoped. The `:host` sets `display:block; width:100%`. The component never leaks or receives styles from outside.

6. **Theme Awareness** — The component reads CSS custom properties (`--background`, `--foreground`, `--hero-search-stop1-opacity`, `--hero-search-stop2-opacity`) from `document.documentElement` and applies them to SVG gradient stops. A `MutationObserver` watches for theme attribute changes.

---

## Customization

### CSS Custom Properties (Design Tokens)

| Variable | Default | Purpose |
|---|---|---|
| `--background` | `0 0% 0%` (hsl values) | Background color for the fill gradient |
| `--foreground` | `0 0% 100%` | Text color for the input |
| `--hero-search-stop1-opacity` | `0.2` | Bottom gradient stop opacity |
| `--hero-search-stop2-opacity` | `0.4` | Top gradient stop opacity |

### Border Styles

Change the border style by calling `applyBorderStyle()` inside the component or set the attribute:

- `"AMBER_BORDER"` — Animated radial gradient (amber → orange → red) with glow filter (default)
- `"FIRE_BORDER"` — Rotating fire gradient
- `null` / unset — Simple `hsl(25 95% 53%)` solid stroke

### Typewriter Suggestions

Edit the `suggestions` array at the top of `ne-hero-search.ts`:

```ts
const suggestions = [
  "Dream it → Build it → Ship it! 👾",
  "Why are native apps better?",
  "✧ Sovereign Code-Forging",
];
```

### Font

The component uses `"Departure Mono", monospace` at 42px. To change:
- Edit the `this.editor.style.cssText` line in the constructor
- Replace the font files in `fonts/` if needed

---

## Key Files Explained

### `ne-hero-search.ts` (Core)

The Custom Element class `NeHeroSearch` extends `HTMLElement`:
- **Constructor**: Builds the entire SVG tree programmatically (no template strings)
- **`connectedCallback()`**: Sets up event listeners, ResizeObserver, starts typewriter
- **`updateGeometry(width)`**: The responsive engine — recalculates all SVG geometry
- **`startSuggestions()` / `stopSuggestions()`**: Controls the AI typewriter mode
- **`applyBorderStyle(styleId)`**: Injects SVG defs from design-library for border effects

### `design-library.ts`

Central registry of:
- `ButtonSpec` definitions (colors, gradients, corners, padding, fonts)
- `SVG_DEF_SNIPPETS` — raw SVG `<defs>` markup for gradients and filters

### `enhancedTyped.ts`

Typewriter utility that works with both `HTMLInputElement` and `SVGTextElement`:
- Simulates real `beforeinput` / `input` events for native scroll behavior
- Supports looping, variable speed, pause/resume, destroy

---

## Dependencies

**Runtime**: None. Zero external dependencies. Pure DOM APIs.

**Font**: Departure Mono (included in `fonts/`)

**Build**: TypeScript compilation required (files use `.ts`/`.tsx`). Compatible with Vite, Webpack, esbuild, etc.

---

## Native Elements Protocol

This component follows the Native Elements design protocol:

1. **Custom Elements (Web Components)** — Standard `customElements.define()` API
2. **Pure SVG Rendering** — All visual output via SVG attributes, never CSS styling
3. **Shadow DOM** — Full encapsulation, no style leakage
4. **`design-id` System** — Single identifier resolves all visual properties from the design library
5. **Responsive via Geometry** — `octagonPath()` + `ResizeObserver`, not CSS hacks
