// Stack recommender catalog (Phase 2). A "slot" is one job in a stack (database, web
// framework, CI...) with the atlas technologies that can fill it. An "archetype" is a kind
// of project and the slots it needs, in the order they are decided. Every candidate is a
// technology slug from the dataset; catalog.test.ts fails if one is missing, so the catalog
// can never recommend something the atlas does not contain.
//
// The catalog only says WHICH technologies compete for a slot. Which one is picked, and
// why, comes from the graph: relationships to what the project already uses, plus
// popularity. See recommend.ts.

export interface Slot {
  id: string;
  label: string;
  /** One line on what this slot does, shown under the pick. */
  role: string;
  candidates: string[];
}

export interface ArchetypeSlot {
  slot: string;
  /** Optional slots are suggested only when the graph gives a strong reason. */
  optional?: boolean;
}

export interface Archetype {
  id: string;
  label: string;
  blurb: string;
  /** Words in a project description that point at this archetype. */
  keywords: string[];
  slots: ArchetypeSlot[];
}

// Candidate order matters: it is the editorial prior (the usual default first). The graph
// then moves a candidate up when it is connected to what the project already uses.
export const SLOTS: Slot[] = [
  { id: "language", label: "Language", role: "What most of the code is written in.",
    candidates: ["typescript", "javascript", "python", "go", "java", "kotlin", "csharp", "rust", "ruby", "php", "elixir", "swift", "dart", "cpp", "c", "scala"] },
  { id: "ui", label: "UI library", role: "Builds the interface from components.",
    candidates: ["react", "vue", "svelte", "angular", "solidjs", "preact", "htmx"] },
  { id: "meta", label: "App framework", role: "Routing, rendering and the build around the UI.",
    candidates: ["nextjs", "remix", "nuxt", "sveltekit", "astro"] },
  { id: "styling", label: "Styling", role: "How the interface is styled.",
    candidates: ["tailwind-css", "shadcn-ui", "mui", "sass"] },
  { id: "client-state", label: "Data fetching & state", role: "Keeps server data and UI state in sync.",
    candidates: ["tanstack-query", "zustand", "redux", "vuex-pinia", "urql"] },
  { id: "backend", label: "Backend framework", role: "Serves the API and business logic.",
    candidates: ["fastapi", "express", "django", "nestjs", "spring-boot", "flask", "fastify", "hono", "gin", "rails", "laravel", "aspnet-core"] },
  { id: "api-style", label: "API contract", role: "How clients and services describe the API.",
    candidates: ["openapi", "graphql-apollo", "grpc"] },
  { id: "database", label: "Database", role: "The system of record.",
    candidates: ["postgresql", "mysql", "sqlite", "mongodb", "mariadb", "cockroachdb", "dynamodb", "supabase", "neon", "firebase"] },
  { id: "orm", label: "Data access", role: "Talks to the database from code.",
    candidates: ["prisma", "drizzle-orm", "sqlalchemy"] },
  { id: "cache", label: "Cache", role: "Keeps hot data and sessions fast.",
    candidates: ["redis", "valkey"] },
  { id: "queue", label: "Background jobs & events", role: "Runs work outside the request and connects services.",
    candidates: ["celery", "kafka", "rabbitmq", "nats", "temporal"] },
  { id: "auth", label: "Authentication", role: "Sign-in, sessions and identity.",
    candidates: ["auth0", "supabase", "keycloak", "firebase", "okta"] },
  { id: "payments", label: "Payments", role: "Takes money.",
    candidates: ["stripe"] },
  { id: "search", label: "Search", role: "Full-text and faceted search.",
    candidates: ["elasticsearch"] },
  { id: "hosting", label: "Hosting", role: "Where it runs in production.",
    candidates: ["aws", "vercel", "gcp", "azure", "cloudflare-workers", "netlify", "aws-lambda", "kubernetes"] },
  { id: "containers", label: "Containers", role: "Packages the app the same way everywhere.",
    candidates: ["docker", "docker-compose", "podman"] },
  { id: "iac", label: "Infrastructure as code", role: "Declares cloud resources in version control.",
    candidates: ["terraform", "opentofu", "pulumi", "helm"] },
  { id: "ci", label: "CI/CD", role: "Builds, tests and ships every change.",
    candidates: ["github-actions", "gitlab-ci", "argocd", "jenkins"] },
  { id: "unit-tests", label: "Unit tests", role: "Fast checks for individual pieces.",
    candidates: ["vitest", "jest", "pytest", "junit", "testcontainers"] },
  { id: "e2e-tests", label: "End-to-end tests", role: "Drives the real app in a browser.",
    candidates: ["playwright", "cypress", "selenium"] },
  { id: "lint", label: "Code quality", role: "Formatting, linting and type checks.",
    candidates: ["eslint", "prettier", "biome", "ruff", "mypy"] },
  { id: "package", label: "Package & build tool", role: "Installs dependencies and builds the project.",
    candidates: ["vite", "npm", "uv", "pip", "cargo", "gradle", "maven", "bun"] },
  { id: "observability", label: "Observability", role: "Errors, metrics and traces in production.",
    candidates: ["sentry", "opentelemetry", "prometheus", "grafana", "datadog"] },
  { id: "analytics", label: "Product analytics", role: "What people actually do in the product.",
    candidates: ["posthog", "google-analytics"] },
  { id: "mobile", label: "Mobile framework", role: "Builds the iOS and Android apps.",
    candidates: ["react-native", "expo", "flutter", "swiftui", "jetpack-compose", "kotlin-multiplatform", "capacitor", "dotnet-maui"] },
  { id: "desktop", label: "Desktop framework", role: "Builds the desktop app.",
    candidates: ["tauri", "electron", "qt", "flutter", "dotnet-maui"] },
  { id: "data-processing", label: "Data processing", role: "Transforms data at scale.",
    candidates: ["pandas", "polars", "spark", "duckdb", "flink"] },
  { id: "orchestration", label: "Pipeline orchestration", role: "Schedules and retries pipeline steps.",
    candidates: ["airflow", "temporal", "duckdb-dbt"] },
  { id: "warehouse", label: "Warehouse & lake", role: "Stores analytical data.",
    candidates: ["snowflake", "bigquery", "clickhouse", "duckdb", "delta-lake", "apache-iceberg"] },
  { id: "storage-format", label: "Storage format", role: "How analytical data sits on disk.",
    candidates: ["apache-parquet", "apache-arrow", "delta-lake", "apache-iceberg"] },
  { id: "ml-framework", label: "ML framework", role: "Trains models.",
    candidates: ["pytorch", "tensorflow", "jax", "scikit-learn", "xgboost", "keras"] },
  { id: "experiment", label: "Experiment tracking", role: "Records runs, metrics and models.",
    candidates: ["mlflow", "weights-biases", "dvc"] },
  { id: "notebook", label: "Notebooks", role: "Interactive exploration.",
    candidates: ["jupyter"] },
  { id: "llm-provider", label: "Model access", role: "Where the language model comes from.",
    candidates: ["openai-api", "ollama", "huggingface-transformers", "vllm", "llama-cpp"] },
  { id: "llm-framework", label: "LLM framework", role: "Prompts, tools, agents and retrieval.",
    candidates: ["langchain", "llamaindex", "langgraph", "dspy", "model-context-protocol"] },
  { id: "vector-db", label: "Vector store", role: "Finds similar embeddings for retrieval.",
    candidates: ["pgvector", "chroma", "qdrant", "pinecone"] },
  { id: "game-engine", label: "Game engine", role: "Rendering, physics and the game loop.",
    candidates: ["unity", "godot", "unreal-engine", "bevy", "pygame"] },
  { id: "graphics-api", label: "Graphics API", role: "Talks to the GPU.",
    candidates: ["vulkan", "webgpu", "opengl", "metal", "directx"] },
  { id: "assets", label: "3D assets", role: "Makes models and animation.",
    candidates: ["blender"] },
  { id: "board", label: "Hardware platform", role: "The board or chip the firmware runs on.",
    candidates: ["esp32", "arduino", "raspberry-pi"] },
  { id: "rtos", label: "Firmware OS", role: "Schedules tasks on the device.",
    candidates: ["freertos", "zephyr", "linux"] },
  { id: "iot-messaging", label: "Device messaging", role: "Moves data between devices and the cloud.",
    candidates: ["mosquitto", "aws-iot-core", "matter", "node-red"] },
  { id: "cli-lib", label: "Distribution", role: "Ships the tool to users' machines.",
    candidates: ["cargo", "npm", "uv", "pip"] },
];

