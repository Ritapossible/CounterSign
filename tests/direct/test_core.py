"""Every rule in countersign_core, tested directly: fields, URLs, the outcome
of one read, and every path of the money."""

import json
import os
import random

import pytest
from conftest import ACME, AUDITOR, FEE, KEEPER, OTHER, PAGE, PROJECT, REWARD, ROOT, SCOPE, STAKE, SUBJECT, audit_page

import countersign_core as core
from countersign_core import (
    ASK_JURY, CONFIRMED, DENIED, DOWN, LIVE, PENDING, POSTING, RECHECK, REFUSED, SILENT, WITHDRAWN, CounterSignError,
)

T0 = 1_700_000_000
GAP = 300
WINDOW = 600


def registered():
    a = core.new_auditor(auditor_id=0, name="Northlight Security", url=PAGE, sample=ACME, signer=AUDITOR, now=T0, window=WINDOW)
    core.apply_registration(a, ok=True, now=T0)
    return a


def errors(**kw):
    args = dict(auditor=registered(), project=PROJECT, subject=SUBJECT, scope=list(SCOPE), passage=ACME, value=STAKE)
    args.update(kw)
    return core.claim_errors(**args)


def posted(now=T0):
    c = core.new_claim(claim_id=0, auditor=registered(), project=PROJECT, subject=SUBJECT, scope=SCOPE, passage=ACME, stake=STAKE, now=now)
    core.open_read(c, kind=POSTING, caller=PROJECT, fee=0, now=now, window=WINDOW)
    return c


def live(now=T0):
    c = posted(now)
    assert core.apply_report(c, seq=1, kind=CONFIRMED, print_="p1", now=now, miss_gap=GAP) == {}
    return c


def recheck(c, now, caller=KEEPER):
    assert core.recheck_errors(c, caller=caller, auditor=registered(), value=FEE) == []
    return core.open_read(c, kind=RECHECK, caller=caller, fee=FEE, now=now, window=WINDOW)


# ------------------------------------------------------------------ fields

@pytest.mark.parametrize("url", [
    "http://northlight.example/audits",
    "https://northlight.example/%2e%2e/admin",
    "https://northlight.example/%252e",
    "https://northlight.example/../x",
    "https://northlight.example\\x",
    "https://user@northlight.example/x",
    "https://northlight.example/x?id=1",
    "https://northlight.example/x#frag",
    "https://northlight.example/a b",
    "https://localhost/x",
    "https://" + "a" * 300 + ".example",
])
def test_unsafe_urls_are_refused(url):
    assert core.url_error(url)


def test_a_plain_page_url_is_accepted_and_its_host_is_the_identity():
    assert core.url_error(PAGE) == ""
    assert core.url_error("https://raw.githubusercontent.com/sigp/public-audits/master/README.md") == ""
    assert core.host_of("https://Raw.GitHubUserContent.com/a/b") == "raw.githubusercontent.com"


@pytest.mark.parametrize("subject,ok", [
    ("Acme Labs", True), ("Acme", True), ("uniswap v4 core", True), ("lido", True),
    ("labs", False), ("the protocol", False), ("Security Audit", False), ("v2", False), ("ab", False),
    ("12345", False), ("a1 b2", False), ("x" * 81, False), ("Acme\x00", False),
])
def test_the_subject_must_be_a_name(subject, ok):
    assert (core.subject_error(subject) == "") == ok, subject


def test_the_scope_is_one_to_four_short_strings():
    assert core.scope_errors(["v2"]) == []
    assert core.scope_errors([]) and core.scope_errors(["a", "b", "c", "d", "e"]) and core.scope_errors("v2")
    assert core.scope_errors(["x"]) and core.scope_errors(["--"]) and core.scope_errors([2]) and core.scope_errors(["y" * 81])


def test_posting_without_a_complete_passage_is_refused_before_any_read():
    assert errors() == []
    assert errors(scope=["lending contracts v3"]) == ["not in the passage as whole words: lending contracts v3"]
    assert errors(scope=["v"]) and errors(scope=["contracts v"])
    assert errors(subject="Acme Lend") == ["the subject is not in the passage as whole words"]
    assert errors(passage="Acme Lending v2") and errors(passage=ACME.replace("v2", "v20"))


def test_a_scope_string_missing_from_the_passage_is_refused():
    assert errors(scope=["lending contracts v2", "April 2026"]) == ["not in the passage as whole words: April 2026"]
    assert errors(scope=["v2"]) == []  # a whole word of the passage


