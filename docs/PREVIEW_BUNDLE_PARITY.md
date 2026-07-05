# Preview vs Bundle Parity Checklist

> **Quality gate document.** Run through this checklist before EVERY Build Widget export.
> **Source of truth:** `settings/A2aChatPreview.tsx` (2328 lines) — the Preview screen.
> **Bundle under test:** `widget-build/src/ChatApp.tsx` (1040), `HeroSearchHost.tsx` (672), `ChatWidget.tsx` (373), plus `use-theme.ts`, `visitor-identity.ts`, `markdown.ts`, `BrainIcon.tsx`, `HeroSearchElement.ts`.
>
> **Status legend:**
> - ✅ Parity confirmed (both sides match)
> - ⚠️ Known / intentional difference (documented)
> - ❌ Missing / divergent in bundle (needs fixing)
>
> **Line numbers are 1-based and current as of v1.1.48.** Re-verify after any edit.

---

## Summary

| Area | ✅ | ⚠️ | ❌ | Notes |
|---|---|---|---|---|
| 1. Hero Search | 9 | 3 | 0 | Bundle owns its own suggestion cache; Preview receives it as a prop. Functionally equivalent. |
| 2. Chat UI | 8 | 3 | 2 | Header subtitle, thinking spinner, and close-button icon diverge. |
| 3. Continue Button | 5 | 1 | 0 | Markdown preview rendering differs (CSS risk). |
| 4. Bar Mode | 5 | 2 | 1 | Close-button behavior differs (hero vs overlay). |
| 5. State Flows | 4 | 2 | 0 | Minimize-without-callback path is bundle-only. |
| 6. Icons | 3 | 2 | 1 | ChatApp close button uses `✕` text char, not SVG. |
| 7. Markdown | 1 | 1 | 1 | **Preview uses `FastMarkdown`, NOT `renderMarkdown`.** |
| 8. Styling & Theme | 6 | 1 | 0 | Theme detection differs by design. |
| 9. Visitor ID | 0 | 1 | 0 | Intentional Broprint.js vs preview-id split. |
| 10. Event Handlers | 6 | 2 | 0 | Parity is good; one event-routing detail differs. |

**Action items (❌):** §2 header subtitle, §2/§6 close icon, §4 close behavior, §7 markdown engine.

---

## 1. Hero Search (full-screen landing)

The `<ne-hero-search>` web component, AI suggestions, typewriter, dropdown, "generate more", and branding.

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`HeroSearchHost.tsx` + `HeroSearchElement.ts`) | Status |
|---|---|---|---|
| 1.1 | Web component `<ne-hero-search>` defined inline via `registerHeroSearch()` (L239–667). Octagonal SVG path `octagonPath()` (L224). viewBox `0 0 768 81.5`, height `75`. | Registered via `registerHeroSearch()` imported from `./HeroSearchElement`. Same octagon path, same viewBox/height. | ✅ |
| 1.2 | Shadow DOM clip-path + `hs-theme-fill` gradient + `hs-amberGlow` + `hs-brainGrad` defs (L280–300). | Same Shadow DOM structure in `HeroSearchElement.ts`. Gradient stop ids match (`#hs-amberGlow`, `#hs-brainGrad`) — relied on by `HeroSearchHost` L321–335. | ✅ |
| 1.3 | Typewriter: cycles unused suggestions, `_typeNext()` with 50ms/char + 4500ms hold + 200ms gap (L638–656). `_hoverPaused` pauses on hover; `_completedQuery` keeps completed text. | Identical typewriter logic lives in `HeroSearchElement.ts` (same web component). Driven by `setSuggestions(unusedTexts)` from `HeroSearchHost` L296, L315–317, L390. | ✅ |
| 1.4 | Suggestions owned by PARENT component. `HeroSearchHost` receives `suggestions` + `allSuggestions` + `onSuggestionClick` + `onGenerateMore` + `canGenerateMoreFlag` as props (L768–787). Cache key `motherbrain_preview_hero_suggestions`, 24-item cap (L675–676). | `HeroSearchHost` owns the cache itself via `./suggestion-cache` (`getAllSuggestions`, `fetchSuggestions`, `markSuggestionUsed`, `canGenerateMore`). State `allSuggestions` (L129), `generating` (L132). Same 24-item cap. | ⚠️ Intentional — bundle is self-contained so a website doesn't have to wire the cache. Functionally equivalent. |
| 1.5 | Dropdown: opens on `pointerdown` (not focus), closes on blur with 200ms delay, filters as user types (L887–908). | Identical wiring (L337–359): `pointerdown` open, `blur` 200ms close, `input` filter. | ✅ |
| 1.6 | Dropdown row: flex, gap 10, `borderRadius 8`, padding `10px 12px`, fontSize 13, opacity 0.35 when used, ✓ badge in neonGreen (L1003–1050). | `rowStyle` / `usedRowStyle` / `usedBadgeStyle` (L546–582) match exactly. Hover bg added via `.mb-sugg-row:hover` (L474–475). | ✅ |
| 1.7 | "Generate new suggestions" row: borderTop, neonGreen, fontWeight 600, `↻ Generate new suggestions` / pulsing dot + `Generating…` (L1053–1098). Hidden past 24-item cap (`canGenerateMoreFlag`). | `generateRowStyle` (L584–592) + `thinkingDotStyle` (L536–544) match. `canGenerateMore()` gate (L422). | ✅ |
| 1.8 | Auto-refill when all suggestions used (L1755–1773): `lastAutoTotalRef` guard prevents infinite loop on fetch failure. | Identical effect (L253–269) with `lastAutoTotalRef`. | ✅ |
| 1.9 | Host container: `position relative`, `minHeight 400`, flex column center, `backgroundColor T.deepVoid`, padding 24, fontFamily T.font (L940–954). | `hostStyle` (L484–497) identical. | ✅ |
| 1.10 | Agent description above search: fontSize 12, textMuted, marginBottom 24, maxWidth 480, lineHeight 1.5 (L957–968). | `descriptionStyle` (L499–506) identical. | ✅ |
| 1.11 | Branding below search: absolute-positioned bottom 16, fontSize 10, textMuted, letterSpacing 0.05em (L1178–1189). Shows `<BrainIcon>` + text. | `brandingStyle` (L647–652) uses `marginTop 20` (NOT absolute bottom 16), fontSize 11, opacity 0.7, with `<BrainIcon size={12}>` inline (L460–468). | ⚠️ Minor — Preview pins branding to the bottom of the hero container; bundle flows it after the continue button. Visually close but not pixel-identical. |
| 1.12 | Stroke + brain gradient colors applied to Shadow DOM stops `#hs-amberGlow` / `#hs-brainGrad` (L868–885). Defaults `#00dc82` / `#a78bfa` from settings (L52–53). | Same Shadow DOM manipulation (L318–335). Props `gradientColor1` / `gradientColor2` default `#00dc82` / `#a78bfa` (L98–99). | ✅ |

