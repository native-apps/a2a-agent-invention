// ---------------- SVG SHAPE LIBRARY ----------------


// Minimal in-memory design library for prototype
export type ButtonSpec = {
  palette: { fg: string; bg: string; border: string };
  gradient?: { from: string; to: string };
  corners: number;
  thickness: number;
  padX: number;
  padY: number;
  fontSize: number;
  fontFamily: string;
  // Optional icon styling controlled by design id
  icon?: {
    strokeWidth?: number;
    // Solid stroke color OR gradient
    stroke?: string;
    strokeGradient?: { from: string; to: string; opacityFrom?: number; opacityTo?: number };
    fill?: string | null; // usually 'none'
  };
};

const BUTTON_SPECS: Record<string, ButtonSpec> = {
  'BTN-RED-01': {
    palette: { fg: '#ffffff', bg: '#0b0b0b', border: '#ff7a00' },
    gradient: { from: '#b80000', to: '#f2460d' },
    corners: 12,
    thickness: 4,
    padX: 16,
    padY: 12,
    fontSize: 16,
    fontFamily: 'Departure Mono, monospace',
    icon: {
      strokeWidth: 2,
      // strokeGradient: { from: '#b80000', to: '#f2460d', opacityFrom: 1, opacityTo: 1 },
      stroke: '#ffffff', // <-- This now sets the icon stroke to solid white
      fill: 'none',
    },
  },
  'BTN-AMBER-01': {
    palette: { fg: '#0b0b0b', bg: '#0b0b0b', border: '#e3bdbd' },
    gradient: { from: '#ffd200', to: '#ff7a00' },
    corners: 12,
    thickness: 4,
    padX: 16,
    padY: 12,
    fontSize: 16,
    fontFamily: 'Departure Mono, monospace',
    icon: {
      strokeWidth: 2,
      // strokeGradient: { from: '#ffd200', to: '#ff7a00', opacityFrom: 1, opacityTo: 1 },
      stroke: '#0b0b0b', // <-- This now sets the icon stroke to solid black
      // fill: 'none',
    },
  },
};

export function getButtonSpec(designId: string): ButtonSpec | null {
  return BUTTON_SPECS[designId] ?? null;
}

// ---------------- SVG DEF LIBRARY ----------------

/**
 * Central registry of <defs> snippets that can be re-used across SVGs.
 * The intent is to keep raw static markup here so components can inject
 * the required gradients / filters into their own <defs> blocks at runtime
 * without duplicating logic.
 */

const SVG_DEF_SNIPPETS: Record<string, string> = {
  // Amber glowing border: radial gradient + subtle blur filter.
  'AMBER_BORDER': `
    <radialGradient id="amberGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffbf00" stop-opacity="1" />
      <stop offset="40%" stop-color="#ff8c00" stop-opacity="1" />
      <stop offset="70%" stop-color="#ff4500" stop-opacity="1" />
      <stop offset="100%" stop-color="#8b0000" stop-opacity="1" />
      <animate attributeName="r" values="30%;70%;30%" dur="3s" repeatCount="indefinite" />
    </radialGradient>
    <filter id="amberGlowFilter" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  `,

  // Dynamic rotating fire gradient for animated borders.
  'FIRE_BORDER': `
    <linearGradient id="fireGradient1" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
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
    </linearGradient>
  `,
};

/**
 * Retrieve a raw <defs> snippet by id so the caller can inject it as needed.
 * Returned string should be inserted directly into an existing <defs> element.
 */
export function getSvgDefSnippet(id: string): string | null {
  return SVG_DEF_SNIPPETS[id] ?? null;
}