export const ARCHETYPES: Archetype[] = [
  { id: "web-app", label: "Web app", blurb: "A product people use in the browser, with accounts and data.",
    keywords: ["web", "website", "web app", "saas", "dashboard", "frontend", "site", "portal", "marketplace", "store", "shop", "ecommerce", "e-commerce", "blog", "browser", "landing"],
    slots: [{ slot: "language" }, { slot: "ui" }, { slot: "meta" }, { slot: "backend", optional: true }, { slot: "styling" }, { slot: "client-state", optional: true },
      { slot: "database" }, { slot: "orm" }, { slot: "auth" }, { slot: "payments", optional: true }, { slot: "hosting" },
      { slot: "ci" }, { slot: "unit-tests" }, { slot: "e2e-tests" }, { slot: "lint" }, { slot: "observability" },
      { slot: "analytics", optional: true }] },
  { id: "api", label: "API or backend service", blurb: "A service other apps call, with its own data.",
    keywords: ["api", "backend", "service", "microservice", "microservices", "server", "rest", "graphql", "grpc", "endpoint", "webhook"],
    slots: [{ slot: "language" }, { slot: "backend" }, { slot: "api-style" }, { slot: "database" }, { slot: "orm", optional: true },
      { slot: "cache" }, { slot: "queue", optional: true }, { slot: "auth", optional: true }, { slot: "containers" },
      { slot: "hosting" }, { slot: "iac", optional: true }, { slot: "ci" }, { slot: "unit-tests" }, { slot: "lint" },
      { slot: "observability" }] },
  { id: "mobile", label: "Mobile app", blurb: "An iOS and Android app with a backend behind it.",
    keywords: ["mobile", "ios", "android", "iphone", "phone", "app store", "play store", "tablet"],
    slots: [{ slot: "mobile" }, { slot: "language" }, { slot: "client-state", optional: true }, { slot: "auth" },
      { slot: "database" }, { slot: "ci" }, { slot: "unit-tests" }, { slot: "observability" }, { slot: "analytics", optional: true }] },
  { id: "desktop", label: "Desktop app", blurb: "An installable app for Windows, macOS and Linux.",
    keywords: ["desktop", "windows", "macos", "linux app", "installer", "native app", "offline"],
    slots: [{ slot: "desktop" }, { slot: "language" }, { slot: "ui", optional: true }, { slot: "database", optional: true },
      { slot: "ci" }, { slot: "unit-tests" }, { slot: "lint" }] },
  { id: "llm-app", label: "AI / LLM app", blurb: "A product built around a language model: chat, agents or retrieval.",
    keywords: ["llm", "gpt", "claude", "chatbot", "chat", "agent", "agents", "rag", "retrieval", "embedding", "embeddings", "prompt", "copilot", "assistant", "genai", "generative"],
    slots: [{ slot: "language" }, { slot: "llm-provider" }, { slot: "llm-framework" }, { slot: "vector-db" }, { slot: "backend" },
      { slot: "database" }, { slot: "ui", optional: true }, { slot: "hosting" }, { slot: "observability" }, { slot: "unit-tests" }] },
  { id: "ml", label: "Machine learning", blurb: "Training and serving models on your own data.",
    keywords: ["machine learning", "ml", "model", "models", "training", "classifier", "prediction", "predict", "deep learning", "neural", "vision", "forecast", "recommendation", "recommender"],
    slots: [{ slot: "language" }, { slot: "notebook" }, { slot: "data-processing" }, { slot: "ml-framework" }, { slot: "experiment" },
      { slot: "storage-format", optional: true }, { slot: "backend" }, { slot: "containers" }, { slot: "hosting" }] },
  { id: "data", label: "Data pipeline", blurb: "Moving and transforming data for analytics.",
    keywords: ["data", "pipeline", "etl", "elt", "analytics", "warehouse", "lake", "lakehouse", "batch", "streaming", "ingest", "reporting", "bi"],
    slots: [{ slot: "language" }, { slot: "data-processing" }, { slot: "orchestration" }, { slot: "warehouse" },
      { slot: "storage-format" }, { slot: "queue", optional: true }, { slot: "containers" }, { slot: "iac", optional: true },
      { slot: "ci" }, { slot: "observability" }] },
  { id: "game", label: "Game", blurb: "A 2D or 3D game.",
    keywords: ["game", "games", "gaming", "3d", "2d", "multiplayer", "shooter", "platformer", "rpg", "vr", "ar", "xr"],
    slots: [{ slot: "game-engine" }, { slot: "language" }, { slot: "graphics-api", optional: true }, { slot: "assets" }, { slot: "ci" }] },
  { id: "cli", label: "Command-line tool", blurb: "A tool developers run in a terminal.",
    keywords: ["cli", "command line", "command-line", "terminal", "utility", "script", "devtool"],
    slots: [{ slot: "language" }, { slot: "cli-lib" }, { slot: "ci" }, { slot: "unit-tests" }, { slot: "lint" }] },
  { id: "iot", label: "Embedded / IoT", blurb: "Firmware on a device that talks to the cloud.",
    keywords: ["iot", "embedded", "firmware", "sensor", "sensors", "device", "devices", "microcontroller", "hardware", "robot", "smart home", "esp32", "arduino"],
    slots: [{ slot: "board" }, { slot: "language" }, { slot: "rtos" }, { slot: "iot-messaging" }, { slot: "database", optional: true },
      { slot: "hosting", optional: true }] },
];