---

## 2. Chat UI (open conversation overlay)

Header, message list, working indicator, input + send button, branding.

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`ChatApp.tsx`) | Status |
|---|---|---|---|
| 2.1 | Overlay container: `position relative`, width/height 100%, minHeight 500, flex column, `backgroundColor T.deepVoid`, fontFamily T.font, color T.text (L1959–1971). | Container uses `position fixed`, `inset 0`, zIndex 2147483647 (L617–626). Same colors/font. | ⚠️ Intentional — Preview is relative (renders inside the settings panel); bundle is `position: fixed` fullscreen so it overlays the whole website. Required for the drop-in widget contract. |
| 2.2 | Header: flex space-between, borderBottom neuralNode, padding `12px 20px` (L1974–1982). | Identical (L629–637). | ✅ |
| 2.3 | Header left: `<BrainIcon size={28}>` + agent name (toUpperCase, fontSize 16, bold, neonGreen, letterSpacing 0.05em) + subtitle **`"online"`** (L1984–1998). | Same layout (L639–655) but subtitle is **`sending ? "thinking..." : agentDescription`** — NOT `"online"` and NOT static. | ❌ **Divergence.** Preview shows a static `"online"` status; bundle shows a dynamic `sending`/`agentDescription` subtitle. Decide which is canonical and align. |
| 2.4 | Header right: minimize `<Minimize2 size={18}>` → `setMode("bar")`; close `<X size={18}>` → `setMode("hero")` (L2000–2024). | Minimize `<MinimizeIcon size={18}>` → `onMinimize?.() ?? setMinimized(true)` (L658–679). Close button renders `✕` text character (NOT SVG) only when `onClose` provided (L680–695). | ❌ **Close icon divergence** — see §6.2. Behavior: bundle honors parent `onMinimize`/`onClose`; preview manages mode internally. |
| 2.5 | Messages scroll container: `flex 1`, `overflowY auto`, padding `16px 20px`, `onScroll={handleScroll}` for infinite scroll + **auto-scroll release** (L2029–2032, L1424–1437). Inner list maxWidth 780, gap 16 (L2034–2041). | Same container (L700–712) but **NO `onScroll` / infinite scroll**. **Auto-scroll release mechanism added** (L215–246): `autoScrollRef` tracks distance from bottom (< 80px = on), scroll listener disables auto-scroll when user scrolls up, re-enables on new message (`messages.length` increase). | ⚠️ Bundle has no "load more history" on scroll. **Scroll release mechanism is now PARITY** ✅ — both stop fighting the user on scroll-up and re-enable on new messages. Infinite-scroll history loading still Preview-only (lower priority). |
| 2.6 | Message bubble: maxWidth 80%, border (user `hotPink+30` / agent `neonGreen+15`), bg (user `hotPink+10` / agent `darkMatter`), padding `12px 14px`, fontSize 13, lineHeight 1.6 (L2051–2062). | Identical (L721–732). | ✅ |
| 2.7 | Agent byline: `<BrainIcon size={12}>` + agent name uppercased, fontSize 10, neonGreen, letterSpacing 0.05em, marginBottom 6 (L2064–2079). | Identical (L734–749). | ✅ |
| 2.8 | Working/thinking indicator: `<Loader2 size={12} className="animate-spin">` (lucide-react) + label `msg.thinking ?? "Thinking..."`, fontSize 12, textMuted (L2083–2100). | CSS spinner div: 12×12, `border 2px solid neonGreen`, `borderTopColor transparent`, `animation: spin 0.8s linear infinite` (L753–776). | ⚠️ Same visual intent (spinning ring), different implementation. Preview relies on Tailwind `animate-spin` + lucide; bundle uses raw CSS keyframes (no Tailwind/lucide available). Acceptable. |
| 2.9 | **Typewriter removed (v1.1.50).** AI response text now appears instantly — `streamText` sets full text + `isStreaming=false` in one shot (L1447–1455). Streaming cursor `▌` only shows during `streamToolCalls` (when text is still empty). | **Identical (v1.1.50).** `streamText` sets full text immediately (L284–292). No `speed=12` typewriter loop. | ✅ **Parity** — both files have the same instant-reveal `streamText`. Previous `speed=12` (12ms/char, multi-minute delays) is gone. |
| 2.10 | Tool call `<details>`: ⟡ glyph + neonGreen name + muted args; "Result:" label in bloodOrange; `<pre>` result (L2103–2189). | Identical markup and colors (L779–865). | ✅ |
| 2.11 | User message: plain text, `whiteSpace pre-wrap`, `wordBreak break-word` (L2193–2201). | Identical (L869–877). | ✅ |
| 2.12 | Timestamp: fontSize 9, textMuted, marginTop 6, right-aligned for user / left for agent (L2223–2232). | Identical (L904–913). | ✅ |
| 2.13 | Input form: maxWidth 780, gap 10. Input bg darkMatter, border neuralNode → neonGreen+60 on focus, padding `12px 14px`, fontSize 13, fontFamily T.font (L2248–2286). Placeholder `sending ? "Mother is thinking..." : "Ask Mother anything..."`. | Identical input + placeholder (L929–967). | ✅ |
| 2.14 | Send button: 44×44, border `sending ? electricCyan : neonGreen`, bg `+10`, disabled opacity 0.3, `⏎` glyph when idle. Sending state shows `<Loader2 size={16} className="animate-spin">` (L2287–2310). | Same 44×44 / colors / `⏎` glyph (L968–1001). Sending state uses CSS spinner div (16×16) instead of `<Loader2>`. | ⚠️ Same as §2.8 — lucide vs CSS spinner. |
| 2.15 | Branding under input: centered, fontSize 10, textMuted, marginTop 8, letterSpacing 0.05em, shows `cfg.widgetBranding` (L2312–2322). | Identical, shows `branding` prop (L1003–1013). | ✅ |

