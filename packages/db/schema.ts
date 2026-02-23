
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  video_ratio: text('video_ratio', { enum: ['16:9', '9:16'] }).notNull(),
  thumbnail: text('thumbnail'),
  category: text('type').notNull(),
  genre: text('genre').notNull(),
  series_count: integer('series_count').notNull().$default(() => 0),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// export const series = sqliteTable('series', {
//   id: text('id').primaryKey(),
//   project_id: text('project_id').notNull(),
//   sort_index: integer('sort_index').notNull(),
//   thumbnail: text('thumbnail'),
//   duration: integer('duration').notNull(),
//   created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
// })

export const genre_categories = sqliteTable('genre_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  created_at: integer('created_at').notNull(),
})

export const genres = sqliteTable('genres', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description').notNull(),
  thumbnail: text('thumbnail'),
  category_id: text('category_id').references(() => genre_categories.id),
  created_at: integer('created_at').notNull(),
})
