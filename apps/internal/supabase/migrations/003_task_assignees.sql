-- Multi-assignee support: replace tasks.assignee_id with task_assignees junction table

-- 1. Create junction table
CREATE TABLE task_assignees (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id),
  UNIQUE(task_id, user_id)
);

-- 2. Migrate existing assignee data
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL;

-- 3. Drop the old column
ALTER TABLE tasks DROP COLUMN assignee_id;
