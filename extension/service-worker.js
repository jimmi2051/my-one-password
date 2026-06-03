/**
 * service-worker.js — MV3 background service worker for My One Password.
 *
 * Responsibilities:
 *  - Message router for popup ↔ backend and content-script ↔ backend
 *  - Auth state machine (cookie check, vault lock status, TTL timer)
 *  - Tab-based OAuth flow when no session cookie exists
 *  - Session TTL: 30-minute sliding window enforced via chrome.alarms
 *
 * Phase 3: On SW wake, restores state from chrome.storage.local and
 * re-registers the lock-check alarm. The local TTL is advisory only;
 * a 401 response from any API call is authoritative and forces re-lock.
 */

importScripts("lib/api.js");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_KEY = "vault_state";
const ALARM_NAME = "lock-check";
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30-minute sliding window

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  initState();
  createLockAlarm();
});

/** Ensure a vault_state entry exists in storage. */
async function initState() {
  const state = await loadState();
  if (!state) {
    await saveState(emptyState());
  }
}

function emptyState() {
  return { unlocked: false, unlocked_at: null, last_activity: null };
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STATE_KEY, (r) => resolve(r[STATE_KEY] || null));
  });
}

async function saveState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STATE_KEY]: state }, resolve);
  });
}

function createLockAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.type];
  if (handler) {
    handler(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }
  console.warn("[1PW] Unknown message type:", message.type);
  sendResponse({ error: "unknown_message_type" });
});

const MESSAGE_HANDLERS = {
  UNLOCK_REQUEST: handleUnlockRequest,
  FETCH: handleFetch,
  AUTOFILL_LOOKUP: handleAutofillLookup,
  CHECK_STATUS: handleCheckStatus,
  OPEN_LOGIN: handleOpenLogin,
};

/**
 * UNLOCK_REQUEST — check whether the vault is unlocked.
 *
 * Fast path: local state says unlocked and within TTL → respond immediately.
 * Slow path: local state expired or locked → consult /auth/me.
 * If server says unlocked → update local state.
 * If not authenticated at all → respond {authenticated: false}.
 */
async function handleUnlockRequest(_message, _sender, sendResponse) {
  try {
    const state = await loadState();

    // Fast path — local state still fresh
    if (state && state.unlocked && state.last_activity) {
      const elapsed = Date.now() - new Date(state.last_activity).getTime();
      if (elapsed < LOCK_TIMEOUT_MS) {
        await updateActivity();
        sendResponse({ unlocked: true });
        return;
      }
    }

    // Slow path — consult server
    const status = await ExtensionApi.checkStatus();

    if (status.unlocked) {
      await markUnlocked();
      sendResponse({ unlocked: true });
      return;
    }

    // Not unlocked — check whether the user has a session cookie at all
    const hasCookie = await hasSessionCookie();
    await markLocked();
    sendResponse({
      unlocked: false,
      authenticated: hasCookie,
      error: status.error || "locked",
    });
  } catch (err) {
    console.error("[1PW] UNLOCK_REQUEST error:", err);
    sendResponse({ unlocked: false, authenticated: false, error: "internal" });
  }
}

/**
 * FETCH — relay a backend API call.
 *
 * Messages use {endpoint, method?, body?} and the SW attaches the session
 * cookie via credentials: "include".
 *
 * On 401 → force lock (server is authoritative).
 */
async function handleFetch(message, _sender, sendResponse) {
  try {
    const res = await ExtensionApi.apiFetch(message.endpoint, {
      method: message.method || "GET",
      body: message.body !== undefined ? JSON.stringify(message.body) : undefined,
    });

    if (res.status === 401) {
      await markLocked();
      let detail = "locked";
      try {
        const err = await res.json();
        if (err.detail) detail = err.detail;
      } catch (_) {}
      sendResponse({ error: detail, status: 401 });
      return;
    }

    if (!res.ok) {
      let detail = "Request failed";
      try {
        const err = await res.json();
        detail = err.detail || detail;
      } catch (_) {}
      sendResponse({ error: detail, status: res.status });
      return;
    }

    // Successful response — slide the TTL window
    await updateActivity();

    const data = await res.json();
    sendResponse({ data, status: res.status });
  } catch (err) {
    console.error("[1PW] FETCH error:", err);
    sendResponse({ error: "network", message: err.message });
  }
}

