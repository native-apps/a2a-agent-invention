# Recipe: A2A Widget Deploy

## Trigger
- "deploy chat widget"
- "embed chat on website"
- "build the widget"
- "set up hero search"
- "add chat to my website"
- "/mother a2a widget"

## Prerequisites Check
- Is the A2A Agent invention installed and configured?
- Is the agent deployed to Cloudflare (endpoint URL is live)?
- Is the target website a React/Vite/TypeScript project? (The widget is a React component bundle)

## Steps

### Step 1: Verify Endpoint is Live
**Action:** Health check the A2A endpoint URL
**curl:**
```bash
curl -X POST {agentUrl}/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "ping"}]
      },
      "metadata": {"source": "widget-health-check"}
    },
    "id": 1
  }'
```
**Expected:** Response has `result.task.status` of `"completed"`
**If failed:** "Endpoint is not responding. Deploy the agent first, then retry."

### Step 2: Build the Widget
**Action:** Navigate to Settings → Chat UI Widget
**Button:** [Open Chat UI Widget Settings]
**Action:** Click **Build Widget**
**Message:** "Building the React component bundle... This compiles the TypeScript source files from `widget-build/src/`."
**Expected:** Build completes with success confirmation

### Step 3: Download the Bundle
**Action:** Click **Download** to get the `motherbrain-widget` bundle
**Message:** "The widget bundle has been downloaded. It contains 12 React/TypeScript source files — drop them into your React/Vite/TypeScript project."

### Step 4: Install the Dependency
**Action:** Install the only runtime dependency in the website project
```bash
npm install @rajesh896/broprint.js
```
**Message:** "This is the only runtime dependency. The bundle includes inline SVG icons, a markdown renderer, CSS-in-JS styles, and theme constants — no Tailwind, lucide-react, or react-markdown needed."

### Step 5: Add to Website
**Action:** Copy the `motherbrain-widget` bundle into the project, then add `ChatWidget` to the app root
**Code block:**
```tsx
import { ChatWidget } from "./motherbrain-widget";

function App() {
  return (
    <>
      {/* your routes / content */}
      <ChatWidget endpoint="https://your-agent.workers.dev" />
    </>
  );
}
```
**Message:** "Place `ChatWidget` OUTSIDE your router so chat state persists across page navigation. That single component manages Hero Search, the floating bottom bar, and the fullscreen chat overlay internally."

### Step 6: Component Props
**Prompt:** "The `ChatWidget` is configured via props. Here are the available options:"
| Prop | Required | Default | Description |
|---|---|---|---|
| `endpoint` | Yes | — | Your A2A agent endpoint URL |
| `logoUrl` | No | — | Custom logo image URL (defaults to the Mother Brain brain icon) |
**Note:** Theme is auto-detected from the visitor's device via `prefers-color-scheme` (dark/light) — no prop needed. Agent name comes from the Worker's Agent Card — no prop needed.
**Action:** User sets the `endpoint` prop (and optionally `logoUrl`), recipe updates the code snippet in real time

### Step 7: Test
**Action:** Open the website in a browser
**Verify:**
1. The hero search field appears with animated AI suggestion prompts
2. Typing a query and pressing ENTER opens the fullscreen chat overlay
3. Sending a message connects to the A2A endpoint and returns a response
4. Minimizing collapses the chat to a full-width bottom bar; expanding returns it to fullscreen
5. Visitor ID is generated and stored in localStorage
**Expected:** Full conversation flow works end-to-end
**If failed:** See Error Handling below

### Step 8: Hero Search (Built In)
**Message:** "Hero Search is built into `ChatWidget` by default — no separate setup needed. Visitors type a query into the hero search field and press ENTER to open the chat."
**How it works:**
- The hero search field shows AI-generated suggestion prompts (animated typewriter)
- When the visitor types their own query and hits ENTER, the fullscreen Chat UI opens with their query as the first message
- If the visitor has chatted before, a "Continue paused conversation" button appears
- When minimized, the chat collapses to a full-width bottom bar
**No action needed:** Hero Search is active by default when using `ChatWidget`.

### Step 9: Custom Logo (Optional)
**Prompt:** "Would you like to add a custom logo to the chat header?"
**Action:** Set the `logoUrl` prop on the `ChatWidget` component:
```tsx
<ChatWidget endpoint="https://your-agent.workers.dev" logoUrl="https://your-cdn.com/logo.png" />
```
**Supported formats:** SVG, PNG, JPG (uploaded files or remote URLs)
**Expected:** Logo appears in the chat header instead of the default brain icon

## Completion Message
✅ **Chat Widget is live!** The React `ChatWidget` is embedded on your website with Hero Search active. Visitors type a query, hit ENTER, and the fullscreen Chat UI opens with AI-powered responses from your A2A agent.

## Error Handling
- **Widget not rendering** → Check that the `motherbrain-widget` bundle is imported correctly and `@rajesh896/broprint.js` is installed. Open the browser console for errors.
- **Chat not connecting** → Verify the `endpoint` prop matches your live Cloudflare Worker URL. Open the browser console for network errors.
- **Visitor ID issues** → Ensure `@rajesh896/broprint.js` loads correctly. Check that `localStorage` is available (not blocked by privacy extensions).
- **Theme not matching** → The widget auto-detects theme via `prefers-color-scheme`. Verify the visitor's device theme setting. (For manual theme editing, see `use-theme.ts` in the bundle.)
- **Build Widget fails** → Check the browser console for build errors. Ensure the A2A Agent invention is fully installed and the database is running.
- **"Continue paused conversation" not appearing** → This only shows for returning visitors with an existing conversation. Test in an incognito window first (new visitor), then revisit the page after a conversation.
