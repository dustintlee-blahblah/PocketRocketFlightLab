/**
 * Small helpers used everywhere: escaping text for HTML, deep copies, base64 to bytes.
 */
/**
 * Escapes &, <, > and " so text can go into HTML (also inside attribute values).
 * @param {*} s
 * @returns {string}
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/**
 * Base64 text to bytes.
 */
const b64ToU8 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/**
 * A deep copy of plain JSON data.
 */
const jclone = (o) => JSON.parse(JSON.stringify(o));
