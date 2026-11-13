# Real-repository corpus

`corpus/real-*` holds 107 snapshots of popular public GitHub repositories (JS/TS, Python, Go,
Rust, Java/Kotlin, Ruby, PHP, C#, Dart/Flutter and a few polyglot monorepos), fetched
2026-11-13 from each repository's default-branch HEAD. `corpus/neg-*` holds hand-written
noise traps.

## What a snapshot contains

Build manifests and tool configs only (package.json, pyproject.toml, go.mod, Cargo.toml,
pom.xml, Gemfile, composer.json, *.csproj, pubspec.yaml, Dockerfiles, compose files, CI
workflows, framework configs), unmodified. No source code and **no lockfiles**, to keep the
repository small. `SOURCE.txt` in each fixture lists the upstream URL and the files taken.

## How ground truth was made

1. Ground truth was written by hand from the snapshot files, before the scanner was run.
2. The scanner was run and every disagreement was reviewed against its evidence:
   * A detection backed by a direct declaration of that technology's own package (or its
     config file) that the author had left out was added, marked `"added_in_review": true`
     with the evidence (465 entries; the hand-written first draft was too thin).
   * A same-name package that is something else (PyPI `babel`, the `nix` crate, npm `net`,
     Dart `html`, `com.auth0:java-jwt`, `sentence-transformers`, `seaborn`) stayed a false
     positive.
   * A technology seen only as an indirect dependency (`// indirect` in go.mod) stayed a
     false positive.
   * Hand-written entries with no evidence in the snapshot were removed (9 entries in 7
     repos, e.g. `express` for the express repository itself).
3. Scoring for real snapshots (`scoring` in ground-truth.json): technologies only (concepts
   are derived from them), languages ignored (detecting them needs the full tree), and
   `nodejs`, `npm`, `pip`, `json`, `yaml` are optional (neither credited nor penalised).

## Results (micro-averaged, final ground truth)

| | Precision | Recall | FP | FN |
|---|---|---|---|---|
| Scanner 1.5e (before) | 94.6% | 85.9% | 49 | 140 |
| Scanner 1.5f (after) | 100% | 98.6% | 0 | 14 |
| Noise traps, before | 12 false positives across 10 traps | | | |
| Noise traps, after | 0 false positives | | | |

Caveats: precision is optimistic, because entries added in review came from the scanner's
own output; a wrong call in review would hide a false positive. Snapshots have no lockfiles
or source, so lockfile handling and source-import detection are not exercised here.
Remaining misses: Gradle plugins and version-catalog-only libraries (Android SDK, Compose,
Kotlin Multiplatform, Firebase), dependencies listed only in setup.py, `jest` declared only
through `@types/jest`, and test libraries brought in by starters (JUnit via
spring-boot-starter-test).