/**
 * Which language you write when you USE a technology. The graph's written_in edges say
 * what a tool is implemented in (Ruff is written in Rust but used on Python code), so
 * language fit for a recommendation needs this separate, curated table. Technologies not
 * listed (databases, hosting, CI...) work from any language.
 */
export const USED_FROM: Record<string, string[]> = {
  react: ["typescript", "javascript"], vue: ["typescript", "javascript"], svelte: ["typescript", "javascript"],
  angular: ["typescript"], solidjs: ["typescript", "javascript"], preact: ["typescript", "javascript"],
  nextjs: ["typescript", "javascript"], remix: ["typescript", "javascript"], nuxt: ["typescript", "javascript"],
  sveltekit: ["typescript", "javascript"], astro: ["typescript", "javascript"],
  "shadcn-ui": ["typescript"], mui: ["typescript", "javascript"],
  "tanstack-query": ["typescript", "javascript"], redux: ["typescript", "javascript"], zustand: ["typescript", "javascript"],
  "vuex-pinia": ["typescript", "javascript"], urql: ["typescript", "javascript"],
  fastapi: ["python"], django: ["python"], flask: ["python"], celery: ["python"], sqlalchemy: ["python"],
  express: ["typescript", "javascript"], nestjs: ["typescript"], fastify: ["typescript", "javascript"],
  hono: ["typescript", "javascript"], prisma: ["typescript", "javascript"], "drizzle-orm": ["typescript"],
  "spring-boot": ["java", "kotlin"], gin: ["go"], rails: ["ruby"], laravel: ["php"], "aspnet-core": ["csharp"],
  vitest: ["typescript", "javascript"], jest: ["typescript", "javascript"], pytest: ["python"], junit: ["java", "kotlin"],
  testcontainers: ["java", "kotlin", "go", "python", "typescript", "csharp"],
  eslint: ["typescript", "javascript"], prettier: ["typescript", "javascript"], biome: ["typescript", "javascript"],
  ruff: ["python"], mypy: ["python"],
  vite: ["typescript", "javascript"], npm: ["typescript", "javascript"], bun: ["typescript", "javascript"],
  uv: ["python"], pip: ["python"], cargo: ["rust"], gradle: ["java", "kotlin"], maven: ["java", "kotlin"],
  "react-native": ["typescript", "javascript"], expo: ["typescript", "javascript"], flutter: ["dart"],
  swiftui: ["swift"], "jetpack-compose": ["kotlin"], "kotlin-multiplatform": ["kotlin"], capacitor: ["typescript", "javascript"],
  "dotnet-maui": ["csharp"], tauri: ["rust", "typescript"], electron: ["typescript", "javascript"], qt: ["cpp", "python"],
  pandas: ["python"], polars: ["python", "rust"], spark: ["python", "scala", "java"], flink: ["java", "python"],
  pytorch: ["python"], tensorflow: ["python"], jax: ["python"], "scikit-learn": ["python"], xgboost: ["python"], keras: ["python"],
  mlflow: ["python"], "weights-biases": ["python"], dvc: ["python"], jupyter: ["python"],
  langchain: ["python", "typescript"], llamaindex: ["python", "typescript"], langgraph: ["python", "typescript"], dspy: ["python"],
  "huggingface-transformers": ["python"], vllm: ["python"],
  unity: ["csharp"], "unreal-engine": ["cpp"], godot: ["csharp"], bevy: ["rust"], pygame: ["python"],
  esp32: ["c", "cpp"], arduino: ["cpp"], "raspberry-pi": ["python"], freertos: ["c"], zephyr: ["c"],
  airflow: ["python"], "duckdb-dbt": ["python"], temporal: ["go", "typescript", "python", "java"],
};

