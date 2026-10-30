#!/usr/bin/env bash
#
# Start TechAtlas locally: FastAPI backend (:8000) + Vite frontend (:5173).
#
# Usage:
#   ./dev.sh                 # build data if missing, then run both servers
#   ./dev.sh --rebuild-data  # always rebuild + validate + layout first
#
# Port handling:
#   - If the backend port is already serving a healthy TechAtlas API, that running
#     backend is reused instead of starting a duplicate.
#   - If a port is occupied by something else, the script stops with a clear message.
#   - Override ports with TECHATLAS_BACKEND_PORT / TECHATLAS_FRONTEND_PORT.
#
# Ctrl-C stops the servers this script started (a reused backend is left running).

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
warn() { printf '\033[33m[dev] %s\033[0m\n' "$1" >&2; }
fail() { printf '\033[31m[dev] %s\033[0m\n' "$1" >&2; exit 1; }

# --- port helpers ----------------------------------------------------------

# Is any process listening on the given TCP port? (lsof is on macOS by default.)
port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    # Fallback: try to connect with bash's /dev/tcp.
    (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
  fi
}

# Does the backend port already serve a healthy TechAtlas API?
backend_is_ours() {
  curl -fs -m 2 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null \
    | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'
}

# --- preflight -------------------------------------------------------------
[ -d "$BACKEND/.venv" ] || warn "backend/.venv not found — run 'make setup' (falling back to system Python/uvicorn)"
[ -d "$FRONTEND/node_modules" ] || fail "frontend/node_modules missing — run 'cd frontend && npm install' (or 'make setup')"

REBUILD=0
[ "${1:-}" = "--rebuild-data" ] && REBUILD=1

if [ "$REBUILD" = "1" ] || [ ! -f "$ROOT/data/graph.json" ] || [ ! -f "$ROOT/data/layout.json" ]; then
  log "building dataset (compile -> validate -> layout)…"
  "$PY" "$ROOT/scripts/build_dataset.py"
  "$PY" "$ROOT/scripts/validate_dataset.py"
  "$PY" "$ROOT/scripts/generate_layout.py"
fi

# --- frontend port must be free -------------------------------------------
if port_in_use "$FRONTEND_PORT"; then
  fail "frontend port $FRONTEND_PORT is already in use.
      Stop whatever is using it, or pick another port:
        TECHATLAS_FRONTEND_PORT=5174 ./dev.sh"
fi

# --- cleanup only the servers WE start ------------------------------------
PIDS=()
cleanup() {
  log "shutting down…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- backend: reuse if healthy, else start (or fail if port is taken) -----
START_BACKEND=1
if port_in_use "$BACKEND_PORT"; then
  if backend_is_ours; then
    log "reusing the TechAtlas backend already running on :$BACKEND_PORT"
    START_BACKEND=0
  else
    fail "port $BACKEND_PORT is in use by something that is NOT the TechAtlas API.
      Free it (e.g. 'pkill -f \"uvicorn app.main:app\"'), or pick another port:
        TECHATLAS_BACKEND_PORT=8001 ./dev.sh"
  fi
fi

if [ "$START_BACKEND" = "1" ]; then
  log "starting backend  -> http://localhost:$BACKEND_PORT  (docs at /docs)"
  (
    cd "$BACKEND"
    exec "$UVICORN" app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload
  ) &
  PIDS+=("$!")

  # Wait for the backend to answer before launching the frontend.
  log "waiting for backend health…"
  up=0
  for _ in $(seq 1 40); do
    if backend_is_ours; then up=1; break; fi
    sleep 0.5
  done
  [ "$up" = "1" ] && log "backend is up." || warn "backend did not report healthy in time — starting frontend anyway."
fi

# --- frontend --------------------------------------------------------------
log "starting frontend -> http://localhost:$FRONTEND_PORT"
(
  cd "$FRONTEND"
  exec env TECHATLAS_API="http://127.0.0.1:$BACKEND_PORT" \
    npm run dev -- --port "$FRONTEND_PORT" --strictPort
) &
PIDS+=("$!")

log "open http://localhost:$FRONTEND_PORT  — press Ctrl-C to stop."

# Wait on either server; if one dies, cleanup (via trap) tears down the other.
wait -n 2>/dev/null || wait
