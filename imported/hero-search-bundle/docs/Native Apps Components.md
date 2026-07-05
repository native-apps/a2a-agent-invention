# Native Elements: Architecture and Style Guide

This document defines the philosophy and technical details for **Native Elements**, a pure-SVG, JavaScript-driven Web Components kit for Native Apps.

### Core Philosophy: Custom Elements First

Our UI is built on a foundation of framework-agnostic **Native Elements**. These are custom elements built with browser-native APIs (Custom Elements V1, Shadow DOM) for maximum performance, longevity, and interoperability.

- **React is the Wrapper, Not the Core:** We use React as our application layer, but it is not the source of truth for our core UI components. React components will be created as lightweight wrappers around Native Elements to handle props, events, and integration with the wider React ecosystem.
- **Performance and Purity:** Native Elements use pure SVG for all rendering. There are no external CSS files, no style classes, and no inline style attributes. All visuals—geometry, color, and gradients—are computed in JavaScript and applied directly as SVG attributes.
- **Encapsulation is Key:** Every Native Element uses the Shadow DOM to completely encapsulate its internal structure, styling, and logic. This prevents style leakage and ensures that components are truly modular and reusable.

---

- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
- https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- https://web.dev/articles/custom-elements-v1
- https://animejs.com/documentation/getting-started/using-with-react/

## Principles

- No CSS for layout/visuals; use SVG elements and attributes only
- JS math for geometry; palettes for color
- Animations: Motion for React (motion.dev) for React wrappers; WAAPI for internal element animations where needed
- Accessibility: keyboard, ARIA roles, focus semantics fully implemented
- Form participation when needed via ElementInternals
- Events via CustomEvent; properties via element instance
- Encapsulation with Web Components (Shadow DOM) controlling attributes/behavior and SVG node points via JS

## Shapes

- Octagon (primary), Hexagon, Chamfered rectangle, Stepped corners
- Shape modules expose functions that map a host width/height + corner parameters → SVG path/points (no distortion at corners)
- Points recomputed on content change or explicit `layout()` calls

## Components (Phase 1)

- ne-input (Form‑Associated, Pure‑SVG Editor)
  - SVG frame + SVG text rendering
  - Pure‑SVG editor: implement caret/selection/IME fully in JS (zero CSS)
  - Emits `ne-change` with current value

- ne-button (SVG only)
  - Octagon (or other shapes) that auto‑fits text width without distorting corners
  - Keyboard accessible (Enter/Space), `role="button"`, `tabindex="0"`
  - Optional `type="submit|reset|button"` with form participation via ElementInternals

## The Triumphant Plan to Universalize <ne-button> (Phase 2) 🦄

### Phase 2.1: Refactor the Foundation (Our Current Elements)

1.  **Deconstruct `NaButtonsReact.tsx`:** Our current hero buttons are functionally merged. The first step is to create a new, universal React wrapper component at `src/components/NeButton.tsx`. This component will serve as the primary way to use `<ne-button>` in React, accepting props like `designId`, `onClick`, and `children` for labels and icons.
2.  **Replace the Old Wrapper:** The `Hero.tsx` component will be updated to use two distinct instances of our new `<NeButton>` component, making them individually controllable and reusable. The old `NaButtonsReact.tsx` component will then be deleted.

### Phase 2.2: Evolve the Design Library & Custom Element

1.  **Analyze Existing Variants:** We will systematically analyze `src/components/ui/button.tsx` to catalogue every existing button `variant` (`default`, `destructive`, `outline`, etc.) and `size`.
2.  **Expand the Design Library:** Each unique variant/size combination will be translated into a new `ButtonSpec` within `src/web-components/design-library.ts`. This ensures our "single design entry point" rule remains pure, with specs like `BTN-OUTLINE-SM` or `BTN-GHOST-LG`.
3.  **Enable Click Handling:** The new `<NeButton>` React wrapper will be enhanced to properly handle `onClick` events, attaching a listener for the `ne-press` custom event emitted by the `<ne-button>` element.

### Phase 2.3: The Great Button Replacement

