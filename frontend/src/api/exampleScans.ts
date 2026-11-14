// Pre-computed Repo X-Ray results for well-known repositories.
//
// Built by scripts/build_example_scans.py with the real scanner pipeline and committed
// under public/example-scans/. They make X-Ray useful on the static Pages site (no
// backend needed) and instant even when a backend is configured but cold.

import index from "../data/exampleScans.json";
import type { RepoScan } from "./types";

export interface ExampleScanMeta {
  slug: string;
  repo: string;
  tagline: string;
  language: string | null;
  technologies: number;
  concepts: number;
  commit: string;
  scanned_on: string | null;
}

export const EXAMPLE_SCANS: ExampleScanMeta[] = index as ExampleScanMeta[];

export function findExample(slug: string | null | undefined): ExampleScanMeta | null {
  if (!slug) return null;
  return EXAMPLE_SCANS.find((e) => e.slug === slug) ?? null;
}

/** The example for a repository, if one was pre-computed (case-insensitive). */
export function exampleForRepo(owner: string, name: string): ExampleScanMeta | null {
  const repo = `${owner}/${name}`.toLowerCase();
  return EXAMPLE_SCANS.find((e) => e.repo.toLowerCase() === repo) ?? null;
}

export async function loadExampleScan(slug: string, signal?: AbortSignal): Promise<RepoScan> {
  const res = await fetch(`${import.meta.env.BASE_URL}example-scans/${encodeURIComponent(slug)}.json`, { signal });
  if (!res.ok) throw new Error(`Example scan ${slug} not found (${res.status}).`);
  return (await res.json()) as RepoScan;
}

/** URL helpers: ?xray=<slug> opens X-Ray on that example, so results can be shared. */
export function readExampleParam(search: string): string | null {
  const slug = new URLSearchParams(search).get("xray");
  return findExample(slug) ? slug : null;
}
export function writeExampleParam(search: string, slug: string | null): string {
  const params = new URLSearchParams(search);
  if (slug) params.set("xray", slug); else params.delete("xray");
  return params.toString();
}
