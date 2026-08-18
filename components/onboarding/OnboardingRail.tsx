'use client'

import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { ONBOARDING_STEPS, stepForPath } from '@/lib/onboarding/state'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * The four-step progress indicator (§29).
 *
 * A client component only because a server layout cannot read the pathname, and
 * the rail must highlight the step the teacher is actually on. It renders no
 * links: a step is reached by completing the one before it, so making the
 * markers navigable would offer a route into a state the data does not support
 * yet — the layout gate would simply bounce them back.
 *
 * `aria-current="step"` carries the position for assistive tech; the ✓ and the
 * filled marker carry it visually. Neither relies on colour alone.
 */
export function OnboardingRail() {
  const pathname = usePathname()
  const current = stepForPath(pathname)
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.key === current)

  if (currentIndex < 0) return null

  return (
    <nav aria-label="ដំណើរការរៀបចំ" className="w-full">
      <p className="mb-3 text-center text-xs font-bold text-text-muted">
        ជំហានទី {toKhmerNumber(currentIndex + 1)} / {toKhmerNumber(ONBOARDING_STEPS.length)}
      </p>

      <ol className="flex items-center justify-center gap-1 sm:gap-2">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = i < currentIndex
          const active = i === currentIndex

          return (
            <li key={step.key} className="flex min-w-0 items-center gap-1 sm:gap-2">
              <div
                className="flex min-w-0 flex-col items-center gap-1.5"
                aria-current={active ? 'step' : undefined}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                    done
                      ? 'border-success bg-success text-white'
                      : active
                        ? 'border-brand bg-brand text-brand-contrast'
                        : 'border-divider bg-bg-surface text-text-muted',
                  ].join(' ')}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : toKhmerNumber(i + 1)}
                </span>

                <span
                  className={[
                    'truncate text-[10px] leading-tight sm:text-[11px]',
                    active ? 'font-bold text-text-heading' : 'text-text-muted',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>

              {i < ONBOARDING_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={[
                    'mb-5 h-0.5 w-4 shrink-0 rounded-full sm:w-10',
                    i < currentIndex ? 'bg-success' : 'bg-divider',
                  ].join(' ')}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default OnboardingRail
