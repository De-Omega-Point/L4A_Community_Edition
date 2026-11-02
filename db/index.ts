import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeEnv = { DB?: D1Database };

let runtimeEnv: RuntimeEnv | undefined;

export function setDbEnv(env: RuntimeEnv) {
  runtimeEnv = env;
}

export function getDb() {
  if (!runtimeEnv?.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(runtimeEnv.DB, { schema });
}
