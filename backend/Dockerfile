# TechAtlas scanner backend -- Render Free Web Service.
# Single-worker uvicorn (the in-process rate limiter / concurrency gate are
# per-instance and assume ONE worker). Binds the port Render injects via $PORT.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY backend/app /app/backend/app
COPY data/graph.json /app/data/graph.json
COPY data/layout.json /app/data/layout.json
# graph_service imports scripts/sizing.py at runtime (single source of truth for sizing).
COPY scripts/sizing.py /app/scripts/sizing.py

RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
# Shell form so $PORT (Render) expands; defaults to 8000 for a local container run.
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
