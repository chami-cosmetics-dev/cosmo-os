# ERP Auto-SMS: stop hammering Hutch after an auth failure

## Why

The `POS Invoice Auto SMS` server script calls `POST https://bsms.hutch.lk/api/login`
**once per Sales Invoice submit**, and on failure it only writes an Error Log row and
moves on. There is no backoff.

So whenever the Hutch account is blocked, both Cosmo ERP instances keep firing failed
logins for as long as it stays blocked — measured at **~120–240 failed logins per day**
across ERP_1 + ERP_2 during the 2026-08-28 → 09-06 outage. That volume is what gets the
API user blocked again, and it is why each unblock lasted less than the one before:

| Working run | Lasted | Messages |
| --- | --- | --- |
| 2026-09-07 11:29 → 09-08 20:47 | 33h 18m | ~1,383 |
| 2026-09-09 15:06 → 09-09 17:21 | 2h 14m | ~195 |

Cosmo OS already backs off (`lib/hutch-sms.ts`, `AUTH_COOLDOWN_MS`). The ERP scripts do not.
This patch gives them the same behaviour: after an auth failure, stop calling `/api/login`
for 15 minutes, then allow one attempt again.

## Where to apply

Server Script **`POS Invoice Auto SMS`**, on both:

- ERP_1 — `https://cosmetics-lk-01.m.frappe.cloud`
- ERP_2 — `https://cosmetics-lk-02.m.frappe.cloud`

The same patch also applies to the two Vault instances if you want it there
(they use a different Hutch account, so they are not part of the current incident).

Line numbers below are from ERP_1's copy (391 lines). ERP_2 is within a couple of lines
of the same layout — match on the surrounding code, not the numbers.

Only whitelisted `safe_exec` calls are used: `frappe.utils.now_datetime`,
`frappe.utils.add_to_date`, `frappe.db.get_value`, `frappe.log_error`.

---

## Edit 1 — add the constant and helper

Put this next to the other `HUTCH_*` constants near the top of the script (around line 19,
beside `HUTCH_AUTH_URL`):

```python
HUTCH_AUTH_COOLDOWN_MIN = 15


def hutch_auth_in_cooldown():
    """True while a recent Hutch auth failure should stop us calling /api/login.

    This script runs on every Sales Invoice submit. Without a cooldown, a blocked
    Hutch account gets hundreds of failed logins a day from this instance alone,
    which is what keeps it blocked. Mirrors AUTH_COOLDOWN_MS in Cosmo's lib/hutch-sms.ts.
    """
    cutoff = frappe.utils.add_to_date(
        frappe.utils.now_datetime(), minutes=-HUTCH_AUTH_COOLDOWN_MIN
    )
    return bool(
        frappe.db.get_value(
            "Error Log",
            [["method", "=", "Hutch Auth Cooldown"], ["creation", ">", cutoff]],
            "name",
        )
    )
```

The cooldown state lives in the Error Log rows the script already writes — no new
DocType, no cache API, and it is shared across all workers on the instance.

---

## Edit 2 — skip the send while cooling down

Find this (around line 100):

```python
    if not hutch:
```

Insert **immediately above** it, at the same 4-space indent:

```python
    if hutch and hutch_auth_in_cooldown():
        hutch = None
        frappe.log_error(
            title="Hutch SMS Paused",
            message="Invoice "
            + str(doc.name)
            + " — Hutch auth failed within the last "
            + str(HUTCH_AUTH_COOLDOWN_MIN)
            + " min; not calling /api/login until the cooldown lifts.",
        )
```

Setting `hutch = None` reuses the script's existing skip path, so no other block needs
re-indenting. Invoices still submit normally; only the SMS is skipped.

---

## Edit 3 — mark the cooldown when login returns no token

Find this (around line 322):

```python
                if not token:
                    frappe.log_error(
                        title="Hutch SMS Auth Failed",
```

Add a second `frappe.log_error` directly after that existing call closes, still inside the
`if not token:` branch (16-space indent):

```python
                    frappe.log_error(
                        title="Hutch Auth Cooldown",
                        message="Invoice " + str(doc.name) + " — no accessToken returned",
                    )
```

---

## Edit 4 — mark the cooldown when login raises

This is the important one: a Hutch **401 raises**, so it lands in the outer handler, not in
`if not token`. Every current failure looks like
`401 Client Error: for url: https://bsms.hutch.lk/api/login`.

Find the handler at the very end of the script (around line 381):

```python
            except Exception as exc:
                frappe.log_error(
                    title="Hutch SMS Error",
                    message="Invoice "
                    + str(doc.name)
                    + " to "
                    + str(mobile)
                    + " — "
                    + str(exc),
                )
```

Append this inside the same `except` block (16-space indent):

```python
                if "api/login" in str(exc) or "401" in str(exc):
                    frappe.log_error(
                        title="Hutch Auth Cooldown",
                        message="Invoice " + str(doc.name) + " — " + str(exc),
                    )
```

Only auth-shaped failures start the cooldown. A single bad phone number or a per-message
send rejection must not pause SMS for the whole instance.

---

## After applying

1. Save the script on **both** instances.
2. Submit one Sales Invoice while Hutch is still blocked. Expect **one**
   `Hutch Auth Cooldown` row, then `Hutch SMS Paused` rows for the next 15 minutes —
   and no further `/api/login` calls in that window.
3. Once Hutch restores the account, the first submit after a cooldown lapses will
   succeed on its own. No manual step.

Verify with:

```
Error Log → filter method in ("Hutch Auth Cooldown", "Hutch SMS Paused", "Hutch SMS Error")
```

During an outage you should now see roughly **4 login attempts per hour per instance**
instead of one per invoice.

## Not covered by this patch

- **The password is still hardcoded in the script body** (plaintext, readable by anyone
  with Script Manager access). Worth moving into a Singles DocType or site config and
  reading it with `frappe.db.get_value`, so a rotation is one edit instead of four.
- **No token caching.** The script logs in once per invoice even when healthy
  (~160/day). That is tolerable, and cutting it needs a cache the `safe_exec`
  sandbox exposes — worth doing separately, but it is not what breaks the account.
