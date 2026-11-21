"""Look through the files in this repository for personal details that should not be here.

Usage:  python tools/pii_scan.py            (run from the repository root)

It reads every text file git tracks and stops with exit code 1 if it finds an email address, a phone
number, a Social Security or card number, or what looks like a person's first and last name. It is the pull-request counterpart of the
check the loader runs on member data (backend/privacy.py), and uses the same tool, Microsoft Presidio.

A real finding means a file needs editing. A harmless one (a firm named after a person, a made-up
name in a test) goes in .pii-allowlist.txt, one per line, after a person has looked at it.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend import privacy  # noqa: E402

ALLOWLIST = ROOT / ".pii-allowlist.txt"
# Files with nothing a person wrote in them: package manifests, map shapes, fonts, images, third-party code.
SKIP_DIRS = ("frontend/src/geo/", "static-dashboard/vendor/", "static-dashboard/assets/")
SKIP_NAMES = ("package-lock.json",)
SKIP_ENDINGS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".svg")
MAX_BYTES = 400_000
# In code, a language model sees a "name" in almost any identifier. A match only counts as a person's name
# when it looks like one: two or three capitalised words, such as "Jane Doe" or "Jane Q. Doe".
LOOKS_LIKE_A_NAME = re.compile(r"^[A-Z][a-z'’-]+(?: [A-Z](?:\.|[a-z'’-]+))? [A-Z][a-z'’-]+$")
# Number types that match too loosely in code to be useful here; the loader still checks them on member data.
TOO_LOOSE_FOR_CODE = {"US_DRIVER_LICENSE", "US_BANK_NUMBER", "US_PASSPORT", "US_ITIN", "UK_NHS", "MEDICAL_LICENSE", "CRYPTO"}
KINDS = [kind for kind in privacy.BLOCKED if kind not in TOO_LOOSE_FOR_CODE] + privacy.NAMES


def tracked_files():
    listed = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode()
    for name in filter(None, listed.split("\0")):
        if name.startswith(SKIP_DIRS) or name.endswith(SKIP_ENDINGS) or name.rsplit("/", 1)[-1] in SKIP_NAMES:
            continue
        path = ROOT / name
        if path.is_file() and path.stat().st_size <= MAX_BYTES:
            yield name, path


def allowed():
    if not ALLOWLIST.exists():
        return set()
    lines = (line.strip() for line in ALLOWLIST.read_text().splitlines())
    return {line.lower() for line in lines if line and not line.startswith("#")}


def scan():
    """Findings as (file, line number, kind, matched text), leaving out anything on the allowlist."""
    ok = allowed()
    engine = privacy.analyzer()
    found = []
    for name, path in tracked_files():
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue  # not text
        for number, line in enumerate(lines, start=1):
            if not line.strip() or len(line) > 2000:
                continue
            for hit in engine.analyze(text=line, language="en", entities=KINDS, score_threshold=0.4):
                matched = line[hit.start:hit.end].strip(" \t'\"`.,;:()[]{}<>")
                if hit.entity_type in privacy.NAMES and not LOOKS_LIKE_A_NAME.match(matched):
                    continue
                if matched.lower() not in ok:
                    found.append((name, number, hit.entity_type, matched))
    return found


def main():
    found = scan()
    if not found:
        print("No personal details found in the tracked files.")
        return 0
    print("Personal details may be in these files. Remove them, or if a match is harmless add it to .pii-allowlist.txt:\n")
    for name, number, kind, matched in found:
        print("  %s:%d  %s  %r" % (name, number, kind, matched))
    print("\n%d to look at." % len(found))
    return 1


if __name__ == "__main__":
    sys.exit(main())
