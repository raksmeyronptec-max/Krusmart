"use client"

import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  type FormEvent,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle, Award, Check, CheckCircle2, Clock, FileSpreadsheet, Home, Info,
  List, MapPin, RotateCcw, Save, Upload, UserPlus, Users,
} from "lucide-react"

import { Button } from "@/components/ui/actions/Button"
import { ConfirmDialog } from "@/components/ui/overlay/ConfirmDialog"
import { notify } from "@/components/ui/feedback/notify"
import { PageContainer, PageHeader } from "@/components/shell/PageContainer"
import Select from "@/components/ui/forms/Select"
import SearchableSelect from "@/components/ui/forms/SearchableSelect"
import { useActiveClass } from "@/lib/hooks/useActiveClass"
import { CLASS_PARAM } from "@/lib/utils/scopeParam"
import { calculateAge } from "@/lib/utils/date"
import { getErrorMessage } from "@/lib/utils/errors"
import { toKhmerNumber } from "@/lib/utils/khmer-num"
import { logger } from "@/lib/utils/logger"
import type { StudentImportRow } from "@/lib/types"

import { createStudent, importStudents } from "./actions"
import { ImportDialog } from "./ImportDialog"
import {
  LocationField, PhotoPanel, ProgressRail, SectionCard, SectionChips, StatusGroup, TextField,
} from "./components"
import {
  INITIAL_STATE, ORPHAN_OPTIONS, POOR_OPTIONS, SECTIONS, YES_NO,
  clearDraft, enrollmentReducer, getDraftSnapshot, getServerDraftSnapshot, isDirty,
  requiredProgress, sectionProgress, subscribeToDraft, toFormData, validateAll, writeDraft,
  type FieldName, type SectionId,
} from "./formState"

type LocationTree = Record<string, Record<string, Record<string, string[]>>>

const AUTOSAVE_DELAY_MS = 800

/** Section a field belongs to, so an invalid field can be scrolled into view. */
const SECTION_OF_FIELD = new Map<FieldName, SectionId>(
  SECTIONS.flatMap((section) =>
    [...section.required, ...section.optional].map((field) => [field, section.id] as const)
  )
)

function formatSavedAt(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" })
}

