"""More ecosystems and config signals (Phase 1.5E).

Ruby (Gemfile), PHP (composer.json), .NET (*.csproj / *.fsproj), Dart/Flutter
(pubspec.yaml), Terraform (*.tf), Kubernetes manifests, Helm charts, Prisma schemas and
single-purpose tool configs (vercel.json, tailwind.config.*, ...). All static text
parsing: nothing is installed or executed.
"""
from __future__ import annotations

import json
import re

from .common import RawDetection


def _pkg(eco: str, name: str, path: str, rule: str, desc: str, *, direct: bool = True,
         status: str = "declared", ev: str = "dependency_manifest") -> RawDetection:
    return RawDetection(ecosystem=eco, package=name, node_id=None, evidence_type=ev,
                        file_path=path, description=desc, detection_status=status,
                        rule=rule, direct=direct)


def _node(node_id: str, path: str, rule: str, desc: str, *, status: str = "declared",
          ev: str = "configuration") -> RawDetection:
    return RawDetection(ecosystem=None, package=None, node_id=node_id, evidence_type=ev,
                        file_path=path, description=desc, detection_status=status, rule=rule)


# ---------------------------------------------------------------- Ruby
_GEM_RE = re.compile(r"""^\s*gem\s+['"]([A-Za-z0-9_.\-]+)['"]""", re.MULTILINE)
_RUBY_VER_RE = re.compile(r"""^\s*ruby\s+['"]""", re.MULTILINE)


def parse_gemfile(path: str, text: str) -> list[RawDetection]:
    out = [_pkg("rubygems", m.group(1), path, "ruby.gemfile",
                f"{m.group(1)} declared in Gemfile") for m in _GEM_RE.finditer(text)]
    out.append(_node("technology:ruby", path, "ruby.gemfile.language",
                     "Gemfile present (Ruby project)"))
    if _RUBY_VER_RE.search(text):
        out.append(_node("technology:ruby", path, "ruby.gemfile.version",
                         "Ruby version pinned in Gemfile"))
    return out


# ---------------------------------------------------------------- PHP
def parse_composer_json(path: str, text: str) -> list[RawDetection]:
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    out: list[RawDetection] = [_node("technology:php", path, "php.composer.language",
                                     "composer.json present (PHP project)")]
    for field in ("require", "require-dev"):
        deps = data.get(field)
        if not isinstance(deps, dict):
            continue
        for name in deps:
            if not isinstance(name, str) or name == "php" or name.startswith("ext-"):
                continue
            out.append(_pkg("packagist", name, path, "php.composer",
                            f"{name} declared in composer.json ({field})"))
    return out


# ---------------------------------------------------------------- .NET
_PKG_REF_RE = re.compile(r"""<PackageReference\s+Include\s*=\s*["']([^"']+)["']""", re.I)
_SDK_RE = re.compile(r"""<Project\s+Sdk\s*=\s*["']([^"']+)["']""", re.I)


def parse_dotnet_project(path: str, text: str) -> list[RawDetection]:
    out = [_node("technology:dotnet", path, "dotnet.project", f"{path.rsplit('/', 1)[-1]} "
                 "present (.NET project)")]
    lang = "technology:csharp" if path.endswith(".csproj") else None
    if lang:
        out.append(_node(lang, path, "dotnet.csproj.language", "C# project file"))
    sdk = _SDK_RE.search(text)
    if sdk and sdk.group(1).startswith("Microsoft.NET.Sdk.Web"):
        out.append(_node("technology:aspnet-core", path, "dotnet.sdk.web",
                         "project uses the ASP.NET Core web SDK"))
    for m in _PKG_REF_RE.finditer(text):
        out.append(_pkg("nuget", m.group(1), path, "dotnet.package_reference",
                        f"{m.group(1)} referenced in {path.rsplit('/', 1)[-1]}"))
    return out


# ---------------------------------------------------------------- Dart / Flutter
def parse_pubspec(path: str, text: str) -> list[RawDetection]:
    out = [_node("technology:dart", path, "dart.pubspec", "pubspec.yaml present (Dart project)")]
    section = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        key = line.strip().split(":", 1)[0].strip()
        if indent == 0:
            section = key if key in ("dependencies", "dev_dependencies") else None
            continue
        if section and indent == 2 and re.fullmatch(r"[a-z0-9_]+", key):
            out.append(_pkg("pub", key, path, "dart.pubspec.dependency",
                            f"{key} declared in pubspec.yaml ({section})",
                            direct=True))
    return out


