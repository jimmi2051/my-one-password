# My One Password — Chrome Extension

Chrome MV3 browser extension companion for the My One Password vault. Provides inline autofill on login forms and quick vault access via a toolbar popup.

## Quick Start

### 1. Backend Configuration

Add these to `.env` (project root):

```env
SAMESITE_POLICY=none
WEBAUTHN_ORIGINS=https://your-frontend-url,chrome-extension://YOUR_EXTENSION_ID
EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

- `SAMESITE_POLICY=none` — required for cross-origin cookie auth from extension
- `WEBAUTHN_ORIGINS` — must include both your frontend URL AND your extension origin for Touch ID to work
- `EXTENSION_ORIGINS` — the extension's origin for CORS

**⚠️ HTTPS required:** When `SAMESITE_POLICY=none`, cookies require `secure=True`. Your backend must be served over HTTPS (Tailscale provides this automatically).

### 2. Get Your Extension ID

1. Load the extension unpacked from `chrome://extensions` (Developer mode ON → Load unpacked → select the `extension/` directory)
2. Copy the 32-character extension ID from the card (e.g., `abcdefghijklmnopqrstuvwxyz123456`)
3. Update your `.env`:
   ```
   WEBAUTHN_ORIGINS=https://your-frontend-url,chrome-extension://abcdefghijklmnopqrstuvwxyz123456
   EXTENSION_ORIGINS=chrome-extension://abcdefghijklmnopqrstuvwxyz123456
   ```
4. Restart the backend

### 3. For a Stable Extension ID (Development)

Add a `"key"` field to `manifest.json` to make the extension ID deterministic. Generate one:

1. Load the extension unpacked once
2. Copy the ID from `chrome://extensions`
3. Add to manifest.json:
   ```json
   {
     "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
   }
   ```
4. The ID is now stable — reload the extension

### 4. Create Test Vault Entries

In the web app, create vault entries for testing:
- **GitHub:** `https://github.com` — title: "GitHub", username: "testuser", password: "testpass"
- **Cloudflare:** `https://cloudflare.com` — title: "Cloudflare", username: "admin", password: "cfpass"
- **Google:** `https://google.com` — title: "Google", username: "user@gmail.com", password: "gpass"

> ⚠️ Use test credentials only, never real passwords.

## Architecture

```
extension/
├── manifest.json            # MV3 manifest
├── service-worker.js        # Auth state, TTL timer, API relay
├── content-script.js        # Form detection, dropdown UI, field fill
├── content-script.css       # Dropdown styles (shadow DOM)
├── popup/
│   ├── popup.html           # Popup shell
│   ├── popup.js             # Search, list, copy, unlock
│   └── popup.css            # Popup styles
└── lib/
    ├── api.js               # API client (fetch relay through SW)
    ├── form-detector.js     # Form heuristics + MutationObserver
    └── url-utils.js         # Domain extraction/matching
```

### Data Flow

```
Web Page (content script)  →  Service Worker  →  Backend API
       │                          │                    │
  detectLoginForm()        chrome.runtime         FastAPI
  AUTOFILL_LOOKUP          .sendMessage()         /api/entries/autofill
       │                          │                    │
  shadow DOM dropdown  ←  AUTOFILL_RESULT  ←  decrypted entries
  fill fields (native)
```

### Auth Flow

1. User clicks extension icon → popup sends UNLOCK_REQUEST to service worker
2. SW checks `chrome.storage.local` for unlock state + TTL
3. If locked: popup triggers WebAuthn (Touch ID) → `POST /auth/webauthn/login`
4. If unlocked: popup fetches entries via `GET /api/entries`
5. Content script sends AUTOFILL_LOOKUP → SW relays to `GET /api/entries/autofill?url=<hostname>`
6. Session TTL: 30-min sliding window, mirroring backend's VaultKeyStore TTL
7. On 401 response: extension forces lock (server is authoritative)

## Acceptance Criteria

- [ ] AC1: Autofill on GitHub, Cloudflare, Grafana login forms
- [ ] AC2: Google sign-in email fill on accounts.google.com
- [ ] AC3: Popup auto-unlock with Touch ID on icon click
- [ ] AC4: Popup search and password copy
- [ ] AC5: 30-min session persistence
- [ ] AC6: Auto-lock after 30 min idle
- [ ] AC7: Multi-tab support
- [ ] AC8: No dropdown on non-matching sites

## Permissions

| Permission | Reason |
|-----------|--------|
| `storage` | Vault unlock state persistence |
| `cookies` | Read session_token cookie for auth |
| `alarms` | 30-min TTL lock-check timer |
| `https://*/*` | Content script injection for autofill on all sites |

## Limitations (V1)

- Login forms only (no registration, password-change, or 2FA forms)
- Single account per domain
- Chrome only (latest stable)
- Companion model: web app required for account setup and entry management
- No offline support (backend must be accessible)
