'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, History, Loader2, PenSquare } from 'lucide-react'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

import { addAssignment, deleteAssignment, getAssignments, uploadHomeworkPhoto } from './actions'
import { HomeworkComposer, type HomeworkDraft } from './HomeworkComposer'
import { HomeworkAssignmentToolbar, type BucketFilter } from './HomeworkAssignmentToolbar'
import { HomeworkAssignmentList } from './HomeworkAssignmentList'
import { dueInfo, type DueBucket } from './assignmentStatus'
import type { HomeworkAssignment } from '@/lib/types'

/**
 * ផ្ញើកិច្ចការទៅអាណាព្យាបាល — the homework publisher.
 *
 * Two jobs, side by side on a laptop and stacked on a phone with the composer
 * first: write one assignment, and keep an eye on the ones already out there.
 *
 * What the screen is careful *not* to claim:
 *
 *  - It never says an assignment was "sent to N parents". `homework_assignments`
 *    holds no recipients, no receipts and no per-child rows; the RLS policy
 *    matches on the teacher, so the row becomes readable to the linked parents
 *    of every pupil this teacher is assigned to. The composer says exactly that.
 *  - It never shows a delivery or read state, because none is recorded.
 *  - Status is derived from `due_date` alone — see `assignmentStatus.ts`.
 *
 * The photo still goes to imgbb through the `uploadHomeworkPhoto` server
 * action, which is where the API key lives. Nothing in this file, and nothing
 * in the browser bundle, ever holds a key. See the note in `actions.ts`.
 */

export interface HomeworkSendClientProps {
  userId: string
  /** Fetched on the server, so the list is never blank on first paint. */
  initialAssignments: HomeworkAssignment[]
}

