from src.limits import InMemoryUsageStore, LimitExceeded, RateLimiter, ServiceLimits


def test_rate_limit_is_scoped_by_user_and_tenant() -> None:
    limits = ServiceLimits(per_user_minute=1, per_tenant_minute=2)
    limiter = RateLimiter(limits, clock=lambda: 100.0)
    limiter.check("tenant-a", "user-a")
    try:
        limiter.check("tenant-a", "user-a")
    except LimitExceeded as error:
        assert error.code == "user_rate_limit"
    else:
        raise AssertionError("user limit deveria ter sido excedido")


def test_tenant_rate_limit_is_independent_from_other_tenant() -> None:
    limits = ServiceLimits(per_user_minute=3, per_tenant_minute=1)
    limiter = RateLimiter(limits, clock=lambda: 100.0)
    limiter.check("tenant-a", "user-a")
    try:
        limiter.check("tenant-a", "user-b")
    except LimitExceeded as error:
        assert error.code == "tenant_rate_limit"
    else:
        raise AssertionError("tenant limit deveria ter sido excedido")
    limiter.check("tenant-b", "user-b")


def test_monthly_call_and_token_quotas_are_clear() -> None:
    usage = InMemoryUsageStore(ServiceLimits(default_monthly_calls=1, default_monthly_tokens=5))
    usage.consume("tenant-a", "user-a", 2, 2)
    try:
        usage.consume("tenant-a", "user-a", 1, 1)
    except LimitExceeded as error:
        assert error.code == "monthly_call_quota_exceeded"
    else:
        raise AssertionError("cota de chamadas deveria ter sido excedida")

    token_usage = InMemoryUsageStore(ServiceLimits(default_monthly_calls=3, default_monthly_tokens=5))
    token_usage.consume("tenant-a", "user-a", 4, 1)
    try:
        token_usage.consume("tenant-a", "user-a", 1, 1)
    except LimitExceeded as error:
        assert error.code == "monthly_token_quota_exceeded"
    else:
        raise AssertionError("cota de tokens deveria ter sido excedida")
