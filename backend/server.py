from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import hashlib
import os
import re
import secrets
import smtplib
import logging
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

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))
PASSWORD_RESET_EXPIRE_MINUTES = int(os.environ.get("PASSWORD_RESET_EXPIRE_MINUTES", "30"))
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@easyorder.dev")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "ChangeMe123!")
DEMO_ADMIN_EMAIL = os.environ.get("DEMO_ADMIN_EMAIL", "demo-admin@easyorder.dev")
DEMO_ADMIN_PASSWORD = os.environ.get("DEMO_ADMIN_PASSWORD", "ChangeMe123!")
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
    await db.users.create_index("email")
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at")
    await db.password_reset_tokens.create_index("user_id")
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
    OPERATOR = "operator"


class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class ClientInput(BaseModel):
    name: str
    address: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    pib: Optional[str] = ""


class ClientCreateInput(ClientInput):
    admin_name: str
    admin_email: EmailStr
    admin_password: str


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    phone: Optional[str] = ""
    role: Role
    client_id: Optional[str] = None  # None only for SUPERADMIN
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class ClientCreateResponse(BaseModel):
    client: Client
    admin_user: User


class UserInput(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = ""
    password: str
    role: Role
    client_id: Optional[str] = None


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
    discount: Optional[float] = 0
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


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    customer_id: str
    customer_name: str
    items: List[OrderItem] = []
    item_count: Optional[int] = None
    client_name: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class OrderInput(BaseModel):
    customer_id: str
    customer_name: str
    items: List[OrderItem] = []
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
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _password_is_strong_enough(password: str) -> bool:
    return len(password) >= 8


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_reset_link(token: str, channel: ForgotPasswordChannel) -> str:
    encoded = quote(token, safe="")
    if channel == ForgotPasswordChannel.MOBILE:
        return f"{RESET_MOBILE_SCHEME}?token={encoded}"
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
        f"Hi {user_name or 'there'},\n\n"
        "We received a request to reset your Easy Order password.\n"
        f"Use this link to set a new password:\n{reset_link}\n\n"
        f"This link expires in {PASSWORD_RESET_EXPIRE_MINUTES} minutes.\n"
        "If you did not request this, you can ignore this email."
    )


def _build_test_email_body() -> str:
    return (
        "This is a test email from Easy Order.\n\n"
        "If you received this, Brevo SMTP is configured correctly and the backend can send mail."
    )


async def _send_reset_email(to_email: str, user_name: str, reset_link: str) -> None:
    if not _smtp_is_configured():
        logger.warning("SMTP not configured. Password reset link for %s: %s", to_email, reset_link)
        return

    body = _build_reset_email_body(user_name, reset_link)
    await asyncio.to_thread(_send_smtp_email_sync, to_email, "Easy Order - Password reset", body)


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


async def find_user_by_email(email: str) -> Optional[dict]:
    return await db.users.find_one(
        {"email": re.compile(f"^{re.escape(email)}$", re.IGNORECASE)},
        {"_id": 0},
    )


security = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    raw = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not raw or not raw.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return User(**raw)


