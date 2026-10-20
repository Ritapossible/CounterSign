# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

import datetime
import json

# ---------------------------------------------------------------------------
# GENERATED FILE - do not edit.
# Built by deploy/build_contract.py from contracts/countersign_text.py (page
# text), contracts/countersign_core.py (the rules) and, for the Board,
# board_shell.py; for the Reader, countersign_prompts.py and reader_shell.py.
# ---------------------------------------------------------------------------


# --- countersign_text.py -----------------------------------------------

# Elements whose content is never visible text.
HIDDEN_ELEMENTS = ("script", "style", "noscript", "template", "svg", "head", "iframe")

ENTITIES = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " ",
    "rsquo": "'", "lsquo": "'", "rdquo": '"', "ldquo": '"', "ndash": "-", "mdash": "-",
    "hellip": "...", "shy": "", "middot": "*", "bull": "*",
}

# Typographic characters folded to their plain form, so that "30‑day" and
# "30-day", or curly and straight quotes, compare equal.
FOLD = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
    "“": '"', "”": '"', "„": '"', "″": '"',
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    "​": "", "‌": "", "‍": "", "﻿": "", "­": "",
    "…": "...",
}

MAX_PAGE_BYTES = 400_000  # a response larger than this is unreadable (Phase 1: lists are 43-178 KB)
MIN_PASSAGE = 40  # characters, after normalisation: a pinned passage must say something
MAX_PASSAGE = 600


def _decode_entity(name):
    if name.startswith("#"):
        try:
            code = int(name[2:], 16) if name[1:2] in ("x", "X") else int(name[1:])
            if 0 < code < 0x110000:
                return chr(code)
        except ValueError:
            return None
        return None
    return ENTITIES.get(name.lower())


def unescape(text):
    """HTML character references, decoded without the ``html`` module."""
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "&":
            end = text.find(";", i + 1, i + 12)
            if end != -1:
                decoded = _decode_entity(text[i + 1 : end])
                if decoded is not None:
                    out.append(decoded)
                    i = end + 1
                    continue
        out.append(ch)
        i += 1
    return "".join(out)


VOID_ELEMENTS = ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr")

# Class names that hide an element in the common CSS frameworks. An element
# that a responsive class shows at some screen size ("hidden md:block") is not hidden.
HIDING_CLASSES = ("hidden", "d-none", "sr-only", "visually-hidden", "invisible", "screen-reader-text")

HIDING_STYLES = ("display:none", "visibility:hidden", "font-size:0;", "font-size:0px", "opacity:0;")


def _attr(tag, name):
    """One attribute of an opening tag normalised by ``is_hidden`` ("" if absent)."""
    at = tag.find(" " + name + "=")
    if at == -1:
        return ""
    v = tag[at + len(name) + 2 :]
    if v[:1] in ("'", '"'):
        end = v.find(v[0], 1)
        return v[1:end] if end != -1 else v[1:]
    return v.split(" ")[0]


def _bare(tag):
    """The tag with every quoted value removed, to find bare attributes."""
    out = []
    quote = ""
    for ch in tag:
        if quote:
            quote = "" if ch == quote else quote
        elif ch in "\"'":
            quote = ch
        else:
            out.append(ch)
    return "".join(out).replace("/", " ") + " "


def hidden_selectors(html):
    """Classes and ids that the page's own <style> blocks hide: rules whose
    selector is a bare ``.name`` or ``#name`` and whose body hides it."""
    found = set()
    for block in html.lower().split("<style")[1:]:
        css = block[block.find(">") + 1 : block.find("</style")]
        for rule in css.split("}"):
            head, _, body = rule.rpartition("{")
            body = "".join(body.split())
            if "display:none" in body or "visibility:hidden" in body:
                for sel in head[head.rfind("{") + 1 :].split(","):
                    sel = sel.strip()
                    if len(sel) > 1 and sel[0] in ".#" and all(c.isalnum() or c in "-_" for c in sel[1:]):
                        found.add(sel)
    return found


def is_hidden(name, tag, hidden):
    """Does this opening tag (lower case) hide what it contains from a reader?"""
    tag = " " + " ".join(tag.replace("=", " = ").split()).replace(" = ", "=")
    if name in HIDDEN_ELEMENTS or " hidden " in _bare(tag).replace("=", " ") or _attr(tag, "aria-hidden") == "true":
        return True
    style = "".join(_attr(tag, "style").split()) + ";"
    if any(rule in style for rule in HIDING_STYLES) or "#" + _attr(tag, "id") in hidden:
        return True
    classes = _attr(tag, "class").split()
    if any(":" in c and not c.endswith(("hidden", "none")) for c in classes):
        return False  # shown at some screen size ("hidden md:block")
    return any(c in HIDING_CLASSES or "." + c in hidden for c in classes)


