from collections.abc import Iterator
import os

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key-with-at-least-32-characters")

from backend import main


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_sessions = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", test_engine)
    monkeypatch.setattr(main, "SessionLocal", test_sessions)
    with TestClient(main.app) as test_client:
        yield test_client
    test_engine.dispose()


def create_account(client: TestClient, email: str = "patient@example.com") -> dict:
    response = client.post(
        "/api/auth/signup",
        json={"name": "  Patient One ", "email": f" {email} ", "password": "safe-demo-pass"},
    )
    assert response.status_code == 201
    return response.json()


def test_signup_hashes_password_and_normalizes_email(client: TestClient) -> None:
    result = create_account(client)
    with main.SessionLocal() as db:
        user = db.scalar(select(main.User).where(main.User.email == "patient@example.com"))
        assert user is not None
        assert user.name == "Patient One"
        assert user.password_hash != "safe-demo-pass"
        assert bcrypt.checkpw(b"safe-demo-pass", user.password_hash.encode("ascii"))
    assert result["user"]["email"] == "patient@example.com"
    assert result["token_type"] == "bearer"

    login = client.post(
        "/api/auth/login",
        json={"email": "PATIENT@example.com", "password": "safe-demo-pass"},
    )
    assert login.status_code == 200
    authorization = {"Authorization": f"Bearer {login.json()['access_token']}"}
    profile = client.get("/api/users/me", headers=authorization)
    assert profile.status_code == 200
    assert profile.json()["email"] == "patient@example.com"
    assert client.patch(
        "/api/users/me",
        headers=authorization,
        json={"name": "Updated Patient"},
    ).json()["name"] == "Updated Patient"
    assert client.post(
        "/api/auth/login",
        json={"email": "patient@example.com", "password": "incorrect-password"},
    ).status_code == 401


def test_check_is_saved_and_history_is_private_to_the_user(client: TestClient) -> None:
    account = create_account(client)
    authorization = {"Authorization": f"Bearer {account['access_token']}"}

    assert client.get("/api/history").status_code == 401
    checked = client.post(
        "/api/interactions/check",
        headers=authorization,
        json={"medicines": ["Warfarin", "Aspirin"]},
    )
    assert checked.status_code == 201
    result = checked.json()
    assert result["worst_severity"] == "danger"
    assert result["findings"][0]["severity"] == "danger"
    assert result["meds"] == ["Warfarin", "Aspirin"]

    history = client.get("/api/history", headers=authorization)
    assert history.status_code == 200
    assert history.json()[0]["id"] == result["id"]

    another_account = create_account(client, "another@example.com")
    another_authorization = {"Authorization": f"Bearer {another_account['access_token']}"}
    assert client.get("/api/history", headers=another_authorization).json() == []


def test_check_rejects_unknown_medicines(client: TestClient) -> None:
    account = create_account(client)
    response = client.post(
        "/api/interactions/check",
        headers={"Authorization": f"Bearer {account['access_token']}"},
        json={"medicines": ["Warfarin", "Unknown drug"]},
    )
    assert response.status_code == 422
