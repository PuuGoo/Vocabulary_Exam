CREATE TABLE IF NOT EXISTS content_folders (
  id serial PRIMARY KEY,
  name varchar(128) NOT NULL,
  normalized_name varchar(128) NOT NULL,
  parent_id integer REFERENCES content_folders(id) ON DELETE RESTRICT,
  owner_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  kind varchar(24) NOT NULL DEFAULT 'folder',
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options boolean NOT NULL DEFAULT false,
  shuffle_mode varchar(16) NOT NULL DEFAULT 'random',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS folder_access (
  id serial PRIMARY KEY,
  folder_id integer NOT NULL REFERENCES content_folders(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level varchar(16) NOT NULL CHECK (access_level IN ('viewer','editor','manager','deny')),
  granted_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_folders_parent_idx ON content_folders(parent_id);
CREATE INDEX IF NOT EXISTS content_folders_owner_idx ON content_folders(owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS content_folders_parent_name_idx ON content_folders(parent_id, normalized_name) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_folders_personal_owner_idx ON content_folders(owner_user_id) WHERE kind='personal_root' AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_folders_legacy_root_idx ON content_folders(kind) WHERE kind='legacy_root' AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS folder_access_folder_user_idx ON folder_access(folder_id,user_id);
CREATE INDEX IF NOT EXISTS folder_access_user_idx ON folder_access(user_id);

ALTER TABLE vocab_sets ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE RESTRICT;
ALTER TABLE vocab_sets ADD COLUMN IF NOT EXISTS publication_status varchar(16) NOT NULL DEFAULT 'draft';
ALTER TABLE category_documents ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE RESTRICT;
ALTER TABLE category_questions ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE RESTRICT;
ALTER TABLE category_questions ADD COLUMN IF NOT EXISTS publication_status varchar(16) NOT NULL DEFAULT 'draft';
ALTER TABLE question_import_batches ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE RESTRICT;
ALTER TABLE category_document_uploads ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE CASCADE;
ALTER TABLE writing_progress ADD COLUMN IF NOT EXISTS folder_id integer REFERENCES content_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vocab_sets_folder_idx ON vocab_sets(folder_id);
CREATE INDEX IF NOT EXISTS category_documents_folder_idx ON category_documents(folder_id);
CREATE INDEX IF NOT EXISTS category_questions_folder_idx ON category_questions(folder_id);
CREATE INDEX IF NOT EXISTS question_import_batches_folder_idx ON question_import_batches(folder_id);
CREATE INDEX IF NOT EXISTS category_document_uploads_folder_idx ON category_document_uploads(folder_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key='folder_acl_publication_backfilled') THEN
    UPDATE vocab_sets SET publication_status='published';
    UPDATE category_questions SET publication_status='published';
    INSERT INTO app_settings(key,value,updated_at) VALUES ('folder_acl_publication_backfilled','true',now()) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=now();
  END IF;
END $$;

DO $$
DECLARE r record; part text; parent_folder integer; child_folder integer; legacy_root integer;
BEGIN
  FOR r IN SELECT id FROM users WHERE role='admin' LOOP
    IF NOT EXISTS (SELECT 1 FROM content_folders WHERE owner_user_id=r.id AND kind='personal_root' AND archived_at IS NULL) THEN
      INSERT INTO content_folders(name,normalized_name,owner_user_id,kind,created_by) VALUES ('Không gian của tôi','không gian của tôi',r.id,'personal_root',r.id);
    END IF;
  END LOOP;
  SELECT id INTO legacy_root FROM content_folders WHERE kind='legacy_root' AND archived_at IS NULL LIMIT 1;
  IF legacy_root IS NULL THEN
    INSERT INTO content_folders(name,normalized_name,kind) VALUES ('Nội dung chung hiện tại','nội dung chung hiện tại','legacy_root') RETURNING id INTO legacy_root;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key='folder_acl_legacy_content_mapped') THEN
  CREATE TEMP TABLE legacy_folder_map(path text PRIMARY KEY,folder_id integer) ON COMMIT DROP;
  INSERT INTO legacy_folder_map VALUES ('',legacy_root);
  FOR r IN
    SELECT DISTINCT category AS path FROM (
      SELECT category FROM vocab_sets UNION SELECT category FROM category_documents UNION SELECT category FROM category_questions
      UNION SELECT category FROM question_import_batches UNION SELECT category FROM category_document_uploads
      UNION SELECT category FROM writing_progress UNION SELECT name FROM vocab_categories
    ) paths WHERE category IS NOT NULL AND btrim(category)<>'' ORDER BY category
  LOOP
    parent_folder:=legacy_root;
    FOREACH part IN ARRAY regexp_split_to_array(r.path,'\s*/\s*') LOOP
      part:=btrim(part); CONTINUE WHEN part='';
      SELECT id INTO child_folder FROM content_folders WHERE parent_id=parent_folder AND normalized_name=lower(part) AND archived_at IS NULL LIMIT 1;
      IF child_folder IS NULL THEN INSERT INTO content_folders(name,normalized_name,parent_id,kind) VALUES (left(part,128),left(lower(part),128),parent_folder,'folder') RETURNING id INTO child_folder; END IF;
      parent_folder:=child_folder;
    END LOOP;
    INSERT INTO legacy_folder_map VALUES (r.path,parent_folder) ON CONFLICT(path) DO UPDATE SET folder_id=excluded.folder_id;
  END LOOP;
  UPDATE vocab_sets x SET folder_id=coalesce(m.folder_id,legacy_root) FROM legacy_folder_map m WHERE m.path=coalesce(x.category,'');
  UPDATE vocab_sets SET folder_id=legacy_root WHERE folder_id IS NULL;
  UPDATE category_documents x SET folder_id=m.folder_id FROM legacy_folder_map m WHERE m.path=x.category;
  UPDATE category_questions x SET folder_id=m.folder_id FROM legacy_folder_map m WHERE m.path=x.category;
  UPDATE question_import_batches x SET folder_id=m.folder_id FROM legacy_folder_map m WHERE m.path=x.category;
  UPDATE category_document_uploads x SET folder_id=m.folder_id FROM legacy_folder_map m WHERE m.path=x.category;
  UPDATE writing_progress x SET folder_id=m.folder_id FROM legacy_folder_map m WHERE m.path=x.category;
  UPDATE writing_progress SET folder_id=legacy_root WHERE folder_id IS NULL;
  UPDATE content_folders f SET shuffle_questions=c.shuffle_questions,shuffle_options=c.shuffle_options,shuffle_mode=c.shuffle_mode,updated_at=now()
    FROM vocab_categories c JOIN legacy_folder_map m ON m.path=c.name WHERE f.id=m.folder_id;
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key='folder_acl_share_targets_migrated') THEN
    UPDATE share_links s SET target_id=m.folder_id FROM vocab_categories c JOIN legacy_folder_map m ON m.path=c.name WHERE s.target_type='question_collection' AND s.target_id=c.id;
    INSERT INTO app_settings(key,value,updated_at) VALUES ('folder_acl_share_targets_migrated','true',now()) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=now();
  END IF;
  INSERT INTO folder_access(folder_id,user_id,access_level) SELECT legacy_root,id,'manager' FROM users WHERE role='admin' ON CONFLICT(folder_id,user_id) DO NOTHING;
  INSERT INTO app_settings(key,value,updated_at) VALUES ('folder_acl_legacy_content_mapped','true',now()) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=now();
  END IF;
END $$;

DROP INDEX IF EXISTS writing_progress_user_category_idx;
CREATE UNIQUE INDEX IF NOT EXISTS writing_progress_user_folder_idx ON writing_progress(user_id,folder_id);

ALTER TABLE vocab_sets DROP CONSTRAINT IF EXISTS vocab_sets_publication_status_check;
ALTER TABLE vocab_sets ADD CONSTRAINT vocab_sets_publication_status_check CHECK(publication_status IN ('draft','published'));
ALTER TABLE category_questions DROP CONSTRAINT IF EXISTS category_questions_publication_status_check;
ALTER TABLE category_questions ADD CONSTRAINT category_questions_publication_status_check CHECK(publication_status IN ('draft','published'));
