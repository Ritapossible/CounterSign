"""Mutation harness: every rule must have a test that fails without it.

Each entry weakens or deletes one rule in a source file. The contracts are
rebuilt from the mutant (so the tests that run the deployed bytes see it), the
suite runs, and it must FAIL. A mutant that survives names an untested rule.

    python3 tests/mutation_check.py
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.path.join(ROOT, "contracts", "countersign_core.py")
TEXT = os.path.join(ROOT, "contracts", "countersign_text.py")
PROMPTS = os.path.join(ROOT, "contracts", "countersign_prompts.py")
BOARD = os.path.join(ROOT, "contracts", "board_shell.py")
READER = os.path.join(ROOT, "contracts", "reader_shell.py")
BUILD = os.path.join(ROOT, "contracts", "build")

# (name, what it breaks, original fragment, mutated fragment, file)
MUTATIONS = [
    # --- money ---
    ("auditor-paid-on-takedown", "no path pays the auditor",
     "    _credit(credits, read[\"caller\"], reward + int(read[\"fee\"]))", "    _credit(credits, read[\"caller\"], int(read[\"fee\"]))\n    _credit(credits, \"0x00000000000000000000000000000000000000a1\", reward)", CORE),
    ("refused-posting-kept", "a refused posting returns the stake",
     "            _credit(credits, claim[\"project\"], int(claim[\"stake\"]))\n            _end(claim, REFUSED", "            _end(claim, REFUSED", CORE),
    ("confirmed-fee-to-caller", "a confirmed re-check pays its fee to the project",
     "        _credit(credits, claim[\"project\"], int(read[\"fee\"]))\n        return credits", "        _credit(credits, read[\"caller\"], int(read[\"fee\"]))\n        return credits", CORE),
    ("no-keeper-reward", "the re-check that takes a claim down earns the reward",
     "    reward = min(KEEPER_REWARD, int(claim[\"stake\"]))", "    reward = 0", CORE),
    ("takedown-keeps-stake", "a take-down returns the rest of the stake",
     "    _credit(credits, claim[\"project\"], int(claim[\"stake\"]) - reward)", "    pass", CORE),
    ("miss-fee-kept", "a first silent read returns the caller's fee",
     "    claim[\"read\"] = None\n    _credit(credits, read[\"caller\"], int(read[\"fee\"]))\n    return credits", "    claim[\"read\"] = None\n    return credits", CORE),
    ("withdraw-keeps-fee", "withdrawing returns an open re-check's fee",
     "    if read:\n        _credit(credits, read[\"caller\"], int(read[\"fee\"]))", "    if False:\n        _credit(credits, read[\"caller\"], int(read[\"fee\"]))", CORE),
    ("withdraw-by-anyone", "only the project withdraws",
     "    if normalize_address(by) != claim[\"project\"]:", "    if False:", CORE),
    ("withdraw-only-live", "a pending claim can be withdrawn",
     "    if claim[\"state\"] not in OPEN:\n        raise CounterSignError(\"claim %d is %s\"", "    if claim[\"state\"] != LIVE:\n        raise CounterSignError(\"claim %d is %s\"", CORE),
    ("withdraw-twice", "a withdrawn claim cannot be withdrawn again",
     "    if claim[\"state\"] not in OPEN:\n        raise CounterSignError(\"claim %d is %s\"", "    if False:\n        raise CounterSignError(\"claim %d is %s\"", CORE),
    ("cheap-stake", "a posting needs MIN_STAKE",
     "value < MIN_STAKE:", "value < 0:", CORE),
    ("any-fee", "a re-check costs exactly the fee",
     "    if isinstance(value, bool) or value != RECHECK_FEE:", "    if isinstance(value, bool):", CORE),
    # --- reads and states ---
    ("one-miss-down", "one silent read never takes a claim down",
     "    if int(claim[\"misses\"]) and int(read[\"at\"]) >= int(claim[\"miss_at\"]) + int(miss_gap):", "    if True:", CORE),
    ("no-miss-gap", "two silent reads must be MISS_GAP apart",
     "int(read[\"at\"]) >= int(claim[\"miss_at\"]) + int(miss_gap):", "True:", CORE),
    ("misses-never-reset", "a confirmation resets the misses",
     "        claim[\"misses\"] = 0\n", "", CORE),
    ("miss-time-moves", "the first miss keeps its time",
     "    if not int(claim[\"misses\"]):\n        claim[\"misses\"] = 1\n        claim[\"miss_at\"]", "    if True:\n        claim[\"misses\"] = 1\n        claim[\"miss_at\"]", CORE),
    ("print-not-updated", "a confirmed re-check stores the new surroundings",
     "    if kind == CONFIRMED:\n        claim[\"print\"] = str(print_)", "    if kind == CONFIRMED:\n        pass", CORE),
    ("any-seq", "reports are numbered",
     "    if not read or int(seq) != int(read[\"seq\"]) or", "    if not read or", CORE),
    ("end-leaves-read-open", "down, refused and withdrawn are terminal: their read closes",
     "    claim[\"ended_at\"] = int(now)\n    claim[\"read\"] = None", "    claim[\"ended_at\"] = int(now)", CORE),
    ("two-reads-open", "one read is open at a time",
     "    if claim.get(\"read\"):\n        raise CounterSignError(\"a read of claim", "    if False:\n        raise CounterSignError(\"a read of claim", CORE),
    ("recheck-pending", "a re-check only from live",
     "    if claim[\"state\"] != LIVE:\n        errors.append(\"only a live claim", "    if claim[\"state\"] not in OPEN:\n        errors.append(\"only a live claim", CORE),
    ("recheck-during-read", "a re-check waits for an open read",
     "    elif claim.get(\"read\"):\n        errors.append(", "    elif False:\n        errors.append(", CORE),
    ("auditor-rechecks", "the auditor cannot re-check its own claims",
     "        errors.append(\"the auditor cannot re-check", "        pass  # (\"the auditor cannot re-check", CORE),
    ("auditor-posts", "the auditor cannot post on its own entry",
     "        errors.append(\"an auditor cannot post claims on its own entry\")", "        pass", CORE),
    ("expire-early", "a read expires only after its deadline",
     "    if int(now) <= int(read[\"due\"]):", "    if False:", CORE),
    ("expire-confirms", "an expired read is silent",
     "    return apply_report(claim, seq=read[\"seq\"], kind=SILENT,", "    return apply_report(claim, seq=read[\"seq\"], kind=CONFIRMED,", CORE),
    ("registration-redecided", "a registration is decided once",
     "    if auditor[\"state\"] != AUDITOR_PENDING:\n        return False", "    if False:\n        return False", CORE),
    ("registration-expires-early", "a registration expires only after its deadline",
     "    if int(now) <= int(auditor[\"due\"]):", "    if False:", CORE),
    ("registration-expiry-redecides", "only a pending registration expires",
     "    if auditor[\"state\"] != AUDITOR_PENDING:\n        raise CounterSignError", "    if False:\n        raise CounterSignError", CORE),
    ("pending-auditor", "claims need a registered auditor",
     "        errors.append(\"the auditor is not registered\")", "        pass", CORE),
    # --- fields ---
    ("scope-substring", "scope matches as whole words",
     "        if not before.isalnum() and not after.isalnum():", "        if True:", TEXT),
    ("scope-unchecked", "every scope string must be in the passage",
     "        missing = [s for s in scope if not whole_word(p, s)]", "        missing = []", CORE),
    ("subject-unchecked", "the subject must be in the passage",
     "        if not whole_word(p, subject):", "        if False:", CORE),
    ("stop-words-allowed", "a subject of only common words is refused",
     "    if all(w in STOP_WORDS for w in words_of(normalize(s))):", "    if False:", CORE),
    ("stop-word-anywhere", "a name containing a common word is accepted",
     "    if all(w in STOP_WORDS for w in words_of(normalize(s))):", "    if any(w in STOP_WORDS for w in words_of(normalize(s))):", CORE),
    ("no-letters", "a subject has at least 3 letters",
     "    if sum(1 for ch in s if ch.isalpha()) < 3:", "    if False:", CORE),
    ("scope-unbounded", "1-4 scope strings",
     "    if not isinstance(scope, list) or not 1 <= len(scope) <= MAX_SCOPE:", "    if not isinstance(scope, list):", CORE),
    ("http-allowed", "the page must be https",
     "    if not u.startswith(\"https://\") or len(u) > MAX_URL:", "    if len(u) > MAX_URL:", CORE),
    ("percent-allowed", "no percent-encoding",
     "ch in \"%\\\\@?#\"", "ch in \"\\\\@?#\"", CORE),
    ("dotdot-allowed", "no ..",
     " or \"..\" in u:", ":", CORE),
    ("short-passage", "a passage must say something",
     "    if len(p) < MIN_PASSAGE:", "    if False:", TEXT),
    # --- one read ---
    ("sample-unchecked", "registration needs the sample on the page",
     "    return text is not None and passage_present(text, sample)", "    return text is not None", CORE),
    ("length-unchecked", "a page with too little visible text is unreadable",
     "    return text if len(text) >= MIN_VISIBLE else None", "    return text", CORE),
    ("byte-cap-off", "a page over the byte cap is unreadable",
     " or len(body) > MAX_PAGE_BYTES:", ":", CORE),
    ("status-ignored", "a non-2xx page is unreadable",
     "    if not 200 <= int(status) < 300 or", "    if", CORE),
    ("posting-skips-phrases", "a withdrawal phrase at posting asks the jury",
     "        ask = bool(fired(text, passage))", "        ask = False", CORE),
    ("phrase-substring", "withdrawal phrases match as whole words",
     "    return [w for w in WITHDRAW if whole_word(window, w)]", "    return [w for w in WITHDRAW if w in window]", CORE),
    ("recheck-skips-print", "changed surroundings ask the jury",
     "        ask = fp != str(stored_print)", "        ask = False", CORE),
    ("model-on-every-read", "a passage with unchanged surroundings never reaches the jury",
     "        ask = fp != str(stored_print)", "        ask = True", CORE),
    # --- the page text ---
    ("scripts-are-text", "hidden elements are not text",
     "    if name in HIDDEN_ELEMENTS or ", "    if False or ", TEXT),
    ("hidden-attribute-is-text", "an element marked hidden is not text",
     "or \" hidden \" in _bare(tag).replace(\"=\", \" \") or", "or False or", TEXT),
    ("aria-hidden-is-text", "an element hidden from readers is not text",
     " or _attr(tag, \"aria-hidden\") == \"true\":", ":", TEXT),
    ("inline-style-is-text", "an element hidden by its style is not text",
     "    if any(rule in style for rule in HIDING_STYLES) or ", "    if False or ", TEXT),
    ("page-css-is-ignored", "an element hidden by the page's own CSS is not text",
     "            if \"display:none\" in body or \"visibility:hidden\" in body:", "            if False:", TEXT),
    ("hiding-class-is-text", "an element hidden by a framework class is not text",
     "    return any(c in HIDING_CLASSES or \".\" + c in hidden for c in classes)", "    return any(\".\" + c in hidden for c in classes)", TEXT),
    ("responsive-class-hidden", "an element a responsive class shows is text",
     "    if any(\":\" in c and not c.endswith((\"hidden\", \"none\")) for c in classes):", "    if False:", TEXT),
    ("nested-hidden-leaks", "a hidden element ends at its own close tag",
     "                depth += 1", "                pass", TEXT),
    ("comments-are-text", "comments are not text",
     "        if html.startswith(\"<!--\", lt):", "        if False:", TEXT),
    ("case-matters", "case and spacing are not words",
     "    return \" \".join(\"\".join(folded).lower().split())", "    return \"\".join(folded)", TEXT),
    ("dates-count", "dates near a passage are not a change",
     "if w not in DATE_WORDS)", ")", TEXT),
    ("second-copy-ignored", "every place the passage appears counts",
     "        at = text.find(p, at + 1)", "        at = -1", TEXT),
    ("window-ignored", "the words beside a passage are its surroundings",
     "        parts.append(_letters(before) + \"|\" + _letters(after))", "        parts.append(\"|\")", TEXT),
    # --- the prompt ---
    ("page-not-neutralized", "the page cannot forge the prompt's structure",
     "    shown = \"\\n...\\n\".join(neutralize(a) for a in around)[:MAX_SHOWN]", "    shown = \"\\n...\\n\".join(a for a in around)[:MAX_SHOWN]", PROMPTS),
    ("loose-label", "the answer is read strictly",
     "    label = as_dict(raw).get(\"label\")", "    label = as_dict(raw).get(\"label\") or as_dict(raw).get(\"verdict\") or (raw if isinstance(raw, str) else None)", PROMPTS),
    ("cannot-tell-keeps", "only confirms keeps a claim",
     "    return CONFIRMED if label == CONFIRMS else DENIED", "    return DENIED if label in (DENIES, POINTS_ELSEWHERE) else CONFIRMED", PROMPTS),
    # --- the Board ---
    ("note-from-anyone", "only the Reader reports",
     "        if self._me() != self.reader:", "        if False:", BOARD),
    ("refusal-reverts", "a refused posting must not revert",
     "            self._refuse(\"; \".join(errors), value)\n            return -1", "            raise Exception(\"; \".join(errors))", BOARD),
    ("refusal-keeps-value", "a refused payment is credited back",
     "        if value > 0:\n            self._take(value)\n            self._pay({me: value})", "        if value > 0:\n            self._take(value)", BOARD),
    ("posting-not-read", "a posting asks the Reader",
     "        self._save_claim(claim)\n        self.claim_count = u256(claim_id + 1)\n        self._ask(claim, auditor)", "        self._save_claim(claim)\n        self.claim_count = u256(claim_id + 1)", BOARD),
    ("collect-twice", "collect zeroes what it sends",
     "        self.owed[me] = u256(0)", "        pass", BOARD),
    # --- the Reader ---
    ("read-for-anyone", "only the Board asks for reads",
     "        if not self.board or str(gl.message.sender_address).lower() != self.board:", "        if False:", READER),
    ("rebind", "the Reader is bound once",
     "!= self.owner or self.board:", "!= self.owner:", READER),
    ("retry-without-open-read", "a retry needs an open read",
     "        if not read:\n            raise Exception(\"[EXPECTED] no read of this claim is open\")", "        if not read:\n            read = {\"seq\": c[\"seq\"] + 1, \"kind\": RECHECK}", READER),
    ("retry-forgets-kind", "a retry reads as the open read's kind",
     "int(read[\"seq\"]), read[\"kind\"] == POSTING, str(a[\"url\"])", "int(read[\"seq\"]), False, str(a[\"url\"])", READER),
    ("retry-forgets-print", "a retry compares with the stored fingerprint",
     "json.dumps(c[\"scope\"]), str(c[\"passage\"]), str(c[\"print\"]))", "json.dumps(c[\"scope\"]), str(c[\"passage\"]), \"\")", READER),
    ("retry-registration-decided", "only a pending registration is retried",
     "        if a[\"state\"] != AUDITOR_PENDING:\n            raise", "        if False:\n            raise", READER),
    ("validator-skips-print", "validators agree on the surroundings",
     "            if str(_theirs.get(\"print\", \"\")) != _r[\"print\"]:\n                return False", "            if False:\n                return False", READER),
    ("validator-trusts-kind", "validators agree on the outcome",
     "            return str(_theirs.get(\"kind\", \"\")) == _kind", "            return True", READER),
    ("validator-trusts-registration", "validators agree on a registration",
     "            return as_dict(leader_result).get(\"ok\") is _ok", "            return True", READER),
    ("unknown-kind-confirms", "an unreadable consensus result is silent",
     "        if kind not in REPORTS:\n            kind = SILENT", "        if kind not in REPORTS:\n            kind = CONFIRMED", READER),
]


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)


def main():
    files = sorted({m[4] for m in MUTATIONS})
    originals = {f: open(f).read() for f in files}
    snap = tempfile.mkdtemp()
    shutil.copytree(BUILD, os.path.join(snap, "build"))
    suite = [sys.executable, "-m", "pytest", "tests/direct", "-q", "-x", "-p", "no:cacheprovider"]
    if run(suite).returncode != 0:
        print("BASELINE SUITE IS RED")
        return 2
    killed, survived, unapplied = [], [], []
    try:
        for name, why, old, new, target in MUTATIONS:
            src = originals[target]
            if old == new or src.count(old) != 1:
                unapplied.append((name, why))
                continue
            try:
                open(target, "w").write(src.replace(old, new, 1))
                if run([sys.executable, "deploy/build_contract.py"]).returncode != 0:
                    killed.append(name)
                    continue
                result = run(suite)
            finally:
                open(target, "w").write(src)
            (killed if result.returncode != 0 else survived).append(name if result.returncode != 0 else (name, why))
    finally:
        for f, text in originals.items():
            open(f, "w").write(text)
        shutil.rmtree(BUILD)
        shutil.copytree(os.path.join(snap, "build"), BUILD)
        shutil.rmtree(snap)
    if run(suite).returncode != 0:
        print("RESTORE FAILED")
        return 3
    print("mutants killed   : %d" % len(killed))
    print("mutants survived : %d" % len(survived))
    print("not applied      : %d" % len(unapplied))
    for name, why in unapplied:
        print("  ?  %-30s %s" % (name, why))
    for name, why in survived:
        print("  !  %-30s UNTESTED: %s" % (name, why))
    return 1 if survived or unapplied else 0


if __name__ == "__main__":
    sys.exit(main())
