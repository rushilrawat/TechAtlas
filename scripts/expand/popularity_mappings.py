#!/usr/bin/env python3
"""Phase 1D — add optional `repo` / `package` popularity-source mappings to nodes.

These are additive, hand-verified identifiers the popularity pipeline uses to fetch
public metrics (GitHub stars/activity, package download counts). A technology with
NEITHER mapping simply has no popularity data and is marked missing downstream — never
zero-filled, never invented.

This edits data/seed/technologies.json in place, setting fields on existing nodes by
id. It adds no nodes and no edges. Re-running is idempotent.
"""
from __future__ import annotations

import json
from pathlib import Path

SEED = Path(__file__).resolve().parent.parent.parent / "data" / "seed"
TECH = SEED / "technologies.json"


def pkg(ecosystem: str, name: str) -> dict:
    return {"ecosystem": ecosystem, "name": name}


# slug -> {"repo": "owner/name", "package": {...}}  (either or both)
MAPPINGS: dict[str, dict] = {
    # Languages / runtimes
    "typescript": {"repo": "microsoft/TypeScript", "package": pkg("npm", "typescript")},
    "rust": {"repo": "rust-lang/rust"},
    "go": {"repo": "golang/go"},
    "nodejs": {"repo": "nodejs/node"},
    "deno": {"repo": "denoland/deno"},
    "bun": {"repo": "oven-sh/bun"},
    "zig": {"repo": "ziglang/zig"},
    "kotlin": {"repo": "JetBrains/kotlin"},
    "elixir": {"repo": "elixir-lang/elixir"},
    "dart": {"repo": "dart-lang/sdk"},
    "solidity": {"repo": "ethereum/solidity"},
    # Frontend
    "react": {"repo": "facebook/react", "package": pkg("npm", "react")},
    "vue": {"repo": "vuejs/core", "package": pkg("npm", "vue")},
    "angular": {"repo": "angular/angular", "package": pkg("npm", "@angular/core")},
    "svelte": {"repo": "sveltejs/svelte", "package": pkg("npm", "svelte")},
    "solidjs": {"repo": "solidjs/solid", "package": pkg("npm", "solid-js")},
    "preact": {"repo": "preactjs/preact", "package": pkg("npm", "preact")},
    "nextjs": {"repo": "vercel/next.js", "package": pkg("npm", "next")},
    "nuxt": {"repo": "nuxt/nuxt", "package": pkg("npm", "nuxt")},
    "astro": {"repo": "withastro/astro", "package": pkg("npm", "astro")},
    "remix": {"repo": "remix-run/remix", "package": pkg("npm", "@remix-run/react")},
    "vite": {"repo": "vitejs/vite", "package": pkg("npm", "vite")},
    "esbuild": {"repo": "evanw/esbuild", "package": pkg("npm", "esbuild")},
    "webpack": {"repo": "webpack/webpack", "package": pkg("npm", "webpack")},
    "tailwind-css": {"repo": "tailwindlabs/tailwindcss", "package": pkg("npm", "tailwindcss")},
    "redux": {"repo": "reduxjs/redux", "package": pkg("npm", "redux")},
    "zustand": {"repo": "pmndrs/zustand", "package": pkg("npm", "zustand")},
    "tanstack-query": {"repo": "TanStack/query", "package": pkg("npm", "@tanstack/react-query")},
    "mui": {"repo": "mui/material-ui", "package": pkg("npm", "@mui/material")},
    "d3": {"repo": "d3/d3", "package": pkg("npm", "d3")},
    "threejs": {"repo": "mrdoob/three.js", "package": pkg("npm", "three")},
    "sigmajs": {"repo": "jacomyal/sigma.js", "package": pkg("npm", "sigma")},
    "graphology": {"repo": "graphology/graphology", "package": pkg("npm", "graphology")},
    # Backend
    "express": {"repo": "expressjs/express", "package": pkg("npm", "express")},
    "fastify": {"repo": "fastify/fastify", "package": pkg("npm", "fastify")},
    "nestjs": {"repo": "nestjs/nest", "package": pkg("npm", "@nestjs/core")},
    "fastapi": {"repo": "fastapi/fastapi", "package": pkg("pypi", "fastapi")},
    "django": {"repo": "django/django", "package": pkg("pypi", "django")},
    "flask": {"repo": "pallets/flask", "package": pkg("pypi", "flask")},
    "celery": {"repo": "celery/celery", "package": pkg("pypi", "celery")},
    "spring-boot": {"repo": "spring-projects/spring-boot"},
    "gin": {"repo": "gin-gonic/gin"},
    "rails": {"repo": "rails/rails", "package": pkg("rubygems", "rails")},
    "laravel": {"repo": "laravel/laravel", "package": pkg("packagist", "laravel/framework")},
    "socketio": {"repo": "socketio/socket.io", "package": pkg("npm", "socket.io")},
    # Databases / data
    "postgresql": {"repo": "postgres/postgres"},
    "redis": {"repo": "redis/redis"},
    "sqlite": {"repo": "sqlite/sqlite"},
    "mariadb": {"repo": "MariaDB/server"},
    "mongodb": {"repo": "mongodb/mongo"},
    "cassandra": {"repo": "apache/cassandra"},
    "elasticsearch": {"repo": "elastic/elasticsearch"},
    "neo4j": {"repo": "neo4j/neo4j"},
    "duckdb": {"repo": "duckdb/duckdb"},
    "clickhouse": {"repo": "ClickHouse/ClickHouse"},
    "cockroachdb": {"repo": "cockroachdb/cockroach"},
    "influxdb": {"repo": "influxdata/influxdb"},
    "supabase": {"repo": "supabase/supabase"},
    "prisma": {"repo": "prisma/prisma", "package": pkg("npm", "prisma")},
    "sqlalchemy": {"repo": "sqlalchemy/sqlalchemy", "package": pkg("pypi", "sqlalchemy")},
    "spark": {"repo": "apache/spark"},
    "kafka": {"repo": "apache/kafka"},
    "airflow": {"repo": "apache/airflow", "package": pkg("pypi", "apache-airflow")},
    "flink": {"repo": "apache/flink"},
    "duckdb-dbt": {"repo": "dbt-labs/dbt-core", "package": pkg("pypi", "dbt-core")},
    "valkey": {"repo": "valkey-io/valkey"},
    # AI / ML
    "pytorch": {"repo": "pytorch/pytorch", "package": pkg("pypi", "torch")},
    "tensorflow": {"repo": "tensorflow/tensorflow", "package": pkg("pypi", "tensorflow")},
    "keras": {"repo": "keras-team/keras", "package": pkg("pypi", "keras")},
    "jax": {"repo": "jax-ml/jax", "package": pkg("pypi", "jax")},
    "scikit-learn": {"repo": "scikit-learn/scikit-learn", "package": pkg("pypi", "scikit-learn")},
    "numpy": {"repo": "numpy/numpy", "package": pkg("pypi", "numpy")},
    "pandas": {"repo": "pandas-dev/pandas", "package": pkg("pypi", "pandas")},
    "matplotlib": {"repo": "matplotlib/matplotlib", "package": pkg("pypi", "matplotlib")},
    "xgboost": {"repo": "dmlc/xgboost", "package": pkg("pypi", "xgboost")},
    "opencv": {"repo": "opencv/opencv", "package": pkg("pypi", "opencv-python")},
    "spacy": {"repo": "explosion/spaCy", "package": pkg("pypi", "spacy")},
    "huggingface-transformers": {"repo": "huggingface/transformers", "package": pkg("pypi", "transformers")},
    "langchain": {"repo": "langchain-ai/langchain", "package": pkg("pypi", "langchain")},
    "llamaindex": {"repo": "run-llama/llama_index", "package": pkg("pypi", "llama-index")},
    "ollama": {"repo": "ollama/ollama"},
    "mlflow": {"repo": "mlflow/mlflow", "package": pkg("pypi", "mlflow")},
    "ray": {"repo": "ray-project/ray", "package": pkg("pypi", "ray")},
    "jupyter": {"repo": "jupyter/notebook", "package": pkg("pypi", "notebook")},
    "chroma": {"repo": "chroma-core/chroma", "package": pkg("pypi", "chromadb")},
    "qdrant": {"repo": "qdrant/qdrant"},
    "vllm": {"repo": "vllm-project/vllm", "package": pkg("pypi", "vllm")},
    "gymnasium": {"repo": "Farama-Foundation/Gymnasium", "package": pkg("pypi", "gymnasium")},
    "dvc": {"repo": "iterative/dvc", "package": pkg("pypi", "dvc")},
    # Cloud / DevOps
    "docker": {"repo": "moby/moby"},
    "kubernetes": {"repo": "kubernetes/kubernetes"},
    "terraform": {"repo": "hashicorp/terraform"},
    "ansible": {"repo": "ansible/ansible", "package": pkg("pypi", "ansible")},
    "helm": {"repo": "helm/helm"},
    "prometheus": {"repo": "prometheus/prometheus"},
    "grafana": {"repo": "grafana/grafana"},
    "istio": {"repo": "istio/istio"},
    "argocd": {"repo": "argoproj/argo-cd"},
    "podman": {"repo": "containers/podman"},
    "containerd": {"repo": "containerd/containerd"},
    "pulumi": {"repo": "pulumi/pulumi"},
    "opentelemetry": {"repo": "open-telemetry/opentelemetry-specification"},
    "vault": {"repo": "hashicorp/vault"},
    "envoy": {"repo": "envoyproxy/envoy"},
    "consul": {"repo": "hashicorp/consul"},
    "minio": {"repo": "minio/minio"},
    "temporal": {"repo": "temporalio/temporal"},
    # Security
    "openssl": {"repo": "openssl/openssl"},
    "keycloak": {"repo": "keycloak/keycloak"},
    "wireshark": {"repo": "wireshark/wireshark"},
    "metasploit": {"repo": "rapid7/metasploit-framework"},
    "nmap": {"repo": "nmap/nmap"},
    "falco": {"repo": "falcosecurity/falco"},
    "trivy": {"repo": "aquasecurity/trivy"},
    # Mobile / desktop
    "flutter": {"repo": "flutter/flutter"},
    "react-native": {"repo": "facebook/react-native", "package": pkg("npm", "react-native")},
    "electron": {"repo": "electron/electron", "package": pkg("npm", "electron")},
    "tauri": {"repo": "tauri-apps/tauri"},
    "expo": {"repo": "expo/expo", "package": pkg("npm", "expo")},
    "capacitor": {"repo": "ionic-team/capacitor", "package": pkg("npm", "@capacitor/core")},
    # Systems
    "llvm": {"repo": "llvm/llvm-project"},
    "qemu": {"repo": "qemu/qemu"},
    "freertos": {"repo": "FreeRTOS/FreeRTOS"},
    "wasmtime": {"repo": "bytecodealliance/wasmtime"},
    "wasmer": {"repo": "wasmerio/wasmer"},
    "systemd": {"repo": "systemd/systemd"},
    # Testing / tooling
    "git": {"repo": "git/git"},
    "playwright": {"repo": "microsoft/playwright", "package": pkg("npm", "playwright")},
    "pytest": {"repo": "pytest-dev/pytest", "package": pkg("pypi", "pytest")},
    "vitest": {"repo": "vitest-dev/vitest", "package": pkg("npm", "vitest")},
    "eslint": {"repo": "eslint/eslint", "package": pkg("npm", "eslint")},
    "jest": {"repo": "jestjs/jest", "package": pkg("npm", "jest")},
    "cypress": {"repo": "cypress-io/cypress", "package": pkg("npm", "cypress")},
    "selenium": {"repo": "SeleniumHQ/selenium"},
    "prettier": {"repo": "prettier/prettier", "package": pkg("npm", "prettier")},
    "ruff": {"repo": "astral-sh/ruff", "package": pkg("pypi", "ruff")},
    "mypy": {"repo": "python/mypy", "package": pkg("pypi", "mypy")},
    "uv": {"repo": "astral-sh/uv", "package": pkg("pypi", "uv")},
    "vscode": {"repo": "microsoft/vscode"},
    "testcontainers": {"repo": "testcontainers/testcontainers-java"},
    "k6": {"repo": "grafana/k6"},
    # Game dev / graphics
    "godot": {"repo": "godotengine/godot"},
    "bevy": {"repo": "bevyengine/bevy", "package": pkg("crates", "bevy")},
    "blender": {"repo": "blender/blender"},
    "pygame": {"repo": "pygame/pygame", "package": pkg("pypi", "pygame")},
    # Misc widely used
    "protobuf": {"repo": "protocolbuffers/protobuf"},
}


def main() -> None:
    nodes = json.loads(TECH.read_text(encoding="utf-8"))
    by_slug = {n["slug"]: n for n in nodes}
    updated = 0
    missing: list[str] = []
    for slug, mapping in MAPPINGS.items():
        node = by_slug.get(slug)
        if node is None:
            missing.append(slug)
            continue
        changed = False
        if "repo" in mapping and node.get("repo") != mapping["repo"]:
            node["repo"] = mapping["repo"]
            changed = True
        if "package" in mapping and node.get("package") != mapping["package"]:
            node["package"] = mapping["package"]
            changed = True
        if changed:
            updated += 1
    TECH.write_text(
        json.dumps(nodes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    mapped = sum(1 for n in nodes if n.get("repo") or n.get("package"))
    print(f"[popularity_mappings] updated {updated} nodes; {mapped} now have a source mapping")
    if missing:
        print(f"  WARNING: {len(missing)} mapping slug(s) not found: {missing}")


if __name__ == "__main__":
    main()
