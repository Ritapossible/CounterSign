"""CounterSign: every rule, as plain Python.

Pure Python, no ``gl.*``: inlined into both contracts by
``deploy/build_contract.py`` and tested directly. The Board holds auditor
entries and claims as dicts and calls these functions; each one that moves
value returns ``credits``, {address: atto}, which the Board moves from what
it holds to what each address is owed. No credit ever names the auditor.

docs/CLAIM-FORMAT.md is the specification of the fields and states,
docs/ARCHITECTURE.md of the reads and the money.
"""

from countersign_text import MAX_PAGE_BYTES, normalize, page_text, passage_error, passage_present, surroundings, surroundings_print, whole_word, words_of  # noqa: E501

GEN = 10**18
MIN_STAKE = GEN // 10  # 0.10 GEN
RECHECK_FEE = GEN // 100  # 0.01 GEN
KEEPER_REWARD = GEN // 50  # 0.02 GEN, paid from the stake to the re-check that takes a claim down

MIN_VISIBLE = 200  # characters of visible text a registered page must have
MAX_URL = 300
MAX_SCOPE = 4

# Auditor entries.
AUDITOR_PENDING = "pending"
AUDITOR_REGISTERED = "registered"
AUDITOR_REFUSED = "refused"

# Claims.
PENDING = "pending"  # posted; the posting read has not been reported
LIVE = "live"
REFUSED = "refused"  # the posting read did not confirm it; stake returned
DOWN = "down"  # a re-check took it down; stake returned, minus the keeper reward
WITHDRAWN = "withdrawn"  # the project took it down itself; stake returned
OPEN = (PENDING, LIVE)

# One read of a page.
CONFIRMED = "confirmed"
ASK_JURY = "ask_jury"  # present and complete, but its surroundings call for the jury
DENIED = "denied"
SILENT = "silent"  # absent, unreadable, unfetchable, or no agreed read in time
REPORTS = (CONFIRMED, DENIED, SILENT)

POSTING = "posting"
RECHECK = "recheck"

# Phrases that, inside the passage itself, say the subject was not audited.
# Code refuses such a passage before any read: it can never be the auditor
# affirming an audit. Only the passage is searched, as whole words, never the
# words around it: a standing disclaimer above a list ("a project not listed
# here was not audited by us") sits beside honest rows. Never add words
# ordinary reports use ("did not find", "no issues", "draft"). Anything subtler
# is the jury's, which reads every posting.
NEGATIONS = (
    "not audited", "never audited", "not been audited", "not yet audited", "unaudited",
    "did not audit", "does not audit", "has not audited", "have not audited", "never audit",
    "not an audit", "audit was declined", "declined to audit",
)

# A subject made only of these words is not a name ("labs", "the protocol").
STOP_WORDS = set(
    "the a an and of for by on in to inc ltd llc co corp company labs lab protocol protocols "
    "finance network dao foundation project audit audits audited report reports security "
    "smart contract contracts review core app v1 v2 v3".split()
)


class CounterSignError(Exception):
    pass


# ------------------------------------------------------------------ fields

def normalize_address(value, context="address"):
    a = str(value).strip().lower()
    if len(a) != 42 or not a.startswith("0x") or any(c not in "0123456789abcdef" for c in a[2:]):
        raise CounterSignError("%s is not an address" % context)
    return a


def url_error(url):
    """Why a page URL is refused ("" if it is not). Refused, never decoded: a
    decoder here could disagree with the server (Remit Milestone 1)."""
    u = str(url)
    if not u.startswith("https://") or len(u) > MAX_URL:
        return "the page must be an https:// URL of at most %d characters" % MAX_URL
    if any(ch.isspace() or ch in "%\\@?#" for ch in u) or ".." in u:
        return "the URL may not contain %, .., \\, @, ?, # or spaces"
    host = u[8:].split("/")[0]
    if "." not in host or host.startswith(".") or host.endswith("."):
        return "the URL has no host"
    return ""