export default function HomeworkSendClient({
  userId,
  initialAssignments,
}: HomeworkSendClientProps) {
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>(initialAssignments)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')

  const [photoTarget, setPhotoTarget] = useState<HomeworkAssignment | null>(null)
  const { confirm, dialog } = useConfirm()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setAssignments(await getAssignments())
    } finally {
      setRefreshing(false)
    }
  }, [])

  // ------------------------------------------------------------- publishing

  const publish = useCallback(
    async (draft: HomeworkDraft): Promise<boolean> => {
      setSubmitting(true)
      try {
        let imageUrl: string | null = null

        if (draft.imageDataUrl?.startsWith('data:image')) {
          // The upload runs on the server; the key never reaches the browser.
          const name = `HW_${userId.substring(0, 5)}_${draft.subject.substring(0, 10)}`
          const upload = await uploadHomeworkPhoto(draft.imageDataUrl, name)
          if (upload.error || !upload.url) {
            throw new Error(upload.error ?? 'មានបញ្ហាក្នុងការផ្ទុករូបភាព')
          }
          imageUrl = upload.url
        }

        const res = await addAssignment({
          subject: draft.subject,
          title: draft.title,
          description: draft.description,
          due_date: draft.dueDate,
          image_url: imageUrl,
          status: 'active',
        })
        if (res.error) throw new Error(res.error)

        notify.success(`បានផ្សាយ «${draft.title}» — អាណាព្យាបាលដែលបានភ្ជាប់អាចមើលឃើញហើយ`)
        await refresh()
        return true
      } catch (error) {
        logger.error(error)
        notify.error(getErrorMessageOr(error, 'ផ្សាយមិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។'))
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [refresh, userId],
  )

  // --------------------------------------------------------------- deleting

  const remove = useCallback(
    async (assignment: HomeworkAssignment) => {
      if (
        !(await confirm({
          title: 'លុបកិច្ចការផ្ទះ',
          message: `កិច្ចការ «${assignment.title}» (${assignment.subject}) នឹងត្រូវលុបចេញជាអចិន្ត្រៃយ៍ ហើយអាណាព្យាបាលនឹងលែងឃើញវាទៀត។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`,
          confirmLabel: 'លុបកិច្ចការនេះ',
        }))
      ) {
        return
      }

      setDeletingId(assignment.id)
      try {
        const res = await deleteAssignment(assignment.id)
        if (res.error) throw new Error(res.error)

        setAssignments((prev) => prev.filter((a) => a.id !== assignment.id))
        notify.success(`បានលុប «${assignment.title}»`)
      } catch (error) {
        logger.error(error)
        notify.error(getErrorMessageOr(error, 'លុបមិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។'))
      } finally {
        setDeletingId(null)
      }
    },
    [confirm],
  )

  // -------------------------------------------------------------- filtering

  const subjectOptions = useMemo(
    () => [...new Set(assignments.map((a) => a.subject))].sort((a, b) => a.localeCompare(b, 'km')),
    [assignments],
  )

  const counts = useMemo(() => {
    const out: Record<DueBucket, number> = { today: 0, upcoming: 0, overdue: 0 }
    for (const a of assignments) out[dueInfo(a.due_date)?.bucket ?? 'upcoming'] += 1
    return out
  }, [assignments])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assignments.filter((a) => {
      if (subjectFilter && a.subject !== subjectFilter) return false
      if (bucketFilter !== 'all' && (dueInfo(a.due_date)?.bucket ?? 'upcoming') !== bucketFilter) {
        return false
      }
      if (!q) return true
      return [a.title, a.description, a.subject].some((f) =>
        String(f ?? '').toLowerCase().includes(q),
      )
    })
  }, [assignments, query, subjectFilter, bucketFilter])

  const filtering = query.trim() !== '' || subjectFilter !== '' || bucketFilter !== 'all'

  const clearFilters = () => {
    setQuery('')
    setSubjectFilter('')
    setBucketFilter('all')
  }

  // ----------------------------------------------------------------- render

  return (
    <PageContainer>
      <PageHeader
        title="ផ្ញើកិច្ចការទៅអាណាព្យាបាល"
        description="បង្កើតកិច្ចការផ្ទះ រួចផ្សាយឱ្យអាណាព្យាបាលមើលឃើញក្នុងកម្មវិធីរបស់ពួកគាត់"
        actions={
          <Link
            href="/homework/enter"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <PenSquare className="h-4 w-4" aria-hidden="true" /> បញ្ចូលពិន្ទុកិច្ចការផ្ទះ
          </Link>
        }
      />

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------------- composer */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5 lg:sticky lg:top-4">
            <HomeworkComposer onPublish={publish} submitting={submitting} onError={notify.error} />
          </div>
        </div>

        {/* -------------------------------------------------------- history */}
        <div className="lg:col-span-7">
          <div className="flex flex-col gap-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5">
            <h2 className="kh-moul flex items-center gap-2 border-b border-divider pb-3 text-base text-brand">
              <History className="h-5 w-5" aria-hidden="true" /> កិច្ចការដែលបានផ្សាយ
              {refreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-label="កំពុងធ្វើបច្ចុប្បន្នភាព" />
              )}
            </h2>

            <HomeworkAssignmentToolbar
              total={assignments.length}
              shown={visible.length}
              query={query}
              onQueryChange={setQuery}
              subject={subjectFilter}
              onSubjectChange={setSubjectFilter}
              subjectOptions={subjectOptions}
              bucket={bucketFilter}
              onBucketChange={setBucketFilter}
              counts={counts}
              onClear={clearFilters}
            />

            {/*
              The list is not boxed into a fixed-height scroller. The old panel
              was `h-[calc(100vh-140px)]` with its own scrollbar, which on a
              phone produced a short window scrolling inside a scrolling page.
            */}
            <HomeworkAssignmentList
              assignments={visible}
              loading={false}
              filtered={filtering}
              onClearFilters={clearFilters}
              onDelete={remove}
              onOpenImage={setPhotoTarget}
              deletingId={deletingId}
            />

            {/*
              The parent app, kept as a quiet utility. Deliberately unadorned:
              the repository contains the parent portal under `/parent`, but
              this points at a separate deployment, so the link says where it
              goes and claims nothing more.
            */}
            <p className="border-t border-divider pt-3 text-xs text-text-muted">
              <a
                href="https://portal-parent-v2.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-text-body underline-offset-2 hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                បើកកម្មវិធីអាណាព្យាបាល
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">(បើកក្នុងផ្ទាំងថ្មី)</span>
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* The photo, full size — named, focus-trapped and Escape-dismissable. */}
      <Dialog
        open={photoTarget !== null}
        onClose={() => setPhotoTarget(null)}
        title={photoTarget?.title ?? 'រូបភាពកិច្ចការផ្ទះ'}
        description={photoTarget?.subject}
        size="lg"
      >
        {photoTarget?.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- teacher-uploaded remote image; next/image needs an allow-listed host
          <img
            src={photoTarget.image_url}
            alt={`រូបភាពភ្ជាប់សម្រាប់កិច្ចការ ${photoTarget.title}`}
            className="h-auto max-h-[70vh] w-full rounded-xl bg-paper object-contain"
          />
        )}
      </Dialog>

      {dialog}
    </PageContainer>
  )
}
