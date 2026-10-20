"""Direct (in-memory) suite: no chain, no network, no model."""

import os
import sys

import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sys.path.insert(0, os.path.join(ROOT, "contracts"))
sys.path.insert(0, os.path.join(ROOT, "deploy"))
sys.path.insert(0, os.path.dirname(__file__))

import genvm_stub  # noqa: E402

GEN = 10**18
STAKE = GEN // 10
FEE = GEN // 100
REWARD = GEN // 50
MISS_GAP = 300
WINDOW = 600

AUDITOR = "0x00000000000000000000000000000000000000a1"
PROJECT = "0x00000000000000000000000000000000000000b1"
KEEPER = "0x00000000000000000000000000000000000000c1"
OTHER = "0x00000000000000000000000000000000000000d1"
DEPLOYER = "0x00000000000000000000000000000000000000e1"
BOARD = "0x000000000000000000000000000000000000b0a2"
READER = "0x000000000000000000000000000000000000ead2"

PAGE = "https://northlight.example/audits"

ROWS = [
    ("Acme Lending", "lending contracts v2", "March 2026"),
    ("Borealis Swap", "router and pools v1", "January 2026"),
    ("Cobalt Vaults", "vault strategies v3", "November 2025"),
]

# The confirming row for Acme, as a project copies it from the page.
ACME = "Acme Lending lending contracts v2 March 2026 Northlight audit report"
SUBJECT = "Acme Lending"
SCOPE = ["lending contracts v2", "March 2026"]


def row_html(client, scope, date, extra=""):
    return "<tr><td>%s</td><td>%s</td><td>%s</td><td><a href=\"/r\">Northlight audit report</a>%s</td></tr>" % (
        client, scope, date, extra)


def audit_page(rows=ROWS, *, before="", after="", extra=None, hidden_row=None, intro=True):
    """A fictional auditor's server-rendered audit list. ``extra`` adds text to
    one client's row; ``hidden_row`` wraps that client's row in hidden markup."""
    extra = extra or {}
    body = []
    for client, scope, date in rows:
        tr = row_html(client, scope, date, extra.get(client, ""))
        if client == hidden_row:
            tr = '<tr style="display:none">' + tr[4:]
        body.append(tr)
    text = (
        "<html><head><title>Northlight Security</title><style>.x{color:red}</style></head><body>"
        + ("<h1>Northlight Security: published audits</h1><p>Every engagement Northlight Security has "
           "completed and published is listed below, with its scope and the month the report was "
           "delivered. If a project shows a Northlight badge for work that is not listed here, "
           "please contact us.</p>" if intro else "")
        + before
        + "<table><tr><th>Client</th><th>Scope</th><th>Date</th><th>Report</th></tr>"
        + "".join(body)
        + "</table>"
        + after
        + "<footer>Northlight Security</footer></body></html>"
    )
    return text.encode("utf-8")


def jury(prompt):
    """A jury that reads only the PAGE block and applies plain rules; it obeys
    nothing written inside the blocks."""
    page = prompt.split("=== PAGE ===\n", 1)[1].split("\n=== END PAGE ===", 1)[0].lower()
    if any(w in page for w in ("withdrawn", "revoked", "retracted")):
        return {"label": "denies"}
    if "v1 only" in page or "not v2" in page:
        return {"label": "points_elsewhere"}
    if "garbled" in page:
        return {"label": "maybe"}
    return {"label": "confirms"}


class Net:
    """One simulated network with a bound Reader and Board."""

    def __init__(self, build="readable"):
        self.rt = genvm_stub.Runtime()
        self.rt.model = jury
        suffix = ".py" if build == "readable" else ".min.py"
        out = os.path.join(ROOT, "contracts", "build")
        reader_ns = self.reader_ns = genvm_stub.load(os.path.join(out, "countersign_reader" + suffix), self.rt)
        self.reader = genvm_stub.deploy(self.rt, reader_ns, "CounterSignReader", READER, sender=DEPLOYER)
        board_ns = genvm_stub.load(os.path.join(out, "countersign_board" + suffix), self.rt)
        self.board = genvm_stub.deploy(self.rt, board_ns, "CounterSignBoard", BOARD, READER, MISS_GAP, WINDOW, sender=DEPLOYER)
        self.rt.call(READER, "bind", BOARD, sender=DEPLOYER)
        self.rt.web[PAGE] = audit_page()

    def call(self, method, *args, sender, value=0, to=BOARD):
        return self.rt.call(to, method, *args, sender=sender, value=value)

    def register(self, url=PAGE, sample=ACME, name="Northlight Security", sender=AUDITOR):
        return self.call("register", name, url, sample, sender=sender)

    def post(self, auditor_id=0, subject=SUBJECT, scope=None, passage=ACME, value=STAKE, sender=PROJECT):
        import json
        return self.call("post", auditor_id, subject, json.dumps(SCOPE if scope is None else scope), passage,
                         sender=sender, value=value)

    def recheck(self, claim_id=0, sender=KEEPER, value=FEE):
        return self.call("recheck", claim_id, sender=sender, value=value)

    def claim(self, claim_id=0):
        import json
        return json.loads(self.board.get_claim(claim_id))

    def auditor(self, auditor_id=0):
        import json
        return json.loads(self.board.get_auditor(auditor_id))

    def owed(self, who):
        return self.board.owed_to(who)

    def status(self):
        import json
        return json.loads(self.board.status())

    def books_balance(self):
        """What the Board received equals what it holds plus what it credited,
        and its balance covers what it holds and owes."""
        s = self.status()
        paid = sum(v for (src, _to, v) in self.rt.transfers if src == BOARD)
        assert s["received"] == s["held"] + s["owed"] + paid, s
        assert s["balance"] == s["held"] + s["owed"], s
        return s

    def live(self):
        """Register Northlight and post Acme's claim, live."""
        self.register()
        cid = self.post()
        assert self.claim(cid)["state"] == "live"
        return cid


@pytest.fixture(scope="session", autouse=True)
def built():
    import subprocess
    subprocess.run([sys.executable, os.path.join(ROOT, "deploy", "build_contract.py")], check=True, capture_output=True)


@pytest.fixture(params=["readable", "deployed"])
def net(request, built):
    return Net(request.param)
