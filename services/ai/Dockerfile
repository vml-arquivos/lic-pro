FROM python:3.12-slim
WORKDIR /app
COPY services/ai/pyproject.toml ./pyproject.toml
COPY services/ai/src ./src
COPY services/ai/ana ./ana
RUN python -m compileall -q src
CMD ["python", "-m", "src.main"]
