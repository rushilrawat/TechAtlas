// Only http(s) URLs are safe to put in an href. Blocks javascript:, data:, etc.
// Repository/Wikidata-sourced URLs are untrusted (anyone can edit Wikidata P856).
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return url;
  } catch {
    // not an absolute URL
  }
  return null;
}
