FROM python:3.12-slim AS builder
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY services/ingest/pyproject.toml ./pyproject.toml
COPY services/ingest/src ./src
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app app
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /build/src ./src
USER app
EXPOSE 8100
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]
