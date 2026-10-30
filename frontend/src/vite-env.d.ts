/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" when the build targets a static host (GitHub Pages) with no backend. */
  readonly VITE_STATIC_API?: string;
  /** Base URL of the Repo X-Ray scanner backend. When unset, Repo X-Ray is hidden. */
  readonly VITE_SCANNER_API?: string;
  /** "true" only in the e2e test-harness build; exposes a window renderer handle for tests. */
  readonly VITE_TEST_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
