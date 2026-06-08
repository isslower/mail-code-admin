import imaplib
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
from datetime import datetime, timezone
from email.header import decode_header
from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import default
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def env_int(name, default):
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        print(f"Invalid {name}={value!r}, using default {default}")
        return default


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.getenv("MAIL_DB_PATH", str(BASE_DIR / "mail_admin.sqlite3")))
ADMIN_USER = os.getenv("MAIL_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("MAIL_ADMIN_PASSWORD", "admin123")
CODE_API_TOKEN = os.getenv("MAIL_CODE_API_TOKEN", "").strip()
SESSION_TTL_SECONDS = 60 * 60 * 12
MAIL_TIMEOUT_SECONDS = env_int("MAIL_TIMEOUT_SECONDS", 12)
AUTO_SYNC_SECONDS = env_int("MAIL_AUTO_SYNC_SECONDS", 0)
SESSIONS = {}
LOGIN_MAX_FAILURES = env_int("MAIL_LOGIN_MAX_FAILURES", 5)
LOGIN_LOCK_SECONDS = env_int("MAIL_LOGIN_LOCK_SECONDS", 300)
LOGIN_FAILURES = {}


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(conn, table, column, definition):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL DEFAULT 993,
                imap_ssl INTEGER NOT NULL DEFAULT 1,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL DEFAULT 465,
                smtp_ssl INTEGER NOT NULL DEFAULT 1,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_sync_at TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                uid TEXT NOT NULL,
                mailbox TEXT NOT NULL DEFAULT 'INBOX',
                sender TEXT,
                recipient TEXT,
                subject TEXT,
                body_text TEXT,
                body_html TEXT,
                code TEXT,
                received_at TEXT,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                raw_headers TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(account_id, uid, mailbox),
                FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                detail TEXT,
                level TEXT NOT NULL DEFAULT 'info',
                account_id INTEGER,
                message_id INTEGER,
                created_at TEXT NOT NULL
            );
            """
        )
        ensure_column(conn, "accounts", "is_active", "INTEGER NOT NULL DEFAULT 1")
        ensure_column(conn, "accounts", "last_error", "TEXT")
        ensure_column(conn, "messages", "is_processed", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "messages", "processed_at", "TEXT")
        ensure_column(conn, "messages", "deleted_at", "TEXT")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def log_event(action, detail="", level="info", account_id=None, message_id=None):
    try:
        with db() as conn:
            conn.execute(
                """
                INSERT INTO operation_logs (action, detail, level, account_id, message_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (action, detail, level, account_id, message_id, now_iso()),
            )
    except Exception as exc:
        print(f"Failed to write operation log: {exc}")


def decode_mime(value):
    if not value:
        return ""
    parts = []
    for text, charset in decode_header(value):
        if isinstance(text, bytes):
            parts.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(text)
    return "".join(parts)


def strip_html(value):
    return re.sub(r"<[^>]+>", " ", value)


def extract_text_parts(message):
    text = ""
    html = ""
    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = part.get_content_disposition()
            if disposition == "attachment":
                continue
            try:
                payload = part.get_content()
            except Exception:
                payload = ""
            if content_type == "text/plain" and not text:
                text = str(payload)
            elif content_type == "text/html" and not html:
                html = str(payload)
    else:
        try:
            payload = message.get_content()
        except Exception:
            payload = ""
        if message.get_content_type() == "text/html":
            html = str(payload)
        else:
            text = str(payload)
    return text.strip(), html.strip()


