"""CounterSign Reader: the only contract that fetches a page or asks the jury.

Built by ``deploy/build_contract.py`` into ``contracts/build/countersign_reader.py``
(and ``.min.py``, the bytes deployed). Do not edit the build.

It holds no GEN and decides nobody's pay. It reads only what its Board asks
for, with the arguments the Board sends: anyone else calling it is refused,
so nobody can have it read a page of their choosing and report the result.
It reports to the Board by messages sent **on finality**, so an appealed
read reaches the Board once, with its final outcome.

Each read, every validator fetches the page itself (a plain fetch, never
rendered) and computes the outcome:

- registration: the page is readable and the sample row is on it;
- a claim: ``read_page`` decides confirmed or silent by code. Only when the
  passage is there but its surroundings call for it (changed since the last
  confirmation, or a withdrawal phrase at posting) is the jury asked, and
  only ``confirms`` confirms.

Validators accept the leader's result only if they reach the same outcome
and the same surroundings fingerprint. A round that does not agree reports
nothing; the Board expires the read as silent.

Hard rules (see docs/ARCHITECTURE.md):
- The fetch is written inline in both closures.
- Every value a closure captures is a plain Python value.
"""


class CounterSignReader(gl.Contract):
    release: str
    owner: str
    board: str
    last: TreeMap[str, str]
    reads: u256

    def __init__(self):
        self.release = "countersign-reader/1"
        self.owner = str(gl.message.sender_address).lower()
        self.board = ""

    @gl.public.write
    def bind(self, board: str) -> None:
        """Set the one Board this Reader serves. Once, by its deployer."""
        if str(gl.message.sender_address).lower() != self.owner or self.board:
            raise Exception("[EXPECTED] the Reader is bound once, by its deployer")
        self.board = normalize_address(board, "board")

    def _from_board(self) -> None:
        if not self.board or str(gl.message.sender_address).lower() != self.board:
            raise Exception("[EXPECTED] only the Board asks for reads")

    @gl.public.write
    def read_registration(self, auditor_id: int, url: str, sample: str) -> None:
        self._from_board()
        uri = str(url)
        row = str(sample)

        def leader() -> str:
            _ok = False
            try:
                # INLINE fetch - do not factor this into a helper.
                _resp = gl.nondet.web.get(uri)
                _ok = registration_ok(int(_resp.status), _resp.body or b"", row)
            except Exception:
                _ok = False
            return json.dumps({"ok": _ok})

        def validator(leader_result) -> bool:
            _ok = False
            try:
                # INLINE fetch again - the duplication is deliberate.
                _resp = gl.nondet.web.get(uri)
                _ok = registration_ok(int(_resp.status), _resp.body or b"", row)
            except Exception:
                _ok = False
            return as_dict(leader_result).get("ok") is _ok

        ok = as_dict(gl.vm.run_nondet(leader, validator, compare_user_errors=True)).get("ok") is True
        self.last["a:%d" % int(auditor_id)] = json.dumps({"ok": ok})
        self.reads = u256(int(self.reads) + 1)
        gl.get_contract_at(Address(self.board)).emit(on="finalized").note_registration(int(auditor_id), ok)

    @gl.public.write
    def read_claim(self, claim_id: int, seq: int, posting: bool, url: str, auditor: str, subject: str,
                   scope_json: str, passage: str, stored_print: str) -> None:
        self._from_board()
        uri = str(url)
        at_posting = bool(posting)
        name = str(auditor)
        subj = str(subject)
        scope = [str(s) for s in json.loads(str(scope_json))]
        text = str(passage)
        stored = str(stored_print)

        def leader() -> str:
            _r = {"kind": SILENT, "print": "", "around": []}
            try:
                # INLINE fetch - do not factor this into a helper.
                _resp = gl.nondet.web.get(uri)
                _r = read_page(int(_resp.status), _resp.body or b"", text, posting=at_posting, stored_print=stored)
            except Exception:
                _r = {"kind": SILENT, "print": "", "around": []}
            _kind = _r["kind"]
            if _kind == ASK_JURY:
                _q = build_prompt(auditor=name, subject=subj, scope=scope, passage=text, around=_r["around"])
                _kind = label_to_kind(read_label(gl.nondet.exec_prompt(_q, response_format="json")))
            return json.dumps({"kind": _kind, "print": _r["print"]})

        def validator(leader_result) -> bool:
            _r = {"kind": SILENT, "print": "", "around": []}
            try:
                # INLINE fetch again - the duplication is deliberate.
                _resp = gl.nondet.web.get(uri)
                _r = read_page(int(_resp.status), _resp.body or b"", text, posting=at_posting, stored_print=stored)
            except Exception:
                _r = {"kind": SILENT, "print": "", "around": []}
            _theirs = as_dict(leader_result)
            if str(_theirs.get("print", "")) != _r["print"]:
                return False
            _kind = _r["kind"]
            if _kind == ASK_JURY:
                _q = build_prompt(auditor=name, subject=subj, scope=scope, passage=text, around=_r["around"])
                _kind = label_to_kind(read_label(gl.nondet.exec_prompt(_q, response_format="json")))
            return str(_theirs.get("kind", "")) == _kind

        decoded = as_dict(gl.vm.run_nondet(leader, validator, compare_user_errors=True))
        kind = str(decoded.get("kind", ""))
        if kind not in REPORTS:
            kind = SILENT
        fp = str(decoded.get("print", ""))[:32]
        self.last["c:%d" % int(claim_id)] = json.dumps({"seq": int(seq), "kind": kind, "print": fp})
        self.reads = u256(int(self.reads) + 1)
        gl.get_contract_at(Address(self.board)).emit(on="finalized").note_claim(int(claim_id), int(seq), kind, fp)

    @gl.public.view
    def last_read(self, key: str) -> str:
        """The last outcome this Reader reached: ``a:<auditor id>`` or ``c:<claim id>``."""
        return self.last.get(str(key), "{}")

    @gl.public.view
    def status(self) -> str:
        return json.dumps({"release": self.release, "board": self.board, "reads": int(self.reads)})