1.  **Target Identification:** Our first conquest will be the buttons on the home page, specifically within the "Services" and "Transform Vision" sections.
2.  **Systematic Replacement:** One by one, the old `<Button>` components in these sections will be replaced with our new, supreme `<NeButton>` component. This involves migrating the `onClick` function, assigning the correct new `designId`, and moving the text and icon into the `children`.
3.  **Final Victory:** With the home page successfully converted, we will have a proven, bodacious model to continue this crusade across the entire application, ultimately leading to the triumphant deletion of the old `button.tsx` file.

## Rendering & Sizing

- Geometry/colors computed in JS; values pushed to SVG attributes (no style attr)
- Current plan: measure content using DOM APIs + textMetrics; size SVG via JS
- Open research: alternatives to ResizeObserver for smoother/cheaper sizing
  - Hypotheses to test:
    - MutationObserver + microtask batching
    - Font metrics + content-length predictive sizing
    - Per-frame reconciliation with rAF only when text width changes

## Fonts in SVG

- Prefer SVG/text presentation attributes (e.g., `font-family`, `font-size`, `fill`) directly on `<text>`
- If any font styling requires CSS, limit strictly to font presentation attributes via SVG attributes (not stylesheets)
- Evaluate `CanvasRenderingContext2D.measureText` vs SVG `getBBox()` for width calc

## Animations

- Motion.dev in React (primary): use for gestures, layout transitions, simple SVG morphing, and hardware-accelerated effects via React wrappers.
- WAAPI (Web Animations API) inside elements: imperative, CSS-free attribute animations (e.g., gradient stop-opacity, stroke-width) for deterministic internals.
- Anime.js (secondary): encapsulate complex physics-like behaviors (collision detection, gravity simulation) and advanced SVG morphing. Import tree-shakable ESM build only.
- Respect reduced‑motion; ensure deterministic animations under reflow

## Events & API

- Properties: element.value, element.palette, element.corners, element.thickness
- Events: `ne-change`, `ne-press`, `ne-focus`, `ne-blur`
- All colors passed as JS values; no CSS variables

## Roadmap / Tasks

- Research SVG font styling without CSS; pick presentation attributes
- Investigate alternatives to ResizeObserver for sizing; prototype options
- Design API for ne-box (palette, thickness, corners) JS-only
- Prototype ne-box pure‑SVG container (no CSS)
- Prototype ne-button SVG octagon with auto‑fit text + ARIA
- Implement ne-input pure‑SVG editor (caret, selection, IME)
- Create web-components/index.ts and wire in main.tsx 
- Final stages, Native Elements as one single Uni-Element that can mutate it's state into any kind of object: <button>, <form>, <input>, <a>, <img>, <video>, <audio>, virtually anything!
- Progressive adoption: Stabilize per element type before moving on (1) ne-button, (2) ne-input, (3) ne-box).

## Usage (conceptual)

```html
<ne-button id="start">Start Your Project</ne-button>
<ne-box id="card"></ne-box>
<ne-input id="email" name="email"></ne-input>
<script>
  const btn = document.getElementById('start');
  btn.palette = { fg: '#e3bdbd', bg: '#0b0b0b', border: '#ff7a00' };
  btn.addEventListener('ne-press', () => console.log('pressed'));

  const card = document.getElementById('card');
  card.corners = { size: 10 };

  const email = document.getElementById('email');
  email.addEventListener('ne-change', e => console.log('value', e.detail));
</script>
```

## WAAPI quick note

WAAPI (Web Animations API) is the native browser API for keyframe/timing animations (`element.animate([...], {...})`). It runs animations off the main thread when possible, avoids CSS, and returns an `Animation` you can control (play, pause, finish, cancel). Perfect for imperative, CSS‑free animations inside our Web Components.

## Motion.dev + Anime.js example

Use Motion.dev as primary with Anime.js for specific physics:

