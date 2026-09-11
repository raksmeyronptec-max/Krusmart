import { ATTENDANCE_MARKS, type AttendanceStatus } from "@/lib/attendance/status"

/**
 * Status pill for tables, rosters and score grids.
 *
 * The app is full of hand-rolled versions of this — attendance marks, pass/fail
 * chips, class-status labels, rank medals — each choosing its own greens and
 * reds. Variants here name the *meaning*, and the attendance vocabulary in
 * particular is fixed by `ATTENDANCE_BADGE` below so a "present" mark is the
 * same green on every screen and every printed sheet.
 *
 * Colour is never the only signal: pass a label, not a bare coloured dot.
 */

export type BadgeVariant = "info" | "success" | "warning" | "danger" | "gold" | "muted"
export type BadgeSize = "sm" | "md"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  /** Small leading glyph; decorative, the text carries the meaning. */
  icon?: React.ReactNode
  children: React.ReactNode
}

const VARIANTS: Record<BadgeVariant, string> = {
  info: "bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning-text",
  danger: "bg-danger/10 text-danger",
  gold: "bg-gold/10 text-gold",
  muted: "bg-paper text-text-muted",
}

const SIZES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-3 py-1 text-xs",
}

export function Badge({
  variant = "muted",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * How each attendance mark LOOKS. What it means is not decided here.
 *
 * ── Why this is derived and not typed out (Phase 17 D8) ───────────────────
 *
 * This map used to spell the four Khmer labels as string literals — a second
 * copy of `ATTENDANCE_MARKS[].label`. Two copies of one vocabulary drift, and
 * this one had: its own doc comment still asserted that the parent portal
 * called `L` **មកយឺត** and "should change", long after the portal had changed.
 * A comment describing a live contradiction that no longer exists is an
 * invitation to resolve it in the wrong direction.
 *
 * So the labels come from `lib/attendance/status.ts`, which is the single
 * declaration of what a mark is called. Only the *tone* is decided here,
 * because a colour is a property of this badge and not of the mark — and it is
 * never the only signal: the label always travels with it.
 *
 * `AP` is a legacy spelling of `L` that nothing writes, and it therefore takes
 * `L`'s label and `L`'s tone. It used to carry its own word and its own colour,
 * so one declared fact rendered two ways depending on which spelling was
 * stored.
 */
const BADGE_TONE: Record<AttendanceStatus, BadgeVariant> = {
  P: "success",
  L: "warning",
  A: "danger",
  AP: "warning",
}

export const ATTENDANCE_BADGE: Record<string, { label: string; variant: BadgeVariant }> =
  Object.fromEntries(
    ATTENDANCE_MARKS.map((m) => [m.code, { label: m.label, variant: BADGE_TONE[m.code] }]),
  )

/**
 * The same three marks as raw colours.
 *
 * The 3D classroom builds WebGL materials, which take a numeric colour and
 * cannot read a CSS class or custom property — so the palette has to exist in
 * both forms. `hex` and `three` are the same value; keeping them adjacent is
 * what stops the 2D and 3D views drifting apart.
 */
export const ATTENDANCE_COLORS: Record<"P" | "L" | "A", { hex: string; three: number }> = {
  P: { hex: "#16A36A", three: 0x16a36a },
  L: { hex: "#D99614", three: 0xd99614 },
  A: { hex: "#D9485F", three: 0xd9485f },
}

/**
 * A pupil nobody has marked yet.
 *
 * Deliberately not one of the three: "not marked" is not a mark, and a seat
 * that borrows the present colour for it is the 3D room's version of reporting
 * a register as finished when it is not. Neutral grey, distinct from all three.
 */
export const ATTENDANCE_UNMARKED_COLOR = { hex: "#94A3B8", three: 0x94a3b8 } as const

export default Badge
