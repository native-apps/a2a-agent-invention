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
- Does the user have website access (ability to edit HTML/JS)?

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
**Message:** "Building the Web Component bundle... This compiles the `<motherbrain-chat>` element."
**Expected:** Build completes with success confirmation

### Step 3: Download the Bundle
**Action:** Click **Download** to get `motherbrain-chat.js`
**Message:** "The bundle file `motherbrain-chat.js` has been downloaded. This is a self-contained Web Component — no framework required."

### Step 4: Add to Website
**Action:** Copy the script tag and custom element to the website HTML
**Code block:**
```html
<!-- Mother Brain Chat Widget -->
<script src="motherbrain-chat.js"></script>
<motherbrain-chat
  endpoint="https://your-agent.workers.dev"
  agent-name="Support Bot"
  theme="dark"
  primary-color="#6366f1"
></motherbrain-chat>
```
**Message:** "Paste this into your website's `<body>` tag. The chat widget renders automatically."

### Step 5: Configure Attributes
**Prompt:** "Let's configure the widget. Here are the available attributes:"
| Attribute | Required | Default | Description |
|---|---|---|---|
| `endpoint` | Yes | — | Your A2A agent endpoint URL |
| `agent-name` | No | "Mother Brain" | Name shown in the chat header |
| `theme` | No | "dark" | `"dark"` or `"light"` |
| `primary-color` | No | "#6366f1" | Accent color for buttons and header |
| `hero-search` | No | "false" | Enable Hero Search mode |
| `logo-url` | No | — | URL for a custom logo in the header |
**Action:** User fills in attributes, recipe updates the HTML snippet in real time

### Step 6: Test
**Action:** Open the website in a browser
**Verify:**
1. The chat bubble/icon appears in the corner
2. Clicking it opens the chat panel
3. Sending a message connects to the A2A endpoint and returns a response
4. Visitor ID is generated and stored in localStorage
**Expected:** Full conversation flow works end-to-end
**If failed:** See Error Handling below

### Step 7: Hero Search Setup (Optional)
**Prompt:** "Would you like to enable Hero Search? This lets visitors type a query into ANY search input on your site and press ENTER to open the chat."
**Buttons:** [Enable Hero Search] [Skip]
**If enabled:**
  - Set `hero-search="true"` on the `<motherbrain-chat>` element
  - Add the Hero Search hook to wire search inputs:
```javascript
document.querySelectorAll('input[type="search"], input[role="searchbox"]').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const chat = document.querySelector('motherbrain-chat');
      if (chat) chat.openChat(input.value);
    }
  });
});
```
**Message:** "Hero Search is active — visitors type a search, hit ENTER, and the fullscreen Chat UI opens with their query."

### Step 8: Custom Logo (Optional)
**Prompt:** "Would you like to add a custom logo to the chat header?"
**Action:** Upload a logo image and get a URL
**Action:** Set `logo-url="https://your-cdn.com/logo.png"` on the `<motherbrain-chat>` element
**Expected:** Logo appears in the chat header next to the agent name

## Completion Message
✅ **Chat Widget is live!** The `<motherbrain-chat>` Web Component is embedded on your website. Visitors can open the chat, send messages, and receive AI-powered responses from your A2A agent.

## Error Handling
- **Widget script not loading** → Check that `motherbrain-chat.js` file path is correct and the server sets proper CORS headers (`Access-Control-Allow-Origin`).
- **Chat not connecting** → Verify the `endpoint` attribute matches your live Cloudflare Worker URL. Open the browser console for network errors.
- **Visitor ID issues** → Ensure the widget script loads before any dependent scripts. Check that `localStorage` is available (not blocked by privacy extensions).
- **Theme not matching** → Verify the `theme` attribute is exactly `"dark"` or `"light"`. Remove any conflicting CSS that overrides `--mb-*` custom properties.
- **Build Widget fails** → Check the browser console for build errors. Ensure the A2A Agent invention is fully installed and the database is running.