/**
 * AUTOFILL_LOOKUP — find entries matching a hostname.
 *
 * Used by the content-script (Phase 4) when a user focuses a password field.
 * Returns {entries: [...]} or {locked: true}.
 */
async function handleAutofillLookup(message, _sender, sendResponse) {
  try {
    console.log("[1PW SW] AUTOFILL_LOOKUP for hostname:", message.hostname);

    // Verify unlock state
    const state = await loadState();
    console.log("[1PW SW] Current state:", JSON.stringify(state));
    if (!state || !state.unlocked) {
      console.log("[1PW SW] State shows locked, checking /auth/me...");
      const status = await ExtensionApi.checkStatus();
      console.log("[1PW SW] /auth/me response:", JSON.stringify(status));
      if (!status.unlocked) {
        console.log("[1PW SW] Vault is locked — telling content script");
        sendResponse({ locked: true });
        return;
      }
      await markUnlocked();
    }

    await updateActivity();
    console.log("[1PW SW] Calling autofillLookup API...");
    const entries = await ExtensionApi.autofillLookup(message.hostname);
    console.log("[1PW SW] API returned", entries.length, "entries");
    sendResponse({ entries });
  } catch (err) {
    console.error("[1PW SW] AUTOFILL_LOOKUP error:", err);
    if (err.message === "locked") {
      await markLocked();
      sendResponse({ locked: true });
    } else {
      sendResponse({ error: "network", message: err.message });
    }
  }
}

/** CHECK_STATUS — proxy for GET /auth/me. */
async function handleCheckStatus(_message, _sender, sendResponse) {
  try {
    sendResponse(await ExtensionApi.checkStatus());
  } catch (_) {
    sendResponse({ unlocked: false, authenticated: false, error: "network" });
  }
}

/** OPEN_LOGIN — open the web app login page in a new tab. */
async function handleOpenLogin(_message, _sender, sendResponse) {
  try {
    const baseUrl = await ExtensionApi.getBaseUrl();
    await chrome.tabs.create({ url: baseUrl + "/login" });
    sendResponse({ opened: true });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Session state helpers
// ---------------------------------------------------------------------------

/** Check whether a session_token cookie exists on the backend domain. */
async function hasSessionCookie() {
  try {
    const baseUrl = await ExtensionApi.getBaseUrl();
    const cookie = await chrome.cookies.get({ url: baseUrl, name: "session_token" });
    return cookie !== null;
  } catch (_err) {
    // chrome.cookies.get may fail if host_permission for the URL is missing
    return false;
  }
}

/** Save unlocked state in storage (called after server confirms unlock). */
async function markUnlocked() {
  const now = new Date().toISOString();
  await saveState({ unlocked: true, unlocked_at: now, last_activity: now });
}

/** Save locked state in storage. */
async function markLocked() {
  await saveState(emptyState());
}

/** Slide the last_activity timestamp forward (extends the TTL window). */
async function updateActivity() {
  const state = await loadState();
  if (state && state.unlocked) {
    state.last_activity = new Date().toISOString();
    await saveState(state);
  }
}

// ---------------------------------------------------------------------------
// Alarm — lock-check (TTL enforcement)
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkLockTimeout();
  }
});

async function checkLockTimeout() {
  const state = await loadState();
  if (state && state.unlocked && state.last_activity) {
    const elapsed = Date.now() - new Date(state.last_activity).getTime();
    if (elapsed >= LOCK_TIMEOUT_MS) {
      console.log("[1PW] Auto-locking due to inactivity");
      await markLocked();
    }
  }
}

// ---------------------------------------------------------------------------
// Service-worker lifecycle
// ---------------------------------------------------------------------------

// MV3 service workers may be terminated after ~30 s of inactivity.
// On wake (activate), restore state and re-register the alarm.
// chrome.alarms persist across SW restarts, but we re-create for safety.
self.addEventListener("activate", async () => {
  const state = await loadState();
  console.log(
    "[1PW] Service worker activated, state:",
    state && state.unlocked ? "unlocked" : "locked"
  );
  createLockAlarm();
});
