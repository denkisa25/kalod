interface ImportMetaEnv {
  /** Injected by astro.config.mjs via vite.define from the INDEXABLE env var.
   *  False for every build unless explicitly opted in at launch. */
  readonly SITE_INDEXABLE: boolean;
  /** Injected by astro.config.mjs via vite.define from the OPENER env var.
   *  False by default — CR-003 opens the site directly on the cue feed.
   *  OPENER=on restores the CR-001 opener island. */
  readonly SITE_OPENER: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
