import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error("DATABASE_URL phải là PostgreSQL URL hợp lệ.");
}

const migrations = [
  "0023_hybrid_spaced_repetition.sql",
  "0024_public_share_links.sql",
  "0025_share_category_content.sql",
  "0026_share_custom_slug.sql",
  "0027_share_password_protection.sql",
  "0028_word_positions.sql",
  "0029_admin_rbac.sql",
  "0030_multilingual_chinese.sql",
  "0031_personal_workspaces.sql",
];

const client = postgres(connectionString, { max: 1 });
try {
  for (const filename of migrations) {
    const sqlText = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    await client.begin((transaction) => transaction.unsafe(sqlText));
    console.log(`Applied ${filename}`);
  }

  const [wordIntegrity] = await client.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE position IS NULL OR position < 1)::integer AS invalid_positions,
      COUNT(*)::integer AS word_count
    FROM words
  `);
  const [positionIntegrity] = await client.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE duplicate_count > 1)::integer AS duplicate_positions,
      COUNT(*) FILTER (WHERE min_position <> 1 OR max_position <> word_count)::integer AS non_contiguous_sets
    FROM (
      SELECT set_id, MIN(position) AS min_position, MAX(position) AS max_position,
             COUNT(*) AS word_count, MAX(position_count) AS duplicate_count
      FROM (
        SELECT set_id, position, COUNT(*) OVER (PARTITION BY set_id, position) AS position_count
        FROM words
      ) positions
      GROUP BY set_id
    ) sets
  `);
  const [rbacIntegrity] = await client.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE role = 'admin' AND admin_profile = 'owner')::integer AS owner_count,
      COUNT(*) FILTER (WHERE role = 'admin' AND admin_profile IS NULL)::integer AS invalid_admins,
      COUNT(*) FILTER (WHERE role <> 'admin' AND admin_profile IS NOT NULL)::integer AS invalid_students
    FROM users
  `);
  const [shareIntegrity] = await client.unsafe(`
    SELECT COUNT(*) FILTER (WHERE custom_slug IS NOT NULL)::integer AS custom_slug_count,
           COUNT(*) FILTER (WHERE password_enabled)::integer AS password_share_count
    FROM share_links
  `);
  const [languageIntegrity] = await client.unsafe(`
    SELECT COUNT(*) FILTER (
      WHERE language_code IS NULL OR btrim(language_code) = ''
         OR translation_language_code IS NULL OR btrim(translation_language_code) = ''
         OR language_settings IS NULL
    )::integer AS invalid_sets,
    COUNT(*) FILTER (WHERE language_code = 'zh-CN')::integer AS chinese_sets
    FROM vocab_sets
  `);
  const [folderIntegrity] = await client.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE role='admin' AND NOT EXISTS (
        SELECT 1 FROM content_folders f WHERE f.owner_user_id=users.id AND f.kind='personal_root' AND f.archived_at IS NULL
      ))::integer AS admins_without_workspace,
      (SELECT COUNT(*) FROM vocab_sets WHERE folder_id IS NULL)::integer AS sets_without_folder,
      (SELECT COUNT(*) FROM category_documents WHERE folder_id IS NULL)::integer AS documents_without_folder,
      (SELECT COUNT(*) FROM category_questions WHERE folder_id IS NULL)::integer AS questions_without_folder
    FROM users
  `);

  if (wordIntegrity.invalid_positions || positionIntegrity.duplicate_positions || positionIntegrity.non_contiguous_sets) {
    throw new Error("Word position integrity check failed after migrations.");
  }
  if (rbacIntegrity.owner_count < 1 || rbacIntegrity.invalid_admins || rbacIntegrity.invalid_students) {
    throw new Error("Admin RBAC integrity check failed after migrations.");
  }
  if (languageIntegrity.invalid_sets) throw new Error("Language metadata integrity check failed after migrations.");
  if (folderIntegrity.admins_without_workspace || folderIntegrity.sets_without_folder || folderIntegrity.documents_without_folder || folderIntegrity.questions_without_folder) {
    throw new Error("Folder scope integrity check failed after migrations.");
  }
  console.log(JSON.stringify({
    words: wordIntegrity.word_count,
    owners: rbacIntegrity.owner_count,
    customSlugs: shareIntegrity.custom_slug_count,
    passwordProtectedShares: shareIntegrity.password_share_count,
    chineseSets: languageIntegrity.chinese_sets,
    personalWorkspacesReady: folderIntegrity.admins_without_workspace === 0,
  }));
} finally {
  await client.end();
}
