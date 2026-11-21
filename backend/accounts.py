"""Who may use the site: accounts, passwords, sign-in sessions and a record of what happened.

Accounts live in their own database (data/accounts.db), apart from the member data, so that
clearing or reloading the member data never touches them.

    python -m backend.accounts add --email you@example.org --role admin
    python -m backend.accounts list
    python -m backend.accounts set-password --email you@example.org
    python -m backend.accounts disable --email someone@example.org     (or: enable)
    python -m backend.accounts sign-out --email someone@example.org    (ends their sessions)

How it is protected:

- Passwords are never stored. What is stored is an Argon2id hash, the method OWASP recommends,
  with a random salt per password. A password must be 12 to 128 characters and not a common one.
- Signing in gives the browser a random session token in a cookie that scripts cannot read and
  that other sites cannot send. Only a hash of the token is stored, so a copy of this database
  does not let anyone in. A session ends after 8 hours, or after 2 hours without use.
- Five wrong passwords lock an account for 15 minutes. A wrong email and a wrong password get the
  same answer, in about the same time, so the site does not reveal which accounts exist.
- Sign-ins, failures, sign-outs and account changes are written to an audit table.
"""
import argparse
import datetime as dt
import getpass
import hashlib
import os
import pathlib
import secrets
import sqlite3

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

DB_PATH = pathlib.Path(os.environ.get("ACCOUNTS_DB", pathlib.Path(__file__).resolve().parent.parent / "data" / "accounts.db"))

