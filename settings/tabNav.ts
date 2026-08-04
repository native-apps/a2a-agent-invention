// ---------------------------------------------------------------------------
// tabNav.ts — Switch between InventionsView tabs from inside an invention
// component.
//
// Mother Brain's InventionsView drives its tab bar from the invention's
// config.json "components" map and owns the active-tab state internally
// (setDetailTab). Invention components only receive { invention, onUpdate }
// props — there is no exposed API to change the active tab.
//
// The one mechanism that needs NO Mother Brain app changes: click the tab bar
// button itself. InventionsView renders one <button> per component key with
// the key's label inside; a programmatic .click() triggers React's synthetic
// onClick, which calls setDetailTab(label) and switches the visible tab.
//
// The label must match the component map key EXACTLY (e.g. "Wizard",
// "Settings"). Components using this helper must tag their OWN buttons with
// data-a2a-nav so they are never mistaken for tab buttons.
// ---------------------------------------------------------------------------

export function activateInventionTab(label: string): boolean {
  if (typeof document === "undefined") return false;
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  );
  const target = buttons.find(
    (b) =>
      !b.hasAttribute("data-a2a-nav") &&
      b.querySelector("svg") !== null &&
      (b.textContent || "").replace(/\s+/g, " ").trim() === label,
  );
  if (target) {
    target.click();
    return true;
  }
  return false;
}
