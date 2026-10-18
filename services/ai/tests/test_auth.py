from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from src.auth import JwtSettings, require_auth, settings


def _token(**overrides: object) -> str:
    claims: dict[str, object] = {
        "sub": "00000000-0000-0000-0000-000000000002",
        "tenantId": "00000000-0000-0000-0000-000000000001",
        "role": "aluno",
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, settings.key, algorithm=settings.algorithm)


def test_require_auth_derives_context_from_claims() -> None:
    context = require_auth(f"Bearer {_token()}")
    assert context.tenant_id == "00000000-0000-0000-0000-000000000001"
    assert context.user_id == "00000000-0000-0000-0000-000000000002"


def test_require_auth_rejects_tampered_signature() -> None:
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000002",
            "tenantId": "00000000-0000-0000-0000-000000000099",
            "role": "aluno",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        "wrong-secret",
        algorithm=settings.algorithm,
    )
    with pytest.raises(HTTPException) as error:
        require_auth(f"Bearer {token}")
    assert error.value.status_code == 401


def test_production_requires_jwt_key() -> None:
    with pytest.raises(RuntimeError, match="AI_JWT_SECRET"):
        JwtSettings({"NODE_ENV": "production", "AI_JWT_ALGORITHM": "HS256"})


def test_production_does_not_accept_fake_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    from src.providers import build_embedding_provider, build_llm_provider

    with pytest.raises(RuntimeError, match="fake"):
        build_llm_provider("fake")
    with pytest.raises(RuntimeError, match="determinístico"):
        build_embedding_provider("deterministic")


def test_gemini_provider_uses_google_openai_compatibility(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    from src.providers import build_embedding_provider, build_llm_provider

    llm = build_llm_provider("gemini")
    embedding = build_embedding_provider("gemini")

    assert llm.name == "gemini"
    assert llm.model == "gemini-2.5-pro"
    assert llm.base_url.startswith("https://generativelanguage.googleapis.com/v1beta/openai")
    assert embedding.model == "gemini-embedding-001"
    assert embedding.dimension == 1024