---

## 3. Continue Paused Conversation Button

Shown on the hero/bar screen when `messageCount > 0`.

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`HeroSearchHost.tsx`) | Status |
|---|---|---|---|
| 3.1 | Rendered when `onOpenChat && messageCount > 0` (L1106). | `onOpenChat && realMessageCount > 0` (L444). `realMessageCount` falls back to prop when DB count unavailable (L195–196). | ✅ |
| 3.2 | Message count: `messages.length` from the parent's loaded history (L1818). | Fetches REAL count from `visitor/history` JSON-RPC in-component (L147–192), falls back to `messageCount` prop. | ✅ Bundle actually improves on this — it doesn't trust the parent's count. |
| 3.3 | Icon: **`<Maximize2 size={16} color={T.neonGreen}>`** (lucide-react) inside a 36×36 rounded box, bg `neonGreen+1a` (L1126–1139). | **`<MaximizeIcon size={16}>`** inline SVG (polyline `15 3 21 3 21 9` / `9 21 3 21 3 15` + 2 lines) inside the same 36×36 box, color neonGreen (L446–448, L613–623). SVG paths are the exact lucide `Maximize2` paths. | ✅ Fixed in Task 6 era — bundle no longer uses `<BrainIcon>` here. |
| 3.4 | Title "Continue paused conversation": fontSize 13, bold, text, marginBottom 2 (L1141–1150). | `continueTitleStyle` (L625–630) identical. | ✅ |
| 3.5 | Last message preview: **plain text** `{lastMessagePreview}` — cleaned via `.replace(/^\s*-{3,}\s*\n?/, "").replace(/\*\*/g, "").slice(0, 100)` in the parent (L1819–1825), rendered in a `whiteSpace: nowrap` + `overflow: hidden` + `textOverflow: ellipsis` div (L1151–1163). | `realLastMessagePreview` cleaned the SAME way (L177–182, L201–207 in `ChatWidget.tsx`), rendered plain in `continuePreviewStyle` (`whiteSpace: nowrap`, `overflow: hidden`, `textOverflow: ellipsis`) (L632–638, L451–453). | ✅ Both use PLAIN TEXT here (not markdown) — correct parity. |
| 3.6 | Count badge `"{messageCount} msgs"`: fontSize 10, textMuted, flexShrink 0, nowrap (L1165–1174). | `continueCountStyle` (L640–645) identical; shows `realMessageCount`. | ✅ |
| 3.7 | Button shell: marginTop 20, width 100%, maxWidth 480, bg darkMatter, border `neonGreen+33`, borderRadius 12, padding `14px 18px`, transition (L1107–1124). | `continueBtnStyle` (L596–611) identical. | ✅ |
| 3.8 | Preview cleaning strips `**` before passing to plain-text render. Bundle strips `**` the same way (L180). | ✅ Matches. **Do NOT** route this through `renderMarkdown` — the `nowrap` container would clip the resulting `<p>` block. | ⚠️ Documented guardrail — both sides currently do the right thing. |