# ---------------------------------------------------------------- Terraform
_TF_PROVIDER_RE = re.compile(r'^\s*provider\s+"([a-z0-9_-]+)"', re.MULTILINE)
_TF_SOURCE_RE = re.compile(r'source\s*=\s*"(?:registry\.terraform\.io/)?[a-z0-9-]+/([a-z0-9_-]+)"')
_TF_RESOURCE_RE = re.compile(r'^\s*(?:resource|data)\s+"([a-z0-9_]+)"', re.MULTILINE)
_TF_PROVIDERS = {
    "aws": "technology:aws", "google": "technology:gcp", "azurerm": "technology:azure",
    "kubernetes": "technology:kubernetes", "helm": "technology:helm",
    "cloudflare": "technology:cloudflare", "vercel": "technology:vercel",
    "netlify": "technology:netlify", "datadog": "technology:datadog",
    "github": "technology:github", "vault": "technology:vault", "docker": "technology:docker",
}
_TF_RESOURCES = {
    "aws_s3_": "technology:amazon-s3", "aws_lambda_": "technology:aws-lambda",
    "aws_dynamodb_": "technology:dynamodb", "google_bigquery_": "technology:bigquery",
    "aws_eks_": "technology:kubernetes", "google_container_cluster": "technology:kubernetes",
    "azurerm_kubernetes_cluster": "technology:kubernetes",
}


def parse_terraform(path: str, text: str) -> list[RawDetection]:
    out = [
        _node("technology:terraform", path, "infra.terraform", "Terraform configuration"),
        _node("concept:infrastructure-as-code", path, "infra.terraform.concept",
              "infrastructure as code inferred from Terraform", status="inferred",
              ev="inferred_pattern"),
    ]
    providers = set(_TF_PROVIDER_RE.findall(text)) | set(_TF_SOURCE_RE.findall(text))
    for p in sorted(providers):
        if p in _TF_PROVIDERS:
            out.append(_node(_TF_PROVIDERS[p], path, "infra.terraform.provider",
                             f"Terraform provider '{p}'"))
    for res in sorted(set(_TF_RESOURCE_RE.findall(text))):
        for prefix, nid in _TF_RESOURCES.items():
            if res.startswith(prefix):
                out.append(_node(nid, path, "infra.terraform.resource",
                                 f"Terraform resource {res}"))
    return out


# ---------------------------------------------------------------- Kubernetes / Helm
_K8S_KINDS = {"Deployment", "StatefulSet", "DaemonSet", "Service", "Ingress", "CronJob",
              "Job", "ConfigMap", "Pod", "HorizontalPodAutoscaler", "Namespace"}
_KIND_RE = re.compile(r"^kind:\s*([A-Za-z]+)\s*$", re.MULTILINE)


def parse_k8s_manifest(path: str, text: str) -> list[RawDetection]:
    if "apiVersion:" not in text:
        return []
    kinds = set(_KIND_RE.findall(text)) & _K8S_KINDS
    base = path.rsplit("/", 1)[-1]
    if not kinds and not base.startswith("kustomization."):
        return []
    what = ", ".join(sorted(kinds)) or "kustomization"
    return [
        _node("technology:kubernetes", path, "infra.k8s", f"Kubernetes manifest ({what})"),
        _node("concept:container-orchestration", path, "infra.k8s.concept",
              "container orchestration inferred from Kubernetes manifests",
              status="inferred", ev="inferred_pattern"),
    ]


def parse_helm_chart(path: str, text: str) -> list[RawDetection]:
    return [
        _node("technology:helm", path, "infra.helm", "Helm chart (Chart.yaml)"),
        _node("technology:kubernetes", path, "infra.helm.k8s",
              "a Helm chart deploys to Kubernetes", status="inferred", ev="inferred_pattern"),
    ]


# ---------------------------------------------------------------- Prisma
_PRISMA_PROVIDER_RE = re.compile(r'datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([a-z]+)"', re.S)
_PRISMA_DB = {"postgresql": "technology:postgresql", "postgres": "technology:postgresql",
              "mysql": "technology:mysql", "sqlite": "technology:sqlite",
              "mongodb": "technology:mongodb", "cockroachdb": "technology:cockroachdb"}


