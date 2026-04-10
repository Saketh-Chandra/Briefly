import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const meetings = sqliteTable('meetings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: text('session_id').notNull().unique(),
  title: text('title'),
  date: text('date').notNull(),
  duration_s: integer('duration_s'),
  audio_path: text('audio_path').notNull(),
  status: text('status', {
    enum: ['recorded', 'transcribing', 'transcribed', 'processing', 'done', 'error'] as const
  }).notNull().default('recorded'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const transcripts = sqliteTable('transcripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meeting_id: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunks: text('chunks'),
  model: text('model'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const summaries = sqliteTable('summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meeting_id: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  todos: text('todos'),
  journal: text('journal'),
  llm_model: text('llm_model'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const screenshots = sqliteTable('screenshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meeting_id: integer('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  taken_at: text('taken_at').notNull().default(sql`(datetime('now'))`),
})
