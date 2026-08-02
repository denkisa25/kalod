interface ImportMetaEnv {
  /** Injected by astro.config.mjs via vite.define from the INDEXABLE env var.
   *  False for every build unless explicitly opted in at launch. */
  readonly SITE_INDEXABLE: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
