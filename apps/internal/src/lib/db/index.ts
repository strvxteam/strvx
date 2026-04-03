import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL must use the postgres superuser (or service_role) connection.
// This bypasses RLS by design — all access control is handled in application
// code (getCurrentUser + Zod validation). The Calendly webhook and all server
// actions depend on this. Do NOT switch to a pooled/scoped connection without
// updating the webhook route to use a service_role client.
const connectionString = process.env.DATABASE_URL;

const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : null;
export const db = client
  ? drizzle(client, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);
