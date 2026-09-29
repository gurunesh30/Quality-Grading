/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the AgriGrade API, e.g. `http://localhost:8000`.
   * Leave unset (or set to `mock`) to run against the fixtures in
   * `src/api/mock.ts`.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
