"""CounterSign: turning a fetched audit-list page into comparable text.

Pure Python, no ``gl.*``: inlined into the Reader contract by
``deploy/build_contract.py`` and tested directly.

The visible-text rules are RedLine's (``redline_text.py``), carried over with
their tests: markup, comments and every element a reader would not see are
dropped, entities decoded, typography folded, case and spacing ignored. Phase 1
measured validators agreeing on this text for real audit lists on Studio and
Bradbury.

On top of them: whole-word matching, and the words around a passage - the
window the jury reads and the fingerprint that decides whether it must.
"""

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
