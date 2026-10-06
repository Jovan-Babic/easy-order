from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
import asyncio
import hashlib
import json
import os
import re
import secrets
import smtplib
import logging
import mimetypes
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from enum import Enum
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from urllib.parse import quote
import cloudinary
import cloudinary.uploader

from calc import compute_order_totals, line_net, line_vat


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Production = explicit APP_ENV=production, or any public Vercel deployment
# (production and preview URLs are both reachable from the internet).
IS_PRODUCTION = (
    os.environ.get("APP_ENV", "").lower() == "production"
    or os.environ.get("VERCEL_ENV", "") in ("production", "preview")
)
DEV_JWT_SECRET = "dev-insecure-secret-change-me"
DEFAULT_SUPERADMIN_PASSWORD = "ChangeMe123!"

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET:
    if IS_PRODUCTION:
        # Fail fast: with the public dev fallback anyone could sign a valid
        # superadmin token, so refusing to start is the only safe option.
        raise RuntimeError("JWT_SECRET must be set in production")
    logger.warning("JWT_SECRET not set - using insecure dev secret (never do this in production)")
    JWT_SECRET = DEV_JWT_SECRET
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))
PASSWORD_RESET_EXPIRE_MINUTES = int(os.environ.get("PASSWORD_RESET_EXPIRE_MINUTES", "30"))
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@easyorder.dev")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", DEFAULT_SUPERADMIN_PASSWORD)
DEMO_ADMIN_EMAIL = os.environ.get("DEMO_ADMIN_EMAIL", "demo-admin@easyorder.dev")
DEMO_ADMIN_PASSWORD = os.environ.get("DEMO_ADMIN_PASSWORD", "ChangeMe123!")
# Demo client/admin/customers/products for local tests and CI. See seed_data().
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "noreply@easyorder.dev")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
RESET_WEB_URL = os.environ.get("RESET_WEB_URL", "http://localhost:3000/reset-password")
RESET_MOBILE_SCHEME = os.environ.get("RESET_MOBILE_SCHEME", "easy-order://reset-password")
PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE = os.environ.get("PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE", "false").lower() == "true"
APP_UPDATE_FILE = ROOT_DIR / "public" / "app" / "app-update.json"

# Public URLs put into invite emails. On Vercel the backend URL falls back to
# the project's production domain (a Vercel system env var).
PUBLIC_BACKEND_URL = (
    os.environ.get("PUBLIC_BACKEND_URL")
    or (f"https://{os.environ['VERCEL_PROJECT_PRODUCTION_URL']}" if os.environ.get("VERCEL_PROJECT_PRODUCTION_URL") else "")
    or "http://localhost:8000"
).rstrip("/")
ADMIN_WEB_URL = (os.environ.get("ADMIN_WEB_URL") or RESET_WEB_URL.rsplit("/reset-password", 1)[0]).rstrip("/")

