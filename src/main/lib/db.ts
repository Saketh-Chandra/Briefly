import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, desc, sql } from 'drizzle-orm'
import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { meetings, transcripts, summaries, screenshots } from './schema'
import type { MeetingDetail, MeetingStatus } from './types'

type DrizzleDb = ReturnType<typeof drizzle>

let _db: DrizzleDb | null = null
let _sqlite: InstanceType<typeof Database> | null = null

// ---------------------------------------------------------------------------
// Test seam — never called in production builds
// ---------------------------------------------------------------------------

/**
 * Override the DB path and reset the singleton.
 * Pass ':memory:' for in-memory SQLite in tests.
 * Migrations are applied from process.cwd()/drizzle when this is set.
 */
export function _setTestDbPath(path: string): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
  _db = null
  _testDbPath = path
}

/** Reset the singleton and clear the test override. */
export function _resetTestDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
  _db = null
  _testDbPath = null
}

let _testDbPath: string | null = null

export function getDb(): DrizzleDb {
  if (!_db) {
    const dbPath = _testDbPath ?? join(app.getPath('userData'), 'briefly.db')
    _sqlite = new Database(dbPath)
    _sqlite.pragma('journal_mode = WAL')
    _sqlite.pragma('foreign_keys = ON')
    _db = drizzle(_sqlite, { schema: { meetings, transcripts, summaries, screenshots } })
    // Resolve migrations folder: test uses cwd/drizzle, dev uses repo root, prod uses asar-unpacked resources
    const migrationsFolder =
      _testDbPath !== null
        ? join(process.cwd(), 'drizzle')
        : is.dev
          ? join(__dirname, '../../drizzle')
          : join(process.resourcesPath, 'drizzle')
    migrate(_db, { migrationsFolder })
    // Ensure the FTS5 search index exists — CREATE VIRTUAL TABLE is outside Drizzle's
    // model so we guarantee it here with IF NOT EXISTS regardless of migration state.
    _sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index
      USING fts5(meeting_id UNINDEXED, source UNINDEXED, content, tokenize='unicode61')
    `)
    rebuildSearchIndex()
  }
  return _db
}

function getRawDb(): InstanceType<typeof Database> {
  if (!_sqlite) getDb() // ensure initialisation
  return _sqlite!
}

// ---------------------------------------------------------------------------
// Search index helpers
// ---------------------------------------------------------------------------

/**
 * Write one content row into the standalone FTS5 search index.
 * source: 'transcript' | 'summary' | 'decisions' | 'journal'
 */
function indexForSearch(meetingId: number, source: string, content: string): void {
  if (!content?.trim()) return
  getRawDb()
    .prepare(`INSERT INTO search_index(meeting_id, source, content) VALUES (?, ?, ?)`)
    .run(meetingId, source, content)
}

/**
 * Remove all search_index rows for a meeting (called before re-indexing or
 * when resetting for reprocessing).
 */
function deleteSearchIndex(meetingId: number): void {
  getRawDb()
    .prepare(`DELETE FROM search_index WHERE meeting_id = ?`)
    .run(meetingId)
}

/**
 * Backfill the search_index from existing transcripts and summaries.
 * Only runs when the index is empty (first boot after the migration).
 */
function rebuildSearchIndex(): void {
  const raw = getRawDb()
  const count = (raw.prepare(`SELECT COUNT(*) AS n FROM search_index`).get() as { n: number }).n
  if (count > 0) return

  const db = getDb()

  const txRows = db.select({ meeting_id: transcripts.meeting_id, content: transcripts.content })
    .from(transcripts)
    .all()
  for (const row of txRows) {
    indexForSearch(row.meeting_id, 'transcript', row.content)
  }

  const sumRows = db
    .select({
      meeting_id: summaries.meeting_id,
      summary: summaries.summary,
      key_decisions: summaries.key_decisions,
      journal: summaries.journal
    })
    .from(summaries)
    .all()
  for (const row of sumRows) {
    if (row.summary) indexForSearch(row.meeting_id, 'summary', row.summary)
    if (row.key_decisions) {
      const decisions = JSON.parse(row.key_decisions) as string[]
      indexForSearch(row.meeting_id, 'decisions', decisions.join(' '))
    }
    if (row.journal) indexForSearch(row.meeting_id, 'journal', row.journal)
  }
}

export function insertMeeting(params: {
  sessionId: string
  audioPath: string
  date: string
}): number {
  const result = getDb()
    .insert(meetings)
    .values({
      session_id: params.sessionId,
      audio_path: params.audioPath,
      date: params.date,
      status: 'recording'
    })
    .run()
  return Number(result.lastInsertRowid)
}

export function updateMeetingStatus(id: number, status: MeetingStatus): void {
  getDb()
    .update(meetings)
    .set({ status, updated_at: sql`(datetime('now'))` })
    .where(eq(meetings.id, id))
    .run()
}

export function updateMeetingDuration(id: number, durationS: number): void {
  getDb()
    .update(meetings)
    .set({ duration_s: durationS, updated_at: sql`(datetime('now'))` })
    .where(eq(meetings.id, id))
    .run()
}

export function getMeetings(): (typeof meetings.$inferSelect)[] {
  return getDb()
    .select()
    .from(meetings)
    .orderBy(desc(meetings.date), desc(meetings.created_at))
    .all()
}

export function getMeetingById(id: number): typeof meetings.$inferSelect | null {
  return getDb().select().from(meetings).where(eq(meetings.id, id)).get() ?? null
}

export function getMeetingDetail(id: number): MeetingDetail | null {
  const db = getDb()

  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get()
  if (!meeting) return null

  const transcriptRow = db
    .select({ content: transcripts.content, chunks: transcripts.chunks, model: transcripts.model })
    .from(transcripts)
    .where(eq(transcripts.meeting_id, id))
    .get()

  const summaryRow = db
    .select({
      summary: summaries.summary,
      todos: summaries.todos,
      key_decisions: summaries.key_decisions,
      participants: summaries.participants,
      journal: summaries.journal
    })
    .from(summaries)
    .where(eq(summaries.meeting_id, id))
    .get()

  const screenshotRows = db
    .select({ path: screenshots.path, taken_at: screenshots.taken_at })
    .from(screenshots)
    .where(eq(screenshots.meeting_id, id))
    .orderBy(screenshots.taken_at)
    .all()

  return {
    ...meeting,
    transcript: transcriptRow
      ? {
          content: transcriptRow.content,
          chunks: transcriptRow.chunks ? JSON.parse(transcriptRow.chunks) : null,
          model: transcriptRow.model
        }
      : null,
    summary: summaryRow
      ? {
          summary: summaryRow.summary,
          todos: summaryRow.todos ? JSON.parse(summaryRow.todos) : null,
          key_decisions: summaryRow.key_decisions ? JSON.parse(summaryRow.key_decisions) : null,
          participants: summaryRow.participants ? JSON.parse(summaryRow.participants) : null,
          journal: summaryRow.journal
        }
      : null,
    screenshots: screenshotRows
  }
}

export function deleteMeeting(id: number): void {
  getDb().delete(meetings).where(eq(meetings.id, id)).run()
}

export function insertScreenshot(meetingId: number, path: string): void {
  getDb().insert(screenshots).values({ meeting_id: meetingId, path }).run()
}

export function insertTranscript(params: {
  meetingId: number
  content: string
  chunks: import('./types').TranscriptChunk[] | null
  model: string
}): void {
  const db = getDb()
  // Remove any previous transcript for this meeting (idempotent on re-run)
  db.delete(transcripts).where(eq(transcripts.meeting_id, params.meetingId)).run()
  db.insert(transcripts)
    .values({
      meeting_id: params.meetingId,
      content: params.content,
      chunks: params.chunks ? JSON.stringify(params.chunks) : null,
      model: params.model
    })
    .run()
  // Index transcript content for full-text search
  deleteSearchIndex(params.meetingId)
  indexForSearch(params.meetingId, 'transcript', params.content)
  // Also update meeting status to 'transcribed'
  updateMeetingStatus(params.meetingId, 'transcribed')
}

export function getMeetingsByDate(dateStr: string): (typeof meetings.$inferSelect)[] {
  return getDb()
    .select()
    .from(meetings)
    .where(sql`date(${meetings.date}) = ${dateStr}`)
    .orderBy(meetings.date)
    .all()
}

/**
 * Full-text search across all indexed content (transcripts, summaries,
 * key decisions, journal) and meeting titles.
 * Uses SQLite FTS5 (BM25) for indexed content; LIKE for titles.
 * Title matches are always ranked above FTS matches.
 * Returns up to 50 meeting rows ordered by relevance.
 */
export function searchMeetings(query: string): (typeof meetings.$inferSelect)[] {
  const raw = getRawDb()

  // Build a safe FTS5 prefix query: wrap each word in double-quotes + * for prefix match
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replace(/"/g, '')}"*`)
    .join(' ')

  if (!terms) return []

  const rows = raw
    .prepare(
      `
      SELECT m.id, m.session_id, m.title, m.date, m.duration_s,
             m.audio_path, m.status, m.created_at, m.updated_at,
             MIN(ranked.score) AS best_score
      FROM (
        SELECT CAST(si.meeting_id AS INTEGER) AS mid, bm25(search_index) AS score
        FROM search_index si
        WHERE search_index MATCH ?
        UNION ALL
        SELECT id AS mid, -999.0 AS score
        FROM meetings
        WHERE title LIKE ? COLLATE NOCASE
      ) ranked
      JOIN meetings m ON m.id = ranked.mid
      GROUP BY m.id
      ORDER BY best_score ASC
      LIMIT 50
    `
    )
    .all(terms, `%${query.trim()}%`)

  return rows as (typeof meetings.$inferSelect)[]
}