---

## 4. Bar Mode (minimized state at bottom)

Collapsed bar shown when the chat is minimized but not closed.

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`ChatWidget.tsx` bar branch + `ChatApp.tsx` minimized branch) | Status |
|---|---|---|---|
| 4.1 | Fixed bar: `position fixed`, bottom/left/right 0, width 100%, zIndex 1000, borderTop `neonGreen+40`, bg `deepVoid+f5`, `backdropFilter blur(12)`, fontFamily T.font (L1873–1885). | `ChatWidget.tsx` bar branch (L265–278) matches **except zIndex 1000**. `ChatApp.tsx` minimized branch (L520–534) uses **zIndex 2147483647** and matches the rest. | ⚠️ zIndex mismatch between the two bundle code paths. Preview uses 1000. Low impact (both stack above page content). |
| 4.2 | Inner row: maxWidth 960, margin auto, flex, gap 12, padding `12px 20px` (L1887–1895). | Both bundle paths match (L280–288, L536–544). | ✅ |
| 4.3 | Brain icon `<BrainIcon size={24} logoUrl={cfg.logoUrl}>` (L1898). | Both paths: `<BrainIcon size={24} logoUrl={logoUrl}>` (L290, L546). | ✅ |
| 4.4 | Preview text: click expands, flex 1, fontSize 13, neonGreen, nowrap, ellipsis, maxHeight 20 (L1900–1913). Content is **`<FastMarkdown content={barPreviewRaw} variant="chat">`** (L1921). | `ChatWidget.tsx` uses **plain text** `{lastMessagePreview ?? "Continue chat with {agentName}…"}` (L313). `ChatApp.tsx` minimized branch uses **`renderMarkdown(...)` via `dangerouslySetInnerHTML`** (L513, L568). | ⚠️ Three different rendering strategies across the codebase. See §7. Preview = FastMarkdown; ChatWidget bar = plain text; ChatApp minimized = renderMarkdown. |
| 4.5 | Expand button: `<Maximize2 size={16}>` → `setMode("overlay")` (L1924–1937). | `ChatWidget.tsx` `<MaximizeIcon size={16}>` → `handleOpenChat` = `setMode("overlay")` (L317–333). `ChatApp.tsx` → `setMinimized(false)` (L572–588). | ✅ Icon + behavior match. |
| 4.6 | Close button: `<X size={16}>` → **`setMode("overlay")`** (L1938–1951). i.e. close re-OPENS the overlay. | `ChatWidget.tsx` `<CloseIcon size={16}>` → `handleClose` = **`setMode("hero")`** (L220, L335–351). `ChatApp.tsx` → `setMinimized(false); onClose?.()` (L590–609). | ❌ **Behavior divergence.** Preview's bar "close" returns to overlay; bundle's bar "close" returns to hero (full reset). Confirm intended semantics and align. |
| 4.7 | `barPreviewRaw` = last **agent** message text, leading `---` stripped, slice 200 (L1802–1805). | `ChatWidget.lastMessagePreview` = last message of ANY role, `---` + `**` stripped, slice 100 (L201–208). `ChatApp.barPreview` = last message of any role, `---` + `**` stripped, then `renderMarkdown` (L511–517). | ⚠️ Preview specifically previews the last AGENT message; bundle previews the last message of any role (could be the user's own). Minor. |

---

## 5. State Flows (hero → overlay → bar → close)

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`ChatWidget.tsx` + `ChatApp.tsx`) | Status |
|---|---|---|---|
| 5.1 | `mode: "overlay" \| "bar" \| "hero"`, default `"hero"` (L1199). | `ChatWidget`: `WidgetMode = "hero" \| "bar" \| "overlay"`, default `"hero"` (L70, L160). | ✅ |
| 5.2 | Hero submit → set input, `setMode("overlay")`, send (preserves `currentTaskId`, L1296–1300). | `handleHeroSubmit` → `setInitialQuery` + `setMode("overlay")` (L211–216). `ChatApp` auto-sends `initialQuery` once via `initialQuerySentRef` guard (L490–497). | ✅ Bundle's ref-guard fixes the duplicate-send bug; preview's task preservation is server-side. |
| 5.3 | Overlay minimize → `setMode("bar")` (L2002). | `ChatWidget.handleMinimize` → `setMode("bar")` (L219). `ChatApp` honors `onMinimize` prop else falls back to internal `setMinimized(true)` (L659–664). | ✅ |
| 5.4 | Overlay close → `setMode("hero")` (L2014). | `ChatWidget.handleClose` → `setMode("hero")` (L220). `ChatApp` → `onClose?.()` (L680–695). | ✅ |
| 5.5 | Bar expand → `setMode("overlay")` (L1901, L1926). | `ChatWidget.handleOpenChat` → `setMode("overlay")` (L218). | ✅ |
| 5.6 | Bar close → **`setMode("overlay")`** (L1940). | `ChatWidget` bar close → `setMode("hero")` (L220). | ❌ See §4.6. |
| 5.7 | — (no internal minimized state) | `ChatApp` has a `minimized` local state (L207) used ONLY when no `onMinimize` prop is passed (L510–613). `ChatWidget` always passes `onMinimize`, so this path is dormant when used via `ChatWidget`. | ⚠️ Bundle-only fallback for standalone `ChatApp` usage (not via `ChatWidget`). Intentional. |

