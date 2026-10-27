"""Copies the user guides (docs/uputstva) into backend/public/guides, where the backend serves them to the
apps by role (GET /api/guide). Run after changing a guide or its screenshots; a backend test fails when the
two copies differ."""
import pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "docs" / "uputstva"
DST = ROOT / "backend" / "public" / "guides"
GUIDES = ["komercijalista", "magacin", "admin"]

if DST.exists():
    shutil.rmtree(DST)
(DST / "slike").mkdir(parents=True)
for name in GUIDES:
    shutil.copy2(SRC / f"{name}.md", DST / f"{name}.md")
    shutil.copytree(SRC / "slike" / name, DST / "slike" / name)
print("published", ", ".join(GUIDES), "->", DST)
