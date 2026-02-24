
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  video_ratio: text('video_ratio', { enum: ['16:9', '9:16'] }).notNull(),
  thumbnail: text('thumbnail'),
  category: text('category').notNull(),
  genre: text('genre').notNull(),
  series_count: integer('series_count').notNull().$default(() => 0),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  sort_index: integer('sort_index').notNull(),
  thumbnail: text('thumbnail'),
  duration: integer('duration').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const genres = sqliteTable('genres', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description').notNull(),
  thumbnail: text('thumbnail'),
  prompt: text('prompt').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type', { enum: ['novel', 'script', 'reference'] }).notNull(),
  project_id: text('project_id'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const chunks = sqliteTable('chunks', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  document_id: text('document_id').notNull(),
  content: text('content').notNull(),
  chunk_index: integer('chunk_index').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
