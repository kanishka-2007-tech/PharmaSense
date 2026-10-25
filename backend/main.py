from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field, field_validator
from dotenv import load_dotenv
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://pharmasense:pharmasense@localhost:5432/pharmasense",
)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if len(JWT_SECRET_KEY) < 32 or JWT_SECRET_KEY == "replace-this-with-a-long-random-secret":
    raise RuntimeError("Set JWT_SECRET_KEY to a random value of at least 32 characters in backend/.env.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
if JWT_EXPIRE_MINUTES < 1:
    raise RuntimeError("JWT_EXPIRE_MINUTES must be a positive integer.")
JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
bearer_scheme = HTTPBearer(auto_error=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(60), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    cls: Mapped[str] = mapped_column(String(160), nullable=False)


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (UniqueConstraint("medicine_a", "medicine_b", name="uq_interaction_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medicine_a: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    medicine_b: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    reco: Mapped[str] = mapped_column(Text, nullable=False)


class CheckHistory(Base):
    __tablename__ = "check_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    meds: Mapped[list[str]] = mapped_column(JSON_TYPE, nullable=False)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSON_TYPE, nullable=False)
    findings_count: Mapped[int] = mapped_column(Integer, nullable=False)
    worst_severity: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def load_seed_data() -> dict[str, list[dict[str, Any]]]:
    return json.loads((BASE_DIR / "seed_data.json").read_text(encoding="utf-8"))


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    seed = load_seed_data()
    with SessionLocal.begin() as db:
        existing_medicines = {item.name.lower() for item in db.scalars(select(Medicine))}
        for item in seed["medicines"]:
            if item["name"].lower() not in existing_medicines:
                db.add(Medicine(name=item["name"], cls=item["cls"]))
        existing_pairs = {
            (item.medicine_a, item.medicine_b)
            for item in db.scalars(select(Interaction))
        }
        for item in seed["interactions"]:
            pair = tuple(sorted((item["a"].lower(), item["b"].lower())))
            if pair not in existing_pairs:
                db.add(
                    Interaction(
                        medicine_a=pair[0],
                        medicine_b=pair[1],
                        severity=item["severity"],
                        text=item["text"],
                        reco=item["reco"],
                    )
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="PharmaSense API", version="1.0.0", lifespan=lifespan)
origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter your name.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("password")
    @classmethod
    def bcrypt_password_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer.")
        return value


class UserLogin(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("password")
    @classmethod
    def bcrypt_password_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer.")
        return value


class UserUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter your name.")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    created_at: datetime


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    cls: str


class InteractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medicine_a: str
    medicine_b: str
    severity: str
    text: str
    reco: str


class CheckRequest(BaseModel):
    medicines: list[str] = Field(min_length=2, max_length=20)

    @field_validator("medicines")
    @classmethod
    def normalize_medicines(cls, values: list[str]) -> list[str]:
        values = [value.strip() for value in values]
        if any(not value for value in values):
            raise ValueError("Medicine names cannot be blank.")
        if len({value.lower() for value in values}) != len(values):
            raise ValueError("A medicine can only be included once.")
        return values


class CheckOut(BaseModel):
    id: int
    meds: list[str]
    findings: list[dict[str, Any]]
    findings_count: int
    worst_severity: str
    at: datetime


def user_payload(user: User) -> dict[str, Any]:
    return {"id": user.id, "name": user.name, "email": user.email, "created_at": user.created_at}


def create_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user.id), "exp": expires}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        user_id = int(jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
Database = Annotated[Session, Depends(get_db)]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(payload: UserCreate, db: Database):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("ascii"),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from None
    db.refresh(user)
    return {"access_token": create_token(user), "user": user_payload(user)}


@app.post("/api/auth/login", response_model=AuthOut)
def login(payload: UserLogin, db: Database):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    password_matches = user is not None and bcrypt.checkpw(
        payload.password.encode("utf-8"), user.password_hash.encode("ascii")
    )
    if not password_matches:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    return {"access_token": create_token(user), "user": user_payload(user)}


@app.get("/api/users/me", response_model=UserOut)
def read_current_user(user: CurrentUser):
    return user


@app.patch("/api/users/me", response_model=UserOut)
def update_current_user(payload: UserUpdate, user: CurrentUser, db: Database):
    user.name = payload.name
    db.commit()
    db.refresh(user)
    return user


@app.get("/api/medicines", response_model=list[MedicineOut])
def list_medicines(db: Database, search: str | None = Query(default=None, max_length=120)):
    statement = select(Medicine).order_by(Medicine.name)
    if search:
        statement = statement.where(Medicine.name.ilike(f"%{search.strip()}%"))
    return db.scalars(statement).all()


@app.get("/api/interactions", response_model=list[InteractionOut])
def list_interactions(db: Database):
    return db.scalars(select(Interaction).order_by(Interaction.medicine_a, Interaction.medicine_b)).all()


@app.post("/api/interactions/check", response_model=CheckOut, status_code=status.HTTP_201_CREATED)
def check_interactions(payload: CheckRequest, user: CurrentUser, db: Database):
    medicines = payload.medicines
    requested = {name.lower() for name in medicines}
    # Load the small curated catalog once; exact matching avoids accepting unknown medicine names.
    all_medicines = {item.name.lower(): item for item in db.scalars(select(Medicine)).all()}
    if not requested.issubset(all_medicines):
        unknown = sorted(name for name in medicines if name.lower() not in all_medicines)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown medicine: {', '.join(unknown)}")

    findings: list[dict[str, Any]] = []
    pair_lookup = {
        (item.medicine_a, item.medicine_b): item
        for item in db.scalars(select(Interaction)).all()
    }
    for index, name_a in enumerate(medicines):
        for name_b in medicines[index + 1 :]:
            pair = tuple(sorted((name_a.lower(), name_b.lower())))
            interaction = pair_lookup.get(pair)
            if interaction:
                findings.append({
                    "pair": [name_a, name_b],
                    "severity": interaction.severity,
                    "text": interaction.text,
                    "reco": interaction.reco,
                    "duplicate": False,
                })

    classes: dict[str, list[str]] = {}
    for name in medicines:
        medicine = all_medicines[name.lower()]
        classes.setdefault(medicine.cls, []).append(name)
    for medicine_class, names in classes.items():
        if len(names) > 1:
            findings.append({
                "pair": [" + ".join(names)],
                "severity": "caution",
                "text": (
                    f"These are both classified as {medicine_class}, so taking them together means "
                    "overlapping effects and higher combined side-effect risk rather than added benefit."
                ),
                "reco": "Confirm with a doctor whether both are actually needed, or if one duplicates the other.",
                "duplicate": True,
            })

    severity_order = {"danger": 0, "caution": 1, "safe": 2}
    findings.sort(key=lambda finding: severity_order[finding["severity"]])
    worst_severity = (
        "danger" if any(item["severity"] == "danger" for item in findings)
        else "caution" if findings
        else "safe"
    )
    entry = CheckHistory(
        user_id=user.id,
        meds=medicines,
        findings=findings,
        findings_count=len(findings),
        worst_severity=worst_severity,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "meds": entry.meds,
        "findings": entry.findings,
        "findings_count": entry.findings_count,
        "worst_severity": entry.worst_severity,
        "at": entry.created_at,
    }


@app.get("/api/history", response_model=list[CheckOut])
def list_history(
    user: CurrentUser,
    db: Database,
    limit: int = Query(default=8, ge=1, le=50),
):
    records = db.scalars(
        select(CheckHistory)
        .where(CheckHistory.user_id == user.id)
        .order_by(CheckHistory.created_at.desc(), CheckHistory.id.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": item.id,
            "meds": item.meds,
            "findings": item.findings,
            "findings_count": item.findings_count,
            "worst_severity": item.worst_severity,
            "at": item.created_at,
        }
        for item in records
    ]


@app.get("/api/history/{history_id}", response_model=CheckOut)
def read_history(history_id: int, user: CurrentUser, db: Database):
    entry = db.scalar(
        select(CheckHistory).where(CheckHistory.id == history_id, CheckHistory.user_id == user.id)
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check history entry not found.")
    return {
        "id": entry.id,
        "meds": entry.meds,
        "findings": entry.findings,
        "findings_count": entry.findings_count,
        "worst_severity": entry.worst_severity,
        "at": entry.created_at,
    }
