// EnhancedTyped: Typed-like utility for input elements that simulates
// real user input events (beforeinput/input), preserves cursor position,
// and ensures native horizontal auto-scrolling behavior.

export interface EnhancedTypedOptions {
  strings: string[];
  typeSpeed?: number; // ms per character
  startDelay?: number; // ms before start
  loop?: boolean;
  nextStringDelay?: number; // ms pause between strings when looping (default 1500)
  onBegin?: () => void;
  onComplete?: () => void;
  // Called after each character is typed with the current value and whether
  // this was the LAST character of the current string (completion signal).
  onCharTyped?: (value: string, isComplete: boolean) => void;
}

type TargetElement = HTMLInputElement | SVGTextElement;

export class EnhancedTyped {
  private el: TargetElement;
  private strings: string[];
  private typeSpeed: number;
  private startDelay: number;
  private loop: boolean;
  private currentStringIndex: number;
  private currentCharIndex: number;
  private typingTimeout: number | null;
  private destroyed: boolean;
  public isTyping: boolean;
  private paused: boolean;
  private onCharTypedCb?: (value: string, isComplete: boolean) => void;
  private nextStringDelay: number;

  constructor(element: TargetElement, options: EnhancedTypedOptions) {
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
    this.nextStringDelay = options.nextStringDelay ?? 1500;

    if (typeof options.onBegin === "function") {
      setTimeout(() => options.onBegin && options.onBegin(), this.startDelay);
    }

    window.setTimeout(() => {
      if (!this.destroyed) this.begin();
    }, this.startDelay);
  }

  private begin(): void {
    if (this.strings.length === 0 || this.destroyed || this.paused) return;
    this.isTyping = true;
    this.type();
  }

  private type(): void {
    if (this.destroyed || this.paused) return;

    const current = this.strings[this.currentStringIndex] ?? "";
    if (this.currentCharIndex < current.length) {
      this.typeChar(current);
      this.typingTimeout = window.setTimeout(() => this.type(), this.typeSpeed);
      return;
    }

    // Finished current string
    this.isTyping = false;

    if (this.loop && !this.destroyed) {
      // brief pause before looping
      this.typingTimeout = window.setTimeout(() => {
        if (!this.paused && !this.destroyed) {
          this.resetForNext();
          this.begin();
        }
      }, this.nextStringDelay);
    }
  }

  private typeChar(current: string): void {
    if (this.destroyed || this.paused) return;
    const nextValue = current.substring(0, this.currentCharIndex + 1);

    if (this.el instanceof HTMLInputElement) {
      this.simulateUserInput(nextValue);
    } else {
      this.simulateSvgTextUpdate(nextValue);
    }

    // Notify listeners after each character is applied
    const isComplete = this.currentCharIndex + 1 >= current.length;
    try {
      this.onCharTypedCb && this.onCharTypedCb(nextValue, isComplete);
    } catch {}

    this.currentCharIndex += 1;
  }

  private simulateSvgTextUpdate(newValue: string): void {
    const textEl = this.el as SVGTextElement;
    // Only update text content here; the host component manages
    // caret position and overflow/scroll anchoring logic.
    textEl.textContent = newValue;
  }

  private simulateUserInput(newValue: string): void {
    const input = this.el as HTMLInputElement;

    // Ensure focus so browsers apply native cursor-follow scroll
    // Mark this focus as programmatic so UI handlers can ignore it
    try {
      (input as any).dataset.enhancedFocus = "1";
      input.focus();
    } catch {}

    // beforeinput
    try {
      const beforeEvt = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: newValue.charAt(newValue.length - 1) || "",
      } as InputEventInit);
      input.dispatchEvent(beforeEvt);
    } catch {}

    // Set value and caret
    input.value = newValue;
    try {
      input.setSelectionRange(newValue.length, newValue.length);
    } catch {}

    // input
    try {
      const inputEvt = new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "insertText",
      } as InputEventInit);
      input.dispatchEvent(inputEvt);
    } catch {}

    // Force scroll to cursor when needed
    try {
      input.scrollLeft = input.scrollWidth;
    } catch {}

    // Clear the programmatic focus marker in a microtask
    try {
      queueMicrotask(() => {
        try {
          delete (input as any).dataset.enhancedFocus;
        } catch {}
      });
    } catch {
      try {
        delete (input as any).dataset.enhancedFocus;
      } catch {}
    }
  }

  private resetForNext(): void {
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
        this.el.setAttribute("x", "24"); // Reset scroll position
        this.el.setAttribute("text-anchor", "start"); // Reset anchor
      }
    }
  }

  public destroy(onComplete?: () => void): void {
    this.destroyed = true;
    this.isTyping = false;
    if (this.typingTimeout != null) {
      window.clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (onComplete) onComplete();
  }

  public pause(): void {
    if (this.destroyed) return;
    this.paused = true;
    this.isTyping = false;
    if (this.typingTimeout != null) {
      window.clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  public resume(): void {
    if (this.destroyed) return;
    this.paused = false;
    this.begin();
  }

  public isPaused(): boolean {
    return this.paused;
  }
}