export function updateTodo(meetingId: number, index: number, done: boolean): void {
  const db = getDb()
  const row = db
    .select({ todos: summaries.todos })
    .from(summaries)
    .where(eq(summaries.meeting_id, meetingId))
    .get()
  if (!row?.todos) return
  const todos = JSON.parse(row.todos) as import('./types').Todo[]
  if (index < 0 || index >= todos.length) return
  todos[index].done = done
  db.update(summaries)
    .set({ todos: JSON.stringify(todos) })
    .where(eq(summaries.meeting_id, meetingId))
    .run()
}

export function updateJournal(meetingId: number, journal: string): void {
  getDb().update(summaries).set({ journal }).where(eq(summaries.meeting_id, meetingId)).run()
}

export function resetMeetingForReprocessing(meetingId: number): void {
  const db = getDb()
  db.delete(summaries).where(eq(summaries.meeting_id, meetingId)).run()
  db.delete(transcripts).where(eq(transcripts.meeting_id, meetingId)).run()
  deleteSearchIndex(meetingId)
  db.update(meetings)
    .set({ status: 'recorded', updated_at: sql`(datetime('now'))` })
    .where(eq(meetings.id, meetingId))
    .run()
}

/**
 * Reconcile meetings left mid-flight after a crash or force-quit.
 * - 'recording' becomes 'recorded' only if audio was actually written.
 * - 'transcribing' and 'processing' reset to 'recorded' so the user can retry.
 */