/** Default language per archetype, used only when nothing in the input implies one. */
export const DEFAULT_LANGUAGE: Record<string, string> = {
  "web-app": "typescript", api: "typescript", "llm-app": "python", ml: "python", data: "python",
  cli: "go", iot: "cpp", desktop: "typescript", mobile: "typescript", game: "csharp",
};

/** Words that make an optional slot worth filling. */
export const SLOT_TRIGGERS: Record<string, string[]> = {
  payments: ["payment", "payments", "pay", "checkout", "subscription", "subscriptions", "billing", "invoice", "marketplace", "ecommerce", "e-commerce", "shop", "store"],
  analytics: ["analytics", "funnel", "funnels", "metrics", "experiments", "a/b"],
  queue: ["queue", "queues", "background", "jobs", "job", "events", "event-driven", "async", "worker", "workers", "stream", "streaming", "realtime", "real-time", "notifications", "email"],
  "client-state": ["dashboard", "realtime", "real-time", "offline", "collaborative", "interactive"],
  auth: ["login", "auth", "authentication", "accounts", "account", "users", "user", "sign in", "sign-in", "signup", "sso", "multi-tenant", "teams"],
  iac: ["terraform", "infrastructure", "multi-region", "enterprise", "compliance"],
  search: ["search", "full-text", "catalog"],
  orm: ["crud", "admin", "relational", "schema", "migrations"],
  ui: ["ui", "interface", "frontend", "screen", "screens"],
  backend: ["backend", "api", "server", "rest"],
  database: ["data", "store", "save", "sync", "history", "users", "accounts"],
  hosting: ["cloud", "deploy", "hosted", "dashboard"],
  "graphics-api": ["engine", "renderer", "shader", "shaders", "rendering"],
  "storage-format": ["lake", "lakehouse", "parquet", "large", "terabytes", "petabytes"],
  "llm-framework": [], "vector-db": [],
};