def parse_prisma_schema(path: str, text: str) -> list[RawDetection]:
    out = [_node("technology:prisma", path, "js.prisma_schema", "Prisma schema"),
           _node("concept:orm", path, "js.prisma_schema.orm",
                 "ORM inferred from a Prisma schema", status="inferred", ev="inferred_pattern")]
    m = _PRISMA_PROVIDER_RE.search(text)
    if m and m.group(1) in _PRISMA_DB:
        out.append(_node(_PRISMA_DB[m.group(1)], path, "js.prisma_schema.provider",
                         f"Prisma datasource provider '{m.group(1)}'"))
    return out


# ---------------------------------------------------------------- one-file tool configs
# basename (exact) or basename prefix ending in "." -> (node id, description)
CONFIG_FILES: dict[str, tuple[str, str]] = {
    "vercel.json": ("technology:vercel", "Vercel project configuration"),
    "netlify.toml": ("technology:netlify", "Netlify configuration"),
    "wrangler.toml": ("technology:cloudflare-workers", "Cloudflare Workers configuration"),
    "wrangler.jsonc": ("technology:cloudflare-workers", "Cloudflare Workers configuration"),
    ".gitlab-ci.yml": ("technology:gitlab-ci", "GitLab CI pipeline"),
    "Jenkinsfile": ("technology:jenkins", "Jenkins pipeline"),
    "deno.json": ("technology:deno", "Deno configuration"),
    "deno.jsonc": ("technology:deno", "Deno configuration"),
    "bunfig.toml": ("technology:bun", "Bun configuration"),
    "bun.lockb": ("technology:bun", "Bun lockfile"),
    "bun.lock": ("technology:bun", "Bun lockfile"),
    "Pulumi.yaml": ("technology:pulumi", "Pulumi project"),
    "ansible.cfg": ("technology:ansible", "Ansible configuration"),
    "tailwind.config.": ("technology:tailwind-css", "Tailwind CSS configuration"),
    "svelte.config.": ("technology:svelte", "Svelte configuration"),
    "astro.config.": ("technology:astro", "Astro configuration"),
    "nuxt.config.": ("technology:nuxt", "Nuxt configuration"),
    "playwright.config.": ("technology:playwright", "Playwright configuration"),
    "vitest.config.": ("technology:vitest", "Vitest configuration"),
    "jest.config.": ("technology:jest", "Jest configuration"),
    "cypress.config.": ("technology:cypress", "Cypress configuration"),
    "webpack.config.": ("technology:webpack", "webpack configuration"),
    "eslint.config.": ("technology:eslint", "ESLint configuration"),
    ".eslintrc": ("technology:eslint", "ESLint configuration"),
    ".prettierrc": ("technology:prettier", "Prettier configuration"),
    "babel.config.": ("technology:babel", "Babel configuration"),
    ".babelrc": ("technology:babel", "Babel configuration"),
    "biome.json": ("technology:biome", "Biome configuration"),
    "hardhat.config.": ("technology:hardhat", "Hardhat configuration"),
    "foundry.toml": ("technology:foundry", "Foundry configuration"),
    "mkdocs.yml": ("technology:python", "MkDocs site (Python tooling)"),
}


def config_target(base: str) -> tuple[str, str] | None:
    if base in CONFIG_FILES:
        return CONFIG_FILES[base]
    for key, val in CONFIG_FILES.items():
        if key.endswith(".") and base.startswith(key):
            return val
        if key.startswith(".") and base.startswith(key + "."):  # .eslintrc.json etc.
            return val
    return None


def parse_tool_config(path: str, text: str) -> list[RawDetection]:
    base = path.rsplit("/", 1)[-1]
    hit = config_target(base)
    if not hit:
        return []
    nid, desc = hit
    out = [_node(nid, path, "config.file", f"{base}: {desc}")]
    if nid in ("technology:gitlab-ci", "technology:jenkins"):
        out.append(_node("concept:ci-cd", path, "config.file.ci",
                         "CI/CD inferred from a pipeline definition", status="inferred",
                         ev="inferred_pattern"))
    return out