def strip_markup(html):
    """Visible text of an HTML document: tags become spaces; comments, and the
    content of every element a reader would not see (script, style, an element
    marked hidden, hidden by an inline style, or hidden by a class), are
    dropped. A plain-text page passes through."""
    lower = html.lower()
    hidden = hidden_selectors(html)
    out = []
    i = 0
    n = len(html)
    while i < n:
        lt = html.find("<", i)
        if lt == -1:
            out.append(html[i:])
            break
        out.append(html[i:lt])
        if html.startswith("<!--", lt):
            end = html.find("-->", lt + 4)
            i = n if end == -1 else end + 3
            continue
        gt = html.find(">", lt + 1)
        if gt == -1:
            break
        tag = lower[lt + 1 : gt].strip()
        name = ""
        for ch in tag:
            if ch.isalnum() or ch == "-":
                name += ch
            else:
                break
        out.append(" ")
        i = gt + 1
        if not name or name in VOID_ELEMENTS or tag.endswith("/") or not is_hidden(name, tag, hidden):
            continue
        # Skip to the matching close tag, counting nested elements of the same name.
        depth = 1
        while depth > 0:
            nxt = lower.find("<" + name, i)
            close = lower.find("</" + name, i)
            if close == -1:
                i = n
                break
            if nxt != -1 and nxt < close and not lower[nxt + 1 + len(name) : nxt + 2 + len(name)].isalnum():
                depth += 1
                i = nxt + 1
                continue
            depth -= 1
            end = lower.find(">", close)
            i = n if end == -1 else end + 1
    return "".join(out)


def normalize(text):
    """The comparable form of a piece of text: entities decoded, typography
    folded, lower case, every run of whitespace a single space."""
    text = unescape(str(text))
    folded = []
    for ch in text:
        folded.append(FOLD.get(ch, ch))
    return " ".join("".join(folded).lower().split())


def page_text(raw):
    """The normalised visible text of a fetched page (bytes or str)."""
    if isinstance(raw, bytes):
        raw = raw[:MAX_PAGE_BYTES].decode("utf-8", "replace")
    else:
        raw = str(raw)[:MAX_PAGE_BYTES]
    head = raw.lstrip()[:200].lower()
    if head.startswith("<") or "<html" in head or "<!doctype" in head:
        raw = strip_markup(raw)
    return normalize(raw)


def passage_present(text, passage):
    """Is the passage on the page, word for word (both normalised)?"""
    p = normalize(passage)
    return p != "" and p in text


def passage_error(passage):
    """Why a passage cannot be pinned ("" if it can)."""
    p = normalize(passage)
    if len(p) < MIN_PASSAGE:
        return "a passage must be at least %d characters" % MIN_PASSAGE
    if len(p) > MAX_PASSAGE:
        return "a passage must be at most %d characters" % MAX_PASSAGE
    return ""


def whole_word(hay, needle):
    """``needle`` occurs in ``hay`` (both normalised) with no letter or digit
    on either side: ``v2`` is not in ``v20``, ``acme`` is not in ``acmeswap``."""
    n = normalize(needle)
    if not n:
        return False
    i = hay.find(n)
    while i >= 0:
        before = hay[i - 1] if i > 0 else " "
        after = hay[i + len(n)] if i + len(n) < len(hay) else " "
        if not before.isalnum() and not after.isalnum():
            return True
        i = hay.find(n, i + 1)
    return False


def words_of(text):
    """The runs of letters and digits in a text."""
    return "".join(c if c.isalnum() else " " for c in text).split()


WINDOW_WORDS = 60  # words either side of a passage that make its surroundings
MAX_PLACES = 3  # places a passage appears that the jury is shown

DATE_WORDS = set("january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday".split())


def _letters(text):
    """Words only: digits, punctuation, and month and day names dropped, so a
    date or a counter near a passage does not count as a change."""
    return " ".join(w for w in "".join(c if c.isalpha() else " " for c in text).split() if w not in DATE_WORDS)


def places(text, passage):
    """Every place the passage appears, as (start, end) offsets."""
    p = normalize(passage)
    out = []
    at = text.find(p) if p else -1
    while at != -1:
        out.append((at, at + len(p)))
        at = text.find(p, at + 1)
    return out


