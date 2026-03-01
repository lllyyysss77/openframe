export function isAnimeStyle(style: string): boolean {
  return /(动漫|二次元|anime|manga|cartoon|toon|cel[-\s]?shad)/i.test(style)
}

export const TURNAROUND_THREE_VIEW_SUFFIX = [
  'Hard requirements:',
  '- Output a single turnaround sheet with exactly three full-body views of the SAME character: front view, side profile view, and back view.',
  '- Keep hairstyle, face shape, costume details, color palette, and body proportion fully consistent across all three views.',
  '- Anime style only. Avoid photorealistic skin, lens effects, and real-person facial rendering.',
  '- No extra characters, no scene background storytelling, no text overlays.',
].join('\n')

export function buildSceneStyleSuffix(style: string): string {
  const lines = [
    'Hard requirements:',
    '- Strictly follow the provided "Project style" in composition language, line quality, color script, and rendering mood.',
    '- This is an environment concept scene image, not a portrait shot. Prioritize space design, depth, and staging.',
    '- Output ONE 16:9 scene sheet with exactly three views of the SAME environment: main wide view, side-angle view, and reverse-angle view.',
    '- Environment only: no humans, no characters, no body parts, no crowds, and no character silhouettes.',
    '- Keep architecture, props, and lighting continuity consistent across all three views.',
    '- Keep output clean: no UI text overlays, no subtitles, no logos.',
  ]

  if (isAnimeStyle(style)) {
    lines.push('- Anime background illustration style only. Avoid photorealistic lens effect, photographic texture, and live-action look.')
  } else {
    lines.push('- Do not shift to photorealistic style unless the project style explicitly requests realism.')
  }

  return lines.join('\n')
}

export function buildPropStyleSuffix(style: string): string {
  const lines = [
    'Hard requirements:',
    '- Output ONE prop turnaround sheet with exactly three views of the SAME prop: front view, side view, and back view.',
    '- Keep shape, size proportion, material, color scheme, and structural details fully consistent across all three views.',
    '- Strictly follow the provided "Project style" in line quality, shape language, color design, and lighting.',
    '- Keep output as a single clean prop reference image, no human subject, no typography, no logos.',
  ]

  if (isAnimeStyle(style)) {
    lines.push('- Anime illustration style only: clean line art + cel-shaded rendering. Avoid photorealistic texture, camera lens realism, and live-action look.')
  } else {
    lines.push('- Do not shift to photorealistic style unless the project style explicitly requests realism.')
  }

  return lines.join('\n')
}

export function buildCostumeSwapSuffix(style: string): string {
  const lines = [
    'Hard requirements:',
    '- This is a CHARACTER COSTUME CHANGE task, not a prop-only render.',
    '- Use the provided reference character image(s) as identity anchor.',
    '- Keep face, hairstyle, body proportion, and identity fully consistent with the reference character.',
    '- Only change outfit/costume and styling details according to the prompt; do not change character identity.',
    '- Output ONE full-body character costume reference sheet with exactly three views: front, side profile, and back.',
    '- Keep outfit materials, silhouette, color palette, and details consistent across all three views.',
    '- Single character only. No extra people, no logos, no text overlays.',
  ]

  if (isAnimeStyle(style)) {
    lines.push('- Anime illustration style only: clean line art + cel-shaded rendering. Avoid photorealistic texture and live-action look.')
  } else {
    lines.push('- Do not shift to photorealistic style unless the project style explicitly requests realism.')
  }

  return lines.join('\n')
}

export function buildCostumeSwapPrompt(args: {
  projectCategory: string
  projectStyle: string
  costumeName: string
  category: string
  description: string
  linkedCharacters: string
}): string {
  return [
    'This is a character outfit-swap task, not a clothing-item-only render.',
    'Using the reference character image(s), generate the same character wearing a new outfit.',
    `Project category: ${args.projectCategory || 'unknown'}`,
    `Project style: ${args.projectStyle || 'unknown'}`,
    `Outfit name: ${args.costumeName || 'unknown'}`,
    `Outfit category: ${args.category || 'unknown'}`,
    `Outfit description: ${args.description || 'unknown'}`,
    `Linked characters: ${args.linkedCharacters || 'unknown'}`,
    'Hard requirements:',
    '- The output must include the full character (full body), not just clothes or a flat lay.',
    '- Keep character identity consistent with the reference (face, hairstyle, body shape, age impression).',
    '- Only change clothing design/material/color details; do not change character identity.',
    '- Single character only, clean background, no subtitles and no watermark.',
  ].join('\n')
}

