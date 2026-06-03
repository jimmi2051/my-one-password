/**
 * URL domain extraction and matching utilities.
 * Used by both content-script.js and popup/popup.js for
 * hostname comparison and autofill domain matching.
 */

/**
 * Extract a normalized hostname from a full URL or hostname string.
 * Strips "www." prefix and lowercases the result.
 *
 * @param {string} url - A full URL (e.g., "https://github.com/login")
 *                        or bare hostname (e.g., "github.com")
 * @returns {string} Normalized hostname, or empty string if parsing fails
 */
export function extractHostname(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  let hostname;

  try {
    // Try parsing as a full URL first
    if (url.startsWith('http://') || url.startsWith('https://')) {
      hostname = new URL(url).hostname;
    } else {
      // Treat as bare hostname — implicitly add protocol for URL parser
      hostname = new URL('https://' + url).hostname;
    }
  } catch {
    // If parsing completely fails, use the raw string stripped of paths
    hostname = url.split('/')[0].split('?')[0].split('#')[0];
  }

  // Strip "www." prefix and lowercase
  return hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * Compare a vault entry's URL against a target hostname.
 * Both are normalized via extractHostname before comparison.
 *
 * @param {string} entryUrl - The URL stored in a vault entry (may be null/undefined)
 * @param {string} targetHostname - The hostname to match against (e.g., window.location.hostname)
 * @returns {boolean} True if the hostnames match
 */
export function matchesDomain(entryUrl, targetHostname) {
  if (!entryUrl || !targetHostname) {
    return false;
  }

  const entryHostname = extractHostname(entryUrl);
  const targetNormalized = extractHostname(targetHostname);

  if (!entryHostname || !targetNormalized) {
    return false;
  }

  return entryHostname === targetNormalized;
}
