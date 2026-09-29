/**
 * Patch POS Invoice Auto SMS: cache Hutch token on a Note, cooldown 60 min.
 * Usage:
 *   node scripts/patch-erp-hutch-token-cache.mjs --file <in.py> <out.py>
 *   node scripts/with-env.mjs cosmo-prod node scripts/patch-erp-hutch-token-cache.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const HELPERS = `
HUTCH_TOKEN_NOTE_TITLE = "Hutch SMS Token Cache"
HUTCH_TOKEN_TTL_MIN = 45


def hutch_cached_token(note_title="Hutch SMS Token Cache"):
    raw = frappe.db.get_value("Note", {"title": note_title}, "content") or ""
    raw = str(raw).strip()
    if not raw or "|" not in raw:
        return None
    token, expiry = raw.split("|", 1)
    token = (token or "").strip()
    expiry = (expiry or "").strip()
    if not token or not expiry:
        return None
    try:
        exp_dt = frappe.utils.get_datetime(expiry)
    except Exception:
        return None
    if exp_dt <= frappe.utils.now_datetime():
        return None
    return token


def hutch_save_token(token, note_title="Hutch SMS Token Cache", ttl_min=45):
    if not token:
        return
    expiry = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=ttl_min)
    payload = str(token) + "|" + str(expiry)
    name = frappe.db.get_value("Note", {"title": note_title}, "name")
    if not name:
        return
    frappe.db.set_value("Note", name, "content", payload, update_modified=False)


def hutch_clear_token(note_title="Hutch SMS Token Cache"):
    name = frappe.db.get_value("Note", {"title": note_title}, "name")
    if not name:
        return
    frappe.db.set_value("Note", name, "content", "", update_modified=False)

`;

function patchScript(script) {
  let next = script;
  const checks = [];

  const r1 = next.replace("HUTCH_AUTH_COOLDOWN_MIN = 15", "HUTCH_AUTH_COOLDOWN_MIN = 60");
  checks.push(["cooldown const", r1 !== next]);
  next = r1;

  const r2 = next.replace(
    "def hutch_auth_in_cooldown(cooldown_min=15):",
    "def hutch_auth_in_cooldown(cooldown_min=60):",
  );
  checks.push(["cooldown default", r2 !== next]);
  next = r2;

  const anchor =
    '            [["method", "=", "Hutch Auth Cooldown"], ["creation", ">", cutoff]],\n            "name",\n        )\n    )\n';
  const altAnchor = anchor.replace(/\n/g, "\r\n");
  if (next.includes(anchor) && !next.includes("def hutch_cached_token(")) {
    next = next.replace(anchor, `${anchor}${HELPERS}`);
    checks.push(["helpers", true]);
  } else if (next.includes(altAnchor) && !next.includes("def hutch_cached_token(")) {
    next = next.replace(altAnchor, `${altAnchor}${HELPERS.replace(/\n/g, "\r\n")}`);
    checks.push(["helpers crlf", true]);
  } else {
    checks.push(["helpers", next.includes("def hutch_cached_token(")]);
  }

  const r3 = next.replace(
    "if hutch and hutch_auth_in_cooldown():",
    "if hutch and not hutch_cached_token() and hutch_auth_in_cooldown():",
  );
  checks.push(["cooldown skip uses cache", r3 !== next || next.includes("not hutch_cached_token() and hutch_auth_in_cooldown()")]);
  next = r3;

  const loginOld = `            try:
                auth_resp = frappe.make_post_request(
                    HUTCH_AUTH_URL,
                    headers=HUTCH_HEADERS,
                    json={"username": hutch["username"], "password": hutch["password"]},
                )
                auth_data = hutch_json(auth_resp)
                token = auth_data.get("accessToken")
                if not token:`;
  const loginNew = `            try:
                token = hutch_cached_token()
                if not token:
                    auth_resp = frappe.make_post_request(
                        HUTCH_AUTH_URL,
                        headers=HUTCH_HEADERS,
                        json={"username": hutch["username"], "password": hutch["password"]},
                    )
                    auth_data = hutch_json(auth_resp)
                    token = auth_data.get("accessToken")
                    if token:
                        hutch_save_token(token)
                if not token:`;
  const loginOldCrlf = loginOld.replace(/\n/g, "\r\n");
  const loginNewCrlf = loginNew.replace(/\n/g, "\r\n");
  if (next.includes(loginOld)) {
    next = next.replace(loginOld, loginNew);
    checks.push(["login cache", true]);
  } else if (next.includes(loginOldCrlf)) {
    next = next.replace(loginOldCrlf, loginNewCrlf);
    checks.push(["login cache crlf", true]);
  } else {
    checks.push(["login cache", next.includes("token = hutch_cached_token()")]);
  }

  const clearOld = `                if "api/login" in str(exc) or "401" in str(exc):
                    frappe.log_error(`;
  const clearNew = `                if "api/login" in str(exc) or "401" in str(exc):
                    hutch_clear_token()
                    frappe.log_error(`;
  if (next.includes(clearOld) && !next.includes("hutch_clear_token()")) {
    next = next.replace(clearOld, clearNew);
    checks.push(["clear token on 401", true]);
  } else if (next.includes(clearOld.replace(/\n/g, "\r\n")) && !next.includes("hutch_clear_token()")) {
    next = next.replace(clearOld.replace(/\n/g, "\r\n"), clearNew.replace(/\n/g, "\r\n"));
    checks.push(["clear token on 401 crlf", true]);
  } else {
    checks.push(["clear token on 401", next.includes("hutch_clear_token()")]);
  }

  return { next, checks };
}

if (process.argv[2] === "--file") {
  const srcPath = process.argv[3];
  const outPath = process.argv[4];
  if (!srcPath || !outPath) {
    console.error("Usage: node scripts/patch-erp-hutch-token-cache.mjs --file <in.py> <out.py>");
    process.exit(1);
  }
  const src = readFileSync(srcPath, "utf8");
  const { next, checks } = patchScript(src);
  console.log("patch checks", Object.fromEntries(checks));
  if (checks.some(([, ok]) => !ok)) {
    console.error("Abort: a patch step did not match.");
    process.exit(1);
  }
  writeFileSync(outPath, next);
  console.log(`Wrote ${outPath} (${next.length} chars)`);
  process.exit(0);
}

const baseUrl = (process.env.ERPNEXT_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.ERPNEXT_API_KEY || "";
const apiSecret = process.env.ERPNEXT_API_SECRET || "";
if (!baseUrl || !apiKey || !apiSecret) {
  console.error("ERPNEXT_BASE_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET required");
  process.exit(1);
}

const auth = { Authorization: `token ${apiKey}:${apiSecret}`, "Content-Type": "application/json" };
const scriptName = "POS Invoice Auto SMS";
const noteTitle = "Hutch SMS Token Cache";

async function erp(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

const notes = await erp(
  `/api/resource/Note?filters=${encodeURIComponent(JSON.stringify([["title", "=", noteTitle]]))}&fields=${encodeURIComponent(JSON.stringify(["name", "title"]))}&limit=1`,
);
const existing = notes.data?.[0];
if (!existing) {
  const created = await erp("/api/resource/Note", {
    method: "POST",
    body: JSON.stringify({
      title: noteTitle,
      public: 0,
      content: "",
    }),
  });
  console.log(`${baseUrl} created Note ${created.data?.name || created.data?.title}`);
} else {
  console.log(`${baseUrl} Note exists ${existing.name}`);
}

const encoded = encodeURIComponent(scriptName);
const doc = await erp(`/api/resource/Server Script/${encoded}`);
const script = doc.data?.script || "";
const { next, checks } = patchScript(script);
console.log("patch checks", Object.fromEntries(checks));
if (checks.some(([, ok]) => !ok)) {
  console.error("Abort: a patch step did not match. Script not saved.");
  process.exit(1);
}
if (next === script) {
  console.log("Already patched.");
  process.exit(0);
}

await erp(`/api/resource/Server Script/${encoded}`, {
  method: "PUT",
  body: JSON.stringify({ script: next }),
});
console.log(`Patched ${scriptName} on ${baseUrl}`);