def host_of(url):
    """The page's host: half of an auditor's identity (the signer is the other)."""
    return str(url)[8:].split("/")[0].lower()


def _printable(text):
    return all(ch.isprintable() for ch in text)


def name_error(name):
    n = str(name).strip()
    if not 2 <= len(n) <= 60 or not _printable(n):
        return "the name must be 2-60 printable characters"
    return ""


def subject_error(subject):
    s = str(subject).strip()
    if not 3 <= len(s) <= 80 or not _printable(s):
        return "the subject must be 3-80 printable characters"
    if sum(1 for ch in s if ch.isalpha()) < 3:
        return "the subject must contain at least 3 letters"
    if all(w in STOP_WORDS for w in words_of(normalize(s))):
        return "the subject must be a name, not only common words"
    return ""


def scope_errors(scope):
    if not isinstance(scope, list) or not 1 <= len(scope) <= MAX_SCOPE:
        return ["the scope must be 1-%d strings" % MAX_SCOPE]
    errors = []
    for s in scope:
        if not isinstance(s, str) or not 2 <= len(s.strip()) <= 80 or not _printable(s):
            errors.append("each scope string must be 2-80 printable characters")
        elif not any(ch.isalnum() for ch in s):
            errors.append("each scope string must contain a letter or digit")
    return errors


def registration_errors(name, url, sample):
    errors = [e for e in (name_error(name), url_error(url)) if e]
    e = passage_error(sample)
    if e:
        errors.append("the sample: " + e)
    return errors


def claim_errors(*, auditor, project, subject, scope, passage, value):
    """Every reason a posting is refused before any page is read."""
    errors = []
    if auditor is None:
        return ["unknown auditor"]
    if auditor["state"] != AUDITOR_REGISTERED:
        errors.append("the auditor is not registered")
    if normalize_address(project) == auditor["signer"]:
        errors.append("an auditor cannot post claims on its own entry")
    if isinstance(value, bool) or not isinstance(value, int) or value < MIN_STAKE:
        errors.append("the stake must be at least %d atto" % MIN_STAKE)
    for e in (subject_error(subject), passage_error(passage)):
        if e:
            errors.append(e)
    scope_problems = scope_errors(scope)
    errors += scope_problems
    if not errors:
        p = normalize(passage)
        if negations(passage):
            errors.append("the passage says the subject was not audited: " + ", ".join(negations(passage)))
        if not whole_word(p, subject):
            errors.append("the subject is not in the passage as whole words")
        missing = [s for s in scope if not whole_word(p, s)]
        if missing:
            errors.append("not in the passage as whole words: " + ", ".join(missing))
    return errors


# --------------------------------------------------------------- auditors

def new_auditor(*, auditor_id, name, url, sample, signer, now, window):
    return {
        "id": int(auditor_id), "name": str(name).strip(), "url": str(url), "host": host_of(url),
        "signer": normalize_address(signer, "signer"), "sample": str(sample),
        "state": AUDITOR_PENDING, "at": int(now), "due": int(now) + int(window),
    }


def apply_registration(auditor, *, ok, now):
    """The Reader's report on a registration. Only a pending entry changes."""
    if auditor["state"] != AUDITOR_PENDING:
        return False
    auditor["state"] = AUDITOR_REGISTERED if ok else AUDITOR_REFUSED
    auditor["decided_at"] = int(now)
    return True


def expire_registration(auditor, *, now):
    """A registration with no report by its deadline is refused; the auditor
    may register again. Nothing is held, so nothing is returned."""
    if auditor["state"] != AUDITOR_PENDING:
        raise CounterSignError("auditor %d is %s" % (int(auditor["id"]), auditor["state"]))
    if int(now) <= int(auditor["due"]):
        raise CounterSignError("the registration read is open until %d" % int(auditor["due"]))
    auditor["state"] = AUDITOR_REFUSED
    auditor["decided_at"] = int(now)
    auditor["why"] = "no agreed read of the page in time"


