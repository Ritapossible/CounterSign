"""CounterSign Board: holds the stakes and the records, never reads a page.

Built by ``deploy/build_contract.py`` into ``contracts/build/countersign_board.py``
(and ``.min.py``, the bytes deployed). Do not edit the build.

It never reads the Reader. It asks the Reader to read a page by a message
(``read_registration``, ``read_claim``) carrying everything the read needs,
and the Reader reports back by messages (``note_registration``,
``note_claim``) that only the Reader may send. Every payout is the Board's
own arithmetic on its own records, so a Reader that never reports locks
nothing: an open read expires, and a project can always withdraw.

**Money.** A payable call never reverts once value has arrived: a refused
posting or re-check is recorded and its value credited straight back
(``_refuse``). Outcomes *credit* what each address is owed; only ``collect``
sends GEN. No credit ever goes to an auditor (docs/ARCHITECTURE.md section 6).
"""


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
        """Anyone closes a read that got no report by its deadline. A posting
        is refused and its stake returned; a re-check's fee is returned and
        the claim's misses are unchanged."""
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
