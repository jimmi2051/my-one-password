/**
 * Form detection heuristics for autofill.
 *
 * Detects login forms by finding <input type="password"> elements and
 * their associated username/email fields. Supports SPA-rendered forms
 * via MutationObserver.
 *
 * Heuristics:
 * - Find <input type="password"> → mark as password fields
 * - For each password field, find associated username/email:
 *   - <input type="email">, <input type="text">, name containing
 *     "user", "email", "login", "username"
 *   - Search within same <form> element, or nearby in DOM
 * - accounts.google.com: detect input[type="email"][name="identifier"]
 * - Form type filter: ONLY trigger when BOTH username AND password
 *   fields are detected (prevents false positives on search,
 *   registration, 2FA forms)
 *
 * @module form-detector
 */

/**
 * Result of a login form detection.
 *
 * @typedef {Object} LoginFormResult
 * @property {HTMLInputElement} passwordField - The detected password input
 * @property {HTMLInputElement|null} usernameField - The detected username/email input, or null
 */

/**
 * Detect a login form on the current page.
 *
 * Searches for <input type="password"> elements and tries to find
 * associated username/email fields. Returns null when only a password
 * field is found without a matching username field (prevents false
 * positives on 2FA, registration, and password-change forms).
 *
 * @returns {LoginFormResult|null} Detected form fields, or null if
 *   no complete login form was found
 */
export function detectLoginForm() {
  const passwordFields = document.querySelectorAll('input[type="password"]');

  if (passwordFields.length === 0) {
    return null;
  }

  // Special case: accounts.google.com
  // Google's sign-in uses a multi-page flow: email first, then password
  if (window.location.hostname === 'accounts.google.com') {
    return detectGoogleSignIn();
  }

  // For each password field, try to find an associated username field
  for (const passwordField of passwordFields) {
    const usernameField = findAssociatedUsernameField(passwordField);

    // Form type filter: ONLY return when BOTH fields are found
    if (usernameField) {
      return { passwordField, usernameField };
    }
  }

  // No complete login form found (may be 2FA, registration, change password)
  return null;
}

/**
 * Detect Google sign-in form fields.
 *
 * Google uses a two-page flow:
 *   Page 1: input[type="email"][name="identifier"] for email
 *   Page 2: input[type="password"][name="Passwd"] for password
 *
 * This function handles both pages independently. On the email page,
 * the "password" field detection path won't trigger because there's
 * no password input yet — this function detects the email field
 * directly and returns it without a password field.
 *
 * The content script will treat a Google sign-in match differently:
 * it fills only the email field and lets the user advance manually.
 *
 * @returns {LoginFormResult|null}
 */
function detectGoogleSignIn() {
  // Page 1: Email entry
  const emailField = document.querySelector('input[type="email"][name="identifier"]');
  if (emailField) {
    return {
      passwordField: null,
      usernameField: emailField
    };
  }

  // Page 2: Password entry (after email was submitted)
  // Check if there's a hidden email field or email display text nearby
  const passwordField = document.querySelector('input[type="password"][name="Passwd"]');
  if (passwordField) {
    // Google shows the email as read-only text or in a hidden div
    // Try to find a nearby email identifier
    const emailFieldOnPasswordPage = findGoogleEmailOnPasswordPage(passwordField);
    return {
      passwordField,
      usernameField: emailFieldOnPasswordPage
    };
  }

  return null;
}

/**
 * On Google's password entry page, try to find the email identifier.
 * Google typically shows the email in a read-only div or hidden input
 * near the password field.
 *
 * @param {HTMLInputElement} passwordField
 * @returns {HTMLInputElement|null}
 */
function findGoogleEmailOnPasswordPage(passwordField) {
  // Google stores the email in a hidden input nearby
  const hiddenEmail = document.querySelector('input[type="hidden"][name="Email"], input[name="Email"]');
  if (hiddenEmail) {
    return hiddenEmail;
  }

  // Look for a visible read-only email field
  const readOnlyEmail = document.querySelector(
    'input[type="email"][readonly], input[name="identifier"][readonly]'
  );
  if (readOnlyEmail) {
    return readOnlyEmail;
  }

  // If we can't find the email, still return the password field
  // (user can manually fill the email, extension autofills password)
  return null;
}

/**
 * Find a username/email field associated with a password field.
 *
 * Search strategy:
 * 1. If the password field is inside a <form>, search that form
 * 2. Check previous siblings of the password field
 * 3. Check parent's previous siblings (fields before the password's container)
 *
 * @param {HTMLInputElement} passwordField - The password input element
 * @returns {HTMLInputElement|null} The associated username field, or null
 */
