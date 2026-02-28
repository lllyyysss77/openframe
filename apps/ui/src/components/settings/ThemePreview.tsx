export type Theme = 'light' | 'dark' | 'system'

export function ThemePreview({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  const sidebar = isLight ? '#e5e7eb' : '#1d232a'
  const content = isLight ? '#f9fafb' : '#191e24'
  const line1   = isLight ? '#d1d5db' : '#374151'
  const line2   = isLight ? '#e5e7eb' : '#2d3748'

  if (theme === 'system') {
    return (
      <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <clipPath id="clip-left"><rect x="0" y="0" width="60" height="80" /></clipPath>
        <g clipPath="url(#clip-left)">
          <rect width="120" height="80" fill="#f9fafb" />
          <rect width="32" height="80" fill="#e5e7eb" />
          <rect x="36" y="12" width="28" height="4" rx="2" fill="#d1d5db" />
          <rect x="36" y="20" width="20" height="3" rx="1.5" fill="#e5e7eb" />
          <rect x="36" y="27" width="24" height="3" rx="1.5" fill="#e5e7eb" />
          <rect x="4"  y="12" width="22" height="3" rx="1.5" fill="#d1d5db" />
          <rect x="4"  y="20" width="22" height="3" rx="1.5" fill="#d1d5db" />
          <rect x="4"  y="28" width="22" height="3" rx="1.5" fill="#d1d5db" />
        </g>
        <clipPath id="clip-right"><rect x="60" y="0" width="60" height="80" /></clipPath>
        <g clipPath="url(#clip-right)">
          <rect width="120" height="80" fill="#191e24" />
          <rect width="32" height="80" fill="#1d232a" />
          <rect x="36" y="12" width="28" height="4" rx="2" fill="#374151" />
          <rect x="36" y="20" width="20" height="3" rx="1.5" fill="#2d3748" />
          <rect x="36" y="27" width="24" height="3" rx="1.5" fill="#2d3748" />
          <rect x="4"  y="12" width="22" height="3" rx="1.5" fill="#374151" />
          <rect x="4"  y="20" width="22" height="3" rx="1.5" fill="#374151" />
          <rect x="4"  y="28" width="22" height="3" rx="1.5" fill="#374151" />
        </g>
        <line x1="60" y1="0" x2="60" y2="80" stroke="#6b7280" strokeWidth="1" strokeDasharray="4 2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="120" height="80" fill={content} />
      <rect width="32" height="80" fill={sidebar} />
      <rect x="4"  y="12" width="22" height="3" rx="1.5" fill={line1} />
      <rect x="4"  y="20" width="22" height="3" rx="1.5" fill={line1} />
      <rect x="4"  y="28" width="22" height="3" rx="1.5" fill={line1} />
      <rect x="36" y="12" width="28" height="4" rx="2"   fill={line1} />
      <rect x="36" y="20" width="20" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="27" width="24" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="34" width="18" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="44" width="70" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="51" width="60" height="3" rx="1.5" fill={line2} />
      <rect x="36" y="58" width="66" height="3" rx="1.5" fill={line2} />
    </svg>
  )
}
