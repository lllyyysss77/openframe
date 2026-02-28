export type CreateCharacterDraft = {
  name: string
  gender: '' | 'male' | 'female' | 'other'
  age: '' | 'child' | 'youth' | 'young_adult' | 'adult' | 'middle_aged' | 'elder'
  personality: string
  appearance: string
  background: string
  thumbnail: string | null
}

export type CreatePropDraft = {
  name: string
  category: string
  description: string
  thumbnail: string | null
}

export type CreateSceneDraft = {
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
}

export type ShotDraft = {
  scene_id: string
  title: string
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
  character_ids: string[]
  prop_ids: string[]
}

export type ShotCard = ShotDraft & {
  id: string
  series_id: string
  shot_index: number
  thumbnail: string | null
  production_first_frame: string | null
  production_last_frame: string | null
  production_video: string | null
  created_at: number
}

export type EditedClipPayload = {
  shotId: string
  path: string
  trimStartSec: number
  trimEndSec: number
}

export type Scene = {
  id: string
  series_id?: string
  project_id: string
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
  created_at: number
}