export const SLOTS_BY_ID = new Map(SLOTS.map((s) => [s.id, s]));
export const ARCHETYPES_BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

/**
 * Common ways people write technology names in a description, mapped to dataset slugs.
 * Labels and slugs already match on their own; this covers nicknames and spellings.
 */
export const SYNONYMS: Record<string, string> = {
  postgres: "postgresql", pg: "postgresql", psql: "postgresql", mongo: "mongodb", k8s: "kubernetes",
  js: "javascript", ts: "typescript", node: "nodejs", "node.js": "nodejs", py: "python", golang: "go",
  "next.js": "nextjs", next: "nextjs", "react native": "react-native", rn: "react-native", tailwind: "tailwind-css",
  "vue.js": "vue", vuejs: "vue", "nuxt.js": "nuxt", "c#": "csharp", ".net": "dotnet", dotnet: "dotnet",
  "c++": "cpp", rails: "rails", "ruby on rails": "rails", "spring boot": "spring-boot", sklearn: "scikit-learn",
  "scikit learn": "scikit-learn", tf: "tensorflow", torch: "pytorch", openai: "openai-api", gpt: "openai-api",
  "hugging face": "huggingface-transformers", huggingface: "huggingface-transformers", gcp: "gcp",
  "google cloud": "gcp", aws: "aws", lambda: "aws-lambda", s3: "amazon-s3", "github actions": "github-actions",
  gha: "github-actions", terraform: "terraform", "unreal": "unreal-engine", ue5: "unreal-engine",
  sveltekit: "sveltekit", "svelte kit": "sveltekit", mui: "mui", "material ui": "mui", shadcn: "shadcn-ui",
  dynamo: "dynamodb", es: "elasticsearch", "elastic search": "elasticsearch", mcp: "model-context-protocol",
  supabase: "supabase", firebase: "firebase", "rabbit mq": "rabbitmq", "w&b": "weights-biases",
  wandb: "weights-biases", "react query": "tanstack-query", "tanstack query": "tanstack-query", pinia: "vuex-pinia",
};