# ---------------------------------------------------------------- build tools by manifest
BUILD_TOOL_FILES: dict[str, tuple[str, str]] = {
    "Cargo.toml": ("technology:cargo", "Cargo manifest"),
    "pom.xml": ("technology:maven", "Maven project (pom.xml)"),
    "build.gradle": ("technology:gradle", "Gradle build script"),
    "build.gradle.kts": ("technology:gradle", "Gradle build script (Kotlin DSL)"),
    "settings.gradle": ("technology:gradle", "Gradle settings"),
    "settings.gradle.kts": ("technology:gradle", "Gradle settings (Kotlin DSL)"),
}


def build_tool_detections(path: str) -> list[RawDetection]:
    """The manifest itself is evidence of the build tool that reads it."""
    hit = BUILD_TOOL_FILES.get(path.rsplit("/", 1)[-1])
    return [_node(hit[0], path, "config.build_tool", hit[1])] if hit else []


# ---------------------------------------------------------------- languages by extension
LANG_EXT: dict[str, str] = {
    ".py": "technology:python", ".ipynb": "technology:jupyter",
    ".ts": "technology:typescript", ".tsx": "technology:typescript",
    ".mts": "technology:typescript", ".js": "technology:javascript",
    ".jsx": "technology:javascript", ".mjs": "technology:javascript",
    ".cjs": "technology:javascript", ".go": "technology:go", ".rs": "technology:rust",
    ".java": "technology:java", ".kt": "technology:kotlin", ".kts": "technology:kotlin",
    ".cs": "technology:csharp", ".rb": "technology:ruby", ".php": "technology:php",
    ".swift": "technology:swift", ".dart": "technology:dart", ".scala": "technology:scala",
    ".ex": "technology:elixir", ".exs": "technology:elixir", ".erl": "technology:erlang",
    ".hs": "technology:haskell", ".lua": "technology:lua", ".zig": "technology:zig",
    ".sol": "technology:solidity", ".c": "technology:c", ".cpp": "technology:cpp",
    ".cc": "technology:cpp", ".cxx": "technology:cpp", ".hpp": "technology:cpp",
    ".r": "technology:r-lang", ".jl": "technology:julia", ".ml": "technology:ocaml",
    ".clj": "technology:clojure", ".cljs": "technology:clojure", ".pl": "technology:perl",
    ".sh": "technology:bash", ".bash": "technology:bash", ".f90": "technology:fortran",
    ".sv": "technology:systemverilog", ".vhd": "technology:vhdl", ".vhdl": "technology:vhdl",
    ".asm": "technology:assembly", ".s": "technology:assembly", ".vue": "technology:vue",
    ".svelte": "technology:svelte", ".tf": "technology:terraform", ".lean": "technology:lean",
}
# Files that are tool configuration, not the project's own code (vite.config.js, ...).
_CONFIG_NAME_RE = re.compile(r"(^\.|\.config\.[a-z]+$|^(gulpfile|gruntfile|Gruntfile)\.)")
# Small "helper" languages need more than a stray file before they count.
_NEEDS_MORE = {"technology:bash", "technology:perl", "technology:assembly", "technology:c"}


def count_languages(paths: list[str]) -> dict[str, list[str]]:
    """Language node id -> example paths, from the full (non-excluded) file list."""
    hits: dict[str, list[str]] = {}
    for p in paths:
        base = p.rsplit("/", 1)[-1]
        if "." not in base or _CONFIG_NAME_RE.search(base):
            continue
        ext = base[base.rfind("."):].lower()
        nid = LANG_EXT.get(ext)
        if nid:
            hits.setdefault(nid, []).append(p)
    return hits


def language_detections(paths: list[str]) -> list[RawDetection]:
    hits = count_languages(paths)
    total = sum(len(v) for v in hits.values())
    out: list[RawDetection] = []
    for nid, files in sorted(hits.items()):
        n = len(files)
        share = n / total if total else 0
        # A language counts when it is a real part of the code: any file in a small repo,
        # otherwise at least 2 files and 3% of code (helpers like shell need more).
        if total > 20 and (n < 2 or share < 0.03):
            continue
        if nid in _NEEDS_MORE and n < 3 and share < 0.10:
            continue
        out.append(RawDetection(
            ecosystem=None, package=None, node_id=nid, evidence_type="file_extension",
            file_path=files[0], description=f"{n} {nid.split(':', 1)[1]} file(s) "
            f"({share:.0%} of code files)", detection_status="confirmed",
            rule="lang.extension"))
    return out