def extract_code(subject, body_text, body_html):
    haystack = "\n".join([subject or "", body_text or "", strip_html(body_html or "")])
    patterns = [
        r"(?i)(?:验证码|校验码|动态码|安全码|verification|verify|code)[^\d]{0,24}(\d{4,8})",
        r"(?<!\d)(\d{4,8})(?!\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, haystack)
        if match:
            return match.group(1)
    return ""


def row_to_dict(row):
    return dict(row) if row else None


def public_account(row):
    item = row_to_dict(row)
    if not item:
        return None
    item.pop("password", None)
    return item


def get_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def get_session(handler):
    header = handler.headers.get("Cookie", "")
    jar = cookies.SimpleCookie(header)
    token = jar.get("mail_session")
    if not token:
        return None
    session = SESSIONS.get(token.value)
    if not session:
        return None
    if session["expires_at"] < time.time():
        SESSIONS.pop(token.value, None)
        return None
    return token.value


def require_auth(handler):
    if urlparse(handler.path).path == "/api/login":
        return True
    return get_session(handler) is not None


def get_api_token(handler, query):
    auth = handler.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    header_token = handler.headers.get("X-Api-Token", "").strip()
    if header_token:
        return header_token
    return query.get("token", [""])[0].strip()


def allow_code_api_token(handler, parsed):
    if parsed.path != "/api/codes/latest" or not CODE_API_TOKEN:
        return False
    return secrets.compare_digest(get_api_token(handler, parse_qs(parsed.query)), CODE_API_TOKEN)


def client_ip(handler):
    return handler.client_address[0] if handler.client_address else "unknown"


def login_retry_after(ip):
    state = LOGIN_FAILURES.get(ip)
    if not state:
        return 0
    locked_until = state.get("locked_until", 0)
    if locked_until <= time.time():
        if locked_until:
            LOGIN_FAILURES.pop(ip, None)
        return 0
    return int(locked_until - time.time()) + 1


def record_login_failure(ip):
    now = time.time()
    state = LOGIN_FAILURES.get(ip, {"count": 0, "first_failed_at": now, "locked_until": 0})
    if now - state.get("first_failed_at", now) > LOGIN_LOCK_SECONDS:
        state = {"count": 0, "first_failed_at": now, "locked_until": 0}
    state["count"] += 1
    if state["count"] >= LOGIN_MAX_FAILURES:
        state["locked_until"] = now + LOGIN_LOCK_SECONDS
    LOGIN_FAILURES[ip] = state
    return login_retry_after(ip)


def clear_login_failures(ip):
    LOGIN_FAILURES.pop(ip, None)


def bool_to_int(value, default=True):
    if value is None:
        return 1 if default else 0
    if isinstance(value, bool):
        return 1 if value else 0
    return 1 if str(value).lower() in {"1", "true", "yes", "on"} else 0


def open_imap(account, select_inbox=True):
    if account["imap_ssl"]:
        client = imaplib.IMAP4_SSL(account["imap_host"], int(account["imap_port"]), timeout=MAIL_TIMEOUT_SECONDS)
    else:
        client = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]), timeout=MAIL_TIMEOUT_SECONDS)
    client.login(account["username"], account["password"])
    if select_inbox:
        client.select("INBOX")
    return client


def open_smtp(account):
    if account["smtp_ssl"]:
        client = smtplib.SMTP_SSL(
            account["smtp_host"],
            int(account["smtp_port"]),
            timeout=MAIL_TIMEOUT_SECONDS,
            context=ssl.create_default_context(),
        )
    else:
        client = smtplib.SMTP(account["smtp_host"], int(account["smtp_port"]), timeout=MAIL_TIMEOUT_SECONDS)
        client.starttls(context=ssl.create_default_context())
    client.login(account["username"], account["password"])
    return client


def account_config_from_payload(payload, existing=None):
    def value(name, default=""):
        incoming = payload.get(name)
        if incoming in (None, ""):
            return existing[name] if existing and name in existing.keys() else default
        return incoming

    return {
        "name": value("name"),
        "email": value("email"),
        "imap_host": value("imap_host"),
        "imap_port": int(value("imap_port", 993) or 993),
        "imap_ssl": bool_to_int(payload.get("imap_ssl"), True if not existing else bool(existing["imap_ssl"])),
        "smtp_host": value("smtp_host"),
        "smtp_port": int(value("smtp_port", 465) or 465),
        "smtp_ssl": bool_to_int(payload.get("smtp_ssl"), True if not existing else bool(existing["smtp_ssl"])),
        "username": value("username"),
        "password": value("password"),
    }


def validate_account_config(account, require_password=True):
    def cfg(name):
        if hasattr(account, "get"):
            return account.get(name)
        return account[name]

    required = ["name", "email", "imap_host", "smtp_host", "username"]
    if require_password:
        required.append("password")
    missing = [field for field in required if not cfg(field)]
    if missing:
        raise ValueError("缺少字段: " + ", ".join(missing))