# ----------------------------------------------------------------- claims

def new_claim(*, claim_id, auditor, project, subject, scope, passage, stake, now):
    return {
        "id": int(claim_id), "auditor": int(auditor["id"]), "project": normalize_address(project, "project"),
        "subject": str(subject).strip(), "scope": [str(s).strip() for s in scope], "passage": str(passage),
        "stake": int(stake), "state": PENDING, "posted_at": int(now), "print": "",
        "misses": 0, "miss_at": 0, "checked_at": 0, "seq": 0, "read": None, "why": "",
    }


def open_read(claim, *, kind, caller, fee, now, window):
    """Number and open a read of the claim's page. One read is open at a time."""
    if claim.get("read"):
        raise CounterSignError("a read of claim %d is open" % int(claim["id"]))
    claim["seq"] = int(claim["seq"]) + 1
    claim["read"] = {
        "seq": claim["seq"], "kind": kind, "caller": normalize_address(caller, "caller"), "fee": int(fee),
        "at": int(now), "due": int(now) + int(window),
    }
    return claim["read"]


def recheck_errors(claim, *, caller, auditor, value):
    """Why a re-check is refused. Only a live claim with no read open: a
    re-check can never race the posting read (THREAT-MODEL T18)."""
    errors = []
    if claim["state"] != LIVE:
        errors.append("only a live claim can be re-checked")
    elif claim.get("read"):
        errors.append("a read of this claim is already open")
    if isinstance(value, bool) or value != RECHECK_FEE:
        errors.append("a re-check costs exactly %d atto" % RECHECK_FEE)
    if normalize_address(caller) == auditor["signer"]:
        errors.append("the auditor cannot re-check claims on its own entry")
    return errors


def _credit(credits, who, amount):
    if amount > 0:
        credits[who] = credits.get(who, 0) + int(amount)


def _end(claim, state, why, now):
    claim["state"] = state
    claim["why"] = why
    claim["ended_at"] = int(now)
    claim["read"] = None


def _take_down(claim, read, why, now):
    credits = {}
    reward = min(KEEPER_REWARD, int(claim["stake"]))
    _credit(credits, read["caller"], reward + int(read["fee"]))
    _credit(credits, claim["project"], int(claim["stake"]) - reward)
    _end(claim, DOWN, why, now)
    return credits


def apply_report(claim, *, seq, kind, print_, now, miss_gap):
    """The Reader's report on a read, or an expired read (``SILENT``).
    Returns the credits, or None when the report is ignored: no read open, a
    different read number (late, replayed or out of order), or the claim
    already withdrawn."""
    read = claim.get("read")
    if kind not in REPORTS:
        raise CounterSignError("unknown outcome %r" % kind)
    if not read or int(seq) != int(read["seq"]) or claim["state"] not in OPEN:
        return None
    credits = {}
    if read["kind"] == POSTING:
        if kind == CONFIRMED:
            claim["state"] = LIVE
            claim["print"] = str(print_)
            claim["checked_at"] = int(read["at"])
            claim["read"] = None
        else:
            _credit(credits, claim["project"], int(claim["stake"]))
            _end(claim, REFUSED, "the auditor's page did not confirm it" if kind == DENIED else "the auditor's page was silent", now)
        return credits
    if kind == CONFIRMED:
        claim["print"] = str(print_)
        claim["checked_at"] = int(read["at"])
        claim["misses"] = 0
        claim["miss_at"] = 0
        claim["read"] = None
        _credit(credits, claim["project"], int(read["fee"]))
        return credits
    if kind == DENIED:
        return _take_down(claim, read, "the auditor's page denies it", now)
    if int(claim["misses"]) and int(read["at"]) >= int(claim["miss_at"]) + int(miss_gap):
        return _take_down(claim, read, "the auditor's page was silent twice", now)
    if not int(claim["misses"]):
        claim["misses"] = 1
        claim["miss_at"] = int(read["at"])
    claim["read"] = None
    _credit(credits, read["caller"], int(read["fee"]))
    return credits


