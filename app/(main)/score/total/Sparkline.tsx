/**
 * A three-point trend, drawn small enough to live inside a table cell.
 *
 * The average column answers "how is this pupil doing"; the sparkline answers
 * "which way are they going", which is the question that decides whether a
 * teacher intervenes. Deliberately not a chart library: `recharts` inside forty
 * table cells would cost more than the whole grid.
 *
 * `title` carries the same information as text, because a 48px line is not
 * readable to everyone and is invisible to a screen reader.
 */
export function Sparkline({
  points,
  labels,
  className = '',
}: {
  /** Oldest → newest. `null` means the pupil had no marks that month. */
  points: (number | null)[]
  labels?: string[]
  className?: string
}) {
  const known = points.filter((p): p is number => p !== null)
  if (known.length < 2) return <span className={`text-[10px] text-text-muted ${className}`}>—</span>

  const width = 48
  const height = 16
  const min = Math.min(...known)
  const max = Math.max(...known)
  const span = max - min || 1
  const step = points.length > 1 ? width / (points.length - 1) : width

  const coords = points.map((p, i) =>
    p === null ? null : { x: i * step, y: height - ((p - min) / span) * height },
  )
  const path = coords
    .map((c, i) => (c === null ? null : `${i === 0 || coords[i - 1] === null ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`))
    .filter(Boolean)
    .join(' ')

  const first = known[0]
  const last = known[known.length - 1]
  const rising = last >= first
  const stroke = rising ? 'var(--color-success)' : 'var(--color-danger)'
  const tip = coords.filter(Boolean).at(-1) as { x: number; y: number }

  const description = points
    .map((p, i) => `${labels?.[i] ?? i + 1}: ${p === null ? '—' : p.toFixed(2)}`)
    .join(' · ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      role="img"
      aria-label={`និន្នាការ ${description}`}
    >
      <title>{description}</title>
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={tip.x} cy={tip.y} r={1.8} fill={stroke} />
    </svg>
  )
}

export default Sparkline