def import_accounts(rows):
    results = []
    created = 0
    for index, payload in enumerate(rows, start=1):
        try:
            account = account_config_from_payload(payload)
            validate_account_config(account)
            with db() as conn:
                duplicate = conn.execute(
                    "SELECT id FROM accounts WHERE email = ? LIMIT 1",
                    (account["email"],),
                ).fetchone()
                if duplicate:
                    results.append(
                        {
                            "row": index,
                            "email": account["email"],
                            "ok": False,
                            "error": "邮箱地址已存在",
                        }
                    )
                    continue
                cur = conn.execute(
                    """
                    INSERT INTO accounts (
                        name, email, imap_host, imap_port, imap_ssl, smtp_host, smtp_port,
                        smtp_ssl, username, password, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        account["name"],
                        account["email"],
                        account["imap_host"],
                        account["imap_port"],
                        account["imap_ssl"],
                        account["smtp_host"],
                        account["smtp_port"],
                        account["smtp_ssl"],
                        account["username"],
                        account["password"],
                        now_iso(),
                    ),
                )
            created += 1
            results.append({"row": index, "id": cur.lastrowid, "email": account["email"], "ok": True})
        except Exception as exc:
            results.append({"row": index, "email": payload.get("email", ""), "ok": False, "error": str(exc)})
    failed = len(rows) - created
    log_event("bulk_import", f"批量导入邮箱账号：成功 {created} 个，失败 {failed} 个")
    return {"created": created, "failed": failed, "results": results}


def test_account_connection(account):
    validate_account_config(account)
    result = {"imap": {"ok": False, "message": ""}, "smtp": {"ok": False, "message": ""}}

    imap_client = None
    try:
        imap_client = open_imap(account)
        result["imap"] = {"ok": True, "message": "IMAP 连接成功"}
    except Exception as exc:
        result["imap"] = {"ok": False, "message": str(exc)}
    finally:
        if imap_client:
            try:
                imap_client.logout()
            except Exception:
                pass

    smtp_client = None
    try:
        smtp_client = open_smtp(account)
        result["smtp"] = {"ok": True, "message": "SMTP 连接成功"}
    except Exception as exc:
        result["smtp"] = {"ok": False, "message": str(exc)}
    finally:
        if smtp_client:
            try:
                smtp_client.quit()
            except Exception:
                pass

    return result


def fetch_messages_for_account(account_id, limit=50):
    with db() as conn:
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not account:
        raise ValueError("邮箱账号不存在")

    client = None
    try:
        client = open_imap(account)
        status, data = client.uid("search", None, "ALL")
        if status != "OK":
            raise RuntimeError("IMAP 搜索邮件失败")

        all_uids = data[0].split() if data and data[0] else []
        uids = all_uids[-limit:]
        saved = 0
        code_count = 0
        with db() as conn:
            for uid_bytes in reversed(uids):
                uid = uid_bytes.decode("ascii", errors="ignore")
                status, msg_data = client.uid("fetch", uid, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                parsed = BytesParser(policy=default).parsebytes(raw)
                subject = decode_mime(parsed.get("Subject"))
                sender = decode_mime(parsed.get("From"))
                recipient = decode_mime(parsed.get("To"))
                text, html = extract_text_parts(parsed)
                received = parsed.get("Date") or now_iso()
                code = extract_code(subject, text, html)
                headers = "\n".join(f"{k}: {v}" for k, v in parsed.items())
                if code:
                    code_count += 1
                conn.execute(
                    """
                    INSERT INTO messages (
                        account_id, uid, mailbox, sender, recipient, subject, body_text,
                        body_html, code, received_at, raw_headers, created_at
                    )
                    VALUES (?, ?, 'INBOX', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id, uid, mailbox) DO UPDATE SET
                        sender=excluded.sender,
                        recipient=excluded.recipient,
                        subject=excluded.subject,
                        body_text=excluded.body_text,
                        body_html=excluded.body_html,
                        code=excluded.code,
                        received_at=excluded.received_at,
                        raw_headers=excluded.raw_headers,
                        is_deleted=0,
                        deleted_at=NULL
                    """,
                    (
                        account_id,
                        uid,
                        sender,
                        recipient,
                        subject,
                        text,
                        html,
                        code,
                        received,
                        headers,
                        now_iso(),
                    ),
                )
                saved += 1
            conn.execute(
                "UPDATE accounts SET last_sync_at = ?, last_error = NULL WHERE id = ?",
                (now_iso(), account_id),
            )
        log_event("sync", f"{account['email']} 同步 {saved} 封邮件，识别 {code_count} 个验证码", account_id=account_id)
        return {"synced": saved, "codes": code_count}
    except Exception as exc:
        with db() as conn:
            conn.execute("UPDATE accounts SET last_error = ? WHERE id = ?", (str(exc), account_id))
        log_event("sync_failed", f"{account['email']} 同步失败: {exc}", "error", account_id=account_id)
        raise
    finally:
        if client:
            try:
                client.logout()
            except Exception:
                pass


def sync_all_accounts():
    with db() as conn:
        accounts = conn.execute("SELECT * FROM accounts WHERE is_active = 1 ORDER BY id DESC").fetchall()
    results = []
    for account in accounts:
        try:
            result = fetch_messages_for_account(account["id"])
            results.append({"account_id": account["id"], "email": account["email"], "ok": True, **result})
        except Exception as exc:
            results.append({"account_id": account["id"], "email": account["email"], "ok": False, "error": str(exc)})
    return results


def auto_sync_loop(interval_seconds):
    while True:
        time.sleep(interval_seconds)
        try:
            results = sync_all_accounts()
            ok_count = sum(1 for item in results if item.get("ok"))
            failed_count = len(results) - ok_count
            synced_count = sum(item.get("synced", 0) for item in results if item.get("ok"))
            code_count = sum(item.get("codes", 0) for item in results if item.get("ok"))
            log_event(
                "auto_sync",
                f"自动同步完成：成功 {ok_count} 个，失败 {failed_count} 个，同步 {synced_count} 封，识别 {code_count} 个验证码",
            )
        except Exception as exc:
            log_event("auto_sync_failed", f"自动同步失败: {exc}", "error")


def start_auto_sync():
    if AUTO_SYNC_SECONDS <= 0:
        return
    worker = threading.Thread(target=auto_sync_loop, args=(AUTO_SYNC_SECONDS,), daemon=True)
    worker.start()
    log_event("auto_sync_started", f"自动同步已开启，每 {AUTO_SYNC_SECONDS} 秒执行一次")
    print(f"Auto sync enabled: every {AUTO_SYNC_SECONDS} seconds")


def delete_remote_message(message_id):
    with db() as conn:
        message = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
        if not message:
            raise ValueError("邮件不存在")
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (message["account_id"],)).fetchone()

    client = open_imap(account)
    try:
        client.uid("store", message["uid"], "+FLAGS", "(\\Deleted)")
        client.expunge()
    finally:
        try:
            client.logout()
        except Exception:
            pass

    with db() as conn:
        conn.execute(
            "UPDATE messages SET is_deleted = 1, deleted_at = ? WHERE id = ?",
            (now_iso(), message_id),
        )
    log_event("delete_remote", f"服务器删除邮件: {message['subject'] or message['uid']}", message_id=message_id)


def send_mail(account_id, to_addr, subject, body):
    with db() as conn:
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not account:
        raise ValueError("邮箱账号不存在")

    message = EmailMessage()
    message["From"] = account["email"]
    message["To"] = to_addr
    message["Subject"] = subject
    message.set_content(body)

    client = open_smtp(account)
    try:
        client.send_message(message)
    finally:
        client.quit()
    log_event("send", f"{account['email']} 发送邮件到 {to_addr}: {subject}", account_id=account_id)


def latest_code_data(query):
    account_id = query.get("account_id", [""])[0].strip()
    email = query.get("email", [""])[0].strip()
    search = query.get("q", [""])[0].strip()
    unprocessed = query.get("unprocessed", ["0"])[0] == "1"
    mark_processed = query.get("mark_processed", ["0"])[0] == "1"

    where = ["m.is_deleted = 0", "COALESCE(m.code, '') <> ''"]
    params = []
    if account_id:
        where.append("m.account_id = ?")
        params.append(account_id)
    if email:
        where.append("a.email = ?")
        params.append(email)
    if unprocessed:
        where.append("m.is_processed = 0")
    if search:
        like = f"%{search}%"
        where.append("(m.subject LIKE ? OR m.sender LIKE ? OR m.body_text LIKE ? OR m.code LIKE ?)")
        params.extend([like, like, like, like])

    sql = f"""
        SELECT
            m.id, m.account_id, m.code, m.subject, m.sender, m.recipient,
            m.received_at, m.created_at, m.is_processed,
            a.name AS account_name, a.email AS account_email
        FROM messages m
        JOIN accounts a ON a.id = m.account_id
        WHERE {' AND '.join(where)}
        ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
        LIMIT 1
    """
    with db() as conn:
        row = conn.execute(sql, params).fetchone()
        if not row:
            return {"code": None}
        item = row_to_dict(row)
        if mark_processed and not item["is_processed"]:
            conn.execute(
                "UPDATE messages SET is_processed = 1, processed_at = ? WHERE id = ?",
                (now_iso(), item["id"]),
            )
            item["is_processed"] = 1
    return {"code": item}


def dashboard_data():
    with db() as conn:
        stats = {
            "accounts": conn.execute("SELECT COUNT(*) AS c FROM accounts WHERE is_active = 1").fetchone()["c"],
            "messages": conn.execute("SELECT COUNT(*) AS c FROM messages WHERE is_deleted = 0").fetchone()["c"],
            "codes": conn.execute(
                "SELECT COUNT(*) AS c FROM messages WHERE is_deleted = 0 AND COALESCE(code, '') <> ''"
            ).fetchone()["c"],
            "unprocessed": conn.execute(
                "SELECT COUNT(*) AS c FROM messages WHERE is_deleted = 0 AND is_processed = 0"
            ).fetchone()["c"],
            "latest_sync_at": conn.execute("SELECT MAX(last_sync_at) AS v FROM accounts").fetchone()["v"],
            "auto_sync_seconds": AUTO_SYNC_SECONDS,
        }
        recent_codes = [
            row_to_dict(row)
            for row in conn.execute(
                """
                SELECT m.id, m.code, m.subject, m.sender, m.received_at, a.name AS account_name, a.email AS account_email
                FROM messages m
                JOIN accounts a ON a.id = m.account_id
                WHERE m.is_deleted = 0 AND COALESCE(m.code, '') <> ''
                ORDER BY COALESCE(m.received_at, m.created_at) DESC
                LIMIT 8
                """
            ).fetchall()
        ]
        logs = [
            row_to_dict(row)
            for row in conn.execute(
                """
                SELECT id, action, detail, level, account_id, message_id, created_at
                FROM operation_logs
                ORDER BY id DESC
                LIMIT 10
                """
            ).fetchall()
        ]
        accounts = [
            public_account(row)
            for row in conn.execute(
                """
                SELECT *
                FROM accounts
                ORDER BY id DESC
                LIMIT 8
                """
            ).fetchall()
        ]
    return {"stats": stats, "recent_codes": recent_codes, "logs": logs, "accounts": accounts}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            if not require_auth(self) and not allow_code_api_token(self, parsed):
                return send_json(self, {"error": "未登录"}, 401)
            return self.handle_api_get(parsed)
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/login" and not require_auth(self):
            return send_json(self, {"error": "未登录"}, 401)
        try:
            return self.handle_api_post(parsed)
        except Exception as exc:
            return send_json(self, {"error": str(exc)}, 400)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not require_auth(self):
            return send_json(self, {"error": "未登录"}, 401)
        try:
            return self.handle_api_put(parsed)
        except Exception as exc:
            return send_json(self, {"error": str(exc)}, 400)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if not require_auth(self):
            return send_json(self, {"error": "未登录"}, 401)
        try:
            return self.handle_api_delete(parsed)
        except Exception as exc:
            return send_json(self, {"error": str(exc)}, 400)

    def handle_api_get(self, parsed):
        query = parse_qs(parsed.query)
        if parsed.path == "/api/me":
            return send_json(self, {"user": ADMIN_USER})
        if parsed.path == "/api/dashboard":
            return send_json(self, dashboard_data())
        if parsed.path == "/api/logs":
            with db() as conn:
                rows = conn.execute(
                    "SELECT * FROM operation_logs ORDER BY id DESC LIMIT 100"
                ).fetchall()
            return send_json(self, {"logs": [row_to_dict(row) for row in rows]})
        if parsed.path == "/api/codes/latest":
            return send_json(self, latest_code_data(query))
        if parsed.path == "/api/accounts":
            with db() as conn:
                rows = conn.execute("SELECT * FROM accounts ORDER BY id DESC").fetchall()
            return send_json(self, {"accounts": [public_account(r) for r in rows]})
        if parsed.path == "/api/messages":
            account_id = query.get("account_id", [""])[0]
            only_codes = query.get("only_codes", ["0"])[0] == "1"
            processed = query.get("processed", [""])[0]
            search = f"%{query.get('q', [''])[0]}%"
            params = []
            where = ["m.is_deleted = 0"]
            if account_id:
                where.append("m.account_id = ?")
                params.append(account_id)
            if only_codes:
                where.append("COALESCE(m.code, '') <> ''")
            if processed in {"0", "1"}:
                where.append("m.is_processed = ?")
                params.append(int(processed))
            if search != "%%":
                where.append("(m.subject LIKE ? OR m.sender LIKE ? OR m.body_text LIKE ? OR m.code LIKE ?)")
                params.extend([search, search, search, search])
            sql = f"""
                SELECT m.*, a.email AS account_email, a.name AS account_name
                FROM messages m
                JOIN accounts a ON a.id = m.account_id
                WHERE {' AND '.join(where)}
                ORDER BY COALESCE(m.received_at, m.created_at) DESC
                LIMIT 200
            """
            with db() as conn:
                rows = conn.execute(sql, params).fetchall()
            messages = []
            for row in rows:
                item = row_to_dict(row)
                item["body_preview"] = (item.get("body_text") or strip_html(item.get("body_html") or ""))[:220]
                item.pop("body_html", None)
                item.pop("raw_headers", None)
                messages.append(item)
            return send_json(self, {"messages": messages})
        if parsed.path.startswith("/api/messages/"):
            message_id = parsed.path.rsplit("/", 1)[-1]
            with db() as conn:
                row = conn.execute(
                    """
                    SELECT m.*, a.email AS account_email, a.name AS account_name
                    FROM messages m
                    JOIN accounts a ON a.id = m.account_id
                    WHERE m.id = ?
                    """,
                    (message_id,),
                ).fetchone()
            if not row:
                return send_json(self, {"error": "邮件不存在"}, 404)
            return send_json(self, {"message": row_to_dict(row)})
        return send_json(self, {"error": "接口不存在"}, 404)

    def handle_api_post(self, parsed):
        payload = get_json(self)
        if parsed.path == "/api/login":
            ip = client_ip(self)
            retry_after = login_retry_after(ip)
            if retry_after:
                return send_json(self, {"error": f"登录失败次数过多，请 {retry_after} 秒后再试"}, 429)
            if payload.get("username") != ADMIN_USER or payload.get("password") != ADMIN_PASSWORD:
                retry_after = record_login_failure(ip)
                detail = f"{payload.get('username', '')} from {ip}"
                if retry_after:
                    detail = f"{detail}，已临时锁定 {retry_after} 秒"
                log_event("login_failed", detail, "warning")
                return send_json(self, {"error": "账号或密码错误"}, 401)
            clear_login_failures(ip)
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = {"user": ADMIN_USER, "expires_at": time.time() + SESSION_TTL_SECONDS}
            log_event("login", f"{ADMIN_USER} 登录后台")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header(
                "Set-Cookie",
                f"mail_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL_SECONDS}",
            )
            body = json.dumps({"user": ADMIN_USER}, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/api/logout":
            token = get_session(self)
            if token:
                SESSIONS.pop(token, None)
            log_event("logout", f"{ADMIN_USER} 退出登录")
            self.send_response(200)
            self.send_header("Set-Cookie", "mail_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')
            return
        if parsed.path == "/api/accounts/test":
            account = account_config_from_payload(payload)
            result = test_account_connection(account)
            log_event("test_account", f"{account['email']} 连接测试")
            return send_json(self, result)
        if parsed.path == "/api/accounts/bulk":
            rows = payload.get("accounts", [])
            if not isinstance(rows, list) or not rows:
                raise ValueError("请提供 accounts 数组")
            if len(rows) > 500:
                raise ValueError("单次最多导入 500 个邮箱账号")
            return send_json(self, import_accounts(rows))
        if parsed.path == "/api/accounts":
            account = account_config_from_payload(payload)
            validate_account_config(account)
            with db() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO accounts (
                        name, email, imap_host, imap_port, imap_ssl, smtp_host, smtp_port,
                        smtp_ssl, username, password, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        account["name"],
                        account["email"],
                        account["imap_host"],
                        account["imap_port"],
                        account["imap_ssl"],
                        account["smtp_host"],
                        account["smtp_port"],
                        account["smtp_ssl"],
                        account["username"],
                        account["password"],
                        now_iso(),
                    ),
                )
            log_event("create_account", f"新增邮箱账号: {account['email']}", account_id=cur.lastrowid)
            return send_json(self, {"id": cur.lastrowid})
        if parsed.path == "/api/sync-all":
            results = sync_all_accounts()
            ok_count = sum(1 for item in results if item["ok"])
            fail_count = len(results) - ok_count
            log_event("sync_all", f"全部同步完成，成功 {ok_count} 个，失败 {fail_count} 个")
            return send_json(self, {"results": results, "ok_count": ok_count, "fail_count": fail_count})
        if parsed.path.startswith("/api/accounts/") and parsed.path.endswith("/sync"):
            account_id = int(parsed.path.split("/")[-2])
            result = fetch_messages_for_account(account_id)
            return send_json(self, result)
        if parsed.path.startswith("/api/accounts/") and parsed.path.endswith("/test"):
            account_id = int(parsed.path.split("/")[-2])
            with db() as conn:
                account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
            if not account:
                return send_json(self, {"error": "邮箱账号不存在"}, 404)
            result = test_account_connection(account)
            log_event("test_account", f"{account['email']} 连接测试", account_id=account_id)
            return send_json(self, result)
        if parsed.path.startswith("/api/messages/") and parsed.path.endswith("/processed"):
            message_id = int(parsed.path.split("/")[-2])
            processed = bool_to_int(payload.get("processed"), True)
            processed_at = now_iso() if processed else None
            with db() as conn:
                conn.execute(
                    "UPDATE messages SET is_processed = ?, processed_at = ? WHERE id = ?",
                    (processed, processed_at, message_id),
                )
            log_event("mark_processed", f"邮件标记为{'已处理' if processed else '未处理'}", message_id=message_id)
            return send_json(self, {"ok": True, "processed": processed})
        if parsed.path == "/api/send":
            for key in ["account_id", "to", "subject", "body"]:
                if not payload.get(key):
                    raise ValueError("缺少字段: " + key)
            send_mail(int(payload["account_id"]), payload["to"], payload["subject"], payload["body"])
            return send_json(self, {"ok": True})
        return send_json(self, {"error": "接口不存在"}, 404)

    def handle_api_put(self, parsed):
        payload = get_json(self)
        if parsed.path.startswith("/api/accounts/"):
            account_id = int(parsed.path.rsplit("/", 1)[-1])
            with db() as conn:
                existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
                if not existing:
                    return send_json(self, {"error": "邮箱账号不存在"}, 404)
                account = account_config_from_payload(payload, existing)
                validate_account_config(account)
                conn.execute(
                    """
                    UPDATE accounts SET
                        name = ?, email = ?, imap_host = ?, imap_port = ?, imap_ssl = ?,
                        smtp_host = ?, smtp_port = ?, smtp_ssl = ?, username = ?, password = ?,
                        is_active = ?
                    WHERE id = ?
                    """,
                    (
                        account["name"],
                        account["email"],
                        account["imap_host"],
                        account["imap_port"],
                        account["imap_ssl"],
                        account["smtp_host"],
                        account["smtp_port"],
                        account["smtp_ssl"],
                        account["username"],
                        account["password"],
                        bool_to_int(payload.get("is_active"), bool(existing["is_active"])),
                        account_id,
                    ),
                )
            log_event("update_account", f"更新邮箱账号: {account['email']}", account_id=account_id)
            return send_json(self, {"ok": True})
        return send_json(self, {"error": "接口不存在"}, 404)

    def handle_api_delete(self, parsed):
        if parsed.path.startswith("/api/accounts/"):
            account_id = int(parsed.path.rsplit("/", 1)[-1])
            with db() as conn:
                account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
                conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
            if account:
                log_event("delete_account", f"删除邮箱账号: {account['email']}", account_id=account_id)
            return send_json(self, {"ok": True})
        if parsed.path.startswith("/api/messages/"):
            message_id = int(parsed.path.rsplit("/", 1)[-1])
            mode = parse_qs(parsed.query).get("mode", ["local"])[0]
            if mode == "remote":
                delete_remote_message(message_id)
            else:
                with db() as conn:
                    message = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
                    conn.execute(
                        "UPDATE messages SET is_deleted = 1, deleted_at = ? WHERE id = ?",
                        (now_iso(), message_id),
                    )
                if message:
                    log_event("delete_local", f"本地删除邮件: {message['subject'] or message['uid']}", message_id=message_id)
            return send_json(self, {"ok": True})
        return send_json(self, {"error": "接口不存在"}, 404)


def main():
    init_db()
    start_auto_sync()
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8088"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Mail Code Admin is running at http://{host}:{port}")
    print(f"Default login: {ADMIN_USER} / {ADMIN_PASSWORD}")
    server.serve_forever()


if __name__ == "__main__":
    main()