def around(text, start, end):
    """The ``WINDOW_WORDS`` words before and after one place, as text."""
    before = text[max(0, start - 40 * WINDOW_WORDS) : start].split()[-WINDOW_WORDS:]
    after = text[end : end + 40 * WINDOW_WORDS].split()[:WINDOW_WORDS]
    return " ".join(before), " ".join(after)


def surroundings(text, passage):
    """What the jury reads: the passage with the words either side of it, at
    up to ``MAX_PLACES`` places it appears."""
    out = []
    for start, end in places(text, passage)[:MAX_PLACES]:
        before, after = around(text, start, end)
        out.append((before + " " + text[start:end] + " " + after).strip())
    return out


def surroundings_print(text, passage):
    """A fingerprint of the words around every place the passage appears,
    dates and numbers dropped. "" if it is not on the page. A second copy of
    the passage, or any changed word beside it, changes the fingerprint."""
    parts = []
    for start, end in places(text, passage):
        before, after = around(text, start, end)
        parts.append(_letters(before) + "|" + _letters(after))
    if not parts:
        return ""
    h = 14695981039346656037
    for ch in "#".join(parts):
        h = ((h ^ ord(ch)) * 1099511628211) % 18446744073709551616
    return "%016x" % h


# --- countersign_core.py -----------------------------------------------

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

# Phrases that only ever mean that one item was withdrawn. At posting, one of
# them as whole words beside the passage sends the claim to the jury instead
# of posting it. Never add words ordinary reports use (did not, draft,
# preliminary): Phase 1 found none of these on four real audit lists. Never
# add a phrase a standing header or disclaimer uses ("not audited by", "was
# not audited", "did not audit", "not an audit", "do not endorse"): a header
# sits within the window of the first rows, and a cautious jury reading it
# beside an honest row could refuse the claim. A real withdrawal added later
# changes the surroundings and reaches the jury on re-check.
WITHDRAW = ("withdrawn", "revoked", "retracted", "rescinded", "superseded", "no longer valid")

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
    """A read with no report by its deadline counts as silent: validators
    could not agree, or no round completed."""
    read = claim.get("read")
    if not read:
        raise CounterSignError("no read of claim %d is open" % int(claim["id"]))
    if int(now) <= int(read["due"]):
        raise CounterSignError("the read is open until %d" % int(read["due"]))
    return apply_report(claim, seq=read["seq"], kind=SILENT, print_="", now=now, miss_gap=miss_gap)


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


def fired(text, passage):
    """Withdrawal phrases, as whole words, in the passage or the words around
    any place it appears."""
    window = " ".join(surroundings(text, passage))
    return [w for w in WITHDRAW if whole_word(window, w)]


def read_page(status, body, passage, *, posting, stored_print):
    """What code decides about one fetch: ``{kind, print, around}``. ``kind``
    is CONFIRMED (no model), ASK_JURY, or SILENT. The Board has already
    checked that the passage contains the subject and every scope string."""
    text = readable_text(status, body)
    if text is None or not passage_present(text, passage):
        return {"kind": SILENT, "print": "", "around": []}
    fp = surroundings_print(text, passage)
    if posting:
        ask = bool(fired(text, passage))
    else:
        ask = fp != str(stored_print)
    return {"kind": ASK_JURY if ask else CONFIRMED, "print": fp, "around": surroundings(text, passage) if ask else []}


def claim_json(claim, auditor):
    out = dict(claim)
    out["auditor_name"] = auditor["name"]
    out["auditor_host"] = auditor["host"]
    out["auditor_signer"] = auditor["signer"]
    return out


# --- board_shell.py ----------------------------------------------------

@gl.evm.contract_interface
class _Payee:
    """Any address, as a value recipient."""

    class View:
        pass

    class Write:
        pass