function includesAny(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword))
}

export function buildProductionFrameMotionSuffix(cameraMove: string, kind: 'first' | 'last'): string {
  const move = (cameraMove || '').trim().toLowerCase()
  const lines = [
    'Hard requirements:',
    kind === 'first'
      ? '- Generate the temporal START frame: it must be an earlier moment than the middle frame within the same shot movement.'
      : '- Generate the temporal END frame: it must be a later moment than the middle frame within the same shot movement.',
    '- Keep shot intent consistent: same subject, same scene, same lens language, and same blocking logic.',
    '- Strictly obey camera move direction; do not reverse motion.',
    `- Camera move to follow: ${cameraMove || 'unknown'}`,
  ]

  if (!move || includesAny(move, ['static', 'locked', 'still', 'none', '固定', '静止', '不动'])) {
    lines.push('- For static/locked camera, keep framing almost unchanged from the middle frame (only minimal natural variation).')
    return lines.join('\n')
  }

  if (includesAny(move, ['push in', 'dolly in', 'truck in', 'zoom in', '推进', '推近', '拉近', '向前'])) {
    lines.push(kind === 'first'
      ? '- Push-in/zoom-in: first frame should be slightly wider/farther than middle frame.'
      : '- Push-in/zoom-in: last frame should be slightly tighter/closer than middle frame.')
    return lines.join('\n')
  }

  if (includesAny(move, ['pull out', 'dolly out', 'truck out', 'zoom out', '拉远', '拉出', '后退', '远离'])) {
    lines.push(kind === 'first'
      ? '- Pull-out/zoom-out: first frame should be slightly tighter/closer than middle frame.'
      : '- Pull-out/zoom-out: last frame should be slightly wider/farther than middle frame.')
    return lines.join('\n')
  }

  if (includesAny(move, ['pan left', 'left pan', '左摇', '向左摇', '左移'])) {
    lines.push(kind === 'first'
      ? '- Pan-left: first frame should be before the left pan completes.'
      : '- Pan-left: last frame should be after the camera has moved further left.')
    return lines.join('\n')
  }

  if (includesAny(move, ['pan right', 'right pan', '右摇', '向右摇', '右移'])) {
    lines.push(kind === 'first'
      ? '- Pan-right: first frame should be before the right pan completes.'
      : '- Pan-right: last frame should be after the camera has moved further right.')
    return lines.join('\n')
  }

  if (includesAny(move, ['tilt up', 'up tilt', '仰拍', '上摇', '向上'])) {
    lines.push(kind === 'first'
      ? '- Tilt-up: first frame should be lower in pitch than middle frame.'
      : '- Tilt-up: last frame should be higher in pitch than middle frame.')
    return lines.join('\n')
  }

  if (includesAny(move, ['tilt down', 'down tilt', '俯拍', '下摇', '向下'])) {
    lines.push(kind === 'first'
      ? '- Tilt-down: first frame should be higher in pitch than middle frame.'
      : '- Tilt-down: last frame should be lower in pitch than middle frame.')
    return lines.join('\n')
  }

  lines.push('- Show a clear temporal before/after phase relative to middle frame while preserving shot continuity.')
  return lines.join('\n')
}

export function buildProjectThumbnailPrompt(args: {
  categoryNames: string
  projectName: string
  genreName: string
  ratio: '16:9' | '9:16'
}): string {
  const ratioHint = args.ratio === '9:16' ? 'vertical mobile frame' : 'cinematic wide frame'
  return [
    'Create a high-quality cinematic project thumbnail image.',
    `Category: ${args.categoryNames}.`,
    `Project name concept: ${args.projectName}.`,
    `Style genre: ${args.genreName}.`,
    `Aspect ratio: ${args.ratio}, ${ratioHint}.`,
    'No text, no watermark, dramatic lighting, strong composition, highly detailed.',
  ].join(' ')
}

export function buildAutoEditPlannerContext(args: {
  userPrompt: string
  projectRatio: '16:9' | '9:16'
  clipLines: string
}): string {
  return [
    'You are an editing planner. Return JSON only.',
    `User intent: ${args.userPrompt || 'Generate the most coherent story cut.'}`,
    `Ratio: ${args.projectRatio}`,
    'Available clips:',
    args.clipLines,
  ].join('\n')
}

export const AUTO_EDIT_PLANNER_INSTRUCTION = 'Return ONLY one JSON object: {"orderedShotIds": string[]}. Keep IDs from the provided list only. Keep between 1 and 20 clips.'