---

## 6. Icons

The bundle has **no `lucide-react` dependency**. All icons must be inline SVG matching lucide paths exactly.

| # | Preview (`A2aChatPreview.tsx`) | Bundle | Status |
|---|---|---|---|
| 6.1 | `<BrainIcon>` imported from `../frontend/components/svg/BrainIcon` (L12). Used at sizes 12, 24, 28. Honors `logoUrl`. | `./BrainIcon.tsx` — bundled copy, same props (`size`, `logoUrl`). Used at 12, 24, 28. | ✅ |
| 6.2 | `<Maximize2>` (lucide) — used in continue button (L1138) and bar expand (L1936). | `MaximizeIcon` inline SVG in `HeroSearchHost.tsx` (L29–46), `ChatApp.tsx` (L47–64), `ChatWidget.tsx` (L34–51). Paths: `polyline 15 3 21 3 21 9` / `polyline 9 21 3 21 3 15` / `line 21,3 → 14,10` / `line 3,21 → 10,14` — exact lucide `Maximize2`. | ✅ |
| 6.3 | `<Minimize2>` (lucide) — overlay header minimize (L2011). Paths: `polyline 4 14 10 14 10 20` / `polyline 20 10 14 10 14 4` / `line 14,10 → 21,3` / `line 3,21 → 10,14`. | `MinimizeIcon` inline SVG in `ChatApp.tsx` (L28–45). Same paths. | ✅ |
| 6.4 | `<X>` (lucide) — overlay header close (L2023) and bar close (L1950). Paths: `line 18,6 → 6,18` / `line 6,6 → 18,18`. | `CloseIcon` inline SVG in `ChatWidget.tsx` (L53–68) — used in bar close. `ChatApp.tsx` overlay close renders the **`✕` Unicode character** (L693), NOT an SVG. | ❌ **`ChatApp.tsx` overlay close button is inconsistent** — uses a text glyph instead of the `CloseIcon` SVG that already exists in the same file's icon set. Replace `✕` with `<CloseIcon size={18}>` for visual parity with the Preview's `<X>`. |
| 6.5 | `<Loader2 className="animate-spin">` (lucide) — thinking indicator (L2092) + send button (L2306). | Replaced with CSS spinner divs (border ring + `animation: spin 0.8s linear infinite`) at L762–772 and L987–997. | ⚠️ Acceptable substitute (bundle can't use lucide/Tailwind). Visual parity is close. |

---

## 7. Markdown Rendering

> **IMPORTANT CORRECTION to the prior assumption:** the Preview does **NOT** use `renderMarkdown`. It uses the **`FastMarkdown` React component** (`../../../components/FastMarkdown`). The bundle uses the **`renderMarkdown()` string→HTML function** (`./markdown.ts`) via `dangerouslySetInnerHTML`. These are two different implementations and must be reconciled.

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`ChatApp.tsx` + `markdown.ts`) | Status |
|---|---|---|---|
| 7.1 | Import: `FastMarkdown from "../../../components/FastMarkdown"` (L13). | Import: `renderMarkdown from "./markdown"` (L3). | ❌ Different engines. `FastMarkdown` is a React component (likely sanitizes + renders React elements, supports `variant="chat"`). `renderMarkdown` is a regex-based string→HTML converter with its own `sanitizeHtml`. |
| 7.2 | Agent message body: `<FastMarkdown content={msg.text} variant="chat" />` (L2220). **Now renders immediately on text arrival** (v1.1.50 — typewriter removed, `isStreaming=false` set instantly). | `<div className="mb-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />` (L896–901). **Now renders immediately** (v1.1.50 — same instant `isStreaming=false`). | ❌ Different engines (FastMarkdown vs renderMarkdown), BUT **both now render markdown instantly** — no more waiting for typewriter to finish. Real-time markdown achieved by removing the typewriter delay. |
| 7.3 | Bar preview: `<FastMarkdown content={barPreviewRaw} variant="chat" />` (L1921) — inside a `nowrap` + `overflow hidden` container. | `ChatApp` minimized bar: `renderMarkdown(...)` via `dangerouslySetInnerHTML` (L513, L568). `ChatWidget` bar: plain text (L313). | ❌ Three strategies. The `renderMarkdown` output wraps in `<p>` (markdown.ts L142) which gets clipped by the `nowrap` container — known invisibility risk. |
| 7.4 | User message: plain text, `pre-wrap` (L2193–2201). | Plain text, `pre-wrap` (L869–877). | ✅ |
| 7.5 | `markdown.ts` feature set (bundle): fenced code blocks, inline code, hr, h1–h3, GFM tables, blockquotes, ul/ol, bold, italic, links, line breaks, `sanitizeHtml` (strips `<script>`, `on*`, `javascript:`, iframes/forms). | `FastMarkdown` feature set: **unverified** — lives outside this repo (`../../../components/FastMarkdown`). `variant="chat"` behavior unknown without reading that file. | ⚠️ Action: read `FastMarkdown.tsx` and produce a feature matrix vs `markdown.ts` to confirm the bundle covers every feature the preview renders. |
| 7.6 | Continue button preview: **plain text** (cleaned), NOT markdown (L1151–1163). | Plain text (cleaned) (L451–453). | ✅ Both correctly avoid markdown here. Guardrail: do NOT route through `renderMarkdown` — the `nowrap` box clips the `<p>`. |

