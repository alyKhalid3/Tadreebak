/**
 * Minimal HTML-attribute-and-text escaper. We don't pull in a templating
 * engine for the existing inline-string templates, but we MUST escape any
 * user-controlled value before it lands in an HTML context — otherwise
 * accepting a company name like
 *   `<img src=x onerror="fetch('/auth/forgot-password',...)">`
 * would let one user run arbitrary JS in every email we send out
 * (the auditor's "Email HTML injection" finding).
 *
 * Covers the five characters that have meaning in HTML.
 */
export const escapeHtml = (input: unknown): string => {
    if (input === null || input === undefined) return "";
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

/**
 * Escape a value AND make it safe to drop into an href/src attribute.
 * For URLs we additionally reject the `javascript:` scheme so even a
 * reflected XSS via a crafted link is neutralised.
 */
export const escapeUrl = (input: unknown): string => {
    const raw = String(input ?? "").trim();
    if (/^(javascript|data|vbscript):/i.test(raw)) return "#";
    return escapeHtml(raw);
};

/**
 * Escape every string in an array, then join with the supplied separator.
 * Used for things like the preKnowledge list in the acceptance email.
 */
export const escapeList = (items: unknown[] | undefined, sep = "\n"): string => {
    if (!Array.isArray(items)) return "";
    return items.map(escapeHtml).join(sep);
};
