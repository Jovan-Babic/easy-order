"""Guides follow the client's modules (guide_for_modules): marked parts are dropped, chapters renumbered,
"odeljak N" references follow. Unit-style: no server needed."""
import itertools
import os
import pathlib
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402

DOCS = pathlib.Path(__file__).resolve().parents[1] / "public" / "guides"

SAMPLE = """## 1. Osnova
Tekst <!-- modul: focus -->samo fokus <!-- /modul -->kraj (odeljak 3).

---

<!-- modul: sef -->
## 2. SEF
SEF tekst.

---
<!-- /modul -->

## 3. Statusi
| a | b |
|---|---|
<!-- modul: warehouse -->
| U pripremi | magacin |
<!-- /modul -->
<!-- modul: !warehouse -->
| Nova | bez magacina |
<!-- /modul -->
| Otkazano | uvek |
<!-- modul: stock, expiry -->
Oba modula.
<!-- /modul -->
"""


def test_blocks_inline_negation_and_renumbering():
    out = server.guide_for_modules(SAMPLE, [])
    assert "SEF" not in out and "samo fokus" not in out and "<!--" not in out
    assert "## 2. Statusi" in out and "(odeljak 2)" in out  # chapter 3 became 2, the reference follows
    assert "| Nova | bez magacina |\n| Otkazano | uvek |" in out  # a table stays in one piece
    assert "U pripremi" not in out and "Oba modula" not in out
    assert "\n---\n\n---" not in out  # the removed chapter takes its separator along

    full = server.guide_for_modules(SAMPLE, ["focus", "sef", "warehouse", "stock", "expiry"])
    assert "## 2. SEF" in full and "## 3. Statusi" in full and "(odeljak 3)" in full and "samo fokus" in full
    assert "U pripremi" in full and "bez magacina" not in full and "Oba modula" in full
    assert "Oba modula" not in server.guide_for_modules(SAMPLE, ["stock"])  # both are needed


@pytest.mark.parametrize("name", ["komercijalista", "magacin", "admin"])
def test_every_module_combination_gives_a_clean_guide(name):
    """No marker is left over and no "odeljak N" points at a chapter the client does not see."""
    text = (DOCS / f"{name}.md").read_text(encoding="utf-8")
    modules = server.ALL_MODULES
    for size in range(len(modules) + 1):
        for combo in itertools.combinations(modules, size):
            out, dangling = server._guide_render(text, combo)
            assert "<!--" not in out, (name, combo)
            assert dangling == [], (name, combo, dangling)
            numbers = re.findall(r"^## (\d+)\. ", out, flags=re.M)
            assert numbers == [str(i) for i in range(1, len(numbers) + 1)], (name, combo)


def test_add_ons_appear_only_with_their_module():
    admin = (DOCS / "admin.md").read_text(encoding="utf-8")
    base = server.guide_for_modules(admin, server.DEFAULT_MODULES)
    assert "E-faktura preko SEF-a" not in base and "Obilasci radnji" not in base
    with_add_ons = server.guide_for_modules(admin, [*server.DEFAULT_MODULES, "sef", "visits"])
    assert "E-faktura preko SEF-a" in with_add_ons and "Obilasci radnji" in with_add_ons
    rep = (DOCS / "komercijalista.md").read_text(encoding="utf-8")
    assert "Obilazak radnji" not in server.guide_for_modules(rep, server.DEFAULT_MODULES)
    assert "Obilazak radnji" in server.guide_for_modules(rep, ["visits"])