# Brute-force protection (counted per email, stored in Mongo so it survives
# serverless cold starts and is shared by all instances).
LOGIN_MAX_FAILURES = int(os.environ.get("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "15"))
FORGOT_PASSWORD_MAX_PER_HOUR = int(os.environ.get("FORGOT_PASSWORD_MAX_PER_HOUR", "3"))

# Product images. Vercel rejects request bodies over 4.5 MB, so the limit
# stays under that; Cloudinary additionally shrinks what it stores.
IMAGE_MAX_BYTES = int(os.environ.get("IMAGE_MAX_BYTES", str(4 * 1024 * 1024)))
IMAGE_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
PRODUCT_IMAGE_FOLDER = "easy-order/products"
CLIENT_LOGO_FOLDER = "easy-order/clients"

mongo_client: AsyncIOMotorClient = None
db = None  # AsyncIOMotorDatabase

def configure_cloudinary() -> None:
    """Configure Cloudinary from either CLOUDINARY_URL or explicit CLOUDINARY_* vars."""
    cloudinary_url = os.environ.get("CLOUDINARY_URL")
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")

    if cloudinary_url:
        cloudinary.config(cloudinary_url=cloudinary_url, secure=True)
        return

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )


configure_cloudinary()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, db
    mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo_client[os.environ["DB_NAME"]]
    await db.customers.create_index("client_id")
    await db.products.create_index("client_id")
    await db.orders.create_index("client_id")
    await db.orders.create_index([("client_id", 1), ("status", 1), ("created_at", -1)])
    await db.orders.create_index([("client_id", 1), ("created_by_user_id", 1), ("created_at", -1)])
    try:
        await db.orders.create_index(
            [("client_id", 1), ("invoice_number", 1)],
            unique=True,
            partialFilterExpression={"invoice_number": {"$type": "string"}},
        )
    except Exception as exc:
        logger.error("Could not create unique index on orders.invoice_number: %s", exc)
    await _migrate_user_emails_to_lowercase()
    try:
        await db.users.create_index("email", unique=True)
    except Exception as exc:  # e.g. two legacy accounts that only differed by case
        logger.error("Could not create unique index on users.email: %s", exc)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at")
    await db.password_reset_tokens.create_index("user_id")
    await db.auth_attempts.create_index("key")
    # TTL cleanup only - the limits themselves are enforced by querying created_at.
    await db.auth_attempts.create_index("created_at", expireAfterSeconds=24 * 3600)
    await seed_data()
    logger.info("Backend started with MongoDB (%s)", os.environ["DB_NAME"])
    yield
    mongo_client.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Auth / role models ----------------
class Role(str, Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    OPERATOR = "operator"  # UI: "Komercijalista" - creates orders
    WAREHOUSE = "warehouse"  # UI: "Magacin" - processes orders


# Roles an admin may create/edit/delete (always within their own client).
ADMIN_MANAGEABLE_ROLES = {Role.OPERATOR, Role.WAREHOUSE}


class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""
    # Invoice settings (RBAC_PLAN.md 5a). Edited by the superadmin only.
    registration_number: Optional[str] = ""
    bank_account: Optional[str] = ""
    logo: Optional[str] = ""
    invoice_prefix: Optional[str] = ""
    invoice_numbering: str = "auto"  # "auto" | "manual"
    # Read-only: the number the next shipped order will get (auto numbering).
    invoice_next_seq: Optional[int] = None
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class ClientInput(BaseModel):
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""
    registration_number: Optional[str] = ""
    bank_account: Optional[str] = ""
    logo: Optional[str] = ""
    invoice_prefix: Optional[str] = ""
    invoice_numbering: str = "auto"
    # Only ever raises the counter (to continue a series from an old system).
    invoice_next_seq: Optional[int] = Field(default=None, ge=1)


class ClientCreateInput(ClientInput):
    # No password field: the admin gets a generated temporary password by
    # email (see _invite_user). An old client still sending admin_password
    # is ignored.
    admin_name: str
    admin_email: EmailStr


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    phone: Optional[str] = ""
    role: Role
    client_id: Optional[str] = None  # None only for SUPERADMIN
    active: bool = True
    # True until the user replaces their temporary (invite) password. While
    # set, only /auth/me, /auth/change-password and /auth/logout work.
    must_change_password: bool = False
    created_at: str = Field(default_factory=now_iso)


class InviteResult(BaseModel):
    invite_sent: bool
    # Only returned when the invite email could NOT be sent (SMTP missing or
    # failing), so the creator can hand the password over another way.
    temporary_password: Optional[str] = None


class UserInviteResponse(User, InviteResult):
    pass


class ClientCreateResponse(InviteResult):
    client: Client
    admin_user: User


class UserInput(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = ""
    role: Role
    client_id: Optional[str] = None


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


class UserUpdateInput(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    active: Optional[bool] = None
    role: Optional[Role] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordChannel(str, Enum):
    WEB = "web"
    MOBILE = "mobile"


class ForgotPasswordInput(BaseModel):
    email: EmailStr
    channel: ForgotPasswordChannel = ForgotPasswordChannel.WEB


class ResetPasswordInput(BaseModel):
    token: str
    new_password: str


class TestEmailInput(BaseModel):
    to_email: EmailStr
    subject: str = "Easy Order SMTP test"


class TestEmailResponse(BaseModel):
    ok: bool = True
    sent_to: EmailStr
    subject: str


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    message: str = "If this account exists, a password reset link has been sent"
    reset_token: Optional[str] = None


class GenericOkResponse(BaseModel):
    ok: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ---------------- Domain models ----------------
class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class CustomerInput(BaseModel):
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""
    client_id: Optional[str] = None  # only honored for SUPERADMIN writes


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    name: str
    image: Optional[str] = ""  # remote url or base64 data uri
    manufacturer: Optional[str] = ""
    price_no_vat: Optional[float] = 0
    vat_rate: Optional[float] = 20
    discount: Optional[float] = 0
    discounts: List[float] = Field(default_factory=lambda: [0])
    additional_discounts: List[int] = Field(default_factory=lambda: [0])
    pieces_per_package: Optional[int] = 0
    boxes_per_transport: Optional[int] = 0
    created_at: str = Field(default_factory=now_iso)


class ProductInput(BaseModel):
    name: str
    image: Optional[str] = ""
    manufacturer: Optional[str] = ""
    price_no_vat: Optional[float] = 0
    vat_rate: Optional[float] = 20
    # None = "not sent". On update this keeps the stored value; a default of 0
    # made "not sent" and "explicitly 0" indistinguishable.
    discount: Optional[float] = None
    discounts: Optional[List[float]] = None
    additional_discounts: Optional[List[int]] = None
    pieces_per_package: Optional[int] = 0
    boxes_per_transport: Optional[int] = 0
    client_id: Optional[str] = None  # only honored for SUPERADMIN writes


class OrderItem(BaseModel):
    product_id: str
    name: str
    image: Optional[str] = ""
    manufacturer: Optional[str] = ""
    price_no_vat: Optional[float] = 0
    vat_rate: Optional[float] = 20
    pieces_per_package: Optional[int] = 0
    boxes_per_transport: Optional[int] = 0
    discount: Optional[float] = 0
    additional_discount: Optional[float] = 0
    ordered_qty: int = 0
    # Set by the warehouse while packing; None = not checked yet.
    picked_qty: Optional[int] = None


class OrderStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    SHIPPED = "shipped"
    REJECTED = "rejected"
    CANCELED = "canceled"


class StatusChange(BaseModel):
    from_status: Optional[str] = None
    to_status: str
    changed_by_user_id: Optional[str] = None
    changed_by_name: Optional[str] = None
    changed_by_role: Optional[str] = None
    changed_at: str = Field(default_factory=now_iso)
    note: Optional[str] = None


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    customer_id: str
    customer_name: str
    items: List[OrderItem] = []
    item_count: Optional[int] = None
    client_name: Optional[str] = None
    status: OrderStatus = OrderStatus.NEW
    status_history: List[StatusChange] = []
    # Warehouse user who took the order (set on new -> in_progress).
    assigned_to_user_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    shipped_at: Optional[str] = None
    # Assigned once, when the order is first shipped; never changes or is freed.
    invoice_seq: Optional[int] = None
    invoice_number: Optional[str] = None
    # Who placed it. None on orders created before this field existed.
    created_by_user_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class OrderItemOut(OrderItem):
    line_net: float = 0


class OrderTotals(BaseModel):
    subtotal: float
    vat: float
    grand: float


class OrderOut(Order):
    """Response shape: stored order + totals computed by calc.py, so clients
    can display amounts without re-implementing the discount/VAT formula.
    `totals` follow picked_qty once shipped; `ordered_totals` always follow
    the ordered quantities."""
    items: List[OrderItemOut] = []
    totals: OrderTotals
    ordered_totals: OrderTotals


class OrderItemInput(BaseModel):
    """What the client may decide per line. Everything else (name, price, VAT,
    packaging...) is snapshotted server-side from the stored Product. Extra
    fields that older clients still send (price_no_vat, name, ...) are ignored."""
    product_id: str
    ordered_qty: int
    discount: Optional[float] = None  # must be one of product.discounts; None = product default
    additional_discount: Optional[float] = None  # must be one of product.additional_discounts


class OrderInput(BaseModel):
    customer_id: str
    customer_name: Optional[str] = None  # ignored - taken from the stored Customer
    items: List[OrderItemInput] = []
    client_id: Optional[str] = None  # only honored for SUPERADMIN writes


class ClientStats(BaseModel):
    client_id: str
    client_name: str
    order_count: int
    customer_count: int
    product_count: int
    total_net: float
    total_vat: float
    total_grand: float


class StatsResponse(BaseModel):
    scope: str  # "global" | "client"
    totals: ClientStats
    by_client: List[ClientStats]


class DashboardSummary(BaseModel):
    order_count: int
    customer_count: int
    product_count: int
    active_customer_count: int
    total_net: float
    total_vat: float
    total_grand: float
    average_order_value: float
    average_items_per_order: float


class RevenuePoint(BaseModel):
    period: str
    order_count: int
    total_net: float
    total_vat: float
    total_grand: float


class ProductSalesStats(BaseModel):
    product_id: str
    name: str
    manufacturer: Optional[str] = ""
    ordered_qty: int
    order_count: int
    total_net: float
    total_vat: float
    total_grand: float


class CustomerSalesStats(BaseModel):
    customer_id: str
    customer_name: str
    order_count: int
    total_grand: float


class RecentOrderStats(BaseModel):
    id: str
    customer_name: str
    item_count: int
    total_grand: float
    created_at: str


class DashboardStatsResponse(BaseModel):
    scope: str
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    summary: DashboardSummary
    revenue_by_period: List[RevenuePoint]
    top_products: List[ProductSalesStats]
    top_customers: List[CustomerSalesStats]
    recent_orders: List[RecentOrderStats]


# ---------------- Auth helpers ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "client_id": user.get("client_id"),
        # Token version: bumped on password change/reset and role change, which
        # invalidates every token issued before. Missing = 0 (older tokens).
        "tv": user.get("token_version", 0),
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


PASSWORD_RULES_MESSAGE = "Password must be at least 8 characters long and contain at least one letter and one digit"


def _password_is_strong_enough(password: str) -> bool:
    return (
        len(password) >= 8
        and any(c.isalpha() for c in password)
        and any(c.isdigit() for c in password)
    )


def ensure_strong_password(password: str) -> None:
    if not _password_is_strong_enough(password):
        raise HTTPException(status_code=400, detail=PASSWORD_RULES_MESSAGE)


def generate_temporary_password() -> str:
    # No look-alike characters (0/O, 1/l/I) since people may retype it from
    # the email by hand. Always contains a letter and a digit.
    letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "23456789"
    chars = [secrets.choice(letters) for _ in range(8)] + [secrets.choice(digits) for _ in range(4)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_reset_link(token: str, channel: ForgotPasswordChannel) -> str:
    # Always the https web page, also for requests from the mobile app: email
    # clients (Gmail etc.) don't make custom-scheme links like easy-order://
    # clickable and spam filters distrust them, so those emails got lost. The
    # web reset page needs no login and works for every role; the new password
    # applies to the app right away. `channel` is still stored on the token.
    encoded = quote(token, safe="")
    sep = "&" if "?" in RESET_WEB_URL else "?"
    return f"{RESET_WEB_URL}{sep}token={encoded}"


def _to_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _smtp_is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD and SMTP_FROM)


def _send_smtp_email_sync(to_email: str, subject: str, plain_text_body: str) -> None:
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(plain_text_body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)


def _build_reset_email_body(user_name: str, reset_link: str) -> str:
    return (
        f"Zdravo {user_name or ''},\n\n"
        "Primili smo zahtev za promenu lozinke za Easy Order.\n"
        f"Novu lozinku postavite preko ovog linka:\n{reset_link}\n\n"
        f"Link važi {PASSWORD_RESET_EXPIRE_MINUTES} minuta. Ako niste vi poslali zahtev, zanemarite ovaj email.\n\n"
        "---\n"
        f"Hi {user_name or 'there'},\n\n"
        "We received a request to reset your Easy Order password.\n"
        f"Use this link to set a new password:\n{reset_link}\n\n"
        f"This link expires in {PASSWORD_RESET_EXPIRE_MINUTES} minutes.\n"
        "If you did not request this, you can ignore this email."
    )


def _mobile_app_download_url() -> Optional[str]:
    """Absolute APK link from app-update.json, or None if no release is published."""
    try:
        data = json.loads(APP_UPDATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not data.get("enabled") or not data.get("download_url"):
        return None
    url = data["download_url"]
    return url if url.startswith("http") else f"{PUBLIC_BACKEND_URL}{url}"


def _build_invite_email_body(name: str, email: str, role: Role, temporary_password: str) -> str:
    lines = [
        f"Zdravo {name},",
        "",
        "Otvoren vam je nalog u aplikaciji Easy Order.",
        "",
        f"Email za prijavu: {email}",
        f"Privremena lozinka: {temporary_password}",
        "",
        "Pri prvoj prijavi bićete zamoljeni da postavite novu lozinku.",
        "",
    ]
    apk_url = _mobile_app_download_url()
    if apk_url:
        lines += [f"Android aplikacija (APK): {apk_url}", ""]
    if role in (Role.ADMIN, Role.SUPERADMIN, Role.WAREHOUSE):
        lines += [f"Administratorski portal: {ADMIN_WEB_URL}", ""]
    lines += [
        "---",
        f"Hi {name}, an Easy Order account was created for you.",
        f"Login: {email} / temporary password: {temporary_password}",
        "You will be asked to set a new password on first login.",
    ]
    return "\n".join(lines)


async def _send_invite_email(name: str, email: str, role: Role, temporary_password: str) -> bool:
    """Returns True if the email went out. Never raises - a failed email must
    not fail the account creation (the caller falls back to showing the
    password to the creator)."""
    if not _smtp_is_configured():
        logger.warning("SMTP not configured - invite email for %s not sent", email)
        return False
    body = _build_invite_email_body(name, email, role, temporary_password)
    try:
        await asyncio.to_thread(_send_smtp_email_sync, email, "Easy Order - pristup aplikaciji / account access", body)
        return True
    except Exception as exc:
        logger.exception("Failed to send invite email to %s: %s", email, exc)
        return False


async def _invite_user(user: User) -> InviteResult:
    """Stores a new user with a generated temporary password, emails it, and
    forces a password change on first login."""
    temporary_password = generate_temporary_password()
    raw = user.dict()
    raw["email"] = normalize_email(raw["email"])
    raw["must_change_password"] = True
    raw["token_version"] = 0
    raw["password_hash"] = hash_password(temporary_password)
    await db.users.insert_one({**raw, "_id": user.id})
    user.must_change_password = True
    sent = await _send_invite_email(user.name, raw["email"], user.role, temporary_password)
    return InviteResult(invite_sent=sent, temporary_password=None if sent else temporary_password)


# ---------------- Brute-force limits ----------------
async def _recent_attempts(key: str, window: timedelta) -> int:
    since = datetime.now(timezone.utc) - window
    return await db.auth_attempts.count_documents({"key": key, "created_at": {"$gte": since}})


async def _record_attempt(key: str) -> None:
    await db.auth_attempts.insert_one({"_id": str(uuid.uuid4()), "key": key, "created_at": datetime.now(timezone.utc)})


def _login_key(email: str) -> str:
    return f"login:{normalize_email(email)}"


def _build_test_email_body() -> str:
    return (
        "This is a test email from Easy Order.\n\n"
        "If you received this, Brevo SMTP is configured correctly and the backend can send mail."
    )


def _build_order_status_email(order: dict, status: str, note: Optional[str], actor_name: str) -> tuple[str, str]:
    """(subject, body) telling the sales rep their order was shipped/rejected."""
    shipped = status == OrderStatus.SHIPPED.value
    customer = order.get("customer_name", "")
    invoice = order.get("invoice_number")
    if shipped:
        subject = f"Easy Order - porudžbina poslata / order shipped: {customer}"
        sr = f"Porudžbina za kupca {customer} je poslata."
        en = f"The order for {customer} has been shipped."
    else:
        subject = f"Easy Order - porudžbina odbijena / order rejected: {customer}"
        sr = f"Porudžbina za kupca {customer} je odbijena."
        en = f"The order for {customer} was rejected."
    lines = [f"Zdravo {order.get('created_by_name') or ''},".replace("  ", " "), "", sr, en, ""]
    if shipped and invoice:
        lines.append(f"Broj fakture / Invoice number: {invoice}")
    if not shipped and note:
        lines.append(f"Razlog / Reason: {note}")
    lines.append(f"Obradio / Handled by: {actor_name}")
    return subject, "\n".join(lines)


async def _send_order_status_email(order: dict, status: str, note: Optional[str], actor: "User") -> None:
    """Best effort, never raises: a failed email must not undo the status
    change. Skipped when the actor placed the order themselves, when the
    creator is unknown (old orders) or has been deleted."""
    creator_id = order.get("created_by_user_id")
    if not creator_id or creator_id == actor.id:
        return
    if not _smtp_is_configured():
        logger.warning("SMTP not configured - order status email for order %s not sent", order.get("id"))
        return
    try:
        creator = await db.users.find_one({"id": creator_id}, {"_id": 0, "email": 1})
        if not creator or not creator.get("email"):
            return
        subject, body = _build_order_status_email(order, status, note, actor.name)
        await asyncio.to_thread(_send_smtp_email_sync, creator["email"], subject, body)
    except Exception as exc:
        logger.exception("Failed to send order status email for order %s: %s", order.get("id"), exc)


async def _send_reset_email(to_email: str, user_name: str, reset_link: str) -> None:
    if not _smtp_is_configured():
        logger.warning("SMTP not configured. Password reset link for %s: %s", to_email, reset_link)
        return

    body = _build_reset_email_body(user_name, reset_link)
    await asyncio.to_thread(_send_smtp_email_sync, to_email, "Easy Order - promena lozinke / password reset", body)


async def _send_test_email(to_email: str, subject: str) -> None:
    if not _smtp_is_configured():
        raise HTTPException(
            status_code=500,
            detail="SMTP is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.",
        )

    await asyncio.to_thread(_send_smtp_email_sync, to_email, subject, _build_test_email_body())


async def _create_password_reset_token_record(user: dict, channel: ForgotPasswordChannel) -> str:
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_reset_token(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    await db.password_reset_tokens.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "token_hash": token_hash,
            "user_id": user["id"],
            "client_id": user.get("client_id"),
            "channel": channel.value,
            "created_at": now_iso(),
            "expires_at": expires_at,
            "used_at": None,
        }
    )
    return raw_token


async def _get_valid_reset_record(token: str) -> Optional[dict]:
    record = await db.password_reset_tokens.find_one(
        {"token_hash": _hash_reset_token(token)},
        {"_id": 0},
    )
    if not record:
        return None
    if record.get("used_at"):
        return None
    expires_at = record.get("expires_at")
    if not expires_at or _to_aware_utc(expires_at) <= datetime.now(timezone.utc):
        return None
    return record


def cloudinary_available() -> bool:
    cfg = cloudinary.config()
    return bool(cfg.cloud_name and cfg.api_key and cfg.api_secret)


_CLOUDINARY_PRODUCT_URL = re.compile(
    rf"res\.cloudinary\.com/[^/]+/image/upload/(?:.+/)?(?:v\d+/)?((?:{re.escape(PRODUCT_IMAGE_FOLDER)}|{re.escape(CLIENT_LOGO_FOLDER)})/[^/.]+)\.\w+$"
)


def _product_image_public_id(url: Optional[str]) -> Optional[str]:
    """public_id of an image this app uploaded, or None for anything else
    (external URLs, data URIs) - those are never deleted."""
    if not url:
        return None
    match = _CLOUDINARY_PRODUCT_URL.search(url)
    return match.group(1) if match else None


async def _delete_product_image(url: Optional[str]) -> None:
    """Best effort: frees space on the Cloudinary plan when a product image is
    replaced or the product is deleted. Order snapshots keep the old URL, but
    no screen displays order item images, so nothing visible breaks."""
    public_id = _product_image_public_id(url)
    if not public_id or not cloudinary_available():
        return
    try:
        await asyncio.to_thread(cloudinary.uploader.destroy, public_id, resource_type="image")
    except Exception as exc:
        logger.warning("Could not delete Cloudinary image %s: %s", public_id, exc)


async def find_user_by_email(email: str) -> Optional[dict]:
    # Emails are stored lowercase (see _migrate_user_emails_to_lowercase), so
    # this is an exact, index-backed lookup.
    return await db.users.find_one({"email": normalize_email(email)}, {"_id": 0})


async def _migrate_user_emails_to_lowercase() -> None:
    """One-off for accounts created before emails were normalized. Idempotent."""
    async for doc in db.users.find({}, {"_id": 1, "email": 1}):
        email = doc.get("email") or ""
        if email != normalize_email(email):
            await db.users.update_one({"_id": doc["_id"]}, {"$set": {"email": normalize_email(email)}})


async def client_is_active(client_id: Optional[str]) -> bool:
    """Superadmins have no client. For everyone else, a soft-deleted
    (active=False) or missing client locks out all of its users."""
    if not client_id:
        return True
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "active": 1})
    return bool(client and client.get("active", True))


security = HTTPBearer(auto_error=False)


async def get_authenticated_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    """Valid token + active user/client. Does NOT enforce the first-login
    password change - only for the few routes that must work before it."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    raw = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not raw or not raw.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if payload.get("tv", 0) != raw.get("token_version", 0):
        # Password was changed/reset (or role changed) after this token was issued.
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    # Checked on every request (not only at login) so deactivating a client
    # also cuts off tokens that were issued before the deactivation.
    if not await client_is_active(raw.get("client_id")):
        raise HTTPException(status_code=401, detail="Client account is disabled")
    return User(**raw)


async def get_current_user(user: User = Depends(get_authenticated_user)) -> User:
    """Default dependency for every business route."""
    if user.must_change_password:
        # 403, not 401: the session is valid, clients should send the user to
        # the change-password screen instead of logging them out.
        raise HTTPException(status_code=403, detail="Password change required")
    return user


def require_roles(*roles: Role):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep


# Admin-level writes (catalog, customers, deleting orders, user management).
# Operators only read the catalog and create orders; warehouse only reads.
require_manager = require_roles(Role.SUPERADMIN, Role.ADMIN)
# Roles that may place orders (warehouse processes them, never creates).
require_order_creator = require_roles(Role.SUPERADMIN, Role.ADMIN, Role.OPERATOR)


# ---------------- Tenant scoping helpers ----------------
async def resolve_write_client_id(user: User, payload_client_id: Optional[str]) -> str:
    if user.role == Role.SUPERADMIN:
        if not payload_client_id:
            raise HTTPException(status_code=400, detail="client_id is required for superadmin writes")
        if not await db.clients.find_one({"id": payload_client_id}, {"_id": 0}):
            raise HTTPException(status_code=404, detail="Client not found")
        return payload_client_id
    return user.client_id


def normalize_additional_discounts(values: Optional[List[int]]) -> List[int]:
    if not values:
        return [0]

    allowed = set(range(0, 16))
    normalized = sorted({int(v) for v in values if int(v) in allowed})
    return normalized or [0]


def normalize_discounts(values: Optional[List[float]], default_discount: float) -> List[float]:
    base = values if values else [default_discount]
    normalized = sorted({max(0.0, min(100.0, float(v))) for v in base})
    default_normalized = max(0.0, min(100.0, float(default_discount)))
    if default_normalized not in normalized:
        normalized.append(default_normalized)
        normalized.sort()
    return normalized or [0.0]


def _scope_query(user: User) -> dict:
    if user.role == Role.SUPERADMIN:
        return {}
    return {"client_id": user.client_id}


async def get_scoped_or_404(collection_name: str, item_id: str, user: User) -> dict:
    item = await db[collection_name].find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role != Role.SUPERADMIN and item.get("client_id") != user.client_id:
        # 404, not 403 - avoids leaking cross-tenant existence via status code.
        raise HTTPException(status_code=404, detail="Not found")
    return item


# ---------------- Auth routes ----------------
api_router = APIRouter(prefix="/api")


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(inp: LoginInput):
    key = _login_key(inp.email)
    window = timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    # Counted per email (not IP): admin-web proxies logins server-to-server,
    # so every portal login would share the same IP.
    if await _recent_attempts(key, window) >= LOGIN_MAX_FAILURES:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {LOGIN_LOCKOUT_MINUTES} minutes.",
        )
    raw = await find_user_by_email(inp.email)
    if not raw or not raw.get("active", True) or not verify_password(inp.password, raw["password_hash"]):
        await _record_attempt(key)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.auth_attempts.delete_many({"key": key})
    # After the password check, so this can't be used to probe which emails exist.
    if not await client_is_active(raw.get("client_id")):
        raise HTTPException(status_code=403, detail="Client account is disabled")
    token = create_access_token(raw)
    return TokenResponse(access_token=token, user=User(**raw))


@api_router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(inp: ForgotPasswordInput):
    debug_token: Optional[str] = None
    key = f"forgot:{normalize_email(inp.email)}"
    if await _recent_attempts(key, timedelta(hours=1)) >= FORGOT_PASSWORD_MAX_PER_HOUR:
        # Same generic response as always - a 429 here would reveal nothing
        # useful to the user and would let an attacker probe the limiter.
        logger.warning("Forgot-password rate limit hit for %s", inp.email)
        return ForgotPasswordResponse()
    await _record_attempt(key)
    user = await find_user_by_email(inp.email)

    if user and user.get("active", True) and await client_is_active(user.get("client_id")):
        raw_token = await _create_password_reset_token_record(user, inp.channel)
        reset_link = _build_reset_link(raw_token, inp.channel)
        try:
            await _send_reset_email(user["email"], user.get("name", ""), reset_link)
        except Exception as exc:
            logger.exception("Failed to send reset email for %s: %s", user["email"], exc)
        if PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE:
            debug_token = raw_token

    return ForgotPasswordResponse(reset_token=debug_token)


@api_router.post("/auth/reset-password", response_model=GenericOkResponse)
async def reset_password(inp: ResetPasswordInput):
    ensure_strong_password(inp.new_password)

    record = await _get_valid_reset_record(inp.token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = await db.users.find_one({"id": record["user_id"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    await _set_password(user["id"], inp.new_password)
    # Invalidate all outstanding reset tokens for this user after a successful reset.
    await db.password_reset_tokens.update_many(
        {"user_id": user["id"], "used_at": None},
        {"$set": {"used_at": now_iso()}},
    )

    return GenericOkResponse()


@api_router.post("/auth/test-email", response_model=TestEmailResponse)
async def test_email(inp: TestEmailInput, current_user: User = Depends(require_roles(Role.SUPERADMIN, Role.ADMIN))):
    try:
        await _send_test_email(inp.to_email, inp.subject)
    except Exception as exc:
        # Details stay in the server log - SMTP errors can include host/user info.
        logger.exception("SMTP test email failed for %s: %s", inp.to_email, exc)
        raise HTTPException(status_code=500, detail="SMTP test failed, check server logs") from exc

    return TestEmailResponse(sent_to=inp.to_email, subject=inp.subject)


async def _set_password(user_id: str, new_password: str) -> dict:
    """Sets a password the user chose themselves: clears the first-login flag
    and bumps token_version so every older session is logged out."""
    updated = await db.users.find_one_and_update(
        {"id": user_id},
        {
            "$set": {"password_hash": hash_password(new_password), "must_change_password": False},
            "$inc": {"token_version": 1},
        },
        projection={"_id": 0},
        return_document=True,
    )
    return updated


@api_router.post("/auth/change-password", response_model=TokenResponse)
async def change_password(inp: ChangePasswordInput, current_user: User = Depends(get_authenticated_user)):
    raw = await db.users.find_one({"id": current_user.id}, {"_id": 0})
    if not verify_password(inp.current_password, raw["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if inp.new_password == inp.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    ensure_strong_password(inp.new_password)
    updated = await _set_password(current_user.id, inp.new_password)
    # The old token is now invalid (token_version bumped) - hand back a fresh
    # one so the user stays logged in on this device.
    return TokenResponse(access_token=create_access_token(updated), user=User(**updated))


@api_router.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_authenticated_user)):
    return current_user


@api_router.post("/auth/logout")
async def logout(current_user: User = Depends(get_authenticated_user)):
    return {"ok": True}


@api_router.post("/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    kind: str = Query("product", pattern="^(product|client_logo)$"),
    current_user: User = Depends(require_roles(Role.SUPERADMIN, Role.ADMIN)),
):
    if kind == "client_logo" and current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Forbidden")
    if (file.content_type or "").lower() not in IMAGE_ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, WEBP or HEIC images are allowed")
    data = await file.read(IMAGE_MAX_BYTES + 1)
    if len(data) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=413, detail=f"Image is too large (max {IMAGE_MAX_BYTES // (1024 * 1024)} MB)"
        )

    if not cloudinary_available():
        raise HTTPException(
            status_code=500,
            detail="Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.",
        )

    try:
        # Upload-time ("incoming") transformation: Cloudinary stores only the
        # shrunk version - max 1000x1000, WEBP, auto quality - typically well
        # under 200 KB, which keeps the free-plan storage from filling up.
        result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            data,
            folder=CLIENT_LOGO_FOLDER if kind == "client_logo" else PRODUCT_IMAGE_FOLDER,
            resource_type="image",
            format="webp",
            transformation=[{"width": 1000, "height": 1000, "crop": "limit"}, {"quality": "auto:good"}],
        )
    except Exception as exc:
        logger.exception("Cloudinary upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="Image upload failed") from exc

    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
    }


@api_router.delete("/upload-image")
async def delete_uploaded_image(
    url: str = Query(..., max_length=2048),
    current_user: User = Depends(require_manager),
):
    """Cleanup for an image uploaded on 'Save' whose product write then failed.
    Only our own folder is touched, and never an image a product still uses."""
    if not _product_image_public_id(url):
        raise HTTPException(status_code=400, detail="Not an image uploaded by this app")
    if await db.products.find_one({"image": url}, {"_id": 1}) or await db.clients.find_one({"logo": url}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Image is in use by a product or client")
    await _delete_product_image(url)
    return {"ok": True}


# ---------------- Clients (tenant companies) ----------------
_INVOICE_PREFIX_RE = re.compile(r"^[A-Z0-9]{1,10}$")


def _invoice_counter_id(client_id: str) -> str:
    return f"invoice:{client_id}"


async def _client_out(doc: dict) -> Client:
    counter = await db.counters.find_one({"_id": _invoice_counter_id(doc["id"])})
    return Client(**{**doc, "invoice_next_seq": (counter or {}).get("seq", 0) + 1})


def _validated_invoice_settings(inp: ClientInput) -> dict:
    prefix = (inp.invoice_prefix or "").strip().upper()
    if prefix and not _INVOICE_PREFIX_RE.match(prefix):
        raise HTTPException(status_code=400, detail="Invoice prefix must be 1-10 letters/digits")
    if inp.invoice_numbering not in ("auto", "manual"):
        raise HTTPException(status_code=400, detail="invoice_numbering must be 'auto' or 'manual'")
    return {"invoice_prefix": prefix}


async def _raise_invoice_counter(client_id: str, next_seq: Optional[int]) -> None:
    """Continue a series from an old system: the next number becomes
    `next_seq`. Only ever raises the counter - lowering could reuse a number."""
    if next_seq is None:
        return
    cid = _invoice_counter_id(client_id)
    current = ((await db.counters.find_one({"_id": cid})) or {}).get("seq", 0)
    if next_seq - 1 < current:
        raise HTTPException(status_code=400, detail=f"Next invoice number must be at least {current + 1}")
    await db.counters.update_one({"_id": cid}, {"$set": {"seq": next_seq - 1}}, upsert=True)


@api_router.get("/clients", response_model=List[Client])
async def list_clients(current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    docs = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(None)
    return [await _client_out(v) for v in docs]


@api_router.post("/clients", response_model=ClientCreateResponse)
async def create_client(inp: ClientCreateInput, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    if await find_user_by_email(inp.admin_email):
        raise HTTPException(status_code=400, detail="Email already in use")
    settings = _validated_invoice_settings(inp)

    client_obj = Client(**{**inp.dict(exclude={"admin_name", "admin_email", "invoice_next_seq"}), **settings})
    await db.clients.insert_one({**client_obj.dict(exclude={"invoice_next_seq"}), "_id": client_obj.id})
    await _raise_invoice_counter(client_obj.id, inp.invoice_next_seq)

    admin_obj = User(
        email=normalize_email(inp.admin_email), name=inp.admin_name, role=Role.ADMIN, client_id=client_obj.id
    )
    invite = await _invite_user(admin_obj)
    return ClientCreateResponse(client=await _client_out(client_obj.dict()), admin_user=admin_obj, **invite.dict())


@api_router.get("/clients/me", response_model=Client)
async def get_my_client(current_user: User = Depends(get_current_user)):
    """The caller's own tenant (invoice header data) - read-only for admin,
    warehouse and operator."""
    if not current_user.client_id:
        raise HTTPException(status_code=404, detail="No client")
    doc = await db.clients.find_one({"id": current_user.client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return await _client_out(doc)


@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return await _client_out(doc)


@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, inp: ClientInput, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    settings = _validated_invoice_settings(inp)
    await _raise_invoice_counter(client_id, inp.invoice_next_seq)
    updated = {**existing, **inp.dict(exclude={"invoice_next_seq"}), **settings}
    await db.clients.replace_one({"id": client_id}, {**updated, "_id": client_id})
    if existing.get("logo") != updated.get("logo"):
        await _delete_product_image(existing.get("logo"))
    return await _client_out(updated)


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    if not await db.clients.find_one({"id": client_id}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Client not found")
    # Soft delete: hard-deleting would orphan this client's users/products/
    # customers/orders and break historical stats.
    await db.clients.update_one({"id": client_id}, {"$set": {"active": False}})
    return {"ok": True}


@api_router.post("/clients/{client_id}/activate")
async def activate_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    result = await db.clients.update_one({"id": client_id}, {"$set": {"active": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True}


# ---------------- Users ----------------
@api_router.get("/users", response_model=List[User])
async def list_users(client_id: Optional[str] = None, current_user: User = Depends(require_manager)):
    if current_user.role == Role.SUPERADMIN:
        query = {"client_id": client_id} if client_id else {}
    else:
        query = {"client_id": current_user.client_id}
    docs = await db.users.find(query, {"_id": 0}).sort("name", 1).to_list(None)
    return [User(**v) for v in docs]


@api_router.post("/users", response_model=UserInviteResponse)
async def create_user(inp: UserInput, current_user: User = Depends(require_manager)):
    if await find_user_by_email(inp.email):
        raise HTTPException(status_code=400, detail="Email already in use")

    if current_user.role == Role.ADMIN:
        # Admins may only create operators/warehouse for their own client -
        # the payload client_id is ignored, never trusted.
        if inp.role not in ADMIN_MANAGEABLE_ROLES:
            raise HTTPException(status_code=403, detail="Admins cannot assign this role")
        role = inp.role
        client_id = current_user.client_id
    else:  # SUPERADMIN
        role = inp.role
        if role == Role.SUPERADMIN:
            client_id = None
        else:
            if not inp.client_id or not await db.clients.find_one({"id": inp.client_id}, {"_id": 0}):
                raise HTTPException(status_code=400, detail="Valid client_id is required for this role")
            client_id = inp.client_id

    obj = User(email=normalize_email(inp.email), name=inp.name, phone=inp.phone, role=role, client_id=client_id)
    invite = await _invite_user(obj)
    return UserInviteResponse(**obj.dict(), **invite.dict())


@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, inp: UserUpdateInput, current_user: User = Depends(require_manager)):
    target = await get_scoped_or_404("users", user_id, current_user)
    if current_user.role == Role.ADMIN:
        is_self = target["id"] == current_user.id
        if not is_self and target.get("role") not in ADMIN_MANAGEABLE_ROLES:
            # Otherwise one admin could reset another admin's password and
            # take over their account, or deactivate them.
            raise HTTPException(status_code=403, detail="Admins can only manage operators and warehouse users")
        # Compare against the stored values: the admin-web edit form always
        # sends `active` (and may send the current role), so only an actual
        # change is rejected - re-sending the same value is fine.
        role_changes = inp.role is not None and inp.role != target.get("role")
        active_changes = inp.active is not None and inp.active != target.get("active", True)
        if is_self and (role_changes or active_changes):
            raise HTTPException(status_code=403, detail="Cannot change your own role or status")
        if inp.role is not None and inp.role not in ADMIN_MANAGEABLE_ROLES:
            raise HTTPException(status_code=403, detail="Admins cannot assign this role")

    updated = {**target}
    if inp.name is not None:
        updated["name"] = inp.name
    if inp.phone is not None:
        updated["phone"] = inp.phone
    if inp.active is not None:
        updated["active"] = inp.active
    role_changed = inp.role is not None and inp.role != target.get("role")
    if inp.role is not None:
        updated["role"] = inp.role
    if inp.password:
        ensure_strong_password(inp.password)
        updated["password_hash"] = hash_password(inp.password)
        # Set by someone else (admin/superadmin) = temporary, the user must
        # replace it. Changing your own password here doesn't force that.
        updated["must_change_password"] = user_id != current_user.id
    if inp.password or role_changed:
        # Old tokens carry the old role/password - log them out everywhere.
        updated["token_version"] = target.get("token_version", 0) + 1
    await db.users.replace_one({"id": user_id}, {**updated, "_id": user_id})
    return User(**updated)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(require_manager)):
    target = await get_scoped_or_404("users", user_id, current_user)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if current_user.role == Role.ADMIN and target.get("role") not in ADMIN_MANAGEABLE_ROLES:
        raise HTTPException(status_code=403, detail="Admins can only manage operators and warehouse users")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------------- Customers ----------------
@api_router.get("/customers", response_model=List[Customer])
async def list_customers(current_user: User = Depends(get_current_user)):
    docs = await db.customers.find(_scope_query(current_user), {"_id": 0}).sort("name", 1).to_list(None)
    return [Customer(**v) for v in docs]


@api_router.post("/customers", response_model=Customer)
async def create_customer(inp: CustomerInput, current_user: User = Depends(require_manager)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    obj = Customer(**inp.dict(exclude={"client_id"}), client_id=client_id)
    await db.customers.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, inp: CustomerInput, current_user: User = Depends(require_manager)):
    existing = await get_scoped_or_404("customers", customer_id, current_user)
    updated = {**existing, **inp.dict(exclude={"client_id"})}
    await db.customers.replace_one({"id": customer_id}, {**updated, "_id": customer_id})
    return Customer(**updated)


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: User = Depends(require_manager)):
    await get_scoped_or_404("customers", customer_id, current_user)
    await db.customers.delete_one({"id": customer_id})
    return {"ok": True}


# ---------------- Products ----------------
@api_router.get("/products", response_model=List[Product])
async def list_products(current_user: User = Depends(get_current_user)):
    docs = await db.products.find(_scope_query(current_user), {"_id": 0}).sort("created_at", 1).to_list(None)
    return [Product(**v) for v in docs]


@api_router.post("/products", response_model=Product)
async def create_product(inp: ProductInput, current_user: User = Depends(require_manager)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    payload = inp.dict(exclude={"client_id"})
    payload["discount"] = max(0.0, min(100.0, float(payload.get("discount") or 0)))
    payload["discounts"] = normalize_discounts(inp.discounts, payload["discount"])
    payload["additional_discounts"] = normalize_additional_discounts(inp.additional_discounts)
    obj = Product(**payload, client_id=client_id)
    await db.products.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, inp: ProductInput, current_user: User = Depends(require_manager)):
    existing = await get_scoped_or_404("products", product_id, current_user)
    incoming = inp.dict(exclude={"client_id"})
    # `is None`, not `or`: an explicit 0 must reset the discount, only a
    # missing field keeps the stored one. Same for the two option lists.
    raw_discount = inp.discount if inp.discount is not None else existing.get("discount")
    discount_value = max(0.0, min(100.0, float(raw_discount or 0)))
    discounts = inp.discounts if inp.discounts is not None else existing.get("discounts")
    additional = (
        inp.additional_discounts if inp.additional_discounts is not None else existing.get("additional_discounts")
    )
    updated = {
        **existing,
        **incoming,
        "id": product_id,
        "discount": discount_value,
        "discounts": normalize_discounts(discounts, discount_value),
        "additional_discounts": normalize_additional_discounts(additional),
    }
    await db.products.replace_one({"id": product_id}, {**updated, "_id": product_id})
    if existing.get("image") != updated.get("image"):
        await _delete_product_image(existing.get("image"))
    return Product(**updated)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(require_manager)):
    existing = await get_scoped_or_404("products", product_id, current_user)
    await db.products.delete_one({"id": product_id})
    await _delete_product_image(existing.get("image"))
    return {"ok": True}


# ---------------- Orders ----------------
def _allowed_supplier_discount(product: dict, requested: Optional[float]) -> float:
    """Supplier discount = product default, or another value the admin
    whitelisted in product.discounts. Anything else is rejected."""
    default = float(product.get("discount") or 0)
    if requested is None:
        return default
    allowed = {float(v) for v in (product.get("discounts") or [])} | {default}
    if float(requested) not in allowed:
        raise HTTPException(status_code=400, detail=f"Discount {requested}% is not allowed for {product['name']}")
    return float(requested)


def _allowed_additional_discount(product: dict, requested: Optional[float]) -> float:
    """Additional discount must be one of product.additional_discounts
    (0 = none is always allowed)."""
    if not requested:
        return 0.0
    allowed = {float(v) for v in (product.get("additional_discounts") or [])}
    if float(requested) not in allowed:
        raise HTTPException(
            status_code=400, detail=f"Additional discount {requested}% is not allowed for {product['name']}"
        )
    return float(requested)


def _rounded_totals(totals: dict) -> OrderTotals:
    return OrderTotals(
        subtotal=round(totals["subtotal"], 2), vat=round(totals["vat"], 2), grand=round(totals["grand"], 2)
    )


def _order_out(doc: dict) -> OrderOut:
    shipped = doc.get("status") == OrderStatus.SHIPPED.value
    items = [{**item, "line_net": round(line_net(item, shipped), 2)} for item in doc.get("items", [])]
    return OrderOut(
        **{**doc, "items": items},
        totals=_rounded_totals(compute_order_totals(doc)),
        ordered_totals=_rounded_totals(compute_order_totals(doc, by_ordered=True)),
    )


def _order_scope_query(user: User) -> dict:
    """Tenant scope for orders, plus: an operator sees only their own."""
    query = _scope_query(user)
    if user.role == Role.OPERATOR:
        query = {**query, "created_by_user_id": user.id}
    return query


def _parse_date(value: str, name: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} must be YYYY-MM-DD")


@api_router.get("/orders", response_model=List[OrderOut])
async def list_orders(
    customer_id: Optional[str] = None,
    portal: bool = False,
    status: Optional[List[str]] = Query(None),
    created_by_user_id: Optional[str] = None,
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive"),
    limit: Optional[int] = Query(None, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    query = _order_scope_query(current_user)
    if customer_id:
        query = {**query, "customer_id": customer_id}
    if status:
        query = {**query, "status": {"$in": status}}
    # Ignored for operators: they are already limited to their own orders.
    if created_by_user_id and current_user.role != Role.OPERATOR:
        query = {**query, "created_by_user_id": created_by_user_id}
    date_range = {}
    if from_date:
        date_range["$gte"] = _parse_date(from_date, "from_date").isoformat()
    if to_date:
        date_range["$lt"] = (_parse_date(to_date, "to_date") + timedelta(days=1)).isoformat()
    if date_range:
        query = {**query, "created_at": date_range}
    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip)
    if limit:
        cursor = cursor.limit(limit)
    docs = await cursor.to_list(None)
    if portal and current_user.role == Role.SUPERADMIN:
        # One query for all client names instead of one per order.
        client_ids = list({d.get("client_id") for d in docs})
        clients = await db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
        names = {c["id"]: c.get("name") for c in clients}
        docs = [{**d, "client_name": names.get(d.get("client_id"))} for d in docs]
    return [_order_out(d) for d in docs]


@api_router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await get_scoped_or_404("orders", order_id, current_user)
    if current_user.role == Role.OPERATOR and order.get("created_by_user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")  # someone else's order
    return _order_out(order)


@api_router.post("/orders", response_model=OrderOut)
async def create_order(inp: OrderInput, current_user: User = Depends(require_order_creator)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    if not inp.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    # Customer and products are looked up inside this client only, so an
    # order can't reference another tenant's data.
    customer = await db.customers.find_one({"id": inp.customer_id, "client_id": client_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    product_ids = list({line.product_id for line in inp.items})
    product_docs = await db.products.find(
        {"id": {"$in": product_ids}, "client_id": client_id}, {"_id": 0}
    ).to_list(None)
    products = {p["id"]: p for p in product_docs}

    items: List[OrderItem] = []
    for line in inp.items:
        product = products.get(line.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"Product not found: {line.product_id}")
        if line.ordered_qty <= 0:
            raise HTTPException(status_code=400, detail=f"Quantity must be positive for {product['name']}")
        # Snapshot from the stored product - never from the payload - so a
        # client can't set its own price/VAT/discount.
        items.append(OrderItem(
            product_id=product["id"],
            name=product["name"],
            image=product.get("image", ""),
            manufacturer=product.get("manufacturer", ""),
            price_no_vat=product.get("price_no_vat", 0),
            vat_rate=product.get("vat_rate", 20),
            pieces_per_package=product.get("pieces_per_package", 0),
            boxes_per_transport=product.get("boxes_per_transport", 0),
            discount=_allowed_supplier_discount(product, line.discount),
            additional_discount=_allowed_additional_discount(product, line.additional_discount),
            ordered_qty=line.ordered_qty,
        ))

    obj = Order(
        client_id=client_id,
        customer_id=customer["id"],
        customer_name=customer["name"],
        items=items,
        created_by_user_id=current_user.id,
        created_by_name=current_user.name,
        status_history=[StatusChange(
            from_status=None,
            to_status=OrderStatus.NEW.value,
            changed_by_user_id=current_user.id,
            changed_by_name=current_user.name,
            changed_by_role=current_user.role.value,
        )],
    )
    doc = obj.dict()
    await db.orders.insert_one({**doc, "_id": obj.id})
    return _order_out(doc)


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, current_user: User = Depends(require_manager)):
    order = await get_scoped_or_404("orders", order_id, current_user)
    if _status_value(order) != OrderStatus.NEW.value:
        raise HTTPException(status_code=409, detail="Only new orders can be deleted - cancel the order instead")
    await db.orders.delete_one({"id": order_id})
    return {"ok": True}


# ---------------- Order status workflow (RBAC_PLAN.md section 4) ----------------
class StatusChangeInput(BaseModel):
    status: OrderStatus
    note: Optional[str] = None
    # Only for -> shipped on a client with manual invoice numbering.
    invoice_number: Optional[str] = Field(default=None, max_length=40)


class PickedItemInput(BaseModel):
    product_id: str
    picked_qty: Optional[int] = None  # None = un-check the line


class PickedItemsInput(BaseModel):
    items: List[PickedItemInput]


def _status_value(order: dict) -> str:
    s = order.get("status") or OrderStatus.NEW.value
    return s.value if isinstance(s, Enum) else s


# (from, to) -> roles allowed; admin/superadmin may override anything (with a note).
_WAREHOUSE_FLOW = {
    ("new", "in_progress"): {Role.WAREHOUSE},
    ("in_progress", "new"): {Role.WAREHOUSE},
    ("in_progress", "shipped"): {Role.WAREHOUSE},
    ("new", "rejected"): {Role.WAREHOUSE},
    ("in_progress", "rejected"): {Role.WAREHOUSE},
    ("new", "canceled"): {Role.OPERATOR},
}
_MANAGER_ROLES = {Role.SUPERADMIN, Role.ADMIN}
_NOTE_REQUIRED_TARGETS = {"rejected"}


def _history_entry(user: User, from_status: Optional[str], to_status: str, note: Optional[str]) -> dict:
    return StatusChange(
        from_status=from_status,
        to_status=to_status,
        changed_by_user_id=user.id,
        changed_by_name=user.name,
        changed_by_role=user.role.value,
        note=note,
    ).dict()


async def _get_order_for_processing(order_id: str, user: User) -> dict:
    """Order lookup that applies the operator's own-orders rule like get_order."""
    order = await get_scoped_or_404("orders", order_id, user)
    if user.role == Role.OPERATOR and order.get("created_by_user_id") != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return order


async def _assign_invoice_number(order: dict, manual_number: Optional[str]) -> Dict[str, Any]:
    """Invoice number for the first shipment (RBAC_PLAN.md section 5): from
    the per-client counter ("auto") or typed by the warehouse ("manual")."""
    client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0}) or {}
    if client.get("invoice_numbering", "auto") == "manual":
        number = (manual_number or "").strip()
        if not number:
            raise HTTPException(status_code=400, detail="Invoice number is required")
        if await db.orders.find_one({"client_id": order["client_id"], "invoice_number": number}, {"_id": 1}):
            raise HTTPException(status_code=409, detail="Invoice number is already used")
        return {"invoice_number": number}
    prefix = client.get("invoice_prefix") or ""
    if not prefix:
        raise HTTPException(status_code=400, detail="Set the invoice prefix for this client first")
    counter = await db.counters.find_one_and_update(
        {"_id": _invoice_counter_id(order["client_id"])},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"invoice_seq": counter["seq"], "invoice_number": f"{prefix}/{counter['seq']:04d}"}


