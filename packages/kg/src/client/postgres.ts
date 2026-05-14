import postgres, { type Sql } from "postgres";

export type PostgresClient = Sql;

export function createPostgresClient(url: string): PostgresClient {
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}
