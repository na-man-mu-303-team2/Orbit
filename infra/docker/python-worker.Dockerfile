FROM python:3.12-slim

WORKDIR /app/services/python-worker

RUN pip install --no-cache-dir uv

COPY services/python-worker/pyproject.toml ./
RUN uv sync

COPY services/python-worker/ ./

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

