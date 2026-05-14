import postgres from "postgres";

export function createClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL not set. Source apps/internal/.env.local before running.",
    );
  }
  return postgres(url, {
    prepare: false,
    idle_timeout: 10,
    max: 5,
  });
}
