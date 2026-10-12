/* 0044 Study Planner template registry (Phase 12) */
--
-- Additive and idempotent. Nothing is dropped or truncated and no vocabulary
-- table is referenced: this only seeds the admin-managed template id and makes
-- sure the connection template columns exist on older deployments.

-- The active template every new personal copy is made from. An admin changes
-- it later through /api/admin/study-planner/template, which upserts this row.
INSERT INTO app_settings (key, value, updated_at)
VALUES ('study_planner.template_id', '1uA6I3fGgr9Sh4pKxmw5I6UVX6Ib4PKa2WCSCFgH-MTY', now())
ON CONFLICT (key) DO NOTHING;

-- Connections created before these columns existed keep template_id empty,
-- which simply means "template not recorded"; the switch flow fills it in.
ALTER TABLE study_planner_connections ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT '';
ALTER TABLE study_planner_connections ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1;
