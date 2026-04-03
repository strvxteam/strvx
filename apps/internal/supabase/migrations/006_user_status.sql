-- Add availability status to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';
