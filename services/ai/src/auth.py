"""Session JWT validation for the AI service.

The service never trusts tenant/user values supplied by a request body or form.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    tenant_id: str
    role: str
    empresa_id: str | None = None


class JwtSettings:
    def __init__(self, env: dict[str, str | None] | None = None) -> None:
        values = env or os.environ
        self.environment = values.get("NODE_ENV") or "development"
        self.algorithm = values.get("AI_JWT_ALGORITHM") or "HS256"
        self.secret = values.get("AI_JWT_SECRET")
        self.public_key = values.get("AI_JWT_PUBLIC_KEY")
        self.issuer = values.get("AI_JWT_ISSUER")
        self.audience = values.get("AI_JWT_AUDIENCE")
        if self.environment == "production":
            missing = [name for name in ("AI_JWT_ISSUER", "AI_JWT_AUDIENCE") if not values.get(name)]
            if self.algorithm.startswith("HS") and not self.secret:
                missing.append("AI_JWT_SECRET")
            if self.algorithm.startswith("RS") and not self.public_key:
                missing.append("AI_JWT_PUBLIC_KEY")
            if missing:
                raise RuntimeError(f"Variáveis obrigatórias ausentes no AI: {', '.join(missing)}")
            if self.algorithm not in {"HS256", "HS384", "HS512", "RS256", "RS384", "RS512"}:
                raise RuntimeError("AI_JWT_ALGORITHM não permitido")
        if self.algorithm.startswith("HS"):
            self.key = self.secret or "test-only-ai-jwt-secret"
        else:
            self.key = self.public_key or "test-only-ai-jwt-public-key"

    def decode(self, token: str) -> dict[str, Any]:
        options = {"require": ["sub", "tenantId", "role", "exp"]}
        kwargs: dict[str, Any] = {
            "key": self.key,
            "algorithms": [self.algorithm],
            "options": options,
        }
        if self.issuer:
            kwargs["issuer"] = self.issuer
        if self.audience:
            kwargs["audience"] = self.audience
        payload = jwt.decode(token, **kwargs)
        if not isinstance(payload, dict):
            raise jwt.InvalidTokenError("claims não são objeto")
        return payload


settings = JwtSettings()


def require_auth(authorization: Annotated[str | None, Header()] = None) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_bearer_token")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing_bearer_token")
    try:
        claims = settings.decode(token)
        user_id = _uuid_claim(claims, "sub")
        tenant_id = _uuid_claim(claims, "tenantId")
        role = claims["role"]
        if not isinstance(role, str) or not role:
            raise ValueError("role inválido")
        empresa_id = _optional_uuid_claim(claims, "empresaId")
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=401, detail="invalid_session_token") from error
    return AuthContext(user_id=user_id, tenant_id=tenant_id, role=role, empresa_id=empresa_id)


def _uuid_claim(claims: dict[str, Any], key: str) -> str:
    value = claims[key]
    return str(UUID(str(value)))


def _optional_uuid_claim(claims: dict[str, Any], key: str) -> str | None:
    if claims.get(key) is None:
        return None
    return _uuid_claim(claims, key)


AuthDependency = Annotated[AuthContext, Depends(require_auth)]