class CounterSignBoard(gl.Contract):
    release: str
    reader: str
    miss_gap: u256
    read_window: u256
    auditor_count: u256
    auditors: TreeMap[u256, str]
    claim_count: u256
    claims: TreeMap[u256, str]
    owed: TreeMap[str, u256]
    owed_total: u256
    held: u256
    received: u256
    refusals: TreeMap[str, str]

    def __init__(self, reader: str, miss_gap: int, read_window: int):
        if not 60 <= int(miss_gap) <= 30 * 86400 or not 60 <= int(read_window) <= 7 * 86400:
            raise Exception("[EXPECTED] miss_gap and read_window are 60 seconds to 30 and 7 days")
        self.release = "countersign-board/1"
        self.reader = normalize_address(reader, "reader")
        self.miss_gap = u256(int(miss_gap))
        self.read_window = u256(int(read_window))

    # -------------------------------------------------------------- helpers

    def _now(self) -> int:
        return int(datetime.datetime.now().timestamp())

    def _me(self) -> str:
        return str(gl.message.sender_address).lower()

    def _auditor(self, auditor_id: int) -> dict:
        if int(auditor_id) < 0 or int(auditor_id) >= int(self.auditor_count):
            raise Exception("[EXPECTED] unknown auditor")
        return json.loads(self.auditors[u256(int(auditor_id))])

    def _claim(self, claim_id: int) -> dict:
        if int(claim_id) < 0 or int(claim_id) >= int(self.claim_count):
            raise Exception("[EXPECTED] unknown claim")
        return json.loads(self.claims[u256(int(claim_id))])

    def _save_claim(self, claim: dict) -> None:
        self.claims[u256(int(claim["id"]))] = json.dumps(claim)

    def _pay(self, credits: dict) -> None:
        """Move credited GEN from what the Board holds to what each is owed."""
        total = 0
        for who, amount in credits.items():
            key = str(who).lower()
            self.owed[key] = u256(int(self.owed.get(key, u256(0))) + int(amount))
            total += int(amount)
        self.held = u256(int(self.held) - total)
        self.owed_total = u256(int(self.owed_total) + total)

    def _take(self, value: int) -> None:
        self.held = u256(int(self.held) + value)
        self.received = u256(int(self.received) + value)

    def _refuse(self, reason: str, value: int) -> None:
        me = self._me()
        if value > 0:
            self._take(value)
            self._pay({me: value})
        self.refusals[me] = json.dumps({"reason": str(reason)[:600], "at": self._now(), "returned": value})

    def _from_reader(self) -> None:
        if self._me() != self.reader:
            raise Exception("[EXPECTED] only the Reader reports reads")

    def _ask(self, claim: dict, auditor: dict) -> None:
        read = claim["read"]
        gl.get_contract_at(Address(self.reader)).emit(on="accepted").read_claim(
            int(claim["id"]), int(read["seq"]), read["kind"] == POSTING, auditor["url"], auditor["name"],
            claim["subject"], json.dumps(claim["scope"]), claim["passage"], claim["print"],
        )

    # ---------------------------------------------------------- entrypoints

    @gl.public.write
    def register(self, name: str, page_url: str, sample: str) -> int:
        """An auditor pins the one page that lists its audits, with one row
        from it. The Reader checks the row is visible there; until it reports,
        the entry is pending. Returns the entry id."""
        errors = registration_errors(str(name), str(page_url), str(sample))
        if errors:
            raise Exception("[EXPECTED] " + "; ".join(errors))
        auditor_id = int(self.auditor_count)
        auditor = new_auditor(auditor_id=auditor_id, name=str(name), url=str(page_url), sample=str(sample),
                              signer=self._me(), now=self._now(), window=int(self.read_window))
        self.auditors[u256(auditor_id)] = json.dumps(auditor)
        self.auditor_count = u256(auditor_id + 1)
        gl.get_contract_at(Address(self.reader)).emit(on="accepted").read_registration(auditor_id, auditor["url"], auditor["sample"])
        return auditor_id

    @gl.public.write
    def note_registration(self, auditor_id: int, ok: bool) -> None:
        """Sent by the Reader once validators have read the registered page."""
        self._from_reader()
        auditor = self._auditor(auditor_id)
        if apply_registration(auditor, ok=bool(ok), now=self._now()):
            self.auditors[u256(int(auditor_id))] = json.dumps(auditor)

    @gl.public.write.payable
    def post(self, auditor_id: int, subject: str, scope_json: str, passage: str) -> int:
        """A project stakes to post a claim. The value sent is the stake.
        Returns the claim id, or -1 when refused before any read - the value
        is then credited back and ``refusal_of`` says why. Otherwise the claim
        is pending until the Reader reports the posting read."""
        value = int(gl.message.value)
        try:
            scope = json.loads(str(scope_json))
        except Exception:
            scope = None
        auditor = None
        if 0 <= int(auditor_id) < int(self.auditor_count):
            auditor = json.loads(self.auditors[u256(int(auditor_id))])
        errors = ["the scope is not valid JSON"] if scope is None else claim_errors(
            auditor=auditor, project=self._me(), subject=str(subject), scope=scope, passage=str(passage), value=value,
        )
        if errors:
            self._refuse("; ".join(errors), value)
            return -1
        claim_id = int(self.claim_count)
        claim = new_claim(claim_id=claim_id, auditor=auditor, project=self._me(), subject=str(subject),
                          scope=scope, passage=str(passage), stake=value, now=self._now())
        open_read(claim, kind=POSTING, caller=self._me(), fee=0, now=self._now(), window=int(self.read_window))
        self._take(value)
        self._save_claim(claim)
        self.claim_count = u256(claim_id + 1)
        self._ask(claim, auditor)
        return claim_id

    @gl.public.write.payable
    def recheck(self, claim_id: int) -> bool:
        """Anyone re-reads a live claim's page, paying ``RECHECK_FEE``. False
        when refused - the value is credited back and ``refusal_of`` says why."""
        value = int(gl.message.value)
        if not 0 <= int(claim_id) < int(self.claim_count):
            self._refuse("unknown claim", value)
            return False
        claim = self._claim(claim_id)
        auditor = self._auditor(claim["auditor"])
        errors = recheck_errors(claim, caller=self._me(), auditor=auditor, value=value)
        if errors:
            self._refuse("; ".join(errors), value)
            return False
        open_read(claim, kind=RECHECK, caller=self._me(), fee=value, now=self._now(), window=int(self.read_window))
        self._take(value)
        self._save_claim(claim)
        self._ask(claim, auditor)
        return True

    @gl.public.write
    def note_claim(self, claim_id: int, seq: int, kind: str, print_: str) -> None:
        """Sent by the Reader once validators have read a claim's page."""
        self._from_reader()
        claim = self._claim(claim_id)
        try:
            credits = apply_report(claim, seq=int(seq), kind=str(kind), print_=str(print_)[:32], now=self._now(),
                                   miss_gap=int(self.miss_gap))
        except CounterSignError as exc:
            raise Exception("[EXPECTED] " + str(exc))
        if credits is not None:
            self._save_claim(claim)
            self._pay(credits)

    @gl.public.write
    def expire_registration(self, auditor_id: int) -> None:
        """Anyone closes a registration that got no report by its deadline. It
        is refused; the auditor may register again."""
        auditor = self._auditor(auditor_id)
        try:
            expire_registration(auditor, now=self._now())
        except CounterSignError as exc:
            raise Exception("[EXPECTED] " + str(exc))
        self.auditors[u256(int(auditor_id))] = json.dumps(auditor)

    @gl.public.write
    def expire(self, claim_id: int) -> None:
        """Anyone closes a read that got no report by its deadline. It counts
        as silent."""
        claim = self._claim(claim_id)
        try:
            credits = expire_read(claim, now=self._now(), miss_gap=int(self.miss_gap))
        except CounterSignError as exc:
            raise Exception("[EXPECTED] " + str(exc))
        self._save_claim(claim)
        self._pay(credits or {})

    @gl.public.write
    def withdraw_claim(self, claim_id: int) -> None:
        """The project takes its own claim down, from pending or live."""
        claim = self._claim(claim_id)
        try:
            credits = withdraw_claim(claim, by=self._me(), now=self._now())
        except CounterSignError as exc:
            raise Exception("[EXPECTED] " + str(exc))
        self._save_claim(claim)
        self._pay(credits)

    @gl.public.write
    def collect(self) -> None:
        """Send the caller everything it is owed."""
        me = self._me()
        amount = int(self.owed.get(me, u256(0)))
        if amount <= 0:
            raise Exception("[EXPECTED] nothing is owed to this address")
        self.owed[me] = u256(0)
        self.owed_total = u256(int(self.owed_total) - amount)
        _Payee(gl.message.sender_address).emit_transfer(value=u256(amount))

    # ---------------------------------------------------------------- views

    @gl.public.view
    def get_auditor(self, auditor_id: int) -> str:
        return json.dumps(self._auditor(auditor_id))

    @gl.public.view
    def get_claim(self, claim_id: int) -> str:
        claim = self._claim(claim_id)
        out = claim_json(claim, self._auditor(claim["auditor"]))
        out["now"] = self._now()
        return json.dumps(out)

    @gl.public.view
    def owed_to(self, address: str) -> int:
        return int(self.owed.get(str(address).lower(), u256(0)))

    @gl.public.view
    def refusal_of(self, address: str) -> str:
        return self.refusals.get(str(address).lower(), "{}")

    @gl.public.view
    def status(self) -> str:
        return json.dumps(
            {
                "release": self.release,
                "reader": self.reader,
                "miss_gap": int(self.miss_gap),
                "read_window": int(self.read_window),
                "auditors": int(self.auditor_count),
                "claims": int(self.claim_count),
                "held": int(self.held),
                "owed": int(self.owed_total),
                "received": int(self.received),
                "balance": int(self.balance),
            }
        )
