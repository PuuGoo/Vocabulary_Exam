# Personal Study Planner

Each signed-in Lexora user connects their own Google account. After connection,
the signed-in app layout requests creation of a personal copy, not on every page
request or during password verification. Failed Google access never blocks login.

The fixed source is `1uA6I3fGgr9Sh4pKxmw5I6UVX6Ib4PKa2WCSCFgH-MTY` (tab
`2127813405`). Drive `files.copy` preserves the workbook rather than reconstructing
it. Changing the master affects future copies only; existing user plans are never
overwritten. No public/link sharing permissions are created by Lexora.

Admin quick actions and the student dashboard show a green direct link when a
copy exists; a gray link opens `/study-planner` to connect Google or retry creation.
There is no vocabulary synchronization or Gemini API involved in this feature.

## Deployment

Apply `drizzle/0041_study_planners.sql` before deploying. The existing Google OAuth
client, redirect URI, token encryption key and state-signing secret are reused.
The existing callback accepts a student only for a signed `/study-planner` state
matching that student's current session. Other admin OAuth flows retain their
permission requirement. APIs always derive ownership from the session, never a
client-supplied user ID.

The source must permit each connecting Google account to view/copy it. Planner
OAuth explicitly requests `drive.readonly` in addition to the existing scopes so
the fixed shared template can be copied without a Picker selection. This is a
broad, restricted read scope; the setup page discloses it before consent. Add it
to the Google consent configuration and complete any required Google verification
before rollout. Existing vocabulary-only tokens require additional consent. If
Google refuses the template, no blank substitute is created. Verify with a
non-admin Google account before production rollout.

A PostgreSQL per-user advisory lock and primary key prevent concurrent requests
creating multiple planners. A private Drive appProperties marker enables recovery
if copying succeeds but DB persistence fails. Copy requests disable automatic
HTTP retries. A rare ambiguous network failure still requires checking Drive
before retrying; Drive and PostgreSQL are not a distributed transaction.

Existing planner links are not replaced automatically when a user switches Google
accounts, deletes a file or revokes access. Reconnect with the original account;
automatic replacement could destroy or hide an existing study plan.

Local DB tests verify repeated/concurrent creation, distinct users, recovery and
copy failures using fake Google calls. Real Google consent, template access and
copy fidelity still require production acceptance; no production copies are made
by those tests.
