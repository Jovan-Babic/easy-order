"""Box barcode (`package_barcode`): one scan = pieces_per_package pieces."""
import io
import uuid

import pytest
from openpyxl import Workbook

from helpers import API, activate_invited_user


def _code():
    return "8" + str(uuid.uuid4().int)[:12]


class S:
    created = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    yield
    for pid in S.created:
        api_client.delete(f"{API}/products/{pid}")


def _mk(api_client, **extra):
    r = api_client.post(f"{API}/products", json={"name": f"TEST_PK_{uuid.uuid4().hex[:6]}", **extra})
    assert r.status_code == 200, r.text
    S.created.append(r.json()["id"])
    return r.json()


def test_scan_reports_unit_and_quantity(api_client):
    piece, box = _code(), _code()
    p = _mk(api_client, barcode=piece, package_barcode=box, pieces_per_package=20)
    assert p["package_barcode"] == box
    as_piece = api_client.get(f"{API}/products/by-barcode/{piece}").json()
    assert as_piece["id"] == p["id"] and as_piece["scan_unit"] == "piece" and as_piece["scan_qty"] == 1
    as_box = api_client.get(f"{API}/products/by-barcode/{box}").json()
    assert as_box["id"] == p["id"] and as_box["scan_unit"] == "package" and as_box["scan_qty"] == 20


def test_box_barcode_needs_pieces_per_package(api_client):
    r = api_client.post(f"{API}/products", json={"name": "TEST_PK_nosize", "package_barcode": _code()})
    assert r.status_code == 400
    p = _mk(api_client, package_barcode=_code(), pieces_per_package=6)
    r = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "pieces_per_package": 0})
    assert r.status_code == 400  # would leave a box barcode without a size
    ok = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "pieces_per_package": 12})
    assert ok.status_code == 200 and ok.json()["package_barcode"] == p["package_barcode"]


def test_code_is_unique_across_piece_and_box(api_client):
    piece, box = _code(), _code()
    _mk(api_client, barcode=piece, package_barcode=box, pieces_per_package=10)
    assert api_client.post(f"{API}/products", json={"name": "TEST_PK_a", "barcode": box}).status_code == 409
    assert api_client.post(
        f"{API}/products", json={"name": "TEST_PK_b", "package_barcode": piece, "pieces_per_package": 5}
    ).status_code == 409
    assert api_client.post(
        f"{API}/products", json={"name": "TEST_PK_c", "package_barcode": box, "pieces_per_package": 5}
    ).status_code == 409
    same = api_client.post(
        f"{API}/products", json={"name": "TEST_PK_d", "barcode": "7" + piece[1:], "package_barcode": "7" + piece[1:], "pieces_per_package": 5}
    )
    assert same.status_code == 409  # piece and box code of one product must differ


def test_update_keeps_or_clears_box_barcode(api_client):
    box = _code()
    p = _mk(api_client, package_barcode=box, pieces_per_package=8)
    kept = api_client.put(f"{API}/products/{p['id']}", json={"name": "TEST_PK_renamed", "pieces_per_package": 8})
    assert kept.json()["package_barcode"] == box
    cleared = api_client.put(
        f"{API}/products/{p['id']}", json={"name": "TEST_PK_renamed", "pieces_per_package": 8, "package_barcode": ""}
    )
    assert cleared.json()["package_barcode"] is None
    assert api_client.get(f"{API}/products/by-barcode/{box}").status_code == 404


def test_warehouse_links_scanned_code_as_box(api_client):
    email = f"test-pk-wh-{uuid.uuid4().hex[:8]}@easyorder.dev"
    created = api_client.post(f"{API}/users", json={"email": email, "name": "TEST pk wh", "role": "warehouse"}).json()
    wh = activate_invited_user(email, created["temporary_password"])
    try:
        code = _code()
        p = _mk(api_client, pieces_per_package=24)
        no_size = _mk(api_client)
        r = wh.post(f"{API}/products/{no_size['id']}/barcode", json={"barcode": _code(), "kind": "package"})
        assert r.status_code == 400
        r = wh.post(f"{API}/products/{p['id']}/barcode", json={"barcode": code, "kind": "package"})
        assert r.status_code == 200 and r.json()["package_barcode"] == code
        assert wh.get(f"{API}/products/by-barcode/{code}").json()["scan_qty"] == 24
        r = wh.post(f"{API}/products/{p['id']}/barcode", json={"barcode": code})  # same code as piece barcode
        assert r.status_code == 409
        quick = wh.post(
            f"{API}/products/quick",
            json={"name": "TEST_PK_quick", "barcode": _code(), "barcode_kind": "package", "pieces_per_package": 12},
        )
        assert quick.status_code == 200, quick.text
        S.created.append(quick.json()["id"])
        assert quick.json()["package_barcode"] and quick.json()["barcode"] is None
        no_pieces = wh.post(
            f"{API}/products/quick", json={"name": "TEST_PK_quick2", "barcode": _code(), "barcode_kind": "package"}
        )
        assert no_pieces.status_code == 400
    finally:
        api_client.delete(f"{API}/users/{created['id']}")


def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["Naziv", "Barkod", "Barkod kutije", "Komada u pakovanju"])
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _upload(session, rows, dry_run):
    return session.post(
        f"{API}/products/import",
        params={"dry_run": str(dry_run).lower()},
        files={"file": ("uvoz.xlsx", _xlsx(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Content-Type": None},
    )


def test_import_box_barcode(api_client):
    piece, box, taken = _code(), _code(), _code()
    owner = _mk(api_client, barcode=taken)
    name = f"TEST_PK_imp_{uuid.uuid4().hex[:6]}"
    rows = [
        (name, piece, box, 20),
        (f"TEST_PK_nosize_{uuid.uuid4().hex[:6]}", None, _code(), None),  # no pieces/package -> error
        (f"TEST_PK_taken_{uuid.uuid4().hex[:6]}", None, taken, 5),  # box code = another product's piece code -> error
    ]
    dry = _upload(api_client, rows, True).json()
    assert dry["summary"] == {"create": 1, "update": 0, "error": 2}, dry
    assert api_client.get(f"{API}/products/by-barcode/{box}").status_code == 404
    _upload(api_client, rows, False)
    found = api_client.get(f"{API}/products/by-barcode/{box}").json()
    S.created.append(found["id"])
    assert found["scan_unit"] == "package" and found["scan_qty"] == 20 and found["barcode"] == piece
    assert owner["id"] != found["id"]
