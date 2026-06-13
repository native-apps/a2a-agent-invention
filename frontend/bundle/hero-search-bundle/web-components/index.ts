// Register all Native Apps Web Components
import "./ne-button";
import "./ne-hero-search";

// Debug flags for verification in DevTools

(window as any).__neWcIndexLoaded = true;
(window as any).__neButtonDefined = !!customElements.get("ne-button");