def test_posting_needs_a_registered_auditor_a_stake_and_a_different_project():
    pending = core.new_auditor(auditor_id=0, name="Northlight", url=PAGE, sample=ACME, signer=AUDITOR, now=T0, window=WINDOW)
    assert errors(auditor=pending) == ["the auditor is not registered"]
    assert errors(auditor=None) == ["unknown auditor"]
    assert errors(value=STAKE - 1) and errors(value=True) and errors(value=0)
    assert errors(project=AUDITOR) == ["an auditor cannot post claims on its own entry"]


def test_registration_fields():
    assert core.registration_errors("Northlight", PAGE, ACME) == []
    assert core.registration_errors("N", PAGE, ACME) and core.registration_errors("Northlight", "http://x.example", ACME)
    assert core.registration_errors("Northlight", PAGE, "too short")


def test_real_rows_from_phase_1_are_complete():
    with open(os.path.join(ROOT, "deploy", "probes", "audit_pages.json")) as h:
        cases = json.load(h)
    complete = 0
    for case in cases.values():
        if case["scope"]:
            p = core.normalize(case["passage"])
            ok = core.whole_word(p, case["subject"]) and all(core.whole_word(p, s) for s in case["scope"])
            complete += ok
    assert complete == 4  # the four GitHub lists; ChainSecurity's names-only text has no scope, as measured


# ------------------------------------------------------------ one page read

def page_read(body, posting=True, stored="", status=200):
    return core.read_page(status, body, ACME, posting=posting, stored_print=stored)


def test_a_complete_passage_with_ordinary_surroundings_is_confirmed_by_code():
    r = page_read(audit_page())
    assert r["kind"] == CONFIRMED and r["print"] and r["around"] == []
    again = page_read(audit_page(), posting=False, stored=r["print"])
    assert again["kind"] == CONFIRMED and again["print"] == r["print"]


@pytest.mark.parametrize("body,status", [
    (audit_page(), 404), (audit_page(), 500), (audit_page(), 301),
    (audit_page(hidden_row="Acme Lending"), 200),
    (audit_page()[: 300], 200),
    (b"<html><body><div id=root></div><script>render()</script></body></html>", 200),
    (audit_page(after="<p>" + "x " * 200_000 + "</p>"), 200),
])
def test_an_unreadable_page_or_a_missing_passage_is_silent(body, status):
    assert page_read(body, status=status)["kind"] == SILENT


def test_at_posting_a_withdrawal_phrase_beside_the_passage_asks_the_jury():
    r = page_read(audit_page(extra={"Acme Lending": " (withdrawn)"}))
    assert r["kind"] == ASK_JURY and r["around"] and "withdrawn" in r["around"][0]
    assert core.fired(core.page_text(audit_page(extra={"Acme Lending": " - no longer valid"})), ACME) == ["no longer valid"]


def test_words_that_ordinary_reports_use_do_not_ask_the_jury():
    for words in (" did not find critical issues", " draft report", " preliminary findings", " Kelp LRT-ETH Withdrawals",
                  " revoke role fix", " unwithdrawn"):
        assert page_read(audit_page(extra={"Acme Lending": words}))["kind"] == CONFIRMED, words


def test_a_standing_disclaimer_above_the_list_does_not_ask_the_jury():
    """A real auditor page may say "a project not listed here was not audited
    by us" above its table. A jury reading that beside the row might refuse an
    honest claim, so those phrases are not on the posting list."""
    for line in ("A project that is not listed here was not audited by us.",
                 "Any project not on this list was not audited by Northlight.",
                 "Projects not listed here, we did not audit.",
                 "We do not endorse any project. A listing here is not an audit of later versions."):
        assert page_read(audit_page(before="<p>%s</p>" % line))["kind"] == CONFIRMED, line
    for phrase in ("not audited by", "was not audited", "did not audit", "not an audit", "do not endorse"):
        assert phrase not in core.WITHDRAW


def test_at_a_recheck_only_changed_surroundings_ask_the_jury():
    base = page_read(audit_page(before="<p>Updated 3 March 2026</p>"))["print"]
    assert page_read(audit_page(before="<p>Updated 4 May 2026</p>"), posting=False, stored=base)["kind"] == CONFIRMED
    assert page_read(audit_page(before="<p>Revised 4 May 2026</p>"), posting=False, stored=base)["kind"] == ASK_JURY
    base = page_read(audit_page())["print"]
    changed = page_read(audit_page(extra={"Acme Lending": " (superseded by v3 review)"}), posting=False, stored=base)
    assert changed["kind"] == ASK_JURY and changed["print"] != base


