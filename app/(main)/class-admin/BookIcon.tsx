import {
  BookMarked,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  FilePen,
  Handshake,
  HeartHandshake,
  LifeBuoy,
  PackageOpen,
  Palette,
  Presentation,
  UsersRound,
  Weight,
  BookOpen,
} from 'lucide-react'

/**
 * Resolves a book's `icon` name to a component.
 *
 * The book registry is plain data (it is imported by server components and by
 * the print sheet), so it names its icon as a string rather than holding a React
 * element. This is the one place that mapping lives.
 */
const ICONS = {
  BookMarked,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  FilePen,
  Handshake,
  HeartHandshake,
  LifeBuoy,
  PackageOpen,
  Palette,
  Presentation,
  UsersRound,
  Weight,
} as const

export default function BookIcon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? BookOpen
  return <Icon className={className} aria-hidden="true" />
}
