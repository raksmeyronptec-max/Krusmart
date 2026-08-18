import { type ReactNode } from 'react'

/**
 * Title + question pair at the top of every setup step.
 *
 * The question is the element that does the work: §33 asks for one primary
 * action per screen, and phrasing each step as a plain question — "តើអ្នកកំពុង
 * បង្រៀននៅស្ថាប័នណា?" — is what keeps a screen from growing a second one.
 */
export function StepHeading({
  title,
  question,
  children,
}: {
  title: string
  question?: string
  children?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-col gap-1.5">
      <h1 className="kh-moul text-lg text-text-heading sm:text-xl">{title}</h1>
      {question && <p className="text-sm text-text-body">{question}</p>}
      {children}
    </header>
  )
}

export default StepHeading
