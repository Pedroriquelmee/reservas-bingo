/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_RESPONSABLE_TRATAMIENTO?: string;
  readonly VITE_CONTACTO_PRIVACIDAD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