function findAssociatedUsernameField(passwordField) {
  const form = passwordField.closest('form');

  if (form) {
    // Search within the same <form> element
    return findUsernameInForm(form, passwordField);
  }

  // No parent form — search nearby in DOM
  return findUsernameNearby(passwordField);
}

/**
 * Search for a username/email field within a form, prioritizing fields
 * that appear before the password field in DOM order.
 *
 * @param {HTMLFormElement} form - The form containing the password field
 * @param {HTMLInputElement} passwordField - The password input to search before
 * @returns {HTMLInputElement|null}
 */
function findUsernameInForm(form, passwordField) {
  const formInputs = form.querySelectorAll('input');

  let foundPassword = false;
  let lastCandidate = null;

  for (const input of formInputs) {
    if (input === passwordField) {
      foundPassword = true;
      break;
    }

    if (input.type === 'password') {
      // Skip other password fields
      continue;
    }

    if (isUsernameCandidate(input)) {
      lastCandidate = input;
    }
  }

  // Return the last username-like field found before the password field
  if (lastCandidate) {
    return lastCandidate;
  }

  // Fallback: search all inputs in the form for an email-type field
  const emailField = form.querySelector('input[type="email"]');
  if (emailField) {
    return emailField;
  }

  return null;
}

/**
 * Search for a username/email field near the password field in the DOM,
 * used when the password field is not inside a <form> element.
 *
 * Checks:
 * - Previous sibling elements
 * - Parent element's previous siblings
 * - Parent element
 *
 * @param {HTMLInputElement} passwordField
 * @returns {HTMLInputElement|null}
 */
function findUsernameNearby(passwordField) {
  // Check previous siblings
  let el = passwordField.previousElementSibling;
  while (el) {
    const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
    if (input && isUsernameCandidate(input)) {
      return input;
    }
    el = el.previousElementSibling;
  }

  // Check parent's previous siblings (fields before the container)
  const parent = passwordField.parentElement;
  if (parent) {
    el = parent.previousElementSibling;
    while (el) {
      const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
      if (input && isUsernameCandidate(input)) {
        return input;
      }
      el = el.previousElementSibling;
    }

    // Check parent itself (could be a label wrapping the field)
    const inputInParent = parent.tagName === 'INPUT' ? parent : parent.querySelector('input');
    if (inputInParent && inputInParent !== passwordField && isUsernameCandidate(inputInParent)) {
      return inputInParent;
    }
  }

  return null;
}

/**
 * Check if an input element is a username/email field candidate.
 *
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
function isUsernameCandidate(input) {
  if (!input || input.type === 'hidden' || input.type === 'password' || input.type === 'submit') {
    return false;
  }

  // Explicit type match
  if (input.type === 'email') {
    return true;
  }

  // Check name/id/autocomplete attributes for common username patterns
  const name = (input.name || '').toLowerCase();
  const id = (input.id || '').toLowerCase();
  const autocomplete = (input.autocomplete || '').toLowerCase();
  const placeholder = (input.placeholder || '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

  const combined = `${name} ${id} ${autocomplete} ${placeholder} ${ariaLabel}`;

  // Primary username patterns
  if (/username|user[-_]?name|login|email|e-mail/.test(combined)) {
    return true;
  }

  return false;
}

/**
 * Setup a MutationObserver to watch for dynamically added password fields.
 * Useful for SPAs that render login forms after initial page load.
 *
 * Uses debounced callback (300ms) to avoid excessive checks during
 * rapid DOM mutations.
 *
 * @param {Function} callback - Called with no arguments when new password
 *                              fields are detected in the DOM
 * @returns {MutationObserver} The observer instance (caller can disconnect)
 */
export function setupFormObserver(callback) {
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    // Check if any added nodes contain a password field
    const hasNewPasswordField = mutations.some((mutation) => {
      if (mutation.type !== 'childList') {
        return false;
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        const element = /** @type {Element} */ (node);

        // Check the added element itself
        if (element.matches && element.matches('input[type="password"]')) {
          return true;
        }

        // Check descendants of the added element
        if (element.querySelector && element.querySelector('input[type="password"]')) {
          return true;
        }
      }

      return false;
    });

    if (hasNewPasswordField) {
      // Debounce: reset timer on each mutation burst
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        callback();
      }, 300);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}