def test_a_page_with_almost_no_visible_text_is_unreadable_even_with_the_passage():
    tiny = ("<html><body><table>" + "<tr><td>Acme Lending</td><td>lending contracts v2</td><td>March 2026</td>"
            "<td>Northlight audit report</td></tr></table></body></html>").encode()
    assert core.passage_present(core.page_text(tiny), ACME) and len(core.page_text(tiny)) < core.MIN_VISIBLE
    assert page_read(tiny)["kind"] == SILENT and not core.registration_ok(200, tiny, ACME)


def test_registration_needs_the_sample_on_a_readable_page():
    assert core.registration_ok(200, audit_page(), ACME)
    assert not core.registration_ok(200, audit_page(), ACME.replace("v2", "v4"))
    assert not core.registration_ok(200, audit_page(intro=False, rows=[]), ACME)
    assert not core.registration_ok(404, audit_page(), ACME)
    # Long and readable, but the list is drawn by script (Halborn, OpenZeppelin in Phase 1).
    nav = ("<html><body><nav>" + "Services Research Blog Careers Contact " * 20 + "</nav>"
           "<div id=audits></div><script>load()</script></body></html>").encode()
    assert len(core.page_text(nav)) >= core.MIN_VISIBLE and not core.registration_ok(200, nav, ACME)


# ------------------------------------------------------------------- money

def test_a_confirmed_posting_goes_live_with_its_fingerprint():
    c = live()
    assert c["state"] == LIVE and c["print"] == "p1" and c["read"] is None and c["checked_at"] == T0


@pytest.mark.parametrize("kind", [DENIED, SILENT])
def test_posting_without_the_passage_is_refused_and_refunded(kind):
    c = posted()
    assert core.apply_report(c, seq=1, kind=kind, print_="", now=T0 + 5, miss_gap=GAP) == {PROJECT: STAKE}
    assert c["state"] == REFUSED and c["read"] is None


def test_a_confirmed_recheck_pays_the_fee_to_the_project():
    c = live()
    recheck(c, T0 + 10)
    assert core.apply_report(c, seq=2, kind=CONFIRMED, print_="p2", now=T0 + 20, miss_gap=GAP) == {PROJECT: FEE}
    assert c["state"] == LIVE and c["print"] == "p2" and c["checked_at"] == T0 + 10


def test_a_denial_takes_the_claim_down_and_pays_the_keeper():
    c = live()
    recheck(c, T0 + 10)
    credits = core.apply_report(c, seq=2, kind=DENIED, print_="", now=T0 + 20, miss_gap=GAP)
    assert credits == {KEEPER: REWARD + FEE, PROJECT: STAKE - REWARD}
    assert c["state"] == DOWN and "denies" in c["why"]


def test_one_silent_read_leaves_the_claim_up():
    c = live()
    recheck(c, T0 + 10)
    assert core.apply_report(c, seq=2, kind=SILENT, print_="", now=T0 + 20, miss_gap=GAP) == {KEEPER: FEE}
    assert c["state"] == LIVE and c["misses"] == 1 and c["miss_at"] == T0 + 10


def test_two_silent_reads_miss_gap_apart_take_it_down():
    c = live()
    recheck(c, T0 + 10)
    core.apply_report(c, seq=2, kind=SILENT, print_="", now=T0 + 20, miss_gap=GAP)
    recheck(c, T0 + 10 + GAP - 1, caller=OTHER)
    assert core.apply_report(c, seq=3, kind=SILENT, print_="", now=T0 + GAP + 20, miss_gap=GAP) == {OTHER: FEE}
    assert c["state"] == LIVE and c["miss_at"] == T0 + 10  # too soon: the first miss keeps its time
    recheck(c, T0 + 10 + GAP, caller=OTHER)
    credits = core.apply_report(c, seq=4, kind=SILENT, print_="", now=T0 + GAP + 30, miss_gap=GAP)
    assert credits == {OTHER: REWARD + FEE, PROJECT: STAKE - REWARD} and c["state"] == DOWN


def test_a_confirmation_resets_the_misses():
    c = live()
    recheck(c, T0 + 10)
    core.apply_report(c, seq=2, kind=SILENT, print_="", now=T0 + 20, miss_gap=GAP)
    recheck(c, T0 + 30)
    core.apply_report(c, seq=3, kind=CONFIRMED, print_="p1", now=T0 + 40, miss_gap=GAP)
    assert c["misses"] == 0 and c["miss_at"] == 0
    recheck(c, T0 + 10 + GAP * 2)
    core.apply_report(c, seq=4, kind=SILENT, print_="", now=T0 + GAP * 3, miss_gap=GAP)
    assert c["state"] == LIVE and c["misses"] == 1