export default function EnrollmentPage() {
  const router = useRouter()
  const urlSearchParams = useSearchParams()
  const { classId: contextClassId, loading: classLoading } = useActiveClass()

  // Which class this form writes into. The URL param wins: onboarding links
  // here as /enrollment?class=<id>, and it is available immediately while
  // TeacherContext is still hydrating. The server re-validates whichever id is
  // sent against the caller's own assignments, so neither source is trusted.
  const activeClassId = urlSearchParams.get(CLASS_PARAM) ?? contextClassId
  const [state, dispatch] = useReducer(enrollmentReducer, INITIAL_STATE)
  const { values, errors, sameAsBirth } = state

  const [locations, setLocations] = useState<LocationTree | null>(null)
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [locationsFailed, setLocationsFailed] = useState(false)

  const [activeSection, setActiveSection] = useState<SectionId>("student-details")
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showReset, setShowReset] = useState(false)

  /**
   * `?import=1` opens the Excel importer straight away, so onboarding's
   * "នាំចូលសិស្សពី Excel" lands on the importer rather than on the manual form
   * with a second click still to make.
   *
   * Read from `window.location` rather than `useSearchParams()` on purpose:
   * this page *is* the client component, so there is no server page above it to
   * host the Suspense boundary that `useSearchParams` requires — the pattern
   * `score/enter` uses. An effect needs no boundary and cannot affect how this
   * route renders.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("import") !== "1") return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount. The rule targets state *derived* from props/state, which cascades; this is a one-shot read of an external source that cannot arrive as a prop (see above), and the dialog stays user-closable afterwards.
    setShowImport(true)
  }, [])

  const formRef = useRef<HTMLFormElement>(null)
  /** Suppresses the unsaved-work prompt while we are deliberately navigating away. */
  const leavingRef = useRef(false)

  const dirty = isDirty(values)
  const progress = requiredProgress(values)
  const errorCount = Object.keys(errors).length

  const set = useCallback((name: FieldName, value: string) => dispatch({ type: "set", name, value }), [])
  const blur = useCallback((name: FieldName) => dispatch({ type: "blur", name }), [])

  /* ─── Location tree ─── */

  useEffect(() => {
    const controller = new AbortController()
    fetch("/locations.json", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((tree: LocationTree) => setLocations(tree))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return
        logger.error("locations:", error)
        setLocationsFailed(true)
      })
      .finally(() => setLocationsLoading(false))
    return () => controller.abort()
  }, [])

  /* ─── Draft: offered, never applied behind the teacher's back ─── */

  const storedDraft = useSyncExternalStore(subscribeToDraft, getDraftSnapshot, getServerDraftSnapshot)
  // Hidden the moment the form has content of its own: restoring over typing
  // would destroy it, and the autosave that follows is the teacher's own work.
  const pendingDraft = dirty ? null : storedDraft

  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => setSavedAt(writeDraft(values, sameAsBirth)), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [values, sameAsBirth, dirty])

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  /* ─── Which section is on screen ─── */

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length) setActiveSection(visible[0].target.id as SectionId)
      },
      { rootMargin: "-20% 0px -60% 0px" }
    )
    SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  /* ─── Ctrl/Cmd+S ─── */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  /* ─── Derived option lists ─── */

  const provinces = useMemo(() => (locations ? Object.keys(locations) : []), [locations])
  const options = (province: string, district?: string, commune?: string) => {
    if (!district) return Object.keys(locations?.[province] ?? {})
    if (!commune) return Object.keys(locations?.[province]?.[district] ?? {})
    return locations?.[province]?.[district]?.[commune] ?? []
  }

  const age = values.dob ? calculateAge(values.dob) : null

  /* ─── Navigation and submission ─── */

  const goToSection = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveSection(id)
  }

  const focusField = (name: FieldName) => {
    const section = SECTION_OF_FIELD.get(name)
    if (section) setActiveSection(section)
    const element = document.getElementById(name)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      element.focus({ preventScroll: true })
    } else if (section) {
      goToSection(section)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateAll(values)
    dispatch({ type: "setErrors", errors: found })

    const firstInvalid = Object.keys(found)[0] as FieldName | undefined
    if (firstInvalid) {
      notify.error(`នៅសល់ ${toKhmerNumber(Object.keys(found).length)} វាលដែលត្រូវពិនិត្យ។`)
      focusField(firstInvalid)
      return
    }
    setShowConfirm(true)
  }

  const confirmSave = async () => {
    // No URL param and the context has not resolved yet: sending no class
    // would let the server fall back to the homeroom assignment, silently
    // filing the student into a class other than the one on screen.
    if (!activeClassId && classLoading) {
      setSubmitError("កំពុងផ្ទុកទិន្នន័យថ្នាក់ សូមរង់ចាំបន្តិច រួចព្យាយាមម្តងទៀត។")
      setShowConfirm(false)
      return
    }
    setIsSaving(true)
    setSubmitError(null)
    try {
      // The active class travels as a parameter, same as deleteAllStudents:
      // the server validates it against the caller's own assignments.
      const result = await createStudent(toFormData(values), activeClassId ?? undefined)
      if (result?.error) {
        setSubmitError(result.error)
        setShowConfirm(false)
        return
      }
      leavingRef.current = true
      clearDraft()
      notify.success(`បានរក្សាទុក ${values.studentName} ដោយជោគជ័យ។`)
      router.push("/student-list")
    } catch (error: unknown) {
      setSubmitError(`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${getErrorMessage(error)}`)
      setShowConfirm(false)
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    dispatch({ type: "reset" })
    clearDraft()
    setSavedAt(null)
    setSubmitError(null)
    setShowReset(false)
    notify.success("បានសម្អាតបែបបទទាំងអស់។")
  }

  const downloadTemplate = () => {
    const link = document.createElement("a")
    link.href = "/sample_data.xlsx"
    link.download = "sample_data.xlsx"
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const runImport = async (students: StudentImportRow[]): Promise<string | null> => {
    if (!activeClassId && classLoading) {
      // Same guard as confirmSave — a whole spreadsheet in the wrong class is
      // strictly worse than one student.
      const message = "កំពុងផ្ទុកទិន្នន័យថ្នាក់ សូមរង់ចាំបន្តិច រួចព្យាយាមម្តងទៀត។"
      notify.error(message)
      return message
    }
    try {
      const result = await importStudents(students, activeClassId ?? undefined)
      if (result?.error) {
        notify.error(result.error)
        return result.error
      }
      leavingRef.current = true
      notify.success(`បានបញ្ចូលសិស្ស ${toKhmerNumber(students.length)} នាក់ដោយជោគជ័យ។`)
      setShowImport(false)
      router.push("/student-list")
      return null
    } catch (error: unknown) {
      const message = `មានបញ្ហាក្នុងការនាំចូល៖ ${getErrorMessage(error)}`
      notify.error(message)
      return message
    }
  }

  /* ─── Render ─── */

  return (
    <PageContainer>
      <PageHeader
        title="ចុះឈ្មោះសិស្សថ្មី"
        description="បំពេញព័ត៌មានចាំបាច់ជាមុនសិន ហើយបន្ថែមព័ត៌មានលម្អិតតាមតម្រូវការ។"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => setShowReset(true)} disabled={!dirty}>
              សម្អាត
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={downloadTemplate}>
              គំរូ Excel
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />}
              onClick={() => setShowImport(true)}>
              នាំចូល
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={<List className="h-4 w-4" />}
              onClick={() => router.push("/student-list")}>
              បញ្ជីសិស្ស
            </Button>
          </>
        }
      />

      {/* An offer, not a surprise: the old page restored silently and told the
          teacher it had loaded a draft that in fact held almost nothing. */}
      {pendingDraft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/25 bg-brand/5 p-3 sm:p-4">
          <Clock className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-text-heading">មានបែបបទដែលមិនទាន់រក្សាទុក</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {pendingDraft.values.studentName || pendingDraft.values.studentId || "បែបបទមិនទាន់បញ្ចប់"}
              {pendingDraft.savedAt ? ` · ${formatSavedAt(pendingDraft.savedAt)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={clearDraft}>
              លុបចោល
            </Button>
            <Button type="button" size="sm" icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => { dispatch({ type: "restore", draft: pendingDraft }); notify.success("បានស្តារបែបបទឡើងវិញ។") }}>
              ស្តារឡើងវិញ
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        <ProgressRail values={values} errors={errors} activeSection={activeSection} onNavigate={goToSection} />

        <div className="min-w-0 flex-1">
          <SectionChips values={values} errors={errors} activeSection={activeSection} onNavigate={goToSection} />

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
            {submitError && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-extrabold">មិនអាចរក្សាទុកបានទេ</p>
                  <p className="mt-1 leading-6">{submitError}</p>
                </div>
              </div>
            )}

            {/* 1 — Student details */}
            <SectionCard
              section={SECTIONS[0]}
              state={sectionProgress(SECTIONS[0], values, errors).state}
              errorCount={sectionProgress(SECTIONS[0], values, errors).errorCount}
            >
              <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <PhotoPanel value={values.photoUrl} onChange={(url) => set("photoUrl", url)} />

                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  <TextField label="អត្តលេខ" name="studentId" required autoComplete="off" placeholder="ឧ. ២០២៦-០០១"
                    value={values.studentId} error={errors.studentId}
                    onChange={(e) => set("studentId", e.target.value)} onBlur={() => blur("studentId")} />

                  <TextField label="ថ្នាក់ទី" name="grade" required autoComplete="off" placeholder="ឧ. ១ក"
                    value={values.grade} error={errors.grade}
                    onChange={(e) => set("grade", e.target.value)} onBlur={() => blur("grade")} />

                  <TextField label="ឈ្មោះសិស្ស (ខ្មែរ)" name="studentName" required autoComplete="off"
                    placeholder="គោត្តនាម និងនាម" value={values.studentName} error={errors.studentName}
                    onChange={(e) => set("studentName", e.target.value)} onBlur={() => blur("studentName")} />

                  <TextField label="ឈ្មោះឡាតាំង" name="latinName" autoComplete="off" placeholder="Latin name"
                    value={values.latinName} onChange={(e) => set("latinName", e.target.value)} />

                  <Select id="gender" name="gender" label="ភេទ" required placeholder="ជ្រើសរើសភេទ"
                    options={["ប្រុស", "ស្រី"]} value={values.gender}
                    onChange={(value) => { set("gender", value); blur("gender") }} />

                  <TextField label="ថ្ងៃខែឆ្នាំកំណើត" name="dob" required type="date"
                    max={new Date().toISOString().split("T")[0]}
                    value={values.dob} error={errors.dob}
                    onChange={(e) => set("dob", e.target.value)} onBlur={() => blur("dob")} />

                  {/* Read-only mirror of the date above — it is never submitted,
                      it exists so a mistyped year is obvious immediately. */}
                  <TextField label="អាយុ (ឆ្នាំ)" name="calculatedAge" readOnly tabIndex={-1}
                    value={age !== null && age >= 0 ? toKhmerNumber(age) : ""}
                    placeholder="គណនាស្វ័យប្រវត្តិ"
                    className="bg-paper font-bold text-text-muted"
                    hint="គណនាតាមថ្ងៃខែឆ្នាំកំណើត" />

                  <TextField label="លេខទូរស័ព្ទអាណាព្យាបាល" name="phone" type="tel" inputMode="tel"
                    autoComplete="tel" placeholder="ឧ. ០១២ ៣៤៥ ៦៧៨"
                    wrapperClassName="sm:col-span-2 xl:col-span-2"
                    value={values.phone} error={errors.phone}
                    onChange={(e) => set("phone", e.target.value)} onBlur={() => blur("phone")} />
                </div>
              </div>
            </SectionCard>

            {/* 2 — Addresses */}
            <SectionCard
              section={SECTIONS[1]}
              state={sectionProgress(SECTIONS[1], values, errors).state}
              errorCount={sectionProgress(SECTIONS[1], values, errors).errorCount}
            >
              {locationsFailed && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  មិនអាចផ្ទុកបញ្ជីទីតាំងបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត ហើយផ្ទុកទំព័រឡើងវិញ។
                </p>
              )}

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-lg border border-divider bg-paper p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-text-heading">ទីកន្លែងកំណើត</h3>
                      <p className="text-xs text-text-muted">អាសយដ្ឋាននៅពេលកំណើត</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <LocationField label="រាជធានី/ខេត្ត" required error={errors.birthProvince}>
                      <SearchableSelect id="birthProvince" name="birthProvince" ariaLabel="រាជធានី ឬខេត្តកំណើត"
                        placeholder="ជ្រើសរើសខេត្ត" options={provinces} value={values.birthProvince}
                        loading={locationsLoading} clearable
                        onChange={(value) => { set("birthProvince", value); blur("birthProvince") }} />
                    </LocationField>
                    <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ" required error={errors.birthDistrict}>
                      <SearchableSelect id="birthDistrict" name="birthDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌកំណើត"
                        placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={options(values.birthProvince)}
                        value={values.birthDistrict} disabled={!values.birthProvince} clearable
                        onChange={(value) => { set("birthDistrict", value); blur("birthDistrict") }} />
                    </LocationField>
                    <LocationField label="ឃុំ/សង្កាត់" required error={errors.birthCommune}>
                      <SearchableSelect id="birthCommune" name="birthCommune" ariaLabel="ឃុំ ឬសង្កាត់កំណើត"
                        placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={options(values.birthProvince, values.birthDistrict)}
                        value={values.birthCommune} disabled={!values.birthDistrict} clearable
                        onChange={(value) => { set("birthCommune", value); blur("birthCommune") }} />
                    </LocationField>
                    <LocationField label="ភូមិ" required error={errors.birthVillage}>
                      <SearchableSelect id="birthVillage" name="birthVillage" ariaLabel="ភូមិកំណើត"
                        placeholder="ជ្រើសរើសភូមិ"
                        options={options(values.birthProvince, values.birthDistrict, values.birthCommune)}
                        value={values.birthVillage} disabled={!values.birthCommune} clearable
                        onChange={(value) => { set("birthVillage", value); blur("birthVillage") }} />
                    </LocationField>
                  </div>
                </div>

                <div className={`rounded-lg border bg-paper p-4 ${sameAsBirth ? "border-success/30" : "border-divider"}`}>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Home className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold text-text-heading">អាសយដ្ឋានសព្វថ្ងៃ</h3>
                      <p className="text-xs text-text-muted">ទីលំនៅបច្ចុប្បន្នរបស់សិស្ស</p>
                    </div>
                  </div>

                  {/* Moved next to the fields it governs — as a banner above both
                      columns it read as applying to the birth address too. */}
                  <label htmlFor="same-as-birth"
                    className="mb-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-brand/20 bg-brand/5 px-3">
                    <input id="same-as-birth" type="checkbox" checked={sameAsBirth}
                      onChange={(e) => dispatch({ type: "sameAsBirth", value: e.target.checked })}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-divider text-brand focus:ring-2 focus:ring-focus-ring/40" />
                    <span className="text-sm font-bold text-text-heading">ដូចទីកន្លែងកំណើត</span>
                    {sameAsBirth && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-extrabold text-success">
                        <Check className="h-3 w-3" aria-hidden="true" /> បានភ្ជាប់
                      </span>
                    )}
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <LocationField label="រាជធានី/ខេត្ត">
                      <SearchableSelect id="currProvince" name="currProvince" ariaLabel="រាជធានី ឬខេត្តសព្វថ្ងៃ"
                        placeholder="ជ្រើសរើសខេត្ត" options={provinces} value={values.currProvince}
                        loading={locationsLoading} disabled={sameAsBirth} clearable
                        onChange={(value) => set("currProvince", value)} />
                    </LocationField>
                    <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ">
                      <SearchableSelect id="currDistrict" name="currDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌសព្វថ្ងៃ"
                        placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={options(values.currProvince)}
                        value={values.currDistrict} disabled={sameAsBirth || !values.currProvince} clearable
                        onChange={(value) => set("currDistrict", value)} />
                    </LocationField>
                    <LocationField label="ឃុំ/សង្កាត់">
                      <SearchableSelect id="currCommune" name="currCommune" ariaLabel="ឃុំ ឬសង្កាត់សព្វថ្ងៃ"
                        placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={options(values.currProvince, values.currDistrict)}
                        value={values.currCommune} disabled={sameAsBirth || !values.currDistrict} clearable
                        onChange={(value) => set("currCommune", value)} />
                    </LocationField>
                    <LocationField label="ភូមិ">
                      <SearchableSelect id="currVillage" name="currVillage" ariaLabel="ភូមិសព្វថ្ងៃ"
                        placeholder="ជ្រើសរើសភូមិ"
                        options={options(values.currProvince, values.currDistrict, values.currCommune)}
                        value={values.currVillage} disabled={sameAsBirth || !values.currCommune} clearable
                        onChange={(value) => set("currVillage", value)} />
                    </LocationField>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* 3 — Status */}
            <SectionCard
              section={SECTIONS[2]}
              state={sectionProgress(SECTIONS[2], values, errors).state}
              errorCount={0}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatusGroup title="ស្ថានភាពសិក្សា" icon={Award} tone="brand">
                  <Select name="isNewStudent" label="សិស្សថ្មី" options={YES_NO}
                    value={values.isNewStudent} onChange={(v) => set("isNewStudent", v)} />
                  <Select name="isRepeater" label="សិស្សត្រួតថ្នាក់" options={YES_NO}
                    value={values.isRepeater} onChange={(v) => set("isRepeater", v)} />
                </StatusGroup>
                <StatusGroup title="ស្ថានភាពសង្គម" icon={Users} tone="warning">
                  <Select name="orphanStatus" label="ស្ថានភាពគ្រួសារ (កំព្រា)" options={ORPHAN_OPTIONS}
                    value={values.orphanStatus} onChange={(v) => set("orphanStatus", v)} />
                  <Select name="isDisabled" label="ពិការភាព" options={YES_NO}
                    value={values.isDisabled} onChange={(v) => set("isDisabled", v)} />
                  <Select name="poorStatus" label="ប័ណ្ណក្រីក្រ" options={POOR_OPTIONS}
                    value={values.poorStatus} onChange={(v) => set("poorStatus", v)} />
                </StatusGroup>
                <StatusGroup title="ការគាំទ្រ" icon={CheckCircle2} tone="success">
                  <Select name="isEquity" label="សិស្សសមធម៌" options={YES_NO}
                    value={values.isEquity} onChange={(v) => set("isEquity", v)} />
                  <Select name="isScholarship" label="អាហារូបករណ៍" options={YES_NO}
                    value={values.isScholarship} onChange={(v) => set("isScholarship", v)} />
                </StatusGroup>
              </div>
            </SectionCard>

            {/* 4 — Guardians */}
            <SectionCard
              section={SECTIONS[3]}
              state={sectionProgress(SECTIONS[3], values, errors).state}
              errorCount={0}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {([
                  { key: "father", title: "ឪពុក", nameField: "fatherName", jobField: "fatherJob", tone: "bg-brand/10 text-brand" },
                  { key: "mother", title: "ម្តាយ", nameField: "motherName", jobField: "motherJob", tone: "bg-success/10 text-success" },
                  { key: "guardian", title: "អាណាព្យាបាល", nameField: "guardianName", jobField: "guardianJob", tone: "bg-warning/10 text-warning" },
                ] as const).map((group) => (
                  <div key={group.key} className="rounded-lg border border-divider bg-paper p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${group.tone}`}>
                        <Users className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className="text-sm font-extrabold text-text-heading">{group.title}</p>
                    </div>
                    <div className="grid gap-4">
                      <TextField label={`ឈ្មោះ${group.title}`} name={group.nameField} placeholder="ឈ្មោះពេញ"
                        autoComplete="off" value={values[group.nameField]}
                        onChange={(e) => set(group.nameField, e.target.value)} />
                      <TextField label="មុខរបរ" name={group.jobField} placeholder="មុខរបរ" autoComplete="off"
                        value={values[group.jobField]} onChange={(e) => set(group.jobField, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* 5 — Additional */}
            <SectionCard
              section={SECTIONS[4]}
              state={sectionProgress(SECTIONS[4], values, errors).state}
              errorCount={0}
            >
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
                <TextField label="ជនជាតិដើមភាគតិច" name="ethnicity" placeholder="ឧ. ព្នង, គួយ" autoComplete="off"
                  value={values.ethnicity} onChange={(e) => set("ethnicity", e.target.value)} />
                <TextField label="លក្ខណៈពិសេស" name="specialFeatures" placeholder="លក្ខណៈផ្សេងៗ" autoComplete="off"
                  value={values.specialFeatures} onChange={(e) => set("specialFeatures", e.target.value)} />
                <TextField label="សេចក្តីផ្សេងៗ" name="otherRemarks" placeholder="ព័ត៌មានបន្ថែម" autoComplete="off"
                  value={values.otherRemarks} onChange={(e) => set("otherRemarks", e.target.value)} />
              </div>
            </SectionCard>

            {/* Save bar. The offset is the bottom nav's own height (56px) plus
                its safe-area padding plus a gap — a flat value overlapped the
                nav's last row on a phone with a home indicator. From `lg` the
                bar is not rendered and the button sits at the edge. */}
            <div className="sticky bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)] z-20 rounded-xl border border-divider bg-bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {/* Announced politely so a screen-reader user hears progress
                      change without the form stealing focus. */}
                  <p aria-live="polite" className="flex items-center gap-2 text-sm">
                    {errorCount > 0 ? (
                      <>
                        <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                        <span className="font-bold text-danger">
                          ត្រូវពិនិត្យ {toKhmerNumber(errorCount)} វាល
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${progress.done === progress.total ? "text-success" : "text-text-muted"}`} aria-hidden="true" />
                        <span className="text-text-muted">
                          ព័ត៌មានចាំបាច់{" "}
                          <span className="font-extrabold text-text-heading tabular-nums">
                            {toKhmerNumber(progress.done)}/{toKhmerNumber(progress.total)}
                          </span>
                        </span>
                      </>
                    )}
                  </p>
                  {savedAt && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                      <Save className="h-3 w-3" aria-hidden="true" />
                      រក្សាទុកជាសេចក្តីព្រាង · {formatSavedAt(savedAt)}
                    </p>
                  )}
                </div>

                <Button type="submit" variant="success" loading={isSaving}
                  icon={<UserPlus className="h-4 w-4" aria-hidden="true" />} className="w-full sm:w-auto">
                  រក្សាទុកព័ត៌មានសិស្ស
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={runImport}
        onDownloadTemplate={downloadTemplate}
      />

      <ConfirmDialog
        open={showConfirm}
        tone="warning"
        title="បញ្ជាក់ការរក្សាទុក"
        confirmLabel="បញ្ជាក់រក្សាទុក"
        cancelLabel="ពិនិត្យម្តងទៀត"
        loading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setShowConfirm(false)}
        message={
          <>
            បង្កើតកំណត់ត្រាសិស្សសម្រាប់{" "}
            <span className="font-extrabold text-text-heading">{values.studentName}</span>{" "}
            (អត្តលេខ {values.studentId}, ថ្នាក់ទី {values.grade})
            {age !== null && age >= 0 ? ` អាយុ ${toKhmerNumber(age)} ឆ្នាំ` : ""}?
          </>
        }
      />

      <ConfirmDialog
        open={showReset}
        tone="danger"
        title="សម្អាតបែបបទ?"
        message="ព័ត៌មានទាំងអស់ក្នុងបែបបទ និងសេចក្តីព្រាងនឹងត្រូវលុប ហើយមិនអាចទាញយកវិញបានទេ។"
        confirmLabel="បាទ សម្អាត"
        onConfirm={resetForm}
        onCancel={() => setShowReset(false)}
      />
    </PageContainer>
  )
}
