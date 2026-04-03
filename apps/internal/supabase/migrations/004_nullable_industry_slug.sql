-- Allow prospects without an industry (e.g. Apollo imports)
ALTER TABLE prospects ALTER COLUMN industry_slug DROP NOT NULL;