function hasRecordedAudio(audioPath: string): boolean {
  if (!existsSync(audioPath)) return false
  try {
    return statSync(audioPath).size > 0
  } catch {
    return false
  }
}

export function resetStuckMeetings(): void {
  const db = getDb()

  const interruptedRecordings = db
    .select({ id: meetings.id, audio_path: meetings.audio_path })
    .from(meetings)
    .where(eq(meetings.status, 'recording'))
    .all()

  for (const meeting of interruptedRecordings) {
    db.update(meetings)
      .set({
        status: hasRecordedAudio(meeting.audio_path) ? 'recorded' : 'error',
        updated_at: sql`(datetime('now'))`
      })
      .where(eq(meetings.id, meeting.id))
      .run()
  }

  db.update(meetings)
    .set({ status: 'recorded', updated_at: sql`(datetime('now'))` })
    .where(sql`${meetings.status} IN ('transcribing', 'processing')`)
    .run()
}

export function getTranscript(meetingId: number): {
  content: string
  chunks: import('./types').TranscriptChunk[] | null
  model: string | null
} | null {
  const row = getDb()
    .select({ content: transcripts.content, chunks: transcripts.chunks, model: transcripts.model })
    .from(transcripts)
    .where(eq(transcripts.meeting_id, meetingId))
    .get()
  if (!row) return null
  return {
    content: row.content,
    chunks: row.chunks ? JSON.parse(row.chunks) : null,
    model: row.model
  }
}

export function insertSummary(params: {
  meetingId: number
  summary: string | null
  todos: import('./types').Todo[] | null
  keyDecisions: string[] | null
  participants: string[] | null
  journal: string | null
  llmModel: string
  meetingTitle?: string | null
}): void {
  const db = getDb()
  db.insert(summaries)
    .values({
      meeting_id: params.meetingId,
      summary: params.summary,
      todos: params.todos ? JSON.stringify(params.todos) : null,
      key_decisions: params.keyDecisions ? JSON.stringify(params.keyDecisions) : null,
      participants: params.participants ? JSON.stringify(params.participants) : null,
      journal: params.journal,
      llm_model: params.llmModel
    })
    .run()

  // Index summary fields for full-text search
  if (params.summary) indexForSearch(params.meetingId, 'summary', params.summary)
  if (params.keyDecisions?.length)
    indexForSearch(params.meetingId, 'decisions', params.keyDecisions.join(' '))
  if (params.journal) indexForSearch(params.meetingId, 'journal', params.journal)

  // Update meeting status to 'done' and optionally set the title
  db.update(meetings)
    .set({
      status: 'done',
      updated_at: sql`(datetime('now'))`,
      ...(params.meetingTitle ? { title: params.meetingTitle } : {})
    })
    .where(eq(meetings.id, params.meetingId))
    .run()
}

export function getSummary(meetingId: number): {
  summary: string | null
  todos: import('./types').Todo[] | null
  journal: string | null
  llm_model: string | null
} | null {
  const row = getDb()
    .select({
      summary: summaries.summary,
      todos: summaries.todos,
      journal: summaries.journal,
      llm_model: summaries.llm_model
    })
    .from(summaries)
    .where(eq(summaries.meeting_id, meetingId))
    .get()
  if (!row) return null
  return {
    summary: row.summary,
    todos: row.todos ? JSON.parse(row.todos) : null,
    journal: row.journal,
    llm_model: row.llm_model
  }
}
