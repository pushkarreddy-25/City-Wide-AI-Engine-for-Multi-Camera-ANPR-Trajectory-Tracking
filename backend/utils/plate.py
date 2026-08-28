"""Indian license-plate generation, validation and normalization.

Format used throughout the project (matches the SRS examples such as
``MH-31-AB-1234``):

    <State:2 letters>-<RTO district:2 digits>-<series:1-2 letters>-<number:4 digits>
"""
import random
import re
import string

# State codes weighted toward Maharashtra (Nagpur = MH-31) for realism.
STATE_CODES = ["MH", "MH", "MH", "KA", "MP", "GJ", "DL", "TN", "UP", "RJ"]

PLATE_RE = re.compile(r"^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}$")


def generate_plate(rng: random.Random | None = None, state: str | None = None) -> str:
    """Generate a syntactically valid random Indian plate string."""
    rng = rng or random
    state = state or rng.choice(STATE_CODES)
    district = rng.randint(1, 49)
    series = "".join(rng.choice(string.ascii_uppercase) for _ in range(rng.choice([1, 2])))
    number = rng.randint(1, 9999)
    return f"{state}-{district:02d}-{series}-{number:04d}"


def is_valid_plate(text: str) -> bool:
    """True if ``text`` matches the expected Indian plate format."""
    if not text:
        return False
    return bool(PLATE_RE.match(text.strip().upper()))


def normalize_plate(text: str) -> str:
    """Uppercase, strip, and collapse whitespace/odd separators to hyphens."""
    if not text:
        return ""
    cleaned = re.sub(r"[\s_]+", "-", text.strip().upper())
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    return cleaned


def plate_edit_distance(a: str, b: str) -> int:
    """Levenshtein distance between two plates, ignoring hyphens/case.

    Used by the linker to tolerate a single-character OCR misread when other
    evidence (attributes, feasible travel) supports the match.
    """
    a = (a or "").replace("-", "").upper()
    b = (b or "").replace("-", "").upper()
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = curr
    return prev[-1]


def plates_similar(a: str, b: str, max_distance: int = 1) -> bool:
    """True if two plates are within ``max_distance`` character edits."""
    if not a or not b:
        return False
    return plate_edit_distance(a, b) <= max_distance
