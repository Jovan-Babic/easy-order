"""A tiny stand-in for the SEF public API, for tests (no real key or network needed).
Behaviour follows the official documentation (31.07.2026): ApiKey header, upload with a
unique requestId, status by invoiceId, cancel only for Draft/New, storno for Approved/Rejected/Sent.
Special API keys: `fake-bad` -> 401, `fake-down` -> 503 on upload."""
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = 8765
URL = f"http://127.0.0.1:{PORT}"


class State:
    lock = threading.Lock()
    next_id = 1000
    invoices = {}  # sales invoice id -> {"status", "request_id", "xml"}
    by_request = {}  # requestId -> sales invoice id
    uploads = []  # every accepted upload (including validations), newest last
    calls = []  # (method, path)


def reset():
    with State.lock:
        State.next_id = 1000
        State.invoices.clear()
        State.by_request.clear()
        State.uploads.clear()
        State.calls.clear()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the test output quiet
        pass

    def _send(self, status, payload):
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def _handle(self, method):
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path.removeprefix("/api/publicApi/")
        body = self._body()
        key = self.headers.get("ApiKey", "")
        with State.lock:
            State.calls.append((method, path))
        if not key.startswith("fake-") or key == "fake-bad":
            return self._send(401, {"Message": "Invalid API key"})
        if method == "GET" and path == "getEfakturaVersion":
            return self._send(200, {"Version": "3.7"})
        if method == "POST" and path == "sales-invoice/ubl/upload":
            return self._upload(key, query, body)
        if method == "GET" and path == "sales-invoice":
            invoice = State.invoices.get(int(query.get("invoiceId", 0)))
            if not invoice:
                return self._send(404, {"Message": "Invoice not found"})
            return self._send(200, {"Status": invoice["status"], "InvoiceId": int(query["invoiceId"]), "Comment": None})
        if method == "POST" and path in ("sales-invoice/cancel", "sales-invoice/storno"):
            data = json.loads(body or b"{}")
            invoice = State.invoices.get(data.get("invoiceId"))
            if not invoice:
                return self._send(404, {"Message": "Invoice not found"})
            if path.endswith("cancel"):
                if invoice["status"] not in ("Draft", "New"):
                    return self._send(400, {"Message": "Invoice cannot be cancelled in this status"})
                invoice["status"] = "Cancelled"
            else:
                if invoice["status"] not in ("Approved", "Rejected", "Sent"):
                    return self._send(400, {"Message": "Invoice cannot be stornoed in this status"})
                invoice["status"] = "Storno"
            return self._send(200, {"ok": True})
        return self._send(404, {"Message": f"Unknown route {method} {path}"})

    def _upload(self, key, query, body):
        if key == "fake-down":
            return self._send(503, {"Message": "Service unavailable"})
        if not query.get("requestId"):
            return self._send(400, {"Message": "requestId is required"})
        match = re.search(rb"\r\n\r\n(.*)\r\n--[0-9a-f]+--\r\n?$", body, re.S)
        xml = (match.group(1) if match else b"").decode("utf-8", "replace")
        if "ActualDeliveryDate" not in xml:
            return self._send(400, {"Message": "InvoiceDeliveryDateMissing", "ErrorCode": "InvoiceDeliveryDateMissing"})
        if "REJECTME" in xml:
            return self._send(400, {"Message": "Test rejection", "ErrorCode": "TestRejection"})
        with State.lock:
            State.uploads.append({"request_id": query["requestId"], "validate_only": query.get("executeValidation") == "true", "xml": xml})
            if query.get("executeValidation") == "true":
                return self._send(200, {})
            if query["requestId"] in State.by_request:  # idempotent: the same requestId returns the same invoice
                invoice_id = State.by_request[query["requestId"]]
            else:
                State.next_id += 1
                invoice_id = State.next_id
                State.by_request[query["requestId"]] = invoice_id
                State.invoices[invoice_id] = {"status": "New", "request_id": query["requestId"], "xml": xml}
        return self._send(200, {"InvoiceId": invoice_id + 5000, "PurchaseInvoiceId": invoice_id + 5000, "SalesInvoiceId": invoice_id})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


_server = None


def start():
    global _server
    if _server is None:
        _server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        threading.Thread(target=_server.serve_forever, daemon=True).start()
    return _server