```javascript
// Motion.dev for main UI animations
<motion.div
  layoutId="button-to-bar"
  animate={{ 
    pathLength: liquidPath,
    y: gravityY 
  }}
/>

// Anime.js for collision detection and gravity
anime({
  targets: '.liquid-element',
  translateY: {
    value: () => calculateGravity(),
    duration: 2000,
    easing: 'linear'
  },
  update: () => checkCollisions()
})
```

## Shadow DOM sanity check (baseline we validated)

We proved the platform and our bundler load path by adding a minimal element on
`public/wc-test.html` that attaches a Shadow Root and renders internal markup,
alongside importing our app’s web-components index to register `<ne-button>`.

```html
<script type="module">
  class XFooShadow extends HTMLElement {
    constructor() {
      super();
      const tmpl = document.createElement('template');
      tmpl.innerHTML = `<b>I'm in shadow dom!</b> <slot></slot>`;
      const root = this.attachShadow({ mode: 'open' });
      root.appendChild(tmpl.content.cloneNode(true));
    }
  }
  customElements.define('x-foo-shadowdom', XFooShadow);
  import '/src/web-components/index.ts';
</script>

<x-foo-shadowdom>— slotted content</x-foo-shadowdom>
<ne-button design-id="BTN-RED-01">Start Your Project</ne-button>
```

In DevTools, both tags show `#shadow-root`. If the inline one shows a shadow
root but `<ne-button>` doesn’t, investigate module execution/definition order.

## The Anatomy of a Native Element: `<ne-button>`

Our flagship component, `<ne-button>`, serves as the blueprint for all Native Elements. It demonstrates our core principles in action.

### 1. Pure SVG Rendering
The button's visual appearance is rendered entirely by an internal `<svg>` element inside its Shadow DOM. This includes:
- **The Shape:** A single `<path>` element creates the button's octagon shape, with its `d` attribute calculated dynamically in JavaScript. This path is used for both the `fill` and the `stroke`.
- **Gradients:** Colors and gradients are defined within a `<defs>` tag inside the SVG. We use `<linearGradient>` elements for both the fill and stroke, allowing for complex visual effects.
- **Text and Icons:** The button's label is rendered by an SVG `<text>` element. Any icons passed in as light DOM children are cloned and injected into the internal SVG, where their styles can be controlled.

### 2. Shadow DOM Encapsulation
The entire internal structure of `<ne-button>` is hidden within its `#shadow-root`. This means that no external styles can accidentally affect the button's appearance, and the button's internal logic is completely self-contained.

### 3. The `design-id` System
A single attribute, `design-id`, is the sole entry point for styling a Native Element.
- The `design-id` (e.g., `"BTN-RED-01"`) is a key that maps to a detailed style specification in our `design-library.ts`.
- This spec object contains everything the component needs to render itself: color palettes, gradient definitions, font sizes, padding, and even icon-specific styling.
- This approach decouples the component's logic from its appearance, allowing for a highly flexible and maintainable design system.

### 4. Hover and Animations via WAAPI
All interactive effects, like hover states, are handled using the Web Animations API (WAAPI).
- We attach event listeners (`pointerenter`, `pointerleave`) directly to the custom element.
- These listeners trigger animations that manipulate SVG attributes directly, such as `stop-opacity` on our gradients or `stroke-width` on our path. This is all done in JavaScript, with no CSS transitions or animations.

---

## React Integration: The Wrapper Pattern

To make our Native Elements feel at home in React, we use a simple and consistent "wrapper" pattern.

### React Wrapper Best Practices
- **Create a Lightweight Wrapper:** For each Native Element, we create a corresponding React component (e.g., `<NeButton>`).
- **Translate Props to `design-id`:** The wrapper accepts familiar React props like `variant="primary"` or `size="large"`. It contains the logic to translate these props into the correct `design-id`.
- **Handle Events:** The wrapper uses a `ref` to attach event listeners to the custom element's DOM node. It listens for our custom events (like `ne-press`) and exposes them as standard React props (e.g., `onClick`).
- **Pass Through Children:** The wrapper passes any `children` (like text or SVG icons) directly into the light DOM of the custom element, which then knows how to render them.

