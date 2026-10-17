FROM python:3.12-slim
WORKDIR /app
COPY services/ingest/pyproject.toml ./pyproject.toml
COPY services/ingest/src ./src
RUN python -m compileall -q src
CMD ["python", "-m", "src.main"]