def test_reports_late_twice_or_out_of_order():
    c = live()
    assert core.apply_report(c, seq=1, kind=DENIED, print_="", now=T0 + 1, miss_gap=GAP) is None  # replayed
    recheck(c, T0 + 10)
    assert core.apply_report(c, seq=1, kind=DENIED, print_="", now=T0 + 11, miss_gap=GAP) is None  # older
    assert core.apply_report(c, seq=3, kind=DENIED, print_="", now=T0 + 11, miss_gap=GAP) is None  # never opened
    assert core.apply_report(c, seq=2, kind=CONFIRMED, print_="p1", now=T0 + 12, miss_gap=GAP) == {PROJECT: FEE}
    assert core.apply_report(c, seq=2, kind=DENIED, print_="", now=T0 + 13, miss_gap=GAP) is None  # twice
    assert c["state"] == LIVE
    with pytest.raises(CounterSignError):
        core.apply_report(c, seq=2, kind="confirms", print_="", now=T0, miss_gap=GAP)


def test_an_expired_read_is_silent():
    c = posted()
    with pytest.raises(CounterSignError):
        core.expire_read(c, now=T0 + WINDOW, miss_gap=GAP)
    assert core.expire_read(c, now=T0 + WINDOW + 1, miss_gap=GAP) == {PROJECT: STAKE}
    assert c["state"] == REFUSED
    with pytest.raises(CounterSignError):
        core.expire_read(c, now=T0 + WINDOW * 2, miss_gap=GAP)
    # The Reader's report for that read, arriving late, is ignored.
    assert core.apply_report(c, seq=1, kind=CONFIRMED, print_="p", now=T0 + WINDOW * 2, miss_gap=GAP) is None


def test_an_expired_recheck_is_not_a_miss():
    """No agreed result is not evidence the page is gone: the fee goes back
    and the misses stay as they were, so expiries never take a claim down."""
    c = posted()
    core.apply_report(c, seq=1, kind=CONFIRMED, print_="p", now=T0 + 1, miss_gap=GAP)
    core.open_read(c, kind=RECHECK, caller=KEEPER, fee=FEE, now=T0 + 10, window=WINDOW)
    with pytest.raises(CounterSignError):
        core.expire_read(c, now=T0 + 10 + WINDOW, miss_gap=GAP)
    assert core.expire_read(c, now=T0 + 11 + WINDOW, miss_gap=GAP) == {KEEPER: FEE}
    assert c["state"] == LIVE and c["misses"] == 0 and c["read"] is None
    # After one reported silent, any number of expiries, however far apart, change nothing.
    core.open_read(c, kind=RECHECK, caller=KEEPER, fee=FEE, now=T0 + 2000, window=WINDOW)
    core.apply_report(c, seq=c["seq"], kind=SILENT, print_="", now=T0 + 2001, miss_gap=GAP)
    assert c["misses"] == 1 and c["miss_at"] == T0 + 2000
    for k in range(3):
        at = T0 + 2000 + (k + 1) * (GAP + WINDOW + 10)
        core.open_read(c, kind=RECHECK, caller=KEEPER, fee=FEE, now=at, window=WINDOW)
        assert core.expire_read(c, now=at + WINDOW + 1, miss_gap=GAP) == {KEEPER: FEE}
        assert c["state"] == LIVE and c["misses"] == 1 and c["miss_at"] == T0 + 2000
    # A silent the Reader reports still counts.
    at = T0 + 2000 + 5 * (GAP + WINDOW + 10)
    core.open_read(c, kind=RECHECK, caller=KEEPER, fee=FEE, now=at, window=WINDOW)
    credits = core.apply_report(c, seq=c["seq"], kind=SILENT, print_="", now=at + 1, miss_gap=GAP)
    assert c["state"] == DOWN and credits[KEEPER] == FEE + core.KEEPER_REWARD


def test_a_pending_claim_cannot_be_rechecked():
    c = posted()
    assert core.recheck_errors(c, caller=KEEPER, auditor=registered(), value=FEE) == ["only a live claim can be re-checked"]
    c = live()
    recheck(c, T0 + 1)
    assert core.recheck_errors(c, caller=OTHER, auditor=registered(), value=FEE) == ["a read of this claim is already open"]
    with pytest.raises(CounterSignError):
        core.open_read(c, kind=RECHECK, caller=OTHER, fee=FEE, now=T0 + 2, window=WINDOW)


