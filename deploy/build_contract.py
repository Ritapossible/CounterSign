#!/usr/bin/env python3
"""Assemble the deployable Intelligent Contract.

A GenVM contract is a single file, but the rules must be testable without a
chain and the prompt must be testable as plain string building, so they are
authored separately and inlined here. Outputs, never edited by hand:

  contracts/build/<name>.py      readable, tested
  contracts/build/<name>.min.py  deployed: docstrings and comments stripped,
                                 unreachable definitions dropped, names shortened

Bradbury caps a transaction at 2^24 gas and a deploy costs about 0.96M gas plus
782 per byte of code and arguments, so the deployed file must stay under about
19 KB; tests/direct/test_built.py holds it to that.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "contracts")
OUT_DIR = os.path.join(SRC, "build")

# Pinned by skills.genlayer.com (genlayer-dev / write-contract). All GenLayer
# networks reject py-genlayer:test, :latest and unversioned aliases, so this is
# never floated.
RUNNER = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"

# The runner comment starts with the GenVM version it was written for.
# Measured 21 October 2026: Studio Next refuses the runner without it
# ("invalid_contract runner malformed") and accepts "# v0.2.0"; Studio, which
# defaulted a missing version to v0.1.0, accepts it too.
RUNNER_VERSION = "v0.2.0"

BUILDS = {
    "countersign_board": (["countersign_text.py", "countersign_core.py", "board_shell.py"], "CounterSignBoard"),
    "countersign_reader": (["countersign_text.py", "countersign_core.py", "countersign_prompts.py", "reader_shell.py"], "CounterSignReader"),
}

# The runner header must be followed IMMEDIATELY by code. Any comment line
# between it and the first statement makes the deploy fail with an empty-stderr
# contract_error on every validator - measured on Studio in RedLine. The
# "generated file" banner therefore sits *after* the imports, not before them.
PREAMBLE = '''# %s
# { "Depends": "%s" }
from genlayer import *

import datetime
import json

# ---------------------------------------------------------------------------
# GENERATED FILE - do not edit.
# Built by deploy/build_contract.py from contracts/countersign_text.py (page
# text), contracts/countersign_core.py (the rules) and, for the Board,
# board_shell.py; for the Reader, countersign_prompts.py and reader_shell.py.
# ---------------------------------------------------------------------------
''' % (RUNNER_VERSION, RUNNER)

# Imports the parts declare for themselves; the preamble already provides them.
DROP_IMPORT = re.compile(
    r"^(import json|import hashlib|import datetime|from countersign_(core|text|prompts) import .*)\s*$"
)


def strip_module_docstring(text):
    """Remove a leading triple-quoted docstring, keeping everything after."""
    stripped = text.lstrip()
    for quote in ('"""', "'''"):
        if stripped.startswith(quote):
            end = stripped.find(quote, len(quote))
            if end == -1:
                raise SystemExit("unterminated module docstring")
            return stripped[end + len(quote) :].lstrip("\n")
    return text


def assemble(parts):
    chunks = [PREAMBLE]
    for name in parts:
        path = os.path.join(SRC, name)
        with open(path) as handle:
            body = strip_module_docstring(handle.read())
        kept = [line for line in body.splitlines() if not DROP_IMPORT.match(line)]
        chunks.append("\n# --- %s %s\n" % (name, "-" * (66 - len(name))))
        chunks.append("\n".join(kept).strip("\n") + "\n")
    return "\n".join(chunks)


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from minify_contract import minify

    os.makedirs(OUT_DIR, exist_ok=True)
    for name, (parts, root) in BUILDS.items():
        built = assemble(parts)
        out_path = os.path.join(OUT_DIR, name + ".py")
        compile(built, out_path, "exec")  # syntax gate before anything touches a network
        with open(out_path, "w") as handle:
            handle.write(built)
        small, removed = minify(built, root=root)
        min_path = os.path.join(OUT_DIR, name + ".min.py")
        compile(small, min_path, "exec")
        with open(min_path, "w") as handle:
            handle.write(small)
        print(
            "%-16s %6d bytes readable -> %6d bytes deployed (%d unreachable definitions dropped)"
            % (name, len(built.encode("utf-8")), len(small.encode("utf-8")), len(removed))
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