def require_roles(*roles: Role):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep


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
    raw = await find_user_by_email(inp.email)
    if not raw or not raw.get("active", True) or not verify_password(inp.password, raw["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(raw)
    return TokenResponse(access_token=token, user=User(**raw))


@api_router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(inp: ForgotPasswordInput):
    user = await find_user_by_email(inp.email)
    debug_token: Optional[str] = None

    if user and user.get("active", True):
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
    if not _password_is_strong_enough(inp.new_password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    record = await _get_valid_reset_record(inp.token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = await db.users.find_one({"id": record["user_id"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(inp.new_password)}},
    )
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
        logger.exception("SMTP test email failed for %s: %s", inp.to_email, exc)
        raise HTTPException(status_code=500, detail=f"SMTP test failed: {str(exc)}") from exc

    return TestEmailResponse(sent_to=inp.to_email, subject=inp.subject)


@api_router.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@api_router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"ok": True}


@api_router.post("/upload-image")
async def upload_product_image(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not cloudinary_available():
        raise HTTPException(
            status_code=500,
            detail="Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.",
        )

    try:
        result = cloudinary.uploader.upload(
            file.file,
            folder="easy-order/products",
            resource_type="image",
            transformation=[{"quality": "auto"}, {"fetch_format": "auto"}],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(exc)}") from exc

    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
    }


# ---------------- Clients (tenant companies) ----------------
@api_router.get("/clients", response_model=List[Client])
async def list_clients(current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    docs = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(None)
    return [Client(**v) for v in docs]


@api_router.post("/clients", response_model=ClientCreateResponse)
async def create_client(inp: ClientCreateInput, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    if await find_user_by_email(inp.admin_email):
        raise HTTPException(status_code=400, detail="Email already in use")

    client_obj = Client(**inp.dict(exclude={"admin_name", "admin_email", "admin_password"}))
    await db.clients.insert_one({**client_obj.dict(), "_id": client_obj.id})

    admin_obj = User(email=inp.admin_email, name=inp.admin_name, role=Role.ADMIN, client_id=client_obj.id)
    admin_raw = admin_obj.dict()
    admin_raw["password_hash"] = hash_password(inp.admin_password)
    await db.users.insert_one({**admin_raw, "_id": admin_obj.id})

    return ClientCreateResponse(client=client_obj, admin_user=admin_obj)


@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return Client(**doc)


@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, inp: ClientInput, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    updated = {**existing, **inp.dict()}
    await db.clients.replace_one({"id": client_id}, {**updated, "_id": client_id})
    return Client(**updated)


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(require_roles(Role.SUPERADMIN))):
    if not await db.clients.find_one({"id": client_id}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Client not found")
    # Soft delete: hard-deleting would orphan this client's users/products/
    # customers/orders and break historical stats.
    await db.clients.update_one({"id": client_id}, {"$set": {"active": False}})
    return {"ok": True}


# ---------------- Users ----------------
@api_router.get("/users", response_model=List[User])
async def list_users(client_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role == Role.OPERATOR:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role == Role.SUPERADMIN:
        query = {"client_id": client_id} if client_id else {}
    else:
        query = {"client_id": current_user.client_id}
    docs = await db.users.find(query, {"_id": 0}).sort("name", 1).to_list(None)
    return [User(**v) for v in docs]


@api_router.post("/users", response_model=User)
async def create_user(inp: UserInput, current_user: User = Depends(get_current_user)):
    if current_user.role == Role.OPERATOR:
        raise HTTPException(status_code=403, detail="Forbidden")
    if await find_user_by_email(inp.email):
        raise HTTPException(status_code=400, detail="Email already in use")

    if current_user.role == Role.ADMIN:
        # Admins may only create Operators for their own client - payload
        # role/client_id are ignored, never trusted.
        role = Role.OPERATOR
        client_id = current_user.client_id
    else:  # SUPERADMIN
        role = inp.role
        if role == Role.SUPERADMIN:
            client_id = None
        else:
            if not inp.client_id or not await db.clients.find_one({"id": inp.client_id}, {"_id": 0}):
                raise HTTPException(status_code=400, detail="Valid client_id is required for this role")
            client_id = inp.client_id

    obj = User(email=inp.email, name=inp.name, phone=inp.phone, role=role, client_id=client_id)
    raw = obj.dict()
    raw["password_hash"] = hash_password(inp.password)
    await db.users.insert_one({**raw, "_id": obj.id})
    return obj


@api_router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, inp: UserUpdateInput, current_user: User = Depends(get_current_user)):
    if current_user.role == Role.OPERATOR:
        raise HTTPException(status_code=403, detail="Forbidden")
    target = await get_scoped_or_404("users", user_id, current_user)
    if current_user.role == Role.ADMIN and inp.role is not None and inp.role != Role.OPERATOR:
        raise HTTPException(status_code=403, detail="Admins cannot assign this role")

    updated = {**target}
    if inp.name is not None:
        updated["name"] = inp.name
    if inp.phone is not None:
        updated["phone"] = inp.phone
    if inp.active is not None:
        updated["active"] = inp.active
    if inp.role is not None:
        updated["role"] = inp.role
    if inp.password:
        updated["password_hash"] = hash_password(inp.password)
    await db.users.replace_one({"id": user_id}, {**updated, "_id": user_id})
    return User(**updated)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role == Role.OPERATOR:
        raise HTTPException(status_code=403, detail="Forbidden")
    await get_scoped_or_404("users", user_id, current_user)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------------- Customers ----------------
@api_router.get("/customers", response_model=List[Customer])
async def list_customers(current_user: User = Depends(get_current_user)):
    docs = await db.customers.find(_scope_query(current_user), {"_id": 0}).sort("name", 1).to_list(None)
    return [Customer(**v) for v in docs]


@api_router.post("/customers", response_model=Customer)
async def create_customer(inp: CustomerInput, current_user: User = Depends(get_current_user)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    obj = Customer(**inp.dict(exclude={"client_id"}), client_id=client_id)
    await db.customers.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, inp: CustomerInput, current_user: User = Depends(get_current_user)):
    existing = await get_scoped_or_404("customers", customer_id, current_user)
    updated = {**existing, **inp.dict(exclude={"client_id"})}
    await db.customers.replace_one({"id": customer_id}, {**updated, "_id": customer_id})
    return Customer(**updated)


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, current_user: User = Depends(get_current_user)):
    await get_scoped_or_404("customers", customer_id, current_user)
    await db.customers.delete_one({"id": customer_id})
    return {"ok": True}


# ---------------- Products ----------------
@api_router.get("/products", response_model=List[Product])
async def list_products(current_user: User = Depends(get_current_user)):
    docs = await db.products.find(_scope_query(current_user), {"_id": 0}).sort("created_at", 1).to_list(None)
    return [Product(**v) for v in docs]


@api_router.post("/products", response_model=Product)
async def create_product(inp: ProductInput, current_user: User = Depends(get_current_user)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    payload = inp.dict(exclude={"client_id"})
    payload["discount"] = max(0.0, min(100.0, float(payload.get("discount") or 0)))
    payload["discounts"] = normalize_discounts(inp.discounts, payload["discount"])
    payload["additional_discounts"] = normalize_additional_discounts(inp.additional_discounts)
    obj = Product(**payload, client_id=client_id)
    await db.products.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, inp: ProductInput, current_user: User = Depends(get_current_user)):
    existing = await get_scoped_or_404("products", product_id, current_user)
    incoming = inp.dict(exclude={"client_id"})
    discount_value = max(0.0, min(100.0, float(incoming.get("discount") or existing.get("discount") or 0)))
    updated = {
        **existing,
        **incoming,
        "id": product_id,
        "discount": discount_value,
        "discounts": normalize_discounts(inp.discounts, discount_value),
        "additional_discounts": normalize_additional_discounts(inp.additional_discounts),
    }
    await db.products.replace_one({"id": product_id}, {**updated, "_id": product_id})
    return Product(**updated)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(get_current_user)):
    await get_scoped_or_404("products", product_id, current_user)
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ---------------- Orders ----------------
@api_router.get("/orders", response_model=List[Order])
async def list_orders(
    customer_id: Optional[str] = None,
    portal: bool = False,
    current_user: User = Depends(get_current_user),
):
    query = _scope_query(current_user)
    if customer_id:
        query = {**query, "customer_id": customer_id}
    docs = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    orders = []
    for value in docs:
        if portal and current_user.role == Role.SUPERADMIN:
            client = await db.clients.find_one({"id": value.get("client_id")}, {"_id": 0, "name": 1})
            value = {**value, "client_name": client.get("name") if client else None}
        orders.append(Order(**value))
    return orders


@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    return Order(**await get_scoped_or_404("orders", order_id, current_user))


@api_router.post("/orders", response_model=Order)
async def create_order(inp: OrderInput, current_user: User = Depends(get_current_user)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    obj = Order(**inp.dict(exclude={"client_id"}), client_id=client_id)
    for item in obj.items:
        item.discount = max(0.0, min(100.0, float(item.discount or 0)))
        item.additional_discount = max(0.0, min(100.0, float(item.additional_discount or 0)))
    await db.orders.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, current_user: User = Depends(get_current_user)):
    await get_scoped_or_404("orders", order_id, current_user)
    await db.orders.delete_one({"id": order_id})
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Easy Order API"}


@api_router.get("/app/update")
async def app_update():
    if not APP_UPDATE_FILE.exists():
        return {"enabled": False}
    try:
        import json
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
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
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
async def seed_data():
    if await db.clients.count_documents({}) == 0:
        demo_client = Client(name="Demo Wholesaler")
        await db.clients.insert_one({**demo_client.dict(), "_id": demo_client.id})
        demo_client_id = demo_client.id
    else:
        first = await db.clients.find_one({}, {"_id": 0, "id": 1})
        demo_client_id = first["id"]

    if not await find_user_by_email(SUPERADMIN_EMAIL):
        superadmin = User(email=SUPERADMIN_EMAIL, name="Super Admin", role=Role.SUPERADMIN, client_id=None)
        raw = superadmin.dict()
        raw["password_hash"] = hash_password(SUPERADMIN_PASSWORD)
        await db.users.insert_one({**raw, "_id": superadmin.id})
        if SUPERADMIN_PASSWORD == "ChangeMe123!":
            logger.warning(
                "SUPERADMIN_PASSWORD not set in backend/.env - using an insecure default password."
            )


app = FastAPI(lifespan=lifespan)
app.include_router(api_router)
app.mount("/app", StaticFiles(directory=ROOT_DIR / "public" / "app"), name="app-downloads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