### Example React Wrapper (`<NeButton>`)
```tsx
import React, { useEffect, useRef, forwardRef } from 'react';

// Maps props to the correct design-id
const getDesignId = (variant, size) => {
  // Logic to return 'BTN-PRIMARY-LG', 'BTN-OUTLINE-SM', etc.
  return 'BTN-RED-01'; // Placeholder
};

export const NeButton = forwardRef(({ variant, size, onClick, children, ...props }, ref) => {
  const internalRef = useRef<HTMLElement>(null);
  const buttonRef = ref || internalRef;
  const designId = getDesignId(variant, size);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el || !onClick) return;

    const handleClick = (e) => onClick(e);
    el.addEventListener('ne-press', handleClick);
    return () => el.removeEventListener('ne-press', handleClick);
  }, [onClick, buttonRef]);

  return (
    <ne-button ref={buttonRef} design-id={designId} {...props}>
      {children}
    </ne-button>
  );
});
```

This elegant pattern gives us the best of both worlds: a beautiful and ergonomic React API for developers, powered by a performant and future-proof foundation of native Web Components.

## Component: ne-button (pure-SVG)

- Visuals: SVG only — <defs><linearGradient/></defs>, background <path>, border <path>, label <text>
- Geometry: octagon path computed from width/height with constant corner cut size
- Auto-size: label measured via SVG getBBox (canvas measureText fallback), padding applied in JS
- Accessibility: role=button, tabindex=0; Enter/Space triggers `ne-press`
- Optional form behavior: internal only; external API remains identifier‑only

Attributes
- Only `design-id` (opaque serial). All visuals come from the Design Library.

Properties (JS)
- Visual knobs are internal. Consumers should not set palette/corners directly.

Events
- `ne-press` (bubbles)

DevTools Verification
1. Inspect <ne-button>, expand `#shadow-root` (enable “Show user agent shadow DOM”).
2. Ensure <svg> contains <defs> → <linearGradient>, two <path> elements, and a <text>.
3. Confirm the background path `fill` is either a color or `url(#grad-...)`.
4. Press Enter/Space to see `ne-press` fire in the console.

## Identifier-Only Frontend Model

- Each custom element exposes a single public attribute: `design-id` (a unique serial token; letters + numbers).
- No visual properties are set on the element itself. The `design-id` is the only input.
- A Design Library (runtime module / backend source) maps `design-id` → full spec:
  - shape type (octagon/hex/stepped/chamfered), corner size, thickness
  - palette (fg, bg, border) and gradient spec (from, to)
  - motion presets (hover/press/focus), if enabled
  - component‑specific parameters (padding, font sizing rules, etc.)
- On connect/attribute change, the component fetches/reads its spec by `design-id` and renders accordingly.
- IDs are opaque and stable; versioning is handled server‑side/library‑side.

### Examples of the IDs
```
pbkx706n
ho5pqwn1
yp3unfp6
q8v4efri
jgbuijsr
9o8ms52k
osjapkeo
kdd9wa19
```

### Library responsibilities
- Validate `design-id` and provide a normalized spec object
- Cache specs client‑side
- Allow A/B or theme switching by resolving `design-id` to different specs per context

### Example (conceptual)
```html
<ne-button design-id="BTN-7F2A1C"></ne-button>
<ne-box design-id="BOX-11D9B7"></ne-box>
<ne-input design-id="INP-9902EE" name="email"></ne-input>
```

The app’s Design Library returns a JSON spec for each ID; components render purely from that spec with SVG + JS.

## The Native Elements Octagon Border

- ne-box (SVG container)
  - Pure‑SVG container for cards/sections; slotted content rendered above SVG backdrop
  - Auto size with content; no CSS styles
- This custom-element will be unique, as it should work for all elements of a page. Anything from <div>, <span>, or any page element.
- This custom-element does not contain content inside of it. It is specficially only for creating the <svg> border of existing object in the page, and MUST NOT replace the content, or overcomplicate standard page content. 
- The NE-Octagon Border does not have any special functions like a <button> or other input element. 
- However, we will expand on it for adding some awesome border shapes, colors, and background styles using hi-tech SVG designs and animations!