ROLES = ("admin", "member")
SESSION_HOURS = 8        # a session ends this long after sign-in, whatever happens
IDLE_MINUTES = 120       # or after this long without a request
MAX_FAILURES = 5
LOCK_MINUTES = 15
MIN_PASSWORD, MAX_PASSWORD = 12, 128
# A short list of the commonest long passwords; length is the main requirement.
COMMON = {line.strip() for line in pathlib.Path(__file__).with_name("common_passwords.txt").read_text().splitlines()
          if line.strip() and not line.startswith("#")}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0, locked_until TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL, email TEXT, action TEXT NOT NULL, detail TEXT
);
"""

hasher = PasswordHasher()  # Argon2id with the library's current recommended cost settings
# Checked when the email is unknown, so that answering takes as long as for a real account.
DUMMY_HASH = hasher.hash(secrets.token_hex(16))


class AccountError(Exception):
    """Something about an account or password that the person can put right."""


def now():
    return dt.datetime.now(dt.timezone.utc)


def stamp(moment):
    return moment.isoformat(timespec="seconds")


def connect(db_path=None):
    path = pathlib.Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def record(con, email, action, detail=None):
    con.execute("INSERT INTO audit (at, email, action, detail) VALUES (?, ?, ?, ?)", [stamp(now()), email, action, detail])


def clean_email(email):
    email = (email or "").strip().lower()
    if "@" not in email or len(email) > 254 or " " in email:
        raise AccountError("That does not look like an email address")
    return email


def check_password(password):
    if not isinstance(password, str) or not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise AccountError("A password must be %d to %d characters long" % (MIN_PASSWORD, MAX_PASSWORD))
    if password.lower() in COMMON or len(set(password)) < 5:
        raise AccountError("That password is too easy to guess")


def add_user(con, email, password, role="member"):
    email = clean_email(email)
    if role not in ROLES:
        raise AccountError("The role must be one of: %s" % ", ".join(ROLES))
    check_password(password)
    if con.execute("SELECT 1 FROM users WHERE email = ?", [email]).fetchone():
        raise AccountError("There is already an account for %s" % email)
    con.execute("INSERT INTO users (email, role, password_hash, created_at) VALUES (?, ?, ?, ?)",
                [email, role, hasher.hash(password), stamp(now())])
    record(con, email, "account_created", role)
    con.commit()


def set_password(con, email, password):
    email = clean_email(email)
    check_password(password)
    done = con.execute("UPDATE users SET password_hash = ?, failures = 0, locked_until = NULL WHERE email = ?",
                       [hasher.hash(password), email]).rowcount
    if not done:
        raise AccountError("There is no account for %s" % email)
    end_sessions(con, email)
    record(con, email, "password_changed")
    con.commit()


def set_disabled(con, email, disabled):
    email = clean_email(email)
    if not con.execute("UPDATE users SET disabled = ? WHERE email = ?", [1 if disabled else 0, email]).rowcount:
        raise AccountError("There is no account for %s" % email)
    if disabled:
        end_sessions(con, email)
    record(con, email, "account_disabled" if disabled else "account_enabled")
    con.commit()


def end_sessions(con, email):
    con.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)", [clean_email(email)])


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def sign_in(con, email, password):
    """A new session token for the right email and password; None for anything else, with no hint why."""
    try:
        email = clean_email(email)
    except AccountError:
        email = None
    user = con.execute("SELECT * FROM users WHERE email = ?", [email]).fetchone() if email else None
    moment = now()
    if user is None or not isinstance(password, str) or len(password) > MAX_PASSWORD:
        try:
            hasher.verify(DUMMY_HASH, "not the password")
        except VerificationError:
            pass
        record(con, email, "sign_in_failed", "unknown account")
        con.commit()
        return None
    locked = user["locked_until"] and user["locked_until"] > stamp(moment)
    try:
        hasher.verify(user["password_hash"], password)
        correct = True
    except (VerificationError, InvalidHashError):
        correct = False
    if not correct or locked or user["disabled"]:
        if not correct and not locked:
            failures = user["failures"] + 1
            until = stamp(moment + dt.timedelta(minutes=LOCK_MINUTES)) if failures >= MAX_FAILURES else None
            con.execute("UPDATE users SET failures = ?, locked_until = ? WHERE id = ?", [0 if until else failures, until, user["id"]])
        record(con, email, "sign_in_failed", "locked" if locked else "disabled" if user["disabled"] and correct else "wrong password")
        con.commit()
        return None
    if hasher.check_needs_rehash(user["password_hash"]):
        con.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hasher.hash(password), user["id"]])
    token = secrets.token_urlsafe(32)
    con.execute("UPDATE users SET failures = 0, locked_until = NULL WHERE id = ?", [user["id"]])
    con.execute("DELETE FROM sessions WHERE expires_at < ?", [stamp(moment)])
    con.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)",
                [token_hash(token), user["id"], stamp(moment), stamp(moment + dt.timedelta(hours=SESSION_HOURS)), stamp(moment)])
    record(con, email, "signed_in")
    con.commit()
    return token


def user_for(con, token):
    """The signed-in user behind a session token, as {email, role}, or None if the session is not good."""
    if not token or len(token) > 200:
        return None
    moment = now()
    found = con.execute(
        """SELECT u.email, u.role, u.disabled, s.expires_at, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?""", [token_hash(token)]).fetchone()
    if found is None:
        return None
    idle_limit = stamp(moment - dt.timedelta(minutes=IDLE_MINUTES))
    if found["disabled"] or found["expires_at"] < stamp(moment) or found["last_seen"] < idle_limit:
        con.execute("DELETE FROM sessions WHERE token_hash = ?", [token_hash(token)])
        con.commit()
        return None
    if found["last_seen"] < stamp(moment - dt.timedelta(minutes=1)):  # no need to write on every request
        con.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", [stamp(moment), token_hash(token)])
        con.commit()
    return {"email": found["email"], "role": found["role"]}


def sign_out(con, token):
    found = con.execute("SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
                        [token_hash(token or "")]).fetchone()
    con.execute("DELETE FROM sessions WHERE token_hash = ?", [token_hash(token or "")])
    if found:
        record(con, found["email"], "signed_out")
    con.commit()


def ask_password():
    first = getpass.getpass("Password (%d characters or more): " % MIN_PASSWORD)
    if getpass.getpass("Again: ") != first:
        raise AccountError("The two did not match")
    return first


def main():
    parser = argparse.ArgumentParser(description="Manage who may sign in to the site.")
    parser.add_argument("command", choices=["add", "list", "set-password", "disable", "enable", "sign-out"])
    parser.add_argument("--email")
    parser.add_argument("--role", default="member", choices=ROLES)
    parser.add_argument("--db", default=None, help="accounts database (default: data/accounts.db)")
    args = parser.parse_args()
    con = connect(args.db)
    try:
        if args.command == "list":
            for u in con.execute("SELECT email, role, disabled, created_at FROM users ORDER BY email"):
                print("%-40s %-7s %s  since %s" % (u["email"], u["role"], "disabled" if u["disabled"] else "active  ", u["created_at"][:10]))
            return
        if not args.email:
            parser.error("--email is needed for %s" % args.command)
        if args.command == "add":
            add_user(con, args.email, ask_password(), args.role)
            print("Added %s as %s." % (clean_email(args.email), args.role))
        elif args.command == "set-password":
            set_password(con, args.email, ask_password())
            print("Password changed, and any open sessions ended.")
        elif args.command in ("disable", "enable"):
            set_disabled(con, args.email, args.command == "disable")
            print("%s is now %sd." % (clean_email(args.email), args.command))
        elif args.command == "sign-out":
            end_sessions(con, args.email)
            record(con, clean_email(args.email), "sessions_ended")
            con.commit()
            print("Ended every session for %s." % clean_email(args.email))
    except AccountError as err:
        raise SystemExit(str(err))
    finally:
        con.close()


if __name__ == "__main__":
    main()
