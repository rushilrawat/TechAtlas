#!/usr/bin/env bash
#
# Start TechAtlas locally: FastAPI backend (:8000) + Vite frontend (:5173).
#
# Usage:
#   ./dev.sh                 # build data if missing, then run both servers
#   ./dev.sh --rebuild-data  # always rebuild + validate + layout first
#
# Ctrl-C stops both servers cleanly.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
BACKEND_PORT="${TECHATLAS_BACKEND_PORT:-8000}"
FRONTEND_PORT="${TECHATLAS_FRONTEND_PORT:-5173}"

# Pick a Python: prefer the backend venv, fall back to python3.
PY="$BACKEND/.venv/bin/python"
[ -x "$PY" ] || PY="python3"
UVICORN="$BACKEND/.venv/bin/uvicorn"
[ -x "$UVICORN" ] || UVICORN="uvicorn"

log()  { printf '\033[36m[dev]\033[0m %s\n' "$1"; }
fail() { printf '\033[31m[dev] %s\033[0m\n' "$1" >&2; exit 1; }

# --- preflight -------------------------------------------------------------
[ -d "$BACKEND/.venv" ] || log "warning: backend/.venv not found — run 'make setup' (using system Python/uvicorn)"
[ -d "$FRONTEND/node_modules" ] || fail "frontend/node_modules missing — run 'cd frontend && npm install' (or 'make setup')"

REBUILD=0
[ "${1:-}" = "--rebuild-data" ] && REBUILD=1

if [ "$REBUILD" = "1" ] || [ ! -f "$ROOT/data/graph.json" ] || [ ! -f "$ROOT/data/layout.json" ]; then
  log "building dataset (compile -> validate -> layout)…"
  "$PY" "$ROOT/scripts/build_dataset.py"
  "$PY" "$ROOT/scripts/validate_dataset.py"
  "$PY" "$ROOT/scripts/generate_layout.py"
fi

# --- cleanup both children on exit ----------------------------------------
PIDS=()
cleanup() {
  log "shutting down…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- backend ---------------------------------------------------------------
log "starting backend  -> http://localhost:$BACKEND_PORT  (docs at /docs)"
(
  cd "$BACKEND"
  exec "$UVICORN" app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload
) &
PIDS+=("$!")

# --- wait for the backend to answer before launching the frontend ---------
log "waiting for backend health…"
for _ in $(seq 1 40); do
  if curl -fs "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null 2>&1; then
    log "backend is up."
    break
  fi
  sleep 0.5
done

# --- frontend --------------------------------------------------------------
log "starting frontend -> http://localhost:$FRONTEND_PORT"
(
  cd "$FRONTEND"
  exec env TECHATLAS_API="http://127.0.0.1:$BACKEND_PORT" \
    npm run dev -- --port "$FRONTEND_PORT"
) &
PIDS+=("$!")

log "both servers running. open http://localhost:$FRONTEND_PORT  — press Ctrl-C to stop."

# Wait on either server; if one dies, cleanup (via trap) tears down the other.
wait -n 2>/dev/null || wait
