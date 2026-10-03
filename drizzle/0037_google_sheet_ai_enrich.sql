-- Additive: Google Sheets AI enrichment switch.
--
-- ai_enrich only controls whether Lexora plants the native Google Sheets
-- =AI()/=Gemini() formulas in the AI-enabled columns of a new Sheet.
-- It is NOT a Gemini integration flag: Lexora never reads GEMINI_API_KEY,
-- never calls generativelanguage.googleapis.com and never runs fetchIpaSingle /
-- fetchIpaBatch for Google Sheets Sync. Google Sheets owns AI generation;
-- Lexora only syncs the values Google generates.
ALTER TABLE google_sheet_connections ADD COLUMN IF NOT EXISTS ai_enrich boolean NOT NULL DEFAULT true;