---

## 8. Styling & Theme

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`use-theme.ts` + components) | Status |
|---|---|---|---|
| 8.1 | Dark theme `T_DARK` (L68–79): deepVoid `#0a0a0f`, darkMatter `#13131f`, neuralNode `#1e1e2d`, neonGreen `#39ff14`, hotPink `#ff3d7f`, bloodOrange `#ff5500`, electricCyan `#38bdf8`, text `#e2e8f0`, textMuted `#64748b`, font `Departure Mono, JetBrains Mono, Courier New, monospace`. | `use-theme.ts` `T_DARK` (L17–28) — **byte-for-byte identical**. | ✅ |
| 8.2 | Light theme `T_LIGHT` (L83–94): deepVoid `#f9fafb`, darkMatter `#ffffff`, neuralNode `#e5e7eb`, neonGreen `#059669`, hotPink `#db2777`, bloodOrange `#ea580c`, electricCyan `#0284c7`, text `#111827`, textMuted `#6b7280`. | `use-theme.ts` `T_LIGHT` (L31–42) — **byte-for-byte identical**. | ✅ |
| 8.3 | Theme detection: `document.body.classList.contains("light")` **OR** `prefers-color-scheme: light`. MutationObserver on body `class` + matchMedia listener (L1224–1262). `const T = isLightMode ? T_LIGHT : T_DARK` (L1265). | `useTheme()` uses **`prefers-color-scheme: light` ONLY** via matchMedia (use-theme.ts L50–64). No `document.body` check (bundle runs on external sites). | ⚠️ Intentional — bundle cannot read the MB app's body class. Red Mode on motherbrain.app is treated as Dark (not separately handled). |
| 8.4 | Color usage: agent borders `neonGreen+15`, user borders `hotPink+30`, agent header `neonGreen`, send button `electricCyan` while sending. | Same hex+alpha usage across all three bundle components. | ✅ |
| 8.5 | Font: `Departure Mono` primary. Preview inherits the MB app's webfont load. | Bundle references the same font stack but **does NOT bundle/Load the webfont** — if the host site hasn't loaded `Departure Mono`, it falls back to `JetBrains Mono` → `Courier New` → `monospace`. | ⚠️ Expected — bundle is a drop-in; can't ship licensed fonts. Confirm the website loads `Departure Mono` for true parity. |
| 8.6 | Animations: `spin` (send/thinking), `pulse` (streaming cursor `▌`), `mb-thinking-pulse` (suggestion generating dot). Preview relies on Tailwind `animate-spin` for `<Loader2>`. | Bundle defines `@keyframes spin`, `@keyframes pulse` in a `<style>` tag (ChatApp L1017–1037) and `@keyframes mb-thinking-pulse` (HeroSearchHost L472–476). No Tailwind dependency. | ✅ |
| 8.7 | Markdown CSS: agent message markdown is styled by `FastMarkdown`'s own styles + global CSS. | Bundle injects `.mb-markdown` CSS block (ChatApp L1020–1036): h1/h2/h3 neonGreen, strong neonGreen, links electricCyan, code blocks deepVoid bg, tables, blockquotes. | ⚠️ See §7 — different engine, but the bundle's markdown CSS is self-contained and theme-aware. |

---

## 9. Visitor ID System (intentionally DIFFERENT)

