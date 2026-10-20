"""The visible-text rules carried over from RedLine, with their tests, and the
new rules on top: whole words, and the words around a passage."""

import pytest
from conftest import ACME, ROWS, audit_page

from countersign_text import (
    MAX_PASSAGE, MIN_PASSAGE, WINDOW_WORDS, hidden_selectors, normalize, page_text, passage_error, passage_present,
    places, strip_markup, surroundings, surroundings_print, unescape, whole_word,
)


def test_markup_comments_and_hidden_elements_are_not_text():
    html = '<p>Keep <b>this</b></p><!-- not this --><script>var x = "not this";</script><style>p{}</style><noscript>no</noscript><p>and this</p>'
    assert normalize(strip_markup(html)) == "keep this and this"
    assert normalize(strip_markup("<p>a</p><!-- x > not this --><p>b</p>")) == "a b"


def test_entities_and_typography_fold_to_one_form():
    assert unescape("&amp;&lt;&#39;&#x2014;&nbsp;&bogus;") == "&<'— &bogus;"
    assert normalize("v2 “audit” — March 2026") == normalize('v2 "audit" - March 2026')


def test_a_table_row_reads_as_one_passage():
    text = page_text(audit_page())
    assert passage_present(text, ACME)
    assert passage_present(text, ACME.upper())  # case and spacing are not words
    assert not passage_present(text, ACME.replace("v2", "v3"))
    assert not passage_present(text, ACME.replace("March", "April"))


def test_plain_text_pages_pass_through():
    assert page_text(b"Plain   TEXT list") == "plain text list"
    assert page_text("| Acme | v2 |") == "| acme | v2 |"


def test_a_passage_must_say_something_and_not_too_much():
    assert "at least" in passage_error("Acme v2")
    assert "at most" in passage_error("word " * 200)
    assert passage_error(ACME) == ""
    assert MIN_PASSAGE == 40 and MAX_PASSAGE == 600


@pytest.mark.parametrize("html", [
    '<div hidden><p>%s</p></div>',
    '<div hidden="hidden">%s</div>',
    '<p aria-hidden="true">%s</p>',
    '<p style="display: none">%s</p>',
    "<p style='visibility:hidden'>%s</p>",
    '<p style="font-size:0px">%s</p>',
    '<span class="sr-only">%s</span>',
    '<div class="text d-none">%s</div>',
    '<style>.old { display: none }</style><p class="old">%s</p>',
    '<style>@media all { #v1 { visibility: hidden } }</style><section id="v1">%s</section>',
    '<div hidden><div><p>%s</p></div></div>',
    '<div hidden><div>first</div><p>%s</p></div>',
])
def test_a_hidden_passage_is_not_present(html):
    page_html = ("<html><body><p>Visible.</p>" + html + "<p>After.</p></body></html>") % ACME
    text = page_text(page_html)
    assert not passage_present(text, ACME), html
    assert text.startswith("visible.") and text.endswith("after.")


def test_a_hidden_table_row_is_not_present():
    assert not passage_present(page_text(audit_page(hidden_row="Acme Lending")), ACME)


@pytest.mark.parametrize("html", [
    '<p class="hidden md:block">%s</p>',
    '<p title="hidden">%s</p>',
    '<p data-hidden="1">%s</p>',
    '<p class="hiddenness">%s</p>',
    '<style>.old p { display: none }</style><p class="old">%s</p>',
])
def test_text_a_reader_can_see_stays_on_the_page(html):
    assert passage_present(page_text(("<html><body>" + html + "</body></html>") % ACME), ACME), html


def test_only_bare_class_and_id_rules_that_hide_count():
    css = "<style>.a{display:none} .b , #c {visibility : hidden} .d .e{display:none} .f{color:red}</style>"
    assert hidden_selectors(css) == {".a", ".b", "#c"}


def test_whole_words_only():
    hay = normalize(ACME)
    assert whole_word(hay, "Acme Lending") and whole_word(hay, "lending contracts v2") and whole_word(hay, "March 2026")
    assert not whole_word(normalize("acme lending contracts v20"), "v2")
    assert not whole_word(normalize("acmeswap router"), "acme")
    assert not whole_word(normalize("kelp lrt-eth withdrawals"), "withdrawn")
    assert whole_word(normalize("(v2)"), "v2") and whole_word(normalize("v2, march"), "v2")
    assert not whole_word(hay, "") and not whole_word(hay, "   ")
    # A later whole-word match counts even when an earlier one is part of a word.
    assert whole_word(normalize("v20 and v2"), "v2")


def test_the_surroundings_are_the_words_either_side_of_every_place():
    text = page_text(audit_page())
    assert len(places(text, ACME)) == 1
    shown = surroundings(text, ACME)
    assert len(shown) == 1 and normalize(ACME) in shown[0]
    assert "borealis swap" in shown[0]  # the next row
    long_text = " ".join(["word%d" % i for i in range(500)]) + " " + normalize(ACME) + " " + " ".join(["tail%d" % i for i in range(500)])
    window = surroundings(long_text, ACME)[0].split(" ")
    assert window[0] == "word%d" % (500 - WINDOW_WORDS) and window[-1] == "tail%d" % (WINDOW_WORDS - 1)


def test_dates_and_numbers_near_a_passage_are_not_a_change():
    a = audit_page(before="<p>Updated 3 March 2026. 41 audits.</p>")
    b = audit_page(before="<p>Updated 9 September 2026. 57 audits.</p>")
    assert surroundings_print(page_text(a), ACME) == surroundings_print(page_text(b), ACME) != ""
    assert surroundings_print(page_text(a), ACME.replace("v2", "v9")) == ""


def test_a_word_beside_a_passage_or_a_second_copy_changes_its_surroundings():
    base = surroundings_print(page_text(audit_page()), ACME)
    withdrawn = surroundings_print(page_text(audit_page(extra={"Acme Lending": " (this audit has been withdrawn)"})), ACME)
    neighbour = surroundings_print(page_text(audit_page(ROWS[:1] + [("Delta DEX", "amm v1", "May 2026")] + ROWS[1:])), ACME)
    twice = surroundings_print(page_text(audit_page(after="<p>%s</p>" % ACME)), ACME)
    assert len({base, withdrawn, neighbour, twice}) == 4


def test_a_change_far_from_the_passage_is_not_a_change():
    filler = "<p>" + " ".join("note%d" % i for i in range(200)) + "</p>"
    a = audit_page(after=filler + "<p>We are hiring.</p>")
    b = audit_page(after=filler + "<p>Our office has moved.</p>")
    assert surroundings_print(page_text(a), ACME) == surroundings_print(page_text(b), ACME)


def test_a_second_copy_far_from_the_first_changes_the_surroundings():
    filler = "<p>" + " ".join("note%d" % i for i in range(200)) + "</p>"
    one = audit_page(after=filler)
    two = audit_page(after=filler + "<p>%s</p>" % ACME)
    assert len(places(page_text(two), ACME)) == 2
    assert surroundings_print(page_text(one), ACME) != surroundings_print(page_text(two), ACME)
