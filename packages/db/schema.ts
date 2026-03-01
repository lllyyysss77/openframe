
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
  title: text('title').notNull().$default(() => ''),
  script: text('script').notNull().$default(() => ''),
  sort_index: integer('sort_index').notNull(),
  thumbnail: text('thumbnail'),
  duration: integer('duration').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  name: text('name').notNull().$default(() => ''),
  gender: text('gender').notNull().$default(() => ''),
  age: text('age').notNull().$default(() => ''),
  personality: text('personality').notNull().$default(() => ''),
  thumbnail: text('thumbnail'),
  appearance: text('appearance').notNull().$default(() => ''),
  background: text('background').notNull().$default(() => ''),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const props = sqliteTable('props', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  name: text('name').notNull().$default(() => ''),
  category: text('category').notNull().$default(() => ''),
  description: text('description').notNull().$default(() => ''),
  thumbnail: text('thumbnail'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const costumes = sqliteTable('costumes', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  name: text('name').notNull().$default(() => ''),
  category: text('category').notNull().$default(() => ''),
  description: text('description').notNull().$default(() => ''),
  character_ids: text('character_ids').notNull().$default(() => '[]'),
  thumbnail: text('thumbnail'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const character_relations = sqliteTable('character_relations', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  source_character_id: text('source_character_id').notNull(),
  target_character_id: text('target_character_id').notNull(),
  relation_type: text('relation_type').notNull().$default(() => ''),
  strength: integer('strength').notNull().$default(() => 3),
  notes: text('notes').notNull().$default(() => ''),
  evidence: text('evidence').notNull().$default(() => ''),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const series_character_links = sqliteTable('series_character_links', {
  project_id: text('project_id').notNull(),
  series_id: text('series_id').notNull(),
  character_id: text('character_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const scenes = sqliteTable('scenes', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull(),
  title: text('title').notNull().$default(() => ''),
  location: text('location').notNull().$default(() => ''),
  time: text('time').notNull().$default(() => ''),
  mood: text('mood').notNull().$default(() => ''),
  description: text('description').notNull().$default(() => ''),
  shot_notes: text('shot_notes').notNull().$default(() => ''),
  thumbnail: text('thumbnail'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const series_scene_links = sqliteTable('series_scene_links', {
  project_id: text('project_id').notNull(),
  series_id: text('series_id').notNull(),
  scene_id: text('scene_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const shots = sqliteTable('shots', {
  id: text('id').primaryKey(),
  series_id: text('series_id').notNull(),
  scene_id: text('scene_id').notNull(),
  title: text('title').notNull().$default(() => ''),
  shot_index: integer('shot_index').notNull().$default(() => 0),
  shot_size: text('shot_size').notNull().$default(() => ''),
  camera_angle: text('camera_angle').notNull().$default(() => ''),
  camera_move: text('camera_move').notNull().$default(() => ''),
  duration_sec: integer('duration_sec').notNull().$default(() => 3),
  action: text('action').notNull().$default(() => ''),
  dialogue: text('dialogue').notNull().$default(() => ''),
  character_ids: text('character_ids').notNull().$default(() => '[]'),
  prop_ids: text('prop_ids').notNull().$default(() => '[]'),
  costume_ids: text('costume_ids').notNull().$default(() => '[]'),
  thumbnail: text('thumbnail'),
  production_first_frame: text('production_first_frame'),
  production_last_frame: text('production_last_frame'),
  production_video: text('production_video'),
  production_first_frame_prompt_override: text('production_first_frame_prompt_override'),
  production_last_frame_prompt_override: text('production_last_frame_prompt_override'),
  production_video_prompt_override: text('production_video_prompt_override'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const series_prop_links = sqliteTable('series_prop_links', {
  project_id: text('project_id').notNull(),
  series_id: text('series_id').notNull(),
  prop_id: text('prop_id').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const series_costume_links = sqliteTable('series_costume_links', {
  project_id: text('project_id').notNull(),
  series_id: text('series_id').notNull(),
  costume_id: text('costume_id').notNull(),
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
