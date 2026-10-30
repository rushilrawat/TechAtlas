# TechAtlas developer tasks.
# Run `make help` for the list.

ROOT      := $(CURDIR)
BACKEND   := $(ROOT)/backend
FRONTEND  := $(ROOT)/frontend
VENV      := $(BACKEND)/.venv
PY        := $(VENV)/bin/python
PIP       := $(VENV)/bin/pip
UVICORN   := $(VENV)/bin/uvicorn
RUFF      := $(VENV)/bin/ruff
PYTEST    := $(VENV)/bin/pytest

# Fall back to system python3 if the venv isn't created yet.
ifeq ($(wildcard $(PY)),)
PY := python3
endif

BACKEND_PORT  ?= 8000
FRONTEND_PORT ?= 5173

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-frontend data dev dev-rebuild \
        backend frontend test test-backend test-frontend lint lint-backend \
        lint-frontend build clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## ---- setup ---------------------------------------------------------------

setup: setup-backend setup-frontend ## Install backend venv + frontend deps

setup-backend: ## Create backend venv and install (editable, with dev extras)
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -q --upgrade pip
	$(PIP) install -q -e "$(BACKEND)[dev]"
	@echo "backend ready: $(VENV)"

setup-frontend: ## Install frontend node modules
	cd $(FRONTEND) && npm install

## ---- data ----------------------------------------------------------------

data: ## Compile, validate, and lay out the dataset
	$(PY) scripts/build_dataset.py
	$(PY) scripts/validate_dataset.py
	$(PY) scripts/generate_layout.py

## ---- run -----------------------------------------------------------------

dev: ## Run backend + frontend together (builds data if missing)
	TECHATLAS_BACKEND_PORT=$(BACKEND_PORT) TECHATLAS_FRONTEND_PORT=$(FRONTEND_PORT) ./dev.sh

dev-rebuild: ## Like `dev`, but always rebuild the dataset first
	TECHATLAS_BACKEND_PORT=$(BACKEND_PORT) TECHATLAS_FRONTEND_PORT=$(FRONTEND_PORT) ./dev.sh --rebuild-data

backend: ## Run only the backend API
	cd $(BACKEND) && $(UVICORN) app.main:app --reload --port $(BACKEND_PORT)

frontend: ## Run only the frontend dev server
	cd $(FRONTEND) && TECHATLAS_API=http://127.0.0.1:$(BACKEND_PORT) npm run dev -- --port $(FRONTEND_PORT)

## ---- quality -------------------------------------------------------------

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend (pytest) tests
	cd $(BACKEND) && $(PYTEST) -q

test-frontend: ## Run frontend (vitest) tests
	cd $(FRONTEND) && npm test

lint: lint-backend lint-frontend ## Lint backend + frontend

lint-backend: ## Ruff-lint backend + scripts
	cd $(BACKEND) && $(RUFF) check app tests ../scripts

lint-frontend: ## Typecheck + eslint the frontend
	cd $(FRONTEND) && npm run typecheck && npm run lint

build: ## Build the frontend for production
	cd $(FRONTEND) && npm run build

clean: ## Remove generated data artifacts and build output
	rm -f data/graph.json data/layout.json
	rm -rf $(FRONTEND)/dist
	@echo "cleaned generated artifacts (run 'make data' to regenerate)"
