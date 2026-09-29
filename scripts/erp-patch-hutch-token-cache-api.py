doc = frappe.get_doc("Server Script", "POS Invoice Auto SMS")
s = doc.script or ""
if "def hutch_cached_token(" in s:
    frappe.response["message"] = {"ok": True, "status": "already_patched"}
else:
    helpers = """
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

"""
    orig = s
    s = s.replace("HUTCH_AUTH_COOLDOWN_MIN = 15", "HUTCH_AUTH_COOLDOWN_MIN = 60")
    s = s.replace(
        "def hutch_auth_in_cooldown(cooldown_min=15):",
        "def hutch_auth_in_cooldown(cooldown_min=60):",
    )
    anchor = (
        '            [["method", "=", "Hutch Auth Cooldown"], ["creation", ">", cutoff]],\n'
        '            "name",\n'
        "        )\n"
        "    )\n"
    )
    if anchor in s:
        s = s.replace(anchor, anchor + helpers, 1)
    else:
        anchor2 = anchor.replace("\n", "\r\n")
        helpers2 = helpers.replace("\n", "\r\n")
        if anchor2 in s:
            s = s.replace(anchor2, anchor2 + helpers2, 1)
        else:
            frappe.throw("Hutch patch: cooldown anchor not found")
    s = s.replace(
        "if hutch and hutch_auth_in_cooldown():",
        "if hutch and not hutch_cached_token() and hutch_auth_in_cooldown():",
    )
    old_login = (
        "            try:\n"
        "                auth_resp = frappe.make_post_request(\n"
        "                    HUTCH_AUTH_URL,\n"
        "                    headers=HUTCH_HEADERS,\n"
        '                    json={"username": hutch["username"], "password": hutch["password"]},\n'
        "                )\n"
        "                auth_data = hutch_json(auth_resp)\n"
        '                token = auth_data.get("accessToken")\n'
        "                if not token:"
    )
    new_login = (
        "            try:\n"
        "                token = hutch_cached_token()\n"
        "                if not token:\n"
        "                    auth_resp = frappe.make_post_request(\n"
        "                        HUTCH_AUTH_URL,\n"
        "                        headers=HUTCH_HEADERS,\n"
        '                        json={"username": hutch["username"], "password": hutch["password"]},\n'
        "                    )\n"
        "                    auth_data = hutch_json(auth_resp)\n"
        '                    token = auth_data.get("accessToken")\n'
        "                    if token:\n"
        "                        hutch_save_token(token)\n"
        "                if not token:"
    )
    if old_login in s:
        s = s.replace(old_login, new_login, 1)
    else:
        old2 = old_login.replace("\n", "\r\n")
        new2 = new_login.replace("\n", "\r\n")
        if old2 in s:
            s = s.replace(old2, new2, 1)
        else:
            frappe.throw("Hutch patch: login block not found")
    old_clear = (
        '                if "api/login" in str(exc) or "401" in str(exc):\n'
        "                    frappe.log_error("
    )
    new_clear = (
        '                if "api/login" in str(exc) or "401" in str(exc):\n'
        "                    hutch_clear_token()\n"
        "                    frappe.log_error("
    )
    if old_clear in s:
        s = s.replace(old_clear, new_clear, 1)
    else:
        oldc = old_clear.replace("\n", "\r\n")
        newc = new_clear.replace("\n", "\r\n")
        if oldc in s:
            s = s.replace(oldc, newc, 1)
        else:
            frappe.throw("Hutch patch: 401 handler not found")
    if s == orig:
        frappe.throw("Hutch patch produced no changes")
    if "def hutch_cached_token(" not in s:
        frappe.throw("Hutch patch: helpers missing after save")
    doc.script = s
    doc.save()
    frappe.response["message"] = {"ok": True, "status": "patched", "chars": len(s)}