def test_a_recheck_costs_exactly_the_fee_and_never_from_the_auditor():
    c = live()
    a = registered()
    assert core.recheck_errors(c, caller=KEEPER, auditor=a, value=FEE - 1)
    assert core.recheck_errors(c, caller=KEEPER, auditor=a, value=FEE + 1)
    assert core.recheck_errors(c, caller=AUDITOR, auditor=a, value=FEE) == ["the auditor cannot re-check claims on its own entry"]


def test_a_pending_claim_can_be_withdrawn():
    c = posted()
    with pytest.raises(CounterSignError):
        core.withdraw_claim(c, by=KEEPER, now=T0 + 1)
    assert core.withdraw_claim(c, by=PROJECT, now=T0 + 1) == {PROJECT: STAKE}
    assert c["state"] == WITHDRAWN and c["read"] is None
    assert core.apply_report(c, seq=1, kind=CONFIRMED, print_="p", now=T0 + 2, miss_gap=GAP) is None
    with pytest.raises(CounterSignError):
        core.withdraw_claim(c, by=PROJECT, now=T0 + 3)


def test_withdrawing_during_a_recheck_returns_the_fee_to_its_payer():
    c = live()
    recheck(c, T0 + 1)
    assert core.withdraw_claim(c, by=PROJECT, now=T0 + 2) == {KEEPER: FEE, PROJECT: STAKE}


def test_registration_reports_change_only_a_pending_entry():
    a = core.new_auditor(auditor_id=0, name="Northlight", url=PAGE, sample=ACME, signer=AUDITOR, now=T0, window=WINDOW)
    assert core.apply_registration(a, ok=False, now=T0) and a["state"] == "refused"
    assert not core.apply_registration(a, ok=True, now=T0) and a["state"] == "refused"


def test_a_registration_with_no_report_expires_refused():
    a = core.new_auditor(auditor_id=0, name="Northlight", url=PAGE, sample=ACME, signer=AUDITOR, now=T0, window=WINDOW)
    with pytest.raises(CounterSignError):
        core.expire_registration(a, now=T0 + WINDOW)
    core.expire_registration(a, now=T0 + WINDOW + 1)
    assert a["state"] == "refused"
    assert not core.apply_registration(a, ok=True, now=T0 + WINDOW + 2)  # a late report is ignored
    with pytest.raises(CounterSignError):
        core.expire_registration(a, now=T0 + WINDOW * 3)


# --------------------------------------------------- property: every path

def test_no_path_pays_the_auditor_and_every_atto_is_accounted_for():
    """Random claim lifecycles. Every atto received ends with the project or a
    keeper, or is still held; the auditor is never credited; terminal states
    stay terminal."""
    rng = random.Random(7)
    callers = [KEEPER, OTHER, PROJECT]
    for trial in range(400):
        c = posted()
        received, credited, now = STAKE, {}, T0
        for _step in range(rng.randint(1, 12)):
            now += rng.choice([1, 60, GAP, GAP + 1, WINDOW + 1])
            before = c["state"]
            action = rng.choice(["report", "report", "recheck", "expire", "withdraw", "stale"])
            credits = None
            try:
                if action == "report" and c.get("read"):
                    credits = core.apply_report(c, seq=c["read"]["seq"], kind=rng.choice([CONFIRMED, DENIED, SILENT]),
                                                print_="p%d" % rng.randint(1, 3), now=now, miss_gap=GAP)
                elif action == "stale":
                    credits = core.apply_report(c, seq=rng.randint(0, c["seq"] + 1) if not c.get("read") else c["seq"] - 1,
                                                kind=DENIED, print_="", now=now, miss_gap=GAP)
                elif action == "recheck":
                    caller = rng.choice(callers)
                    if not core.recheck_errors(c, caller=caller, auditor=registered(), value=FEE):
                        core.open_read(c, kind=RECHECK, caller=caller, fee=FEE, now=now, window=WINDOW)
                        received += FEE
                elif action == "expire":
                    credits = core.expire_read(c, now=now, miss_gap=GAP)
                elif action == "withdraw":
                    credits = core.withdraw_claim(c, by=PROJECT, now=now)
            except CounterSignError:
                credits = None
            if before in (REFUSED, DOWN, WITHDRAWN):
                assert c["state"] == before and not credits
            for who, amount in (credits or {}).items():
                assert who != AUDITOR and amount > 0
                credited[who] = credited.get(who, 0) + amount
        held = (STAKE if c["state"] in (PENDING, LIVE) else 0) + (int(c["read"]["fee"]) if c.get("read") else 0)
        assert sum(credited.values()) + held == received, (trial, c, credited)
        assert set(credited) <= {PROJECT, KEEPER, OTHER}
