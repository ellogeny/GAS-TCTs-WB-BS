/**
 * API Request utilities
 */
function createApiUtils(customFetch, options) {
  const scriptProps = (options && options.scriptProperties)
    ? options.scriptProperties
    : PropertiesService.getScriptProperties();
  const getNum = (key, def) => {
    const v = scriptProps.getProperty(key);
    const n = v !== null && v !== undefined ? Number(v) : NaN;
    return isNaN(n) ? def : n;
  };
  const cfg = {
    maxRetries: (options && options.maxRetries) || getNum('API_MAX_RETRIES', 3),
    initialDelayMs: (options && options.initialDelayMs) || getNum('API_INITIAL_DELAY_MS', 500),
    backoffFactor: (options && options.backoffFactor) || getNum('API_BACKOFF_FACTOR', 2)
  };
  const RATE_LIMITS = {
    REQUESTS_PER_SECOND: getNum('API_REQUESTS_PER_SECOND', 5),
    SLEEP_INTERVAL: 1000
  };

  let requestCount = 0;
  let lastRequestTime = Date.now();

  function computeRetryDelayFromHeaders(resp, fallbackDelay) {
    try {
      if (!resp || !resp.getAllHeaders) return fallbackDelay;
      const headers = resp.getAllHeaders() || {};
      const retryAfter = headers['Retry-After'] || headers['retry-after'];
      if (retryAfter) {
        const seconds = Number(retryAfter);
        if (!isNaN(seconds) && seconds >= 0) return Math.max(seconds * 1000, fallbackDelay);
      }
      const rlRetry = headers['X-Ratelimit-Retry'] || headers['x-ratelimit-retry'];
      if (rlRetry) {
        const seconds = Number(rlRetry);
        if (!isNaN(seconds) && seconds >= 0) return Math.max(seconds * 1000, fallbackDelay);
      }
      const rlReset = headers['X-Ratelimit-Reset'] || headers['x-ratelimit-reset'];
      const rlLimit = headers['X-Ratelimit-Limit'] || headers['x-ratelimit-limit'];
      const rlRemaining = headers['X-Ratelimit-Remaining'] || headers['x-ratelimit-remaining'];
      if (rlReset && rlLimit && rlRemaining) {
        const resetSec = Number(rlReset);
        const limit = Number(rlLimit);
        const remaining = Number(rlRemaining);
        if (!isNaN(resetSec) && !isNaN(limit) && !isNaN(remaining) && limit > 0) {
          const deficit = Math.max(0, limit - remaining);
          if (deficit > 0) {
            return Math.max(Math.ceil((deficit / limit) * resetSec) * 1000, fallbackDelay);
          }
        }
      }
    } catch (e) {}
    return fallbackDelay;
  }

  function isRetryableStatus(code) {
    if (code === 0 || code === null || code === undefined) return true;
    if (code === 408 || code === 429) return true;
    if (code === 409) return true; // WB sometimes uses 409 for throttling/contention
    if (code >= 500 && code <= 599) return true;
    return false;
  }

  return {
    checkRateLimit() {
      requestCount++;
      if (requestCount >= RATE_LIMITS.REQUESTS_PER_SECOND) {
        const elapsed = Date.now() - lastRequestTime;
        if (elapsed < RATE_LIMITS.SLEEP_INTERVAL) {
          Utilities.sleep(RATE_LIMITS.SLEEP_INTERVAL - elapsed);
        }
        requestCount = 0;
        lastRequestTime = Date.now();
      }
    },

    fetch(url, requestOptions = {}, errorMessage = '') {
      this.checkRateLimit();
      const doFetch = typeof customFetch === 'function'
        ? customFetch
        : (u, o) => UrlFetchApp.fetch(u, o);

      let attempt = 0;
      let delay = cfg.initialDelayMs;
      
      while (attempt <= cfg.maxRetries) {
        try {
          const response = doFetch(url, { muteHttpExceptions: true, ...requestOptions });
          const responseCode = response.getResponseCode();
          if (responseCode === 200) {
            try {
              return JSON.parse(response.getContentText());
            } catch (parseErr) {
              Logger.log(`Parse Error: ${errorMessage}\nError: ${parseErr}`);
              // treat as retryable parse error
            }
          } else {
            const body = response && response.getContentText ? response.getContentText() : '';
            Logger.log(`API Error (${responseCode}): ${errorMessage}\nResponse: ${body}`);
            if (!isRetryableStatus(responseCode)) {
              break;
            }
            // prefer header-driven delay when available
            delay = computeRetryDelayFromHeaders(response, Math.min(delay * cfg.backoffFactor, 10000));
          }
        } catch (error) {
          Logger.log(`Request Failed: ${errorMessage}\nError: ${error.toString()}`);
        }

        attempt++;
        if (attempt > cfg.maxRetries) break;
        Utilities.sleep(delay);
        delay = Math.min(delay * cfg.backoffFactor, 15000);
      }

      return null;
    },

    // Batch fetch with retries. Each request: { url, requestOptions, errorMessage, meta }
    fetchAll(requests) {
      if (!Array.isArray(requests) || requests.length === 0) return [];
      const doFetchAll = (reqs) => UrlFetchApp.fetchAll(reqs);

      // Wrap response holders
      const results = new Array(requests.length).fill(null);
      let pendingIdx = requests.map((_, idx) => idx);

      let attempt = 0;
      let delay = cfg.initialDelayMs;

      while (pendingIdx.length > 0 && attempt <= cfg.maxRetries) {
        // Rate-limit per batch
        this.checkRateLimit();

        const reqBatch = pendingIdx.map(i => {
          const r = requests[i];
          const ro = r.requestOptions || {};
          return { url: r.url, muteHttpExceptions: true, ...ro };
        });
        let responses = [];
        try {
          responses = doFetchAll(reqBatch);
        } catch (e) {
          Logger.log(`Batch fetchAll failed at attempt ${attempt}: ${e}`);
          responses = [];
        }

        const nextPending = [];
        let suggestedDelay = delay;
        for (let j = 0; j < pendingIdx.length; j++) {
          const globalIdx = pendingIdx[j];
          const r = requests[globalIdx];
          const resp = responses[j];
          try {
            const code = resp && resp.getResponseCode ? resp.getResponseCode() : 0;
            if (resp && resp.getResponseCode && code === 200) {
              try {
                const parsed = JSON.parse(resp.getContentText());
                results[globalIdx] = parsed;
              } catch (e) {
                Logger.log(`Parse Error: ${r.errorMessage || ''} err=${e}`);
                nextPending.push(globalIdx);
              }
            } else {
              const body = resp && resp.getContentText ? resp.getContentText() : '';
              Logger.log(`API Error (${code}): ${r.errorMessage || ''}\nResponse: ${body}`);
              if (isRetryableStatus(code)) {
                // track the max recommended delay across responses
                suggestedDelay = Math.max(suggestedDelay, computeRetryDelayFromHeaders(resp, Math.min(delay * cfg.backoffFactor, 10000)));
                nextPending.push(globalIdx);
              }
            }
          } catch (e) {
            Logger.log(`Unexpected Error processing batch element: ${r.errorMessage || ''} err=${e}`);
            nextPending.push(globalIdx);
          }
        }

        if (nextPending.length === pendingIdx.length) {
          attempt++;
          if (attempt > cfg.maxRetries) break;
          Utilities.sleep(suggestedDelay);
          delay = Math.min(suggestedDelay * cfg.backoffFactor, 15000);
        }
        pendingIdx = nextPending;
      }

      return results;
    }
  };
}




