/**
 * Saved settings: a small wrapper around localStorage that stores JSON and never throws (private windows, full storage).
 */
/* ---------- storage helpers ---------- */
/**
 * Reads and writes JSON values in localStorage. get(key, fallback) returns the fallback when nothing is saved or
 * the value can't be read; set(key, value) silently does nothing when storage is unavailable.
 */
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};
