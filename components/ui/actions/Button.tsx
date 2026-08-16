"use client"

import { forwardRef } from "react"
import { Loader2 } from "lucide-react"

/**
 * The action button for the teacher and admin apps.
 *
 * Every page previously hand-rolled its own — `bg-[#0054a6] hover:bg-blue-700
 * px-5 py-2.5 rounded-xl font-bold` and a dozen near-misses of it. This is the
 * single vocabulary for those, built only from the semantic tokens in
 * `globals.css` so light, dark and print all follow from the palette.
 *
 * Variants encode *meaning*, not colour: pick `danger` because the action
 * destroys something, not because you want red. `gold` is reserved for
 * achievement surfaces — rankings, honour roll, certificates.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "ghost"
  | "gold"

export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and disables the button. */
  loading?: boolean
  /** Leading icon; hidden from assistive tech, the label carries the meaning. */
  icon?: React.ReactNode
  /**
   * Hide this button when printing. Most action buttons should — a printed
   * certificate has no use for a "Save" control — but a few live inside
   * surfaces that are already excluded by their own `.no-print` wrapper.
   */
  printHidden?: boolean
  children: React.ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Navy carries primary structure in light mode; the token flips to cyan on
  // dark, where navy would vanish into the ground.
  primary: "bg-brand text-brand-contrast hover:bg-brand-hover",
  secondary: "border border-divider bg-bg-surface text-text-heading hover:bg-paper",
  success: "bg-success text-white hover:opacity-90",
  // Consequential but not destructive — bulk imports and overrides should not
  // resemble either a routine primary action or an irreversible deletion.
  warning: "bg-warning text-white hover:opacity-90",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "bg-transparent text-text-body hover:bg-paper",
  gold: "bg-gold text-brand-950 hover:opacity-90",
}

/**
 * `min-h-11` is 44px — the iOS/Android touch-target convention this app's
 * teacher workflows are built to. `sm` keeps a 32px visual height on desktop
 * but still meets the floor on coarse pointers.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 min-h-11 px-3 text-xs sm:min-h-8",
  md: "h-10 min-h-11 px-4 text-sm sm:min-h-10",
  lg: "h-12 min-h-12 px-6 text-base",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    printHidden = true,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        printHidden ? "print:hidden" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
})

export default Button
