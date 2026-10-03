-- Additive: admin-editable AI instruction text per connection.
--
-- ai_prompts is JSON text ("meaning": "...", "ipa": "...", ...).
-- NULL means "use the built-in defaults in aiFormula.ts". Google Sheets
-- still executes the native =AI() formula; Lexora only writes wording.
ALTER TABLE google_sheet_connections ADD COLUMN IF NOT EXISTS ai_prompts text;