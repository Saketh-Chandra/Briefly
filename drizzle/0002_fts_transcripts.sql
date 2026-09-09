-- Standalone FTS5 search index decoupled from source table schema.
-- Application code writes rows explicitly via indexForSearch().
-- source values: 'transcript' | 'summary' | 'decisions' | 'journal'
CREATE VIRTUAL TABLE IF NOT EXISTS search_index
USING fts5(
  meeting_id UNINDEXED,
  source     UNINDEXED,
  content,
  tokenize='unicode61'
);