| # | Preview (`A2aChatPreview.tsx`) | Bundle (`visitor-identity.ts`) | Status |
|---|---|---|---|
| 9.1 | localStorage key: **`motherbrain_preview_visitor_id`** (L100). | localStorage keys: **`motherbrain_visitor_id`** (primary, shared with website) + **`motherbrain_widget_visitor_id`** (legacy/migration) (L13–14). | ⚠️ Intentional — preview must NOT pollute the real website visitor ID. |
| 9.2 | Generator: `preview-${Date.now()}-${random}` (L108). Synchronous `getOrCreateVisitorId()` (L104–114). | Generator: **Broprint.js** `getCurrentBrowserFingerPrint()` → `vid_${fingerprint}` (L59–63). Async `getVisitorId()`. Fallback chain: Broprint → `crypto.randomUUID()` → `Date.now()+random` (L64–79). | ⚠️ Intentional — bundle fingerprinting gives a stable cross-session identity for real visitors; preview just needs a throwaway id. |
| 9.3 | Task ID persisted at **`motherbrain_preview_task_id`** (L203, L210). | No task-id persistence in `visitor-identity.ts`. (`motherbrain_task_id` seen in the user's browser localStorage comes from the website, not this bundle.) | ⚠️ Preview-only. Not a parity gap — task continuity is handled server-side via `visitor_id`. |
| 9.4 | Resolved synchronously at module init: `useRef(getOrCreateVisitorId())` (L1217). | Resolved async on mount: `getVisitorId()` awaited in useEffect (ChatApp L236–257, ChatWidget L171–197). `visitorIdRef.current` is null until resolved; `handleSend` awaits it (ChatApp L334–336). | ⚠️ Intentional — Broprint.js is async (canvas/audio fingerprinting). |
| 9.5 | Suggestion cache key: `motherbrain_preview_hero_suggestions` (L675). | Suggestion cache lives in `./suggestion-cache.ts` (separate file). Key namespace is separate from preview. | ⚠️ Intentional — preview and website must not share suggestion state. |

---

## 10. Event Handlers

| # | Preview (`A2aChatPreview.tsx`) | Bundle | Status |
|---|---|---|---|
| 10.1 | `handleSend(text?)` (overlay): adds user msg + working msg, POSTs `message/send` with `metadata.visitor_id`, parses `task.history` (last agent parts) + `artifacts[].metadata.toolCalls`, streams text + tool calls, handles errors (L326–485 equivalent in preview). | `ChatApp.handleSend` (L326–485) — same shape, same JSON-RPC `message/send`, same `task.history` + `artifacts` parsing, same streaming. Race-condition guard on history load (L247–251). | ✅ |
| 10.2 | `handleHeroSubmit(query)` → set input, `setMode("overlay")`, preserve `currentTaskId` (L1296–1300). | `ChatWidget.handleHeroSubmit` → `setInitialQuery` + `setMode("overlay")` (L211–216). `ChatApp` auto-sends `initialQuery` once (ref-guarded, L490–497). | ✅ |
| 10.3 | `handleKeyDown`: Enter (no shift) → send (L2261–2266 region). | `ChatApp.handleKeyDown` identical (L499–504). | ✅ |
| 10.4 | Suggestion click (dropdown): `onSuggestionClick` → mark used, refresh, submit (preview wires via parent). | `HeroSearchHost.handleSuggestionClick` → `markSuggestionUsed` + `refreshList` + `onSubmit` (L272–279). | ✅ |
| 10.5 | Hero web component submit (`hero-search-submit` event): if `onSuggestionClick` wired → route through it (so prompt dims), else `onSubmit` directly (L847–857). | `HeroSearchHost` mount effect always calls `markSuggestionUsed(detail.query)` + `refreshList` + `onSubmit(detail.query)` (L300–308). | ⚠️ Bundle always marks-used on hero submit; preview only marks-used when the dropdown is wired. Minor — bundle behavior is more consistent. |
| 10.6 | Minimize click → `setMode("bar")` (L2002). | `ChatWidget.handleMinimize` → `setMode("bar")` (L219). | ✅ |
| 10.7 | Close click (overlay) → `setMode("hero")` (L2014). | `ChatWidget.handleClose` → `setMode("hero")` (L220). | ✅ |
| 10.8 | Close click (bar) → `setMode("overlay")` (L1940). | `ChatWidget` bar close → `setMode("hero")` (L220). | ❌ See §4.6 / §5.6. |
| 10.9 | Expand click (bar) → `setMode("overlay")` (L1901, L1926). | `ChatWidget.handleOpenChat` → `setMode("overlay")` (L218). | ✅ |
| 10.10 | Continue button click → `onOpenChat()` = `setMode("overlay")` (L1108, L1817). | `HeroSearchHost` continue → `onOpenChat` prop = `ChatWidget.handleOpenChat` → `setMode("overlay")` (L445, L218). | ✅ |

---

## Known Intentional Differences (summary)

These are by design and should NOT be "fixed" without explicit approval:

1. **Visitor ID** (§9): Preview uses `motherbrain_preview_visitor_id` (sync, throwaway). Bundle uses Broprint.js → `motherbrain_visitor_id` (async, fingerprinted, shared with website).
2. **Theme detection** (§8.3): Preview reads MB app `document.body.classList` + `prefers-color-scheme`. Bundle reads `prefers-color-scheme` only (can't access host app's body class reliably).
3. **Overlay positioning** (§2.1): Preview is `position: relative` (in-panel). Bundle is `position: fixed` fullscreen (drop-in widget contract).
4. **Suggestion cache ownership** (§1.4): Preview's `HeroSearchHost` receives suggestions as props; bundle's `HeroSearchHost` owns the cache itself (self-contained).
5. **Icons** (§6): Bundle has no `lucide-react`/Tailwind. All icons are inline SVG matching lucide paths; spinners are CSS rings instead of `<Loader2 className="animate-spin">`.
6. **Endpoint** (implicit): Preview targets `cfg.agentUrl || "https://a2a.motherbrain.app"` (L1198). Bundle uses whatever `endpoint` prop is passed (`ChatWidget`/`ChatApp`/`HeroSearchHost` all take `endpoint`).
7. **Font loading** (§8.5): Bundle references `Departure Mono` but does not ship it; relies on the host site.

---

## Action Items (must fix before next export)

| Priority | Item | Section | File |
|---|---|---|---|
| ✅ Done v1.1.50 | **Typewriter removed.** Both Preview and Bundle now show AI responses instantly (no 12ms/char delay). `streamText` sets full text + `isStreaming=false` immediately. Markdown renders right away. | §2.9, §7.2 | `A2aChatPreview.tsx` L1447, `ChatApp.tsx` L284 |
| ✅ Done v1.1.50 | **Scroll release mechanism.** Both files now track scroll position via `autoScrollRef`. When user scrolls up > 80px from bottom, auto-scroll stops. Re-enabled on new message (`messages.length` increase). Preview also resets on mode change. | §2.5 | `A2aChatPreview.tsx` L1268–1305, L1424–1437; `ChatApp.tsx` L215–246 |
| ✅ Done v1.1.50 | **Real-time markdown rendering.** Achieved by removing the typewriter — text arrives complete, `isStreaming=false` immediately, so the markdown branch (not the plain-text-with-cursor branch) renders instantly. | §7.2 | Both files |
| 🔴 High | **Markdown engine mismatch.** Preview uses `FastMarkdown` (React component); bundle uses `renderMarkdown` (regex → HTML via `dangerouslySetInnerHTML`). Read `../../../components/FastMarkdown.tsx`, build a feature matrix vs `markdown.ts`, and decide: (a) port `FastMarkdown` into the bundle, or (b) confirm `renderMarkdown` covers every feature `FastMarkdown` exposes for `variant="chat"`. | §7.1, §7.2 | `widget-build/src/markdown.ts`, `widget-build/src/ChatApp.tsx` |
| 🔴 High | **`ChatApp` overlay close button uses `✕` text glyph** instead of the `CloseIcon` SVG that already exists in the same file. Replace with `<CloseIcon size={18}>` for parity with the Preview's `<X>` and the bundle's own bar close button. | §2.4, §6.4 | `widget-build/src/ChatApp.tsx` L680–695 |
| 🟡 Medium | **Overlay header subtitle.** Preview shows static `"online"`; bundle shows `sending ? "thinking..." : agentDescription`. Pick the canonical behavior. | §2.3 | `widget-build/src/ChatApp.tsx` L652–654 |
| 🟡 Medium | **Bar close behavior.** Preview's bar close → `setMode("overlay")`; bundle's bar close → `setMode("hero")` (full reset). Confirm intended semantics. | §4.6, §5.6, §10.8 | `widget-build/src/ChatWidget.tsx` L220 |
| 🟡 Medium | **Bar preview rendering is inconsistent** across three code paths: Preview=`FastMarkdown`, `ChatWidget`=plain text, `ChatApp` minimized=`renderMarkdown` (clipped by `nowrap`). Standardize on ONE strategy. | §4.4, §7.3 | `ChatWidget.tsx` L313, `ChatApp.tsx` L513 |
| 🟢 Low | **zIndex mismatch** in bar mode: Preview=1000, `ChatWidget`=1000, `ChatApp` minimized=2147483647. Align to one value. | §4.1 | `ChatApp.tsx` L528 |
| 🟢 Low | **Bar preview source.** Preview previews the last AGENT message; bundle previews the last message of any role. | §4.7 | `ChatWidget.tsx` L201–208 |
| 🟢 Low | **No infinite-scroll history loading** in the bundle (Preview has `handleScroll` + `hasMoreHistory` + `LOAD_MORE_LIMIT`). Initial 20-message load is shared. | §2.5 | `ChatApp.tsx` |
| 🟢 Low | **Branding position.** Preview pins branding to the hero container bottom; bundle flows it after the continue button. | §1.11 | `HeroSearchHost.tsx` L647–652 |

---

## Verification Procedure (run before every export)

1. **Diff the theme constants.** `T_DARK` / `T_LIGHT` in `A2aChatPreview.tsx` (L68–94) must equal `use-theme.ts` (L17–42) byte-for-byte.
2. **Grep for hardcoded colors.** In the bundle, every color must reference `T.*` — no literal hex outside `use-theme.ts`. (`grep -nE "#[0-9a-fA-F]{3,6}" widget-build/src/*.tsx | grep -v use-theme.ts`)
3. **Icon audit.** Confirm `MaximizeIcon`, `MinimizeIcon`, `CloseIcon`, `BrainIcon` are the ONLY icons used; confirm none are lucide-react imports; confirm `ChatApp`'s close button uses `<CloseIcon>` not `✕`.
4. **Markdown spot-check.** Render a message with: bold, italic, h2, fenced code, table, blockquote, link, ordered list, horizontal rule. Compare Preview vs bundle pixel-for-pixel.
5. **State machine walkthrough.** hero→submit→overlay→minimize→bar→expand→overlay→close→hero. Then hero→continue→overlay→minimize→bar→close (verify intended target).
6. **Visitor ID check.** In the website's localStorage: `motherbrain_visitor_id` should be set (Broprint.js), NOT `motherbrain_preview_visitor_id`.
7. **Theme toggle.** Switch device theme light↔dark; every element (hero, dropdown, continue button, chat header, bubbles, input, bar) must re-flow without a page reload.
8. **Run this checklist top-to-bottom.** Any ❌ blocks the export.
