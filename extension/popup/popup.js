/**
 * popup.js — Popup UI for My One Password Chrome extension.
 *
 * Responsibilities:
 *  - On load: issue UNLOCK_REQUEST to the service worker.
 *    If unlocked → fetch entries and render the vault list.
 *    If locked but authenticated → trigger WebAuthn / Touch ID unlock flow.
 *    If not authenticated → show "Sign In" button that opens the web app.
 *  - Client-side search filtering by title / username / url.
 *  - Click-to-copy via navigator.clipboard.writeText() with toast feedback.
 */

(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const DOM = {
    lockedState: $("locked-state"),
    vaultState: $("vault-state"),
    unlockContent: $("unlock-content"),
    loadingContent: $("loading-content"),
    unlockBtn: $("unlock-btn"),
    signInBtn: $("sign-in-btn"),
    unlockMessage: $("unlock-message"),
    unlockError: $("unlock-error"),
    searchInput: $("search-input"),
    entryList: $("entry-list"),
    emptyState: $("empty-state"),
    toast: $("toast"),
  };

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  /** All vault entries currently loaded (client-side search source). */
  let allEntries = [];

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    showUnlockView("Checking vault status...", false, false);

    const result = await sendMessage({ type: "UNLOCK_REQUEST" });

    if (result.unlocked) {
      showVaultView();
      await fetchEntries();
      return;
    }

    if (result.authenticated) {
      showUnlockView("Unlock to access your vault", true, false);
    } else {
      showUnlockView("Not signed in", false, true);
    }
  }

  // -----------------------------------------------------------------------
  // View helpers
  // -----------------------------------------------------------------------

  function showUnlockView(message, showUnlock, showSignIn) {
    DOM.lockedState.style.display = "flex";
    DOM.vaultState.style.display = "none";
    DOM.loadingContent.style.display = "none";
    DOM.unlockContent.style.display = "block";
    DOM.unlockMessage.textContent = message;
    DOM.unlockBtn.style.display = showUnlock ? "block" : "none";
    DOM.signInBtn.style.display = showSignIn ? "block" : "none";
    DOM.unlockError.style.display = "none";
  }

  function showLoading(message) {
    DOM.lockedState.style.display = "flex";
    DOM.vaultState.style.display = "none";
    DOM.unlockContent.style.display = "none";
    DOM.loadingContent.style.display = "block";
    DOM.loadingContent.querySelector("p").textContent = message;
  }

  function showVaultView() {
    DOM.lockedState.style.display = "none";
    DOM.vaultState.style.display = "flex";
    DOM.searchInput.focus();
  }

  // -----------------------------------------------------------------------
  // Unlock flow — Touch ID / WebAuthn
  // -----------------------------------------------------------------------

  DOM.unlockBtn.addEventListener("click", startUnlock);
  DOM.signInBtn.addEventListener("click", openLoginPage);

  async function openLoginPage() {
    await sendMessage({ type: "OPEN_LOGIN" });
    window.close();
  }

  async function startUnlock() {
    showLoading("Connecting to vault...");
    DOM.unlockError.style.display = "none";

    try {
      // Step 1 — Get WebAuthn assertion options
      const optsResult = await sendMessage({
        type: "FETCH",
        endpoint: "/auth/webauthn/login-options",
        method: "POST",
        body: {},
      });

      if (optsResult.error) {
        if (optsResult.status === 404) {
          showUnlockView(
            "Touch ID not registered. Set it up in the web app.",
            false,
            true
          );
          return;
        }
        showUnlockView(optsResult.error, true, false);
        return;
      }

      // Step 2 — Present Touch ID prompt
      showLoading("Touch ID required");
      const options = prepareAssertionOptions(optsResult.data.options);
      let assertion;

      try {
        assertion = await navigator.credentials.get({ publicKey: options });
      } catch (credErr) {
        // User cancelled or the credential API failed
        showUnlockView(
          "Touch ID cancelled or unavailable",
          true,
          false
        );
        return;
      }

      if (!assertion) {
        showUnlockView("Touch ID returned no credential", true, false);
        return;
      }

      // Step 3 — Send assertion to backend
      showLoading("Verifying...");
      const loginResult = await sendMessage({
        type: "FETCH",
        endpoint: "/auth/webauthn/login",
        method: "POST",
        body: { credential: serializeAssertion(assertion) },
      });

      if (loginResult.error) {
        showUnlockView("Unlock failed", true, false);
        showAppError(loginResult.error);
        return;
      }

      // Step 4 — Verify unlock completed (server stores key; read back via /auth/me)
      const statusResult = await sendMessage({ type: "UNLOCK_REQUEST" });
      if (statusResult.unlocked) {
        showVaultView();
        await fetchEntries();
      } else {
        showUnlockView("Vault still locked — try again", true, false);
      }
    } catch (err) {
      console.error("[1PW] Unlock error:", err);
      showUnlockView("Something went wrong", true, false);
      showAppError(err.message);
    }
  }

  function showAppError(message) {
    DOM.unlockError.textContent = message;
    DOM.unlockError.style.display = "block";
  }

  // -----------------------------------------------------------------------
  // Vault entry rendering
  // -----------------------------------------------------------------------

  async function fetchEntries() {
    const result = await sendMessage({
      type: "FETCH",
      endpoint: "/api/entries",
    });

    if (result.error) {
      if (result.error === "locked") {
        showUnlockView("Session expired. Unlock again.", true, false);
        return;
      }
      showToast("Failed to load entries");
      return;
    }

    allEntries = result.data || [];
    renderEntries(allEntries);
  }

  function renderEntries(entries) {
    DOM.entryList.innerHTML = "";

    if (entries.length === 0) {
      DOM.emptyState.style.display = "block";
      return;
    }
    DOM.emptyState.style.display = "none";

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "entry-row";
      row.setAttribute("role", "option");

      const info = document.createElement("div");
      info.className = "entry-info";

      const title = document.createElement("div");
      title.className = "entry-title";
      title.textContent = entry.title;

      const username = document.createElement("div");
      username.className = "entry-username";
      username.textContent = entry.username || "(no username)";

      const urlEl = document.createElement("div");
      urlEl.className = "entry-url";
      try {
        urlEl.textContent = entry.url ? new URL(entry.url).hostname : "";
      } catch (_) {
        urlEl.textContent = "";
      }

      info.appendChild(title);
      info.appendChild(username);
      info.appendChild(urlEl);

      const actions = document.createElement("div");
      actions.className = "entry-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyToClipboard(entry.password);
      });
      actions.appendChild(copyBtn);

      row.appendChild(info);
      row.appendChild(actions);

      row.addEventListener("click", () => copyToClipboard(entry.password));
      DOM.entryList.appendChild(row);
    }
  }

  // -----------------------------------------------------------------------
  // Search — client-side filter
  // -----------------------------------------------------------------------

  DOM.searchInput.addEventListener("input", () => {
    const query = DOM.searchInput.value.trim().toLowerCase();
    if (!query) {
      renderEntries(allEntries);
      return;
    }

    const filtered = allEntries.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        (e.username && e.username.toLowerCase().includes(query)) ||
        (e.url && e.url.toLowerCase().includes(query))
    );
    renderEntries(filtered);
  });

  // -----------------------------------------------------------------------
  // Clipboard
  // -----------------------------------------------------------------------

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied!");
    } catch (_) {
      showToast("Failed to copy");
    }
  }

  // -----------------------------------------------------------------------
  // Toast
  // -----------------------------------------------------------------------

  let toastTimer = null;

  function showToast(message) {
    DOM.toast.textContent = message;
    DOM.toast.style.display = "block";
    DOM.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      DOM.toast.classList.remove("show");
      setTimeout(() => {
        DOM.toast.style.display = "none";
      }, 200);
    }, 1500);
  }

  // -----------------------------------------------------------------------
  // Message passing
  // -----------------------------------------------------------------------

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  }

  // -----------------------------------------------------------------------
  // WebAuthn helpers
  // -----------------------------------------------------------------------

  /**
   * Prepare the assertion options for navigator.credentials.get().
   * The backend returns base64url-encoded binary fields; we must convert
   * challenge and allowCredentials[].id to ArrayBuffer.
   */
  function prepareAssertionOptions(srvOptions) {
    const opts = { ...srvOptions };
    opts.challenge = base64urlToArrayBuffer(opts.challenge);

    if (opts.allowCredentials) {
      opts.allowCredentials = opts.allowCredentials.map((cred) => ({
        ...cred,
        id: base64urlToArrayBuffer(cred.id),
      }));
    }

    return opts;
  }

  /** Convert a DOM PublicKeyCredential back to the JSON shape the backend expects. */
  function serializeAssertion(credential) {
    return {
      id: credential.id,
      type: credential.type,
      rawId: abToBase64url(credential.rawId),
      response: {
        authenticatorData: abToBase64url(credential.response.authenticatorData),
        clientDataJSON: abToBase64url(credential.response.clientDataJSON),
        signature: abToBase64url(credential.response.signature),
        userHandle: credential.response.userHandle
          ? abToBase64url(credential.response.userHandle)
          : null,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Base64url <-> ArrayBuffer
  // -----------------------------------------------------------------------

  function base64urlToArrayBuffer(b64url) {
    let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const bin = atob(base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function abToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
})();
