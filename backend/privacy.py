"""What keeps a person from being picked out of the database.

Four things, used by the ingest before anything is stored:

1. `pseudonym`: the ISACA member ID becomes a keyed hash. The same member gets the same
   hash every month, which is what lets one month be compared with the next, but the hash
   cannot be turned back into an ID without the key. The key never goes in the database or
   the repository: it comes from the MEMBERS_KEY environment variable, or is kept in the
   computer's keychain.
2. `floor_values`: a value shared by fewer than K members (an employer, a ZIP code, a city)
   is blanked.
3. `scan_text`: Microsoft Presidio reads every stored piece of text for personal or health
   details (emails, phone numbers, ID and card numbers, people's names).
4. `check_frame`: Pandera checks that only the allowed columns, with allowed values, are stored.

Rows stay unique in combination, so the database is confidential. This module lowers what a
copy of it would reveal; it does not make the data anonymous.
"""
import functools
import hashlib
import hmac
import os
import pathlib
import re
import secrets

# The smallest group a stored employer, ZIP code or city may have, and the smallest the site shows.
K = 5

KEY_SERVICE = "westfloridaisaca"
KEY_NAME = "member-pseudonym-key"
ALLOWLIST = pathlib.Path(__file__).with_name("pii_allowlist.txt")

# Presidio entity types that stop a load outright, wherever they appear.
BLOCKED = [
    "EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN", "US_ITIN", "US_PASSPORT", "US_DRIVER_LICENSE", "US_BANK_NUMBER",
    "CREDIT_CARD", "IBAN_CODE", "IP_ADDRESS", "MEDICAL_LICENSE", "UK_NHS", "CRYPTO",
]
# A person's name stops a load unless the whole value is on the reviewed allowlist (firms named after people).
NAMES = ["PERSON"]


class PrivacyError(Exception):
    """A load was stopped because it would have stored something it must not."""


# ---------------------------------------------------------------- the key

def load_key(create=True):
    """The secret behind the pseudonyms: MEMBERS_KEY (hex) if set, else the keychain entry, made on first use."""
    from_env = os.environ.get("MEMBERS_KEY")
    if from_env:
        key = bytes.fromhex(from_env)
        if len(key) < 32:
            raise PrivacyError("MEMBERS_KEY must be at least 32 bytes of hex (64 characters)")
        return key
    try:
        import keyring
        stored = keyring.get_password(KEY_SERVICE, KEY_NAME)
        if stored is None and create:
            stored = secrets.token_hex(32)
            keyring.set_password(KEY_SERVICE, KEY_NAME, stored)
            print("Made a new pseudonym key and saved it in this computer's keychain as '%s'. "
                  "Back it up: without it, next month's report cannot be matched to this one." % KEY_SERVICE)
        if stored:
            return bytes.fromhex(stored)
    except Exception as err:  # no keychain on this machine
        raise PrivacyError("No pseudonym key: set MEMBERS_KEY to 64 hex characters, or use a computer with a keychain (%s)" % err)
    raise PrivacyError("No pseudonym key found")


def pseudonym(key, context, value):
    """A stable stand-in for `value`. `context` keeps stand-ins made for one purpose from matching another's."""
    message = ("%s:%s" % (context, str(value).strip())).encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()[:32]


def fingerprint(key):
    """Identifies a key without revealing it, so a load made with the wrong key can be refused."""
    return pseudonym(key, "fingerprint", KEY_SERVICE)[:16]


# ---------------------------------------------------------------- small groups

def floor_values(frame, columns, k=K):
    """Blank any value in `columns` that fewer than k rows share. Returns {column: rows blanked}."""
    blanked = {}
    for column in columns:
        counts = frame[column].map(frame[column].value_counts())
        small = frame[column].notna() & (counts < k)
        frame[column] = frame[column].astype(object).where(~small, None)
        blanked[column] = int(small.sum())
    return blanked


def smallest_group(frame, column):
    counts = frame[column].dropna().value_counts()
    return int(counts.min()) if len(counts) else None


def unique_rows(frame, columns):
    """How many rows no other row matches on all of `columns`: a measure of exposure, not a gate."""
    sizes = frame.groupby(columns, dropna=False)[columns[0]].transform("size")
    return int((sizes == 1).sum())


# ---------------------------------------------------------------- personal details in text

@functools.lru_cache(maxsize=1)
def analyzer():
    # Presidio checks email domains with tldextract, which by default downloads a list of domain endings.
    # Nothing may leave this computer during a load, so it is told to use the copy it ships with.
    import tldextract
    tldextract.extract = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    model = os.environ.get("PII_MODEL", "en_core_web_lg")
    engine = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy", "models": [{"lang_code": "en", "model_name": model}]}).create_engine()
    return AnalyzerEngine(nlp_engine=engine, supported_languages=["en"])


def allowlist():
    if not ALLOWLIST.exists():
        return set()
    lines = (line.strip() for line in ALLOWLIST.read_text().splitlines())
    return {line.lower() for line in lines if line and not line.startswith("#")}


# Plain patterns, checked as well as Presidio: they are blunt, and catch what a statistical model can miss.
PATTERNS = [
    ("EMAIL_ADDRESS", re.compile(r"\S+@\S+")),
    ("LONG_NUMBER", re.compile(r"\d(?:[\s().-]*\d){6,}")),  # seven or more digits: a phone, ID, card or account number
    ("URL", re.compile(r"https?://|www\.", re.IGNORECASE)),
]


def scan_text(values, names=True):
    """Findings for each distinct text value: [(value, kind, matched text)]. Empty means clean.
    `names` also looks for people's names; turn it off for values that are place names by nature.

    Finding a person's name is a judgement by a language model and can miss, most of all a name inside a
    longer phrase. The five-member floor is the main protection for free text: one member's own wording
    is not stored unless four others typed the same thing."""
    allowed = allowlist()
    found = []
    for value in sorted({str(v) for v in values if v is not None and str(v).strip()}):
        for kind, pattern in PATTERNS:
            match = pattern.search(value)
            if match:
                found.append((value, kind, match.group(0)))
        hits = analyzer().analyze(text=value, language="en", entities=BLOCKED + (NAMES if names else []), score_threshold=0.3)
        for hit in hits:
            if hit.entity_type in NAMES and value.lower() in allowed:
                continue
            found.append((value, hit.entity_type, value[hit.start:hit.end]))
    return sorted(set(found))


# ---------------------------------------------------------------- what may be stored

def check_frame(frame, columns, categories):
    """Stop unless the frame holds exactly `columns`, and each column in `categories` only its allowed values."""
    import pandera.pandas as pa
    extra = set(frame.columns) ^ set(columns)
    if extra:
        raise PrivacyError("Columns differ from the allowed list: %s" % sorted(extra))
    checks = {name: pa.Column(nullable=True, checks=pa.Check.isin(allowed)) for name, allowed in categories.items()}
    checks["zip"] = pa.Column(nullable=True, checks=pa.Check.str_matches(r"^\d{5}$"))
    checks["join_date"] = pa.Column(nullable=True, checks=pa.Check.str_matches(r"^\d{4}-\d{2}-01$"))
    checks["expiry_date"] = pa.Column(nullable=True, checks=pa.Check.str_matches(r"^\d{4}-\d{2}-01$"))
    try:
        pa.DataFrameSchema(checks).validate(frame, lazy=True)
    except pa.errors.SchemaErrors as err:
        problems = err.failure_cases[["column", "check", "failure_case"]].drop_duplicates().head(10)
        raise PrivacyError("Values outside the allowed lists:\n%s" % problems.to_string(index=False))
