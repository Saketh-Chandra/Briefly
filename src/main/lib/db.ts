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

export function getDb(): DrizzleDb {
  if (!_db) {
    const dbPath = join(app.getPath('userData'), 'briefly.db')
    const sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    _db = drizzle(sqlite, { schema: { meetings, transcripts, summaries, screenshots } })
    // Resolve migrations folder: dev = repo root, prod = asar-unpacked resources
    const migrationsFolder = is.dev
      ? join(__dirname, '../../drizzle')
      : join(process.resourcesPath, 'drizzle')
    migrate(_db, { migrationsFolder })
  }
  return _db
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
    .select({ summary: summaries.summary, todos: summaries.todos, journal: summaries.journal })
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
      journal: params.journal,
      llm_model: params.llmModel
    })
    .run()

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
