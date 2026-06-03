/**
 * api.js — Backend API client for My One Password Chrome extension.
 *
 * All fetch() calls use credentials: "include" so the browser attaches the
 * SameSite=None session cookie (enabled via SAMESITE_POLICY=none in .env).
 *
 * This module is loaded via importScripts('lib/api.js') in service-worker.js.
 * Functions are exposed on self.ExtensionApi.
 */
(function () {
  "use strict";

  const DEFAULT_BASE_URL = "https://jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net";

  /** Read the configured API base URL from chrome.storage.local. */
  async function getBaseUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["apiBaseUrl"], (result) => {
        resolve(result.apiBaseUrl || DEFAULT_BASE_URL);
      });
    });
  }

  /**
   * Low-level fetch wrapper.
   * @param {string} endpoint  — e.g. "/auth/me" or a full URL
   * @param {object} [opts]    — method, body, headers
   * @returns {Promise<Response>}
   */
  async function apiFetch(endpoint, opts) {
    const baseUrl = await getBaseUrl();
    const url = endpoint.startsWith("http") ? endpoint : baseUrl + endpoint;

    const options = {
      credentials: "include",
      method: "GET",
      headers: { "Content-Type": "application/json" },
      ...opts,
    };
    return fetch(url, options);
  }

  /** GET /auth/me — returns {email, unlocked}. */
  async function checkStatus() {
    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) {
        return { unlocked: false, authenticated: false };
      }
      return res.json();
    } catch (err) {
      return {
        unlocked: false,
        authenticated: false,
        error: "network",
        message: err.message,
      };
    }
  }

  /** POST /auth/unlock — unlock vault with master password. */
  async function unlock(masterPassword) {
    const res = await apiFetch("/auth/unlock", {
      method: "POST",
      body: JSON.stringify({ master_password: masterPassword || null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unlock failed" }));
      throw new Error(err.detail || "Unlock failed");
    }
    return res.json();
  }

  /** GET /api/entries — list vault entries (optional search filter). */
  async function getEntries(search) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await apiFetch("/api/entries?" + params.toString());
    if (!res.ok) {
      if (res.status === 401) throw new Error("locked");
      throw new Error("Failed to fetch entries");
    }
    return res.json();
  }

  /** GET /api/entries/autofill?url=<hostname> — find entries matching a domain. */
  async function autofillLookup(hostname) {
    const params = new URLSearchParams({ url: hostname });
    const res = await apiFetch("/api/entries/autofill?" + params.toString());
    if (!res.ok) {
      if (res.status === 401) throw new Error("locked");
      return [];
    }
    return res.json();
  }

  self.ExtensionApi = {
    DEFAULT_BASE_URL,
    getBaseUrl,
    apiFetch,
    checkStatus,
    unlock,
    getEntries,
    autofillLookup,
  };
})();
