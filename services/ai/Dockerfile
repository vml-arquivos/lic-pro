FROM python:3.12-slim

WORKDIR /app
COPY services/ai/pyproject.toml ./pyproject.toml
COPY services/ai/src ./src
COPY services/ai/ana ./ana
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
