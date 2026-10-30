/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" when the build targets a static host (GitHub Pages) with no backend. */
  readonly VITE_STATIC_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
