"""The deployed files: what they are built from, that they fit, and the
structural rules a reviewer would check by reading them."""

import ast
import builtins
import os
import subprocess
import sys

import pytest

from minify_contract import _names_used, minify

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUILD = os.path.join(ROOT, "contracts", "build")
RUNNER = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"
CAP = 16_777_216
GENLAYER = {"gl", "Address", "u256", "TreeMap", "DynArray"}


def read(name):
    with open(os.path.join(BUILD, name)) as h:
        return h.read()


@pytest.fixture(scope="module")
def board():
    subprocess.run([sys.executable, os.path.join(ROOT, "deploy", "build_contract.py")], check=True, capture_output=True)
    return read("countersign_board.py")


@pytest.fixture(scope="module")
def reader(board):
    return read("countersign_reader.py")


@pytest.fixture(scope="module", params=[("countersign_board", "CounterSignBoard"), ("countersign_reader", "CounterSignReader")])
def pair(request, board):
    name, root = request.param
    return read(name + ".py"), read(name + ".min.py"), root


def method(src, name):
    start = src.index("    def %s(" % name)
    rest = src[start + 10 :]
    ends = [i for i in (rest.find("\n    @gl."), rest.find("\n    def ")) if i != -1]
    return src[start : start + 10 + min(ends)] if ends else src[start:]


def closures(src, name):
    body = method(src, name)
    leader = body[body.index("def leader"): body.index("def validator")]
    validator = body[body.index("def validator"): body.index("gl.vm.run_nondet")]
    return body, leader, validator


def test_runner_header_then_code(pair):
    for src in pair[:2]:
        lines = src.splitlines()
        assert lines[0] == "# v0.2.0"  # Studio Next refuses a runner comment without its version
        assert lines[1] == '# { "Depends": "%s" }' % RUNNER
        assert lines[2] == "from genlayer import *"


def test_deployed_is_a_fresh_minify_of_the_tested_build(pair):
    readable, deployed, root = pair
    assert minify(readable, root=root)[0] == deployed


def test_every_name_the_deployed_file_uses_is_defined(pair):
    tree = ast.parse(pair[1])
    defined = set(GENLAYER) | set(dir(builtins))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            defined.add(node.name)
        elif isinstance(node, ast.Assign):
            defined |= {t.id for t in node.targets if isinstance(t, ast.Name)}
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            defined |= {(a.asname or a.name).split(".")[0] for a in node.names if a.name != "*"}
    missing = set()
    for node in tree.body:
        missing |= _names_used(node) - defined
    assert not missing, sorted(missing)


def test_it_fits_bradburys_gas_cap(pair):
    """Measured on Bradbury: a deploy costs about 0.96M gas plus 782 per byte
    of code and arguments, against 2^24."""
    size = len(pair[1].encode("utf-8"))
    assert 960_000 + 782 * (size + 100) < CAP * 0.96, size


def test_the_fetch_is_inline_in_every_closure(reader):
    for name in ("_read_registration", "_read_claim"):
        _body, leader, validator = closures(reader, name)
        for closure in (leader, validator):
            assert "gl.nondet.web.get(uri)" in closure
            assert "_resp.status" in closure and "_resp.body" in closure
            assert "render" not in closure  # plain fetch only (Phase 1)


def test_registration_runs_no_model_and_a_claim_asks_only_when_code_says_so(reader):
    _body, leader, validator = closures(reader, "_read_registration")
    assert "exec_prompt" not in leader and "exec_prompt" not in validator
    _body, leader, validator = closures(reader, "_read_claim")
    for closure in (leader, validator):
        assert closure.count("exec_prompt") == 1
        assert "if _kind == ASK_JURY:" in closure[: closure.index("exec_prompt")]


def test_validators_compare_the_outcome_and_the_fingerprint(reader):
    _body, _leader, validator = closures(reader, "_read_registration")
    assert 'as_dict(leader_result).get("ok") is _ok' in validator
    _body, _leader, validator = closures(reader, "_read_claim")
    assert 'if str(_theirs.get("print", "")) != _r["print"]:' in validator
    assert 'return str(_theirs.get("kind", "")) == _kind' in validator


def test_the_board_never_reads_the_reader_and_runs_no_model(board):
    assert ".view()" not in board
    assert "exec_prompt" not in board and "run_nondet" not in board and "web.get" not in board
    assert board.count("gl.get_contract_at(") == 2  # the two read requests, as messages
    assert '.emit(on="accepted").read_registration(' in method(board, "register")
    assert '.emit(on="accepted").read_claim(' in method(board, "_ask")


def test_the_reader_reports_on_finality_holds_no_gen_and_serves_one_board(board, reader):
    for name in ("note_registration", "note_claim"):
        assert "self._from_reader()" in method(board, name)
    assert "payable" not in reader and "emit_transfer" not in reader
    assert reader.count('.emit(on="finalized")') == 2 and 'emit(on="accepted")' not in reader
    for name in ("read_registration", "read_claim"):
        assert "self._from_board()" in method(reader, name)


def test_only_collect_moves_value_and_payable_calls_never_revert(board):
    assert board.count("emit_transfer(") == 1
    assert "emit_transfer(" in method(board, "collect")
    assert board.count("@gl.public.write.payable") == 2
    for name in ("post", "recheck"):
        body = method(board, name)
        assert "raise" not in body and "self._refuse(" in body, name


def test_no_credit_names_the_auditor(board):
    """The Board credits only through ``_pay`` and ``_refuse``; neither ever
    takes the auditor's address."""
    for name in ("note_registration", "register"):
        assert "_pay(" not in method(board, name)
    assert '"signer"' not in method(board, "_pay")


def test_a_retry_takes_only_an_id_and_reads_everything_else_from_the_board(reader):
    for name, args in (("retry_registration", "(self, auditor_id: int)"), ("retry_claim", "(self, claim_id: int)")):
        body = method(reader, name)
        assert body.startswith("    def %s%s" % (name, args)), name
        assert "self._board().get_" in body and "_from_board" not in body
    assert "self._from_board()" in method(reader, "read_registration") and "self._from_board()" in method(reader, "read_claim")
    # Only the private methods read a page; the public ones only gather the inputs.
    for name in ("read_registration", "read_claim", "retry_registration", "retry_claim"):
        assert "run_nondet" not in method(reader, name), name
