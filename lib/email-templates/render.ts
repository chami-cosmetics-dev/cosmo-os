/** Replace {{placeholder}} tokens. Unknown keys left as-is. */
export function renderEmailTemplatePlaceholders(
  text: string,
  data: Record<string, string | number>
): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return full;
    return String(data[key]);
  });
}

/** Staff often type [Name] or {{name}}. Send path always fills the registrant name. */
export function applyRegisterEmailName(text: string, name: string): string {
  const safe = name.trim() || "there";
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, safe)
    .replace(/\{\s*name\s*\}/gi, safe)
    .replace(/\[\s*name\s*\]/gi, safe);
}

export function parseEmailAddressList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
