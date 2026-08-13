from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from enum import Enum
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
import cloudinary
import cloudinary.uploader

from calc import compute_order_totals


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@easyorder.dev")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "ChangeMe123!")
DEMO_ADMIN_EMAIL = os.environ.get("DEMO_ADMIN_EMAIL", "demo-admin@easyorder.dev")
DEMO_ADMIN_PASSWORD = os.environ.get("DEMO_ADMIN_PASSWORD", "ChangeMe123!")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

mongo_client: AsyncIOMotorClient = None
db = None  # AsyncIOMotorDatabase

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, db
    mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo_client[os.environ["DB_NAME"]]
    await db.customers.create_index("client_id")
    await db.products.create_index("client_id")
    await db.orders.create_index("client_id")
    await db.users.create_index("email")
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
    pieces_per_package: Optional[int] = 0
    boxes_per_transport: Optional[int] = 0
    created_at: str = Field(default_factory=now_iso)


class ProductInput(BaseModel):
    name: str
    image: Optional[str] = ""
    manufacturer: Optional[str] = ""
    price_no_vat: Optional[float] = 0
    vat_rate: Optional[float] = 20
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
    ordered_qty: int = 0


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    customer_id: str
    customer_name: str
    items: List[OrderItem] = []
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


def cloudinary_available() -> bool:
    return bool(
        os.environ.get("CLOUDINARY_CLOUD_NAME")
        and os.environ.get("CLOUDINARY_API_KEY")
        and os.environ.get("CLOUDINARY_API_SECRET")
    )


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


@api_router.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@api_router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"ok": True}


@api_router.post("/upload-image")
async def upload_product_image(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not cloudinary_available():
        raise HTTPException(status_code=500, detail="Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.")

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
    obj = Product(**inp.dict(exclude={"client_id"}), client_id=client_id)
    await db.products.insert_one({**obj.dict(), "_id": obj.id})
    return obj


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, inp: ProductInput, current_user: User = Depends(get_current_user)):
    existing = await get_scoped_or_404("products", product_id, current_user)
    updated = {**existing, **inp.dict(exclude={"client_id"}), "id": product_id}
    await db.products.replace_one({"id": product_id}, {**updated, "_id": product_id})
    return Product(**updated)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(get_current_user)):
    await get_scoped_or_404("products", product_id, current_user)
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ---------------- Orders ----------------
@api_router.get("/orders", response_model=List[Order])
async def list_orders(customer_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = _scope_query(current_user)
    if customer_id:
        query = {**query, "customer_id": customer_id}
    docs = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    return [Order(**v) for v in docs]


@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    return Order(**await get_scoped_or_404("orders", order_id, current_user))


@api_router.post("/orders", response_model=Order)
async def create_order(inp: OrderInput, current_user: User = Depends(get_current_user)):
    client_id = await resolve_write_client_id(current_user, inp.client_id)
    obj = Order(**inp.dict(exclude={"client_id"}), client_id=client_id)
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