@api_router.post("/orders/{order_id}/status", response_model=OrderOut)
async def change_order_status(
    order_id: str, inp: StatusChangeInput, current_user: User = Depends(get_current_user)
):
    order = await _get_order_for_processing(order_id, current_user)
    current = _status_value(order)
    target = inp.status.value
    note = (inp.note or "").strip() or None

    override = current_user.role in _MANAGER_ROLES
    if current == target:
        raise HTTPException(status_code=400, detail="Order already has that status")
    if override:
        # Anything -> anything, but only with a reason, except the normal flow.
        if (current, target) not in _WAREHOUSE_FLOW and not note:
            raise HTTPException(status_code=400, detail="A note is required to override the status flow")
    else:
        allowed = _WAREHOUSE_FLOW.get((current, target))
        if allowed is None:
            raise HTTPException(status_code=400, detail=f"Transition {current} -> {target} is not allowed")
        if current_user.role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
    if target in _NOTE_REQUIRED_TARGETS and not note:
        raise HTTPException(status_code=400, detail="A note is required")

    if target == OrderStatus.SHIPPED.value:
        items = order.get("items", [])
        if any(i.get("picked_qty") is None for i in items):
            raise HTTPException(status_code=400, detail="Check every item (picked_qty) before shipping")
        if not any((i.get("picked_qty") or 0) > 0 for i in items):
            raise HTTPException(status_code=400, detail="Nothing was picked - reject the order instead")

    update: Dict[str, Any] = {"status": target}
    if target == OrderStatus.SHIPPED.value and not order.get("invoice_number"):
        # An order keeps the number from its first shipment, even if an admin
        # later moves it back and ships it again.
        update.update(await _assign_invoice_number(order, inp.invoice_number))
    if target == OrderStatus.IN_PROGRESS.value:
        update["assigned_to_user_id"] = current_user.id
        update["assigned_to_name"] = current_user.name
    elif target == OrderStatus.NEW.value:
        update["assigned_to_user_id"] = None
        update["assigned_to_name"] = None
    if target == OrderStatus.SHIPPED.value:
        update["shipped_at"] = now_iso()

    # Conditional update: if someone else changed the status meanwhile, 409.
    try:
        result = await db.orders.update_one(
            {"id": order_id, "status": current},
            {"$set": update, "$push": {"status_history": _history_entry(current_user, current, target, note)}},
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Invoice number is already used")
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Order was changed in the meantime")
    updated_doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if target in (OrderStatus.SHIPPED.value, OrderStatus.REJECTED.value):
        await _send_order_status_email(updated_doc, target, note, current_user)
    return _order_out(updated_doc)


@api_router.patch("/orders/{order_id}/items", response_model=OrderOut)
async def update_picked_items(
    order_id: str,
    inp: PickedItemsInput,
    current_user: User = Depends(require_roles(Role.SUPERADMIN, Role.ADMIN, Role.WAREHOUSE)),
):
    order = await get_scoped_or_404("orders", order_id, current_user)
    current = _status_value(order)
    if current not in (OrderStatus.NEW.value, OrderStatus.IN_PROGRESS.value):
        raise HTTPException(status_code=409, detail="Only new or in-progress orders can be packed")

    items = order.get("items", [])
    by_id = {i["product_id"]: i for i in items}
    for line in inp.items:
        item = by_id.get(line.product_id)
        if item is None:
            raise HTTPException(status_code=400, detail=f"Product not in order: {line.product_id}")
        if line.picked_qty is not None and (line.picked_qty < 0 or line.picked_qty > item.get("ordered_qty", 0)):
            raise HTTPException(
                status_code=400, detail=f"picked_qty for {item['name']} must be between 0 and {item.get('ordered_qty', 0)}"
            )
        item["picked_qty"] = line.picked_qty

    update: Dict[str, Any] = {"items": items}
    push = None
    if current == OrderStatus.NEW.value:
        update.update(
            status=OrderStatus.IN_PROGRESS.value,
            assigned_to_user_id=current_user.id,
            assigned_to_name=current_user.name,
        )
        push = {"status_history": _history_entry(current_user, current, OrderStatus.IN_PROGRESS.value, None)}
    result = await db.orders.update_one(
        {"id": order_id, "status": current}, {"$set": update, **({"$push": push} if push else {})}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Order was changed in the meantime")
    return _order_out(await db.orders.find_one({"id": order_id}, {"_id": 0}))


@api_router.get("/")
async def root():
    return {"message": "Easy Order API"}


@api_router.get("/app/update")
async def app_update():
    if not APP_UPDATE_FILE.exists():
        return {"enabled": False}
    try:
        return json.loads(APP_UPDATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(status_code=503, detail="App update metadata is unavailable")


# ---------------- Statistics ----------------
async def _compute_client_stats(client_id: str) -> ClientStats:
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    client_name = client["name"] if client else "Unknown"
    orders = await db.orders.find({"client_id": client_id}, {"_id": 0}).to_list(None)
    customer_count = await db.customers.count_documents({"client_id": client_id})
    product_count = await db.products.count_documents({"client_id": client_id})

    total_net = 0.0
    total_vat = 0.0
    for o in orders:
        totals = compute_order_totals(o)
        total_net += totals["subtotal"]
        total_vat += totals["vat"]

    return ClientStats(
        client_id=client_id,
        client_name=client_name,
        order_count=len(orders),
        customer_count=customer_count,
        product_count=product_count,
        total_net=round(total_net, 2),
        total_vat=round(total_vat, 2),
        total_grand=round(total_net + total_vat, 2),
    )


@api_router.get("/stats/overview", response_model=StatsResponse)
async def stats_overview(current_user: User = Depends(require_roles(Role.SUPERADMIN, Role.ADMIN))):
    if current_user.role == Role.SUPERADMIN:
        client_docs = await db.clients.find({}, {"_id": 0, "id": 1}).to_list(None)
        by_client = [await _compute_client_stats(c["id"]) for c in client_docs]
        totals = ClientStats(
            client_id="",
            client_name="All Clients",
            order_count=sum(c.order_count for c in by_client),
            customer_count=sum(c.customer_count for c in by_client),
            product_count=sum(c.product_count for c in by_client),
            total_net=round(sum(c.total_net for c in by_client), 2),
            total_vat=round(sum(c.total_vat for c in by_client), 2),
            total_grand=round(sum(c.total_grand for c in by_client), 2),
        )
        return StatsResponse(scope="global", totals=totals, by_client=by_client)

    stats = await _compute_client_stats(current_user.client_id)
    return StatsResponse(scope="client", totals=stats, by_client=[stats])


def _parse_dashboard_date(value: Optional[str], field_name: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}; use YYYY-MM-DD")


@api_router.get("/stats/dashboard", response_model=DashboardStatsResponse)
async def stats_dashboard(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: User = Depends(require_roles(Role.SUPERADMIN, Role.ADMIN)),
):
    start = _parse_dashboard_date(from_date, "from_date")
    end = _parse_dashboard_date(to_date, "to_date")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="from_date must be before to_date")

    query = {} if current_user.role == Role.SUPERADMIN else {"client_id": current_user.client_id}
    # created_at is an ISO-8601 UTC string, so a string range works in Mongo
    # and avoids loading every order ever placed. The loop below re-checks
    # with real datetimes for any legacy format.
    created_range: Dict[str, str] = {}
    if start:
        created_range["$gte"] = start.isoformat()
    if end:
        created_range["$lt"] = (end + timedelta(days=1)).isoformat()
    order_query = {**query, "created_at": created_range} if created_range else query
    orders = await db.orders.find(order_query, {"_id": 0}).sort("created_at", -1).to_list(None)
    filtered_orders = []
    for order in orders:
        try:
            created_at = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if start and created_at < start:
            continue
        if end and created_at >= end + timedelta(days=1):
            continue
        filtered_orders.append(order)

    product_rows: Dict[str, Dict[str, Any]] = {}
    customer_rows: Dict[str, Dict[str, Any]] = {}
    revenue_rows: Dict[str, Dict[str, Any]] = {}
    total_net = 0.0
    total_vat = 0.0
    total_items = 0

    for order in filtered_orders:
        totals = compute_order_totals(order)
        total_net += totals["subtotal"]
        total_vat += totals["vat"]
        total_items += len(order.get("items", []))
        period = order["created_at"][:7]
        revenue = revenue_rows.setdefault(period, {"period": period, "order_count": 0, "total_net": 0.0, "total_vat": 0.0})
        revenue["order_count"] += 1
        revenue["total_net"] += totals["subtotal"]
        revenue["total_vat"] += totals["vat"]

        customer_id = order.get("customer_id", "")
        customer = customer_rows.setdefault(customer_id, {
            "customer_id": customer_id,
            "customer_name": order.get("customer_name", "Unknown"),
            "order_count": 0,
            "total_grand": 0.0,
        })
        customer["order_count"] += 1
        customer["total_grand"] += totals["grand"]

        for item in order.get("items", []):
            product_id = item.get("product_id", item.get("name", "unknown"))
            product = product_rows.setdefault(product_id, {
                "product_id": product_id,
                "name": item.get("name", "Unknown"),
                "manufacturer": item.get("manufacturer", ""),
                "ordered_qty": 0,
                "order_count": 0,
                "total_net": 0.0,
                "total_vat": 0.0,
            })
            product["ordered_qty"] += int(item.get("ordered_qty") or 0)
            product["order_count"] += 1
            product["total_net"] += line_net(item)
            product["total_vat"] += line_vat(item)

    customer_count = await db.customers.count_documents(query)
    summary = DashboardSummary(
        order_count=len(filtered_orders),
        customer_count=customer_count,
        product_count=await db.products.count_documents(query),
        active_customer_count=len(customer_rows),
        total_net=round(total_net, 2),
        total_vat=round(total_vat, 2),
        total_grand=round(total_net + total_vat, 2),
        average_order_value=round((total_net + total_vat) / len(filtered_orders), 2) if filtered_orders else 0,
        average_items_per_order=round(total_items / len(filtered_orders), 2) if filtered_orders else 0,
    )

    revenue_by_period = [
        RevenuePoint(**{**row, "total_net": round(row["total_net"], 2), "total_vat": round(row["total_vat"], 2), "total_grand": round(row["total_net"] + row["total_vat"], 2)})
        for row in sorted(revenue_rows.values(), key=lambda row: row["period"])
    ]
    top_products = [
        ProductSalesStats(**{**row, "total_net": round(row["total_net"], 2), "total_vat": round(row["total_vat"], 2), "total_grand": round(row["total_net"] + row["total_vat"], 2)})
        for row in sorted(product_rows.values(), key=lambda row: row["total_net"] + row["total_vat"], reverse=True)[:10]
    ]
    top_customers = [CustomerSalesStats(**row) for row in sorted(customer_rows.values(), key=lambda row: row["total_grand"], reverse=True)[:10]]
    recent_orders = [
        RecentOrderStats(
            id=order["id"],
            customer_name=order.get("customer_name", "Unknown"),
            item_count=len(order.get("items", [])),
            total_grand=round(compute_order_totals(order)["grand"], 2),
            created_at=order["created_at"],
        )
        for order in filtered_orders[:10]
    ]

    return DashboardStatsResponse(
        scope="global" if current_user.role == Role.SUPERADMIN else "client",
        from_date=from_date,
        to_date=to_date,
        summary=summary,
        revenue_by_period=revenue_by_period,
        top_products=top_products,
        top_customers=top_customers,
        recent_orders=recent_orders,
    )


@api_router.get("/stats/clients/{client_id}", response_model=ClientStats)
async def stats_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    if not await db.clients.find_one({"id": client_id}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Client not found")
    return await _compute_client_stats(client_id)


# ---------------- Seed ----------------
DEMO_CUSTOMERS = [
    {"name": "Maxi Market d.o.o.", "address": "Bulevar oslobođenja 1, Novi Sad", "pib": "101234567",
     "phone": "+381 21 123456", "email": "nabavka@maxi-demo.rs"},
    {"name": "Delikates Prodavnica", "address": "Knez Mihailova 10, Beograd", "pib": "107654321",
     "phone": "+381 11 7654321", "email": "info@delikates-demo.rs"},
]
# Values the older integration tests (test_easy_order/iteration3/iteration4) assert on.
DEMO_PRODUCTS = [
    {"name": "Ulje Bundeve 250ml", "manufacturer": "Bački Dukat", "price_no_vat": 450, "vat_rate": 20,
     "discount": 5, "discounts": [0, 5, 10], "pieces_per_package": 12, "boxes_per_transport": 40},
    {"name": "Kokosovo ulje 150ml", "manufacturer": "Bački Dukat", "price_no_vat": 380, "vat_rate": 20,
     "discount": 0, "discounts": [0, 3, 7], "pieces_per_package": 12, "boxes_per_transport": 50},
    {"name": "Jabukovo sirce 1L", "manufacturer": "Zdrava Hrana", "price_no_vat": 220, "vat_rate": 10,
     "discount": 10, "discounts": [0, 10, 15], "pieces_per_package": 6, "boxes_per_transport": 60},
]


async def _seed_demo_data() -> None:
    """Local/CI only (never IS_PRODUCTION): a demo client with an admin,
    customers and products, so tests run against an empty database."""
    client = await db.clients.find_one({"name": "Demo Wholesaler"}, {"_id": 0})
    if not client:
        client_obj = Client(name="Demo Wholesaler")
        client = client_obj.dict()
        await db.clients.insert_one({**client, "_id": client_obj.id})
    client_id = client["id"]

    if not await find_user_by_email(DEMO_ADMIN_EMAIL):
        admin = User(email=normalize_email(DEMO_ADMIN_EMAIL), name="Demo Admin", role=Role.ADMIN, client_id=client_id)
        raw = {**admin.dict(), "token_version": 0, "password_hash": hash_password(DEMO_ADMIN_PASSWORD)}
        await db.users.insert_one({**raw, "_id": admin.id})

    for data in DEMO_CUSTOMERS:
        if not await db.customers.find_one({"client_id": client_id, "name": data["name"]}):
            obj = Customer(client_id=client_id, **data)
            await db.customers.insert_one({**obj.dict(), "_id": obj.id})
    for data in DEMO_PRODUCTS:
        if not await db.products.find_one({"client_id": client_id, "name": data["name"]}):
            obj = Product(client_id=client_id, **data)
            await db.products.insert_one({**obj.dict(), "_id": obj.id})


async def seed_data():
    # Opt-in, not just "not production": a local backend may point at the
    # real Atlas database (backend/.env), and a demo admin with a public
    # password must never land there.
    if SEED_DEMO_DATA:
        if IS_PRODUCTION:
            logger.error("SEED_DEMO_DATA is ignored in production")
        else:
            await _seed_demo_data()

    if not await find_user_by_email(SUPERADMIN_EMAIL):
        if SUPERADMIN_PASSWORD == DEFAULT_SUPERADMIN_PASSWORD:
            if IS_PRODUCTION:
                # The default password is public (it's in the repo), so never
                # create a production superadmin with it. Skip instead of
                # crashing so an already-seeded deployment keeps running.
                logger.error("SUPERADMIN_PASSWORD not set - refusing to create superadmin with the default password")
                return
            logger.warning(
                "SUPERADMIN_PASSWORD not set in backend/.env - using an insecure default password."
            )
        superadmin = User(email=normalize_email(SUPERADMIN_EMAIL), name="Super Admin", role=Role.SUPERADMIN, client_id=None)
        raw = superadmin.dict()
        raw["token_version"] = 0
        raw["password_hash"] = hash_password(SUPERADMIN_PASSWORD)
        await db.users.insert_one({**raw, "_id": superadmin.id})


app = FastAPI(lifespan=lifespan)
app.include_router(api_router)
# Not every OS registers .apk (Windows doesn't), and without it StaticFiles
# serves the APK as text/plain, which some Android browsers won't install.
mimetypes.add_type("application/vnd.android.package-archive", ".apk")
APP_DOWNLOADS_DIR = ROOT_DIR / "public" / "app"
if APP_DOWNLOADS_DIR.is_dir():
    app.mount("/app", StaticFiles(directory=APP_DOWNLOADS_DIR), name="app-downloads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