def expire_read(claim, *, now, miss_gap):
    """Close a read with no report by its deadline: validators could not
    agree, or no round completed. That is no result, not evidence the page
    is gone. An expired posting read is a refusal and returns the stake. An
    expired re-check returns its fee and leaves ``misses`` as they were: only
    a ``silent`` the Reader reports counts as a miss (THREAT-MODEL T23)."""
    read = claim.get("read")
    if not read:
        raise CounterSignError("no read of claim %d is open" % int(claim["id"]))
    if int(now) <= int(read["due"]):
        raise CounterSignError("the read is open until %d" % int(read["due"]))
    if read["kind"] == POSTING:
        return apply_report(claim, seq=read["seq"], kind=SILENT, print_="", now=now, miss_gap=miss_gap)
    credits = {}
    _credit(credits, read["caller"], int(read["fee"]))
    claim["read"] = None
    return credits


def withdraw_claim(claim, *, by, now):
    """The project takes its own claim down, from pending or live. Its stake
    returns, and the fee of an open re-check returns to whoever paid it."""
    if normalize_address(by) != claim["project"]:
        raise CounterSignError("only the project may withdraw its claim")
    if claim["state"] not in OPEN:
        raise CounterSignError("claim %d is %s" % (int(claim["id"]), claim["state"]))
    credits = {}
    read = claim.get("read")
    if read:
        _credit(credits, read["caller"], int(read["fee"]))
    _credit(credits, claim["project"], int(claim["stake"]))
    _end(claim, WITHDRAWN, "withdrawn by the project", now)
    return credits


# ------------------------------------------------------------ one page read

def readable_text(status, body):
    """The visible text of a response, or None when the page is unreadable:
    not 2xx, over the byte cap, or too little visible text (drawn by script)."""
    if not 200 <= int(status) < 300 or len(body) > MAX_PAGE_BYTES:
        return None
    text = page_text(body)
    return text if len(text) >= MIN_VISIBLE else None


def registration_ok(status, body, sample):
    """A page registers only if it is readable and the sample row is on it:
    a long page is not a list (Phase 1: Halborn, OpenZeppelin)."""
    text = readable_text(status, body)
    return text is not None and passage_present(text, sample)


def negations(passage):
    """Negation phrases, as whole words, in the passage itself."""
    p = normalize(passage)
    return [n for n in NEGATIONS if whole_word(p, n)]


def read_page(status, body, passage, *, posting, stored_print):
    """What code decides about one fetch: ``{kind, print, around}``. ``kind``
    is CONFIRMED (no model), ASK_JURY, DENIED or SILENT. The Board has already
    checked that the passage contains the subject and every scope string.

    At posting, code alone never confirms: whole words show a passage names
    the subject and scope, not that it affirms an audit of them ("Acme v2 was
    not audited"). A passage that negates itself is denied by code; every
    other one goes to the jury, which must find that it affirms this auditor
    audited the subject for every scope item. At a re-check, unchanged
    surroundings are the words the jury already affirmed, so code confirms."""
    text = readable_text(status, body)
    if text is None or not passage_present(text, passage):
        return {"kind": SILENT, "print": "", "around": []}
    fp = surroundings_print(text, passage)
    if posting and negations(passage):
        return {"kind": DENIED, "print": fp, "around": []}
    ask = True if posting else fp != str(stored_print)
    return {"kind": ASK_JURY if ask else CONFIRMED, "print": fp, "around": surroundings(text, passage) if ask else []}


def claim_json(claim, auditor):
    out = dict(claim)
    out["auditor_name"] = auditor["name"]
    out["auditor_host"] = auditor["host"]
    out["auditor_signer"] = auditor["signer"]
    return out
