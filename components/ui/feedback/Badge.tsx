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
  warning: "bg-warning/10 text-warning",
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
 * The attendance marks, with the Khmer labels the teacher app actually uses.
 *
 * `attendance.status` only ever holds `P`, `L` or `A` — nothing in the app
 * writes `AP`, even though the type union allows it. Note that both teacher
 * views label `L` as **ច្បាប់** (excused), not "late": that is the vocabulary
 * teachers enter against, so it is the one recorded here. The parent portal's
 * i18n calls the same code `មកយឺត`; the two disagree, and the portal is the
 * one that should change, since attendance is entered on this side.
 *
 * Keeping the mapping here means the seating plan, the monthly sheet and the
 * 3D view cannot drift apart about what colour a mark is.
 */
export const ATTENDANCE_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  P: { label: "វត្តមាន", variant: "success" },
  L: { label: "ច្បាប់", variant: "warning" },
  A: { label: "អវត្តមាន", variant: "danger" },
  /** Declared by the type but never written by any current screen. */
  AP: { label: "សុំច្បាប់", variant: "info" },
}

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

export default Badge
