/**
 * content-script.js — Form detection, inline dropdown, and autofill.
 *
 * Injected into every page (MV3 content_scripts with matches: ["https://*/*"]).
 * Detects login forms, shows an inline dropdown near focused fields, and fills
 * credentials via native DOM setters (compatible with React/Vue/Angular).
 *
 * Message protocol (content-script ↔ service worker):
 *   Request:  { type: "AUTOFILL_LOOKUP", hostname: "github.com" }
 *   Response: { type: "AUTOFILL_RESULT", entries: [{id,title,username,password,url}] }
 *             { type: "AUTOFILL_RESULT", entries: [] }       // no match → silent (AC8)
 *             { type: "AUTOFILL_RESULT", locked: true }      // vault locked
 *
 * Architecture:
 *   - form-detector.js: heuristic password-field discovery + MutationObserver
 *   - url-utils.js:     hostname extraction and comparison
 *   - This file:        message relay, shadow-DOM dropdown, field filling
 */

// ---------------------------------------------------------------------------
// Service-worker relay
// ---------------------------------------------------------------------------

/**
 * Send a message to the service worker and wait for the response.
 * @param {Object} message
 * @returns {Promise<Object>}
 */
function sendToSw(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Dropdown UI (shadow DOM)
// ---------------------------------------------------------------------------

/** @type {HTMLDivElement|null} */
let dropdownHost = null;
/** @type {ShadowRoot|null} */
let dropdownRoot = null;
/** @type {HTMLInputElement|null} */
let activeField = null;
/** @type {Array<{id:number, title:string, username:string, password:string, url:string}>} */
let cachedEntries = [];

/**
 * Create the shadow-DOM dropdown container.
 * Returns existing one if already attached to the document.
 */
function getDropdownHost() {
  if (dropdownHost && dropdownHost.isConnected) {
    return dropdownHost;
  }
  removeDropdown();

  dropdownHost = document.createElement("div");
  dropdownHost.id = "__1pw_dropdown_host";
  dropdownHost.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;";
  dropdownRoot = dropdownHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .dropdown {
      position: absolute;
      min-width: 240px;
      max-width: 320px;
      max-height: 280px;
      overflow-y: auto;
      background: #1e1e2e;
      border: 1px solid #45475a;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #cdd6f4;
      padding: 4px 0;
    }
    .dropdown:empty { display: none; }
    .entry-row {
      display: flex;
      flex-direction: column;
      padding: 8px 14px;
      cursor: pointer;
      border-bottom: 1px solid #313244;
      transition: background 0.1s;
    }
    .entry-row:last-child { border-bottom: none; }
    .entry-row:hover { background: #313244; }
    .entry-row:active { background: #45475a; }
    .entry-title {
      font-weight: 600;
      font-size: 13px;
      color: #cdd6f4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .entry-username {
      font-size: 11px;
      color: #a6adc8;
      margin-top: 1px;
    }
    .no-match {
      padding: 12px 14px;
      color: #6c7086;
      font-style: italic;
      font-size: 12px;
    }
  `;
  dropdownRoot.appendChild(style);

  const list = document.createElement("div");
  list.className = "dropdown";
  dropdownRoot.appendChild(list);

  document.body.appendChild(dropdownHost);
  return dropdownHost;
}

/**
 * Render the dropdown with entries near the given field.
 * @param {HTMLInputElement} field
 * @param {Array} entries
 */
function showDropdown(field, entries) {
  cachedEntries = entries;
  activeField = field;

  if (!entries || entries.length === 0) {
    removeDropdown();
    return; // AC8: silent, no dropdown
  }

  const host = getDropdownHost();
  const list = dropdownRoot.querySelector(".dropdown");
  list.innerHTML = ""; // safe: shadow DOM, no user content in innerHTML context
  // (entries are decrypted server-side — title/username are sanitised by backend)

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "entry-row";

    const titleEl = document.createElement("div");
    titleEl.className = "entry-title";
    titleEl.textContent = entry.title || "Untitled";

    const userEl = document.createElement("div");
    userEl.className = "entry-username";
    userEl.textContent = entry.username || "";

    row.appendChild(titleEl);
    row.appendChild(userEl);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur from closing before click registers
      fillCredentials(entry);
      removeDropdown();
    });

    list.appendChild(row);
  }

  // Position below the field
  const rect = field.getBoundingClientRect();
  host.style.top = (rect.bottom + 4 + window.scrollY) + "px";
  host.style.left = (rect.left + window.scrollX) + "px";
  host.style.width = "auto";
  host.style.height = "auto";
}

/**
 * Remove the dropdown from the DOM.
 */
function removeDropdown() {
  if (dropdownHost && dropdownHost.isConnected) {
    dropdownHost.remove();
  }
  dropdownHost = null;
  dropdownRoot = null;
  activeField = null;
  cachedEntries = [];
}

// ---------------------------------------------------------------------------
// Field filling
// ---------------------------------------------------------------------------

/**
 * Fill detected form fields with the selected credential.
 * Uses native DOM value setters + dispatched input/change events
 * to trigger framework reactivity (React, Vue, Angular).
 *
 * @param {{username:string, password:string}} credential
 */
function fillCredentials(credential) {
  const form = detectLoginForm();
  if (!form) return;

  const fields = [];

  if (form.usernameField && credential.username) {
    fields.push({ el: form.usernameField, value: credential.username });
  }
  if (form.passwordField && credential.password) {
    fields.push({ el: form.passwordField, value: credential.password });
  }

  for (const { el, value } of fields) {
    // Native setter
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    );
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }

    // Dispatch events for framework reactivity
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("focus", { bubbles: true, composed: true }));
  }

  // Clear credential from JS memory after fill
  credential = null;
}

// ---------------------------------------------------------------------------
// Form detection (delegated to form-detector.js helpers)
// ---------------------------------------------------------------------------

/**
 * Detect a login form on the current page, using the helpers from form-detector.js
 * when they are available, or falling back to a minimal inline heuristic.
 *
 * @returns {{usernameField: HTMLInputElement|null, passwordField: HTMLInputElement}|null}
 */
function detectLoginForm() {
  // Use the imported helper if available
  if (typeof FormDetector !== "undefined" && FormDetector.detectLoginForm) {
    return FormDetector.detectLoginForm();
  }
  return detectLoginFormInline();
}

/**
 * Minimal inline fallback (runs before form-detector.js loads, or if it fails).
 */
function detectLoginFormInline() {
  const passwordFields = document.querySelectorAll('input[type="password"]');
  for (const pw of passwordFields) {
    if (pw.offsetParent === null) continue; // skip hidden fields

    const form = pw.closest("form");
    const container = form || pw.parentElement;

    // Try to find username/email field near the password field
    let username = container.querySelector('input[type="email"]');
    if (!username) {
      username = container.querySelector('input[type="text"]:not([role])');
    }
    if (!username) {
      // Search by name attribute
      const candidates = container.querySelectorAll('input[type="text"], input[type="email"]');
      for (const c of candidates) {
        if (/user|email|login|username/i.test(c.name || "")) {
          username = c;
          break;
        }
      }
    }
    // If still no username found, check previous sibling
    if (!username && pw.previousElementSibling) {
      const prev = pw.previousElementSibling;
      if (prev.tagName === "INPUT" && (prev.type === "text" || prev.type === "email")) {
        username = prev;
      }
    }

    if (username) {
      return { usernameField: username, passwordField: pw };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Autofill lookup
// ---------------------------------------------------------------------------

/**
 * Query the service worker for vault entries matching the current hostname.
 * Only triggers for pages with a detected login form.
 *
 * @param {HTMLInputElement} field — the focused field
 */
async function lookupAndShow(field) {
  // Fast path: don't bother looking up non-text fields
  const t = (field.type || "").toLowerCase();
  if (t !== "text" && t !== "email" && t !== "password") return;

  // Detect a login form on the page
  const form = detectLoginForm();
  if (!form) return; // no complete login form → AC8 silent

  try {
    const hostname = window.location.hostname.replace(/^www\./, "").toLowerCase();
    const response = await sendToSw({ type: "AUTOFILL_LOOKUP", hostname });

    if (response && response.locked) {
      // Vault locked — silent (user unlocks via popup)
      return;
    }

    const entries = (response && response.entries) || [];
    showDropdown(field, entries);
  } catch (err) {
    // Network error or extension context invalidated — degrade silently
    console.debug("[1PW] Autofill lookup failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Delegated focusin: catches dynamically added fields (SPA support)
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!target || target.nodeName !== "INPUT") return;

  const t = (target.type || "").toLowerCase();
  if (t === "text" || t === "email" || t === "password") {
    lookupAndShow(target);
  }
}, true); // use capture phase for reliability

// Close dropdown on:
document.addEventListener("click", (event) => {
  if (dropdownHost && !dropdownHost.contains(event.target)) {
    removeDropdown();
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeDropdown();
  }
}, true);

// Blur with delay (allows mousedown on dropdown to register before close)
document.addEventListener("focusout", (event) => {
  if (activeField && event.target === activeField) {
    setTimeout(() => {
      // Check if focus moved to the dropdown
      if (dropdownHost && dropdownHost.contains(document.activeElement)) return;
      if (document.activeElement !== activeField) {
        removeDropdown();
      }
    }, 200);
  }
}, true);

// ---------------------------------------------------------------------------
// SPA / dynamic form support
// ---------------------------------------------------------------------------

// Observe DOM for password fields added after initial page load
const observer = new MutationObserver(() => {
  // Debounce implicitly via the focusin handler — we only react when
  // the user actually focuses a field, not on every DOM mutation.
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});

// Initial scan for already-focused fields (e.g. page loaded with autofocus)
if (document.readyState === "complete" || document.readyState === "interactive") {
  const active = document.activeElement;
  if (active && active.nodeName === "INPUT") {
    const t = (active.type || "").toLowerCase();
    if (t === "text" || t === "email" || t === "password") {
      lookupAndShow(active);
    }
  }
} else {
  document.addEventListener("DOMContentLoaded", () => {
    const active = document.activeElement;
    if (active && active.nodeName === "INPUT") {
      const t = (active.type || "").toLowerCase();
      if (t === "text" || t === "email" || t === "password") {
        lookupAndShow(active);
      }
    }
  });
}

console.log("[1PW] Content script loaded — autofill ready.");
