"use client"

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useReducer,
  type InputHTMLAttributes,
  type ReactNode,
  type FormEvent,
} from "react"
import { Button } from "@/components/ui/actions/Button"
import { useRouter } from "next/navigation"
import {
  Award,
  Camera,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Home,
  Image as ImageIcon,
  Info,
  Link2,
  List,
  MapPin,
  Save,
  Smile,
  Upload,
  UserPlus,
  Users,
  X,
  Check,
  AlertCircle,
  Trash2,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react"
import toast from "react-hot-toast"
import * as XLSX from "xlsx-js-style"
import { createStudent, importStudents } from "./actions"
import Select from "@/components/ui/forms/Select"
import SearchableSelect from "@/components/ui/forms/SearchableSelect"
import { getErrorMessage } from "@/lib/utils/errors"
import { logger } from "@/lib/utils/logger"
import { calculateAge } from "@/lib/utils/date"
import type { SheetImportRow } from "@/lib/utils/xlsx"

type LocationTree = Record<string, Record<string, Record<string, string[]>>>

type SectionMeta = {
  id: string
  label: string
  icon: LucideIcon
  requiredFields: string[]
}

type FieldError = Record<string, string>

type FormState = {
  photoUrl: string
  photoUrlInput: string
  dob: string
  age: string
  birthProv: string
  birthDist: string
  birthComm: string
  birthVill: string
  currProv: string
  currDist: string
  currComm: string
  currVill: string
  sameAsBirth: boolean
  fieldErrors: FieldError
}

type FormAction =
  | { type: "SET_FIELD"; field: keyof FormState; value: any }
  | { type: "SET_ERROR"; field: string; message: string }
  | { type: "CLEAR_ERROR"; field: string }
  | { type: "CLEAR_ALL_ERRORS" }
  | { type: "RESET" }

const YES_NO = ["ទេ", "បាទ/ចាស"]

const SECTIONS: SectionMeta[] = [
  { id: "student-details", label: "ព័ត៌មានសិស្ស", icon: UserPlus, requiredFields: ["studentId", "grade", "studentName", "gender", "dob"] },
  { id: "addresses", label: "អាសយដ្ឋាន", icon: MapPin, requiredFields: ["birthProvince", "birthDistrict", "birthCommune", "birthVillage"] },
  { id: "student-status", label: "ស្ថានភាព", icon: Award, requiredFields: [] },
  { id: "guardians", label: "អាណាព្យាបាល", icon: Users, requiredFields: [] },
  { id: "additional-details", label: "បន្ថែម", icon: FileText, requiredFields: [] },
]

const AVATAR_GROUPS = [
  { key: "notionists", label: "តុក្កតា", seeds: [1, 3, 6, 9, 10, 13, 15, 17, 18, 19, 20, 23, 29, 52, 54, 58, 59, 64, 65, 68, 74, 75, 84] },
  { key: "avataaars", label: "មនុស្ស", seeds: [1, 2, 3, 5, 8, 12, 15, 18, 22, 25, 28, 32, 35, 38, 42, 45, 48, 52, 55, 58] },
  { key: "bottts", label: "រ៉ូបូត", seeds: [1, 2, 4, 7, 11, 14, 17, 21, 24, 27, 31, 34, 37, 41, 44, 47, 51, 54, 57, 60] },
] as const

const DRAFT_KEY = "krusmart_enrollment_draft"

const inputBase = [
  "min-h-11 w-full rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 text-[16px] text-text-heading",
  "placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus-ring/30",
  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-text-muted",
  "dark:bg-bg-surface dark:text-text-heading transition-colors",
].join(" ")

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value }
    case "SET_ERROR":
      return { ...state, fieldErrors: { ...state.fieldErrors, [action.field]: action.message } }
    case "CLEAR_ERROR": {
      const { [action.field]: _, ...rest } = state.fieldErrors
      return { ...state, fieldErrors: rest }
    }
    case "CLEAR_ALL_ERRORS":
      return { ...state, fieldErrors: {} }
    case "RESET":
      return {
        photoUrl: "", photoUrlInput: "", dob: "", age: "",
        birthProv: "", birthDist: "", birthComm: "", birthVill: "",
        currProv: "", currDist: "", currComm: "", currVill: "",
        sameAsBirth: false, fieldErrors: {},
      }
    default:
      return state
  }
}

/* ─── Sub-components ─── */

function ProgressSidebar({
  activeSection,
  completedSections,
  sectionErrors,
  onNavigate,
}: {
  activeSection: string
  completedSections: Set<string>
  sectionErrors: Record<string, number>
  onNavigate: (id: string) => void
}) {
  const progress = Math.round((completedSections.size / SECTIONS.length) * 100)
  return (
    <nav
      aria-label="ផ្នែកនៃការចុះឈ្មោះ"
      className="sticky top-4 hidden h-fit w-64 shrink-0 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm xl:block"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">វឌ្ឍនភាព</p>
          <p className="text-lg font-extrabold text-text-heading">{progress}%</p>
        </div>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-success transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="space-y-0.5">
        {SECTIONS.map((section, index) => {
          const isActive = activeSection === section.id
          const isComplete = completedSections.has(section.id)
          const errorCount = sectionErrors[section.id] ?? 0
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onNavigate(section.id)}
              className={[
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all",
                isActive
                  ? "bg-brand/10 text-brand shadow-sm ring-1 ring-brand/20"
                  : "text-text-body hover:bg-paper hover:text-text-heading",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold transition-colors",
                  isComplete
                    ? "bg-success text-white"
                    : errorCount > 0
                      ? "bg-danger/15 text-danger"
                      : isActive
                        ? "bg-brand text-brand-contrast"
                        : "bg-paper text-text-muted group-hover:bg-bg-surface",
                ].join(" ")}
              >
                {isComplete ? <Check className="h-4 w-4" /> : errorCount > 0 ? <AlertCircle className="h-4 w-4" /> : index + 1}
              </span>
              <span className="flex-1">{section.label}</span>
              {errorCount > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-extrabold text-white">
                  {errorCount}
                </span>
              )}
              {isActive && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
            </button>
          )
        })}
      </div>
      <div className="mt-4 rounded-xl border border-brand/10 bg-brand/5 p-3">
        <p className="text-xs leading-5 text-text-muted">
          បំពេញផ្នែកដែលមានសញ្ញា <span className="font-bold text-danger">*</span> ឱ្យគ្រប់គ្រាន់ ដើម្បីបញ្ចប់ការចុះឈ្មោះ។
        </p>
      </div>
    </nav>
  )
}

function MobileStepper({
  activeSection,
  completedSections,
  onNavigate,
}: {
  activeSection: string
  completedSections: Set<string>
  onNavigate: (id: string) => void
}) {
  return (
    <nav
      aria-label="ផ្នែកនៃការចុះឈ្មោះ"
      className="sticky top-0 z-30 -mx-4 mb-5 border-b border-divider bg-bg-app/95 px-4 py-3 backdrop-blur xl:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <span className="text-xs font-extrabold">{completedSections.size}/{SECTIONS.length}</span>
        </div>
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
          {SECTIONS.map((section, index) => {
            const isActive = activeSection === section.id
            const isComplete = completedSections.has(section.id)
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onNavigate(section.id)}
                className={[
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                  isActive
                    ? "border-brand bg-brand text-brand-contrast shadow-sm"
                    : isComplete
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-divider bg-bg-surface text-text-muted",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold",
                    isComplete
                      ? "bg-success text-white"
                      : isActive
                        ? "bg-white/20 text-white"
                        : "bg-paper text-text-muted",
                  ].join(" ")}
                >
                  {isComplete ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="whitespace-nowrap">{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

function SectionCard({
  number,
  title,
  description,
  icon: Icon,
  children,
  id,
  isComplete,
  errorCount,
}: {
  number: string
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
  id: string
  isComplete?: boolean
  errorCount?: number
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-all focus-within:border-brand/30 focus-within:shadow-md focus-within:ring-1 focus-within:ring-focus-ring/10 sm:p-6"
    >
      <header className="mb-5 flex items-start gap-3 border-b border-divider pb-4">
        <span
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-sm transition-colors",
            isComplete ? "bg-success text-white" : "bg-brand text-brand-contrast",
          ].join(" ")}
        >
          {isComplete ? <Check className="h-5 w-5" /> : number}
        </span>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold text-text-heading">{title}</h2>
            {isComplete && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-extrabold text-success">
                <Check className="h-3 w-3" /> បំពេញរួច
              </span>
            )}
            {!!errorCount && errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-extrabold text-danger">
                <AlertCircle className="h-3 w-3" /> មានបញ្ហា {errorCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function TextField({
  label,
  hint,
  wrapperClassName = "",
  className = "",
  id,
  name,
  required,
  error,
  onBlur,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  wrapperClassName?: string
  error?: string
}) {
  const fieldId = id ?? name ?? label
  const hasError = !!error
  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="mb-1.5 flex items-center gap-1 text-sm font-bold text-text-body">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={hasError ? "true" : "false"}
        aria-describedby={hasError ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={[
          inputBase,
          hasError ? "border-danger focus:border-danger focus:ring-danger/20" : "",
          className,
        ].join(" ")}
        onBlur={onBlur}
        {...props}
      />
      {hasError && (
        <p id={`${fieldId}-error`} className="mt-1.5 flex items-center gap-1 text-xs font-bold text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      {hint && !hasError && (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-xs leading-5 text-text-muted">{hint}</p>
      )}
    </div>
  )
}

function LocationField({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-text-body">{label}</p>
      {children}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  )
}

function StatusCard({
  title,
  icon: Icon,
  children,
  color = "brand",
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  color?: "brand" | "success" | "warning"
}) {
  const map = {
    brand: "bg-brand/10 text-brand border-brand/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  }
  return (
    <div className="rounded-xl border border-divider bg-paper p-4 transition-all hover:shadow-sm hover:border-divider/80">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${map[color]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-extrabold text-text-heading">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Modal({
  open,
  onClose,
  children,
  maxWidth = "sm:max-w-lg",
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])
  useEffect(() => {
    if (open && ref.current) {
      const el = ref.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      el?.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        className={[
          "w-full rounded-t-2xl border border-divider bg-bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6",
          maxWidth,
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  )
}

/* ─── Main Page ─── */

export default function EnrollmentPage() {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState("student-details")
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [avatarTab, setAvatarTab] = useState(0)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const [locations, setLocations] = useState<LocationTree | null>(null)
  const [locationsLoading, setLocationsLoading] = useState(true)

  const [form, dispatch] = useReducer(formReducer, {
    photoUrl: "", photoUrlInput: "", dob: "", age: "",
    birthProv: "", birthDist: "", birthComm: "", birthVill: "",
    currProv: "", currDist: "", currComm: "", currVill: "",
    sameAsBirth: false, fieldErrors: {},
  })

  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Load locations */
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/locations.json", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject("fail")))
      .then((d: LocationTree) => setLocations(d))
      .catch((err) => { if ((err as { name?: string }).name !== "AbortError") logger.error("locations:", err) })
      .finally(() => setLocationsLoading(false))
    return () => ctrl.abort()
  }, [])

  /* Load draft */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.dob) dispatch({ type: "SET_FIELD", field: "dob", value: draft.dob })
        if (draft.photoUrl) dispatch({ type: "SET_FIELD", field: "photoUrl", value: draft.photoUrl })
        if (draft.birthProv) dispatch({ type: "SET_FIELD", field: "birthProv", value: draft.birthProv })
        if (draft.birthDist) dispatch({ type: "SET_FIELD", field: "birthDist", value: draft.birthDist })
        if (draft.birthComm) dispatch({ type: "SET_FIELD", field: "birthComm", value: draft.birthComm })
        if (draft.birthVill) dispatch({ type: "SET_FIELD", field: "birthVill", value: draft.birthVill })
        if (draft.currProv) dispatch({ type: "SET_FIELD", field: "currProv", value: draft.currProv })
        if (draft.currDist) dispatch({ type: "SET_FIELD", field: "currDist", value: draft.currDist })
        if (draft.currComm) dispatch({ type: "SET_FIELD", field: "currComm", value: draft.currComm })
        if (draft.currVill) dispatch({ type: "SET_FIELD", field: "currVill", value: draft.currVill })
        if (draft.sameAsBirth) dispatch({ type: "SET_FIELD", field: "sameAsBirth", value: draft.sameAsBirth })
        setHasDraft(true)
        toast.success("បានផ្ទុកសេចក្តីព្រាងពីមុន។")
      }
    } catch { /* ignore */ }
  }, [])

  /* Auto-save draft */
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const draft = {
        dob: form.dob, photoUrl: form.photoUrl,
        birthProv: form.birthProv, birthDist: form.birthDist, birthComm: form.birthComm, birthVill: form.birthVill,
        currProv: form.currProv, currDist: form.currDist, currComm: form.currComm, currVill: form.currVill,
        sameAsBirth: form.sameAsBirth,
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      setHasDraft(true)
    }, 2000)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [form.dob, form.photoUrl, form.birthProv, form.birthDist, form.birthComm, form.birthVill, form.currProv, form.currDist, form.currComm, form.currVill, form.sameAsBirth])

  /* Sync current address when same-as-birth toggled */
  useEffect(() => {
    if (form.sameAsBirth) {
      dispatch({ type: "SET_FIELD", field: "currProv", value: form.birthProv })
      dispatch({ type: "SET_FIELD", field: "currDist", value: form.birthDist })
      dispatch({ type: "SET_FIELD", field: "currComm", value: form.birthComm })
      dispatch({ type: "SET_FIELD", field: "currVill", value: form.birthVill })
    }
  }, [form.sameAsBirth, form.birthProv, form.birthDist, form.birthComm, form.birthVill])

  /* Intersection observer */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id) }) },
      { rootMargin: "-15% 0px -55% 0px" }
    )
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  /* Keyboard shortcut Ctrl+S */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); formRef.current?.requestSubmit() } }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  /* Warn before unload */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.dob || form.photoUrl || form.birthProv) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [form.dob, form.photoUrl, form.birthProv])

  /* Derived */
  const provinceOptions = locations ? Object.keys(locations) : []
  const birthDistrictOptions = Object.keys(locations?.[form.birthProv] ?? {})
  const birthCommuneOptions = Object.keys(locations?.[form.birthProv]?.[form.birthDist] ?? {})
  const birthVillageOptions = locations?.[form.birthProv]?.[form.birthDist]?.[form.birthComm] ?? []
  const currDistrictOptions = Object.keys(locations?.[form.currProv] ?? {})
  const currCommuneOptions = Object.keys(locations?.[form.currProv]?.[form.currDist] ?? {})
  const currVillageOptions = locations?.[form.currProv]?.[form.currDist]?.[form.currComm] ?? []
  const isWorking = isSaving || isImporting

  /* Section completion */
  const completed = new Set<string>()
  if (formRef.current) {
    const f = formRef.current
    SECTIONS.forEach((sec) => {
      if (sec.requiredFields.every((name) => (f.elements.namedItem(name) as HTMLInputElement | null)?.value?.trim())) {
        completed.add(sec.id)
      }
    })
  }

  const secErrMap: Record<string, number> = {}
  SECTIONS.forEach((sec) => {
    const c = sec.requiredFields.filter((f) => !!form.fieldErrors[f]).length
    if (c) secErrMap[sec.id] = c
  })

  /* Handlers */
  const validateField = useCallback((name: string, value: string) => {
    const required = ["studentId", "grade", "studentName", "gender", "dob", "birthProvince", "birthDistrict", "birthCommune", "birthVillage"]
    if (!value.trim() && required.includes(name)) {
      dispatch({ type: "SET_ERROR", field: name, message: "វាលនេះត្រូវការបំពេញ" })
    } else {
      dispatch({ type: "CLEAR_ERROR", field: name })
    }
  }, [])

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    dispatch({ type: "SET_FIELD", field: "dob", value: val })
    const a = val ? calculateAge(val) : null
    dispatch({ type: "SET_FIELD", field: "age", value: a !== null && a >= 0 ? String(a) : "" })
    validateField("dob", val)
  }

  const processPhotoFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("ទំហំរូបថតធំពេក។ សូមជ្រើសរើសរូបដែលតូចជាង 5MB។")
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => dispatch({ type: "SET_FIELD", field: "photoUrl", value: ev.target?.result as string })
    reader.readAsDataURL(file)
    toast.success("បានផ្ទុករូបភាព។")
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processPhotoFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith("image/")) processPhotoFile(file)
    else toast.error("សូមទម្លាក់តែឯកសាររូបភាពប៉ុណ្ណោះ។")
  }

  const applyUrlPhoto = () => {
    let url = form.photoUrlInput.trim()
    if (!url) { toast.error("សូមបញ្ចូលតំណភ្ជាប់រូបភាពជាមុនសិន។"); return }
    if (url.includes("drive.google.com")) {
      const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
      const id = m1 ? m1[1] : m2 ? m2[1] : null
      if (id) url = `https://drive.google.com/thumbnail?id=${id}&sz=w800`
    }
    dispatch({ type: "SET_FIELD", field: "photoUrl", value: url })
    dispatch({ type: "SET_FIELD", field: "photoUrlInput", value: "" })
    toast.success("បានកំណត់រូបតំណាងរួចរាល់។")
  }

  const selectAvatar = (seed: number, group: string) => {
    dispatch({ type: "SET_FIELD", field: "photoUrl", value: `https://api.dicebear.com/7.x/${group}/svg?seed=${seed}` })
    setShowAvatarModal(false)
    toast.success("បានជ្រើសរូបតំណាង។")
  }

  const clearPhoto = () => {
    dispatch({ type: "SET_FIELD", field: "photoUrl", value: "" })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const scrollToSection = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveSection(id) }

  const validateAll = (): boolean => {
    if (!formRef.current) return false
    const f = formRef.current
    const errors: FieldError = {}
    const required = ["studentId", "grade", "studentName", "gender", "dob", "birthProvince", "birthDistrict", "birthCommune", "birthVillage"]
    let first: string | null = null
    required.forEach((name) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null
      if (!el?.value?.trim()) { errors[name] = "វាលនេះត្រូវការបំពេញ"; if (!first) first = name }
    })
    dispatch({ type: "CLEAR_ALL_ERRORS" })
    Object.entries(errors).forEach(([k, v]) => dispatch({ type: "SET_ERROR", field: k, message: v }))
    if (first) {
      const el = f.elements.namedItem(first) as HTMLElement | null
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      el?.focus()
      return false
    }
    return true
  }

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); if (!validateAll()) return; setShowConfirmModal(true) }

  const confirmSubmit = async () => {
    if (!formRef.current) return
    setIsSaving(true); setSubmitError(null); setShowConfirmModal(false)
    try {
      const fd = new FormData(formRef.current)
      fd.append("photoUrl", form.photoUrl)
      const result = await createStudent(fd)
      if (result?.error) { setSubmitError(result.error); return }
      localStorage.removeItem(DRAFT_KEY)
      toast.success("បានរក្សាទុកព័ត៌មានសិស្សដោយជោគជ័យ។", { duration: 4000 })
      router.push("/student-list")
    } catch (err: unknown) {
      setSubmitError(`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${getErrorMessage(err)}`)
    } finally { setIsSaving(false) }
  }

  const resetForm = () => {
    dispatch({ type: "RESET" })
    if (formRef.current) formRef.current.reset()
    localStorage.removeItem(DRAFT_KEY)
    setHasDraft(false); setShowResetModal(false)
    toast.success("បានសម្អាតបែបបទទាំងអស់។")
  }

  const downloadTemplate = () => {
    const a = document.createElement("a")
    a.href = "/sample_data.xlsx"; a.download = "sample_data.xlsx"
    document.body.appendChild(a); a.click(); a.remove()
    toast.success("កំពុងទាញយកគំរូ Excel។")
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true); setSubmitError(null)
    try {
      let jsonData: SheetImportRow[] = []
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text()
        const lines = text.split("\n").filter((l) => l.trim())
        if (lines.length) {
          const sep = lines[0].includes(";") ? ";" : ","
          jsonData = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")))
        }
      } else {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf)
        const ws = wb.Sheets[wb.SheetNames[0]]
        jsonData = XLSX.utils.sheet_to_json<SheetImportRow>(ws, { header: 1 })
      }
      if (jsonData.length <= 1) { toast.error("គ្មានទិន្នន័យសម្រាប់បញ្ចូលទេ។"); return }
      const rows = jsonData.slice(1)
      const students = rows.filter((r) => r.length > 0 && r[0]).map((row) => {
        const rawDob = row[5]
        let dobStr = ""
        if (typeof rawDob === "number") {
          const d = new Date(Math.round((rawDob - 25569) * 86400 * 1000))
          dobStr = d.toISOString().split("T")[0]
        } else if (typeof rawDob === "string") {
          dobStr = rawDob.trim()
          if (dobStr.includes("-")) {
            const p = dobStr.split("-")
            if (p.length === 3 && p[0].length === 2) dobStr = `${p[2]}-${p[1]}-${p[0]}`
          }
        }
        let poorStatus = "គ្មាន"
        if (row[19]?.toString().trim()) poorStatus = "ក្រ១"
        else if (row[20]?.toString().trim()) poorStatus = "ក្រ២"
        let orphanStatus = "ទេ"
        const ov = row[17]?.toString().trim()
        if (ov) {
          if (ov.includes("ទាំងពីរ")) orphanStatus = "កំព្រាទាំងពីរ"
          else if (ov.includes("ម្តាយ")) orphanStatus = "កំព្រាម្តាយ"
          else if (ov.includes("ឪពុក")) orphanStatus = "កំព្រាឪពុក"
          else orphanStatus = "កំព្រាទាំងពីរ"
        }
        return {
          student_id: row[0]?.toString() || "", grade: row[1]?.toString() || "",
          name_kh: row[2]?.toString() || "", name_latin: row[3]?.toString() || "",
          gender: row[4]?.toString() || "", dob: dobStr, phone: row[6]?.toString() || "",
          birth_province: row[7]?.toString() || "", birth_district: row[8]?.toString() || "",
          birth_commune: row[9]?.toString() || "", birth_village: row[10]?.toString() || "",
          curr_province: row[11]?.toString() || "", curr_district: row[12]?.toString() || "",
          curr_commune: row[13]?.toString() || "", curr_village: row[14]?.toString() || "",
          is_new_student: Boolean(row[15]?.toString().trim()),
          is_repeater: Boolean(row[16]?.toString().trim()),
          orphan_status: orphanStatus, is_disabled: Boolean(row[18]?.toString().trim()),
          poor_status: poorStatus, is_equity: Boolean(row[21]?.toString().trim()),
          is_scholarship: Boolean(row[22]?.toString().trim()),
          father_name: row[23]?.toString() || "", father_job: row[24]?.toString() || "",
          mother_name: row[25]?.toString() || "", mother_job: row[26]?.toString() || "",
          guardian_name: row[27]?.toString() || "", guardian_job: row[28]?.toString() || "",
          ethnicity: row[29]?.toString() || "", special_features: row[30]?.toString() || "",
          other_remarks: row[31]?.toString() || "", photo_url: row[32]?.toString() || "",
        }
      })
      if (!students.length) { toast.error("រកមិនឃើញជួរទិន្នន័យសិស្សក្នុងឯកសារនេះទេ។"); return }
      const result = await importStudents(students)
      if (result?.error) { setSubmitError(result.error); return }
      toast.success(`បានបញ្ចូលព័ត៌មានសិស្ស ${students.length} នាក់ដោយជោគជ័យ។`, { duration: 4000 })
      router.push("/student-list")
    } catch (err: unknown) {
      setSubmitError(`មានបញ្ហាក្នុងការអានឯកសារ៖ ${getErrorMessage(err)}`)
    } finally { setIsImporting(false); e.target.value = "" }
  }

  /* ─── Render ─── */
  return (
    <main className="min-h-screen bg-bg-app pb-28 pt-4 transition-colors sm:pt-6">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        {/* Header */}
        <header className="mb-5 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-brand via-brand to-success" />
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-contrast shadow-sm">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">KruSmart</p>
                <h1 className="kh-moul mt-1 text-xl text-text-heading sm:text-2xl">ចុះឈ្មោះសិស្សថ្មី</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                  បំពេញព័ត៌មានសំខាន់ជាមុនសិន ហើយបន្ថែមព័ត៌មានលម្អិតតាមតម្រូវការ។
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasDraft && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-extrabold text-brand">
                  <Save className="h-3 w-3" /> មានសេចក្តីព្រាង
                </span>
              )}
              <Button type="button" variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setShowResetModal(true)}>
                សម្អាត
              </Button>
              <Button type="button" variant="secondary" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={downloadTemplate}>
                គំរូ Excel
              </Button>
              <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setShowImportModal(true)}>
                នាំចូល
              </Button>
              <Button type="button" variant="secondary" size="sm" icon={<List className="h-4 w-4" />} onClick={() => router.push("/student-list")}>
                បញ្ជីសិស្ស
              </Button>
            </div>
          </div>
        </header>

        <MobileStepper activeSection={activeSection} completedSections={completed} onNavigate={scrollToSection} />

        <div className="flex gap-6">
          <ProgressSidebar activeSection={activeSection} completedSections={completed} sectionErrors={secErrMap} onNavigate={scrollToSection} />

          <div className="min-w-0 flex-1">
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Global error */}
              {submitError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger shadow-sm">
                  <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-extrabold">មិនអាចរក្សាទុកបានទេ</p>
                    <p className="mt-1 leading-6">{submitError}</p>
                  </div>
                </div>
              )}

              {/* Section 1: Student Details */}
              <SectionCard id="student-details" number="1" title="ព័ត៌មានសិស្ស"
                description="ព័ត៌មានមានសញ្ញា * គឺចាំបាច់សម្រាប់បង្កើតកំណត់ត្រាសិស្ស។"
                icon={UserPlus} isComplete={completed.has("student-details")} errorCount={secErrMap["student-details"]}
              >
                <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
                  <aside className="rounded-2xl border border-divider bg-paper p-4 text-center">
                    <p className="text-sm font-extrabold text-text-heading">រូបតំណាង</p>
                    <div
                      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                      className={[
                        "group relative mx-auto mt-3 flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200",
                        isDragOver ? "border-brand bg-brand/5 scale-105 shadow-lg" : "border-brand/40 bg-bg-surface hover:border-brand hover:shadow-md",
                        form.photoUrl ? "border-solid border-brand/30" : "",
                      ].join(" ")}
                    >
                      {form.photoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={form.photoUrl} alt="រូបតំណាងសិស្ស" className="h-full w-full object-cover"
                            onError={() => dispatch({ type: "SET_FIELD", field: "photoUrl", value: "" })} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                            <button type="button" onClick={(e) => { e.stopPropagation(); clearPhoto() }}
                              className="flex h-8 w-8 scale-90 items-center justify-center rounded-full bg-danger text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100 hover:bg-danger/90"
                              aria-label="លុបរូបភាព"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="flex flex-col items-center gap-1.5 text-text-muted">
                          <ImageIcon className="h-8 w-8" aria-hidden="true" />
                          <span className="text-xs font-bold">បន្ថែមរូប</span>
                          <span className="text-[10px] text-text-muted/60">ឬទម្លាក់រូបនៅទីនេះ</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <input type="url" value={form.photoUrlInput}
                        onChange={(e) => dispatch({ type: "SET_FIELD", field: "photoUrlInput", value: e.target.value })}
                        className="min-h-8 flex-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-xs text-text-heading placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-focus-ring/30"
                        placeholder="https://... ឬ Google Drive"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrlPhoto() } }}
                      />
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={applyUrlPhoto} aria-label="ប្រើតំណភ្ជាប់">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" variant="secondary" icon={<Smile className="h-3.5 w-3.5" />} onClick={() => setShowAvatarModal(true)}>
                        រូបតុក្កតា
                      </Button>
                      <Button type="button" size="sm" variant="ghost" icon={<Camera className="h-3.5 w-3.5" />} onClick={() => fileInputRef.current?.click()}>
                        ផ្ទុកឡើង
                      </Button>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-text-muted">អាចប្រើរូបផ្ទាល់ រូបតុក្កតា ឬតំណភ្ជាប់។ ទំហំអតិបរមា 5MB។</p>
                    <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoUpload} />
                  </aside>

                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                    <TextField label="អត្តលេខ" name="studentId" required placeholder="ឧ. 2026-001" autoComplete="off"
                      error={form.fieldErrors.studentId} onBlur={(e) => validateField("studentId", e.target.value)} />
                    <TextField label="ថ្នាក់ទី" name="grade" required placeholder="ឧ. ១ក" autoComplete="off"
                      error={form.fieldErrors.grade} onBlur={(e) => validateField("grade", e.target.value)} />
                    <TextField label="ឈ្មោះសិស្ស (ខ្មែរ)" name="studentName" required placeholder="គោត្តនាម និងនាម" autoComplete="name"
                      error={form.fieldErrors.studentName} onBlur={(e) => validateField("studentName", e.target.value)} />
                    <TextField label="ឈ្មោះឡាតាំង" name="latinName" placeholder="Latin name" autoComplete="name" />
                    <Select name="gender" label="ភេទ" required placeholder="ជ្រើសរើសភេទ" options={["ប្រុស", "ស្រី"]} />
                    <TextField label="ថ្ងៃខែឆ្នាំកំណើត" name="dob" required type="date" value={form.dob}
                      onChange={handleDobChange} error={form.fieldErrors.dob} />
                    <TextField label="អាយុ (ឆ្នាំ)" name="calculatedAge" value={form.age} readOnly
                      placeholder="គណនាស្វ័យប្រវត្តិ" className="bg-paper font-bold text-text-muted"
                      hint="គណនាតាមថ្ងៃខែឆ្នាំកំណើត" />
                    <TextField label="លេខទូរស័ព្ទអាណាព្យាបាល" name="phone" type="tel" placeholder="ឧ. ០១២ ៣៤៥ ៦៧៨"
                      wrapperClassName="sm:col-span-2 xl:col-span-2" autoComplete="tel" />
                  </div>
                </div>
              </SectionCard>

              {/* Section 2: Addresses */}
              <SectionCard id="addresses" number="2" title="ព័ត៌មានទីតាំង និងអាសយដ្ឋាន"
                description="ជ្រើសរើសតាមលំដាប់ រាជធានី/ខេត្ត → ក្រុង/ស្រុក/ខណ្ឌ → ឃុំ/សង្កាត់ → ភូមិ។"
                icon={MapPin} isComplete={completed.has("addresses")} errorCount={secErrMap["addresses"]}
              >
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand/15 bg-brand/[0.04] p-3">
                  <input id="same-as-birth" type="checkbox" checked={form.sameAsBirth}
                    onChange={(e) => dispatch({ type: "SET_FIELD", field: "sameAsBirth", value: e.target.checked })}
                    className="h-5 w-5 rounded border-divider text-brand focus:ring-brand focus:ring-offset-0" />
                  <label htmlFor="same-as-birth" className="cursor-pointer text-sm font-bold text-text-heading">
                    អាសយដ្ឋានសព្វថ្ងៃ ដូចទីកន្លែងកំណើត
                  </label>
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-xl border border-divider bg-paper p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-extrabold text-text-heading">ទីកន្លែងកំណើត</h3>
                        <p className="text-xs text-text-muted">អាសយដ្ឋាននៅពេលកំណើត</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <LocationField label="រាជធានី/ខេត្ត" error={form.fieldErrors.birthProvince}>
                        <SearchableSelect name="birthProvince" ariaLabel="រាជធានី ឬខេត្តកំណើត" placeholder="ជ្រើសរើសខេត្ត"
                          options={provinceOptions} value={form.birthProv} loading={locationsLoading} clearable
                          onChange={(v) => {
                            dispatch({ type: "SET_FIELD", field: "birthProv", value: v })
                            dispatch({ type: "SET_FIELD", field: "birthDist", value: "" })
                            dispatch({ type: "SET_FIELD", field: "birthComm", value: "" })
                            dispatch({ type: "SET_FIELD", field: "birthVill", value: "" })
                            validateField("birthProvince", v)
                          }} />
                      </LocationField>
                      <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ" error={form.fieldErrors.birthDistrict}>
                        <SearchableSelect name="birthDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌកំណើត" placeholder="ជ្រើសរើសក្រុង/ស្រុក"
                          options={birthDistrictOptions} value={form.birthDist} disabled={!form.birthProv} clearable
                          onChange={(v) => {
                            dispatch({ type: "SET_FIELD", field: "birthDist", value: v })
                            dispatch({ type: "SET_FIELD", field: "birthComm", value: "" })
                            dispatch({ type: "SET_FIELD", field: "birthVill", value: "" })
                            validateField("birthDistrict", v)
                          }} />
                      </LocationField>
                      <LocationField label="ឃុំ/សង្កាត់" error={form.fieldErrors.birthCommune}>
                        <SearchableSelect name="birthCommune" ariaLabel="ឃុំ ឬសង្កាត់កំណើត" placeholder="ជ្រើសរើសឃុំ/សង្កាត់"
                          options={birthCommuneOptions} value={form.birthComm} disabled={!form.birthDist} clearable
                          onChange={(v) => {
                            dispatch({ type: "SET_FIELD", field: "birthComm", value: v })
                            dispatch({ type: "SET_FIELD", field: "birthVill", value: "" })
                            validateField("birthCommune", v)
                          }} />
                      </LocationField>
                      <LocationField label="ភូមិ" error={form.fieldErrors.birthVillage}>
                        <SearchableSelect name="birthVillage" ariaLabel="ភូមិកំណើត" placeholder="ជ្រើសរើសភូមិ"
                          options={birthVillageOptions} value={form.birthVill} disabled={!form.birthComm} clearable
                          onChange={(v) => { dispatch({ type: "SET_FIELD", field: "birthVill", value: v }); validateField("birthVillage", v) }} />
                      </LocationField>
                    </div>
                  </div>

                  <div className={["rounded-xl border bg-paper p-4 transition-opacity", form.sameAsBirth ? "border-success/30 opacity-75" : "border-divider"].join(" ")}>
                    <div className="mb-4 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Home className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-extrabold text-text-heading">អាសយដ្ឋានសព្វថ្ងៃ</h3>
                        <p className="text-xs text-text-muted">ទីលំនៅបច្ចុប្បន្នរបស់សិស្ស</p>
                      </div>
                      {form.sameAsBirth && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-extrabold text-success">
                          <Check className="h-3 w-3" /> បានភ្ជាប់
                        </span>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <LocationField label="រាជធានី/ខេត្ត">
                        <SearchableSelect name="currProvince" ariaLabel="រាជធានី ឬខេត្តសព្វថ្ងៃ" placeholder="ជ្រើសរើសខេត្ត"
                          options={provinceOptions} value={form.currProv} loading={locationsLoading} disabled={form.sameAsBirth} clearable
                          onChange={(v) => { dispatch({ type: "SET_FIELD", field: "currProv", value: v }); dispatch({ type: "SET_FIELD", field: "currDist", value: "" }); dispatch({ type: "SET_FIELD", field: "currComm", value: "" }); dispatch({ type: "SET_FIELD", field: "currVill", value: "" }) }} />
                      </LocationField>
                      <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ">
                        <SearchableSelect name="currDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌសព្វថ្ងៃ" placeholder="ជ្រើសរើសក្រុង/ស្រុក"
                          options={currDistrictOptions} value={form.currDist} disabled={!form.currProv || form.sameAsBirth} clearable
                          onChange={(v) => { dispatch({ type: "SET_FIELD", field: "currDist", value: v }); dispatch({ type: "SET_FIELD", field: "currComm", value: "" }); dispatch({ type: "SET_FIELD", field: "currVill", value: "" }) }} />
                      </LocationField>
                      <LocationField label="ឃុំ/សង្កាត់">
                        <SearchableSelect name="currCommune" ariaLabel="ឃុំ ឬសង្កាត់សព្វថ្ងៃ" placeholder="ជ្រើសរើសឃុំ/សង្កាត់"
                          options={currCommuneOptions} value={form.currComm} disabled={!form.currDist || form.sameAsBirth} clearable
                          onChange={(v) => { dispatch({ type: "SET_FIELD", field: "currComm", value: v }); dispatch({ type: "SET_FIELD", field: "currVill", value: "" }) }} />
                      </LocationField>
                      <LocationField label="ភូមិ">
                        <SearchableSelect name="currVillage" ariaLabel="ភូមិសព្វថ្ងៃ" placeholder="ជ្រើសរើសភូមិ"
                          options={currVillageOptions} value={form.currVill} disabled={!form.currComm || form.sameAsBirth} clearable
                          onChange={(v) => dispatch({ type: "SET_FIELD", field: "currVill", value: v })} />
                      </LocationField>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Section 3: Status */}
              <SectionCard id="student-status" number="3" title="ស្ថានភាព និងអាហារូបករណ៍"
                description="កំណត់ស្ថានភាពសិស្ស ដើម្បីប្រើក្នុងរបាយការណ៍ និងការគាំទ្រសិស្ស។" icon={Award}
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatusCard title="ស្ថានភាពសិក្សា" icon={Award} color="brand">
                    <Select name="isNewStudent" label="សិស្សថ្មី" options={YES_NO} defaultValue="ទេ" />
                    <Select name="isRepeater" label="សិស្សត្រួតថ្នាក់" options={YES_NO} defaultValue="ទេ" />
                  </StatusCard>
                  <StatusCard title="ស្ថានភាពសង្គម" icon={Users} color="warning">
                    <Select name="orphanStatus" label="ស្ថានភាពគ្រួសារ (កំព្រា)"
                      options={["ទេ", "កំព្រាឪពុក", "កំព្រាម្តាយ", "កំព្រាទាំងពីរ"]} defaultValue="ទេ" />
                    <Select name="isDisabled" label="ពិការភាព" options={YES_NO} defaultValue="ទេ" />
                    <Select name="poorStatus" label="ប័ណ្ណក្រីក្រ" options={["គ្មាន", "ក្រ១", "ក្រ២"]} defaultValue="គ្មាន" />
                  </StatusCard>
                  <StatusCard title="ការគាំទ្រ" icon={CheckCircle2} color="success">
                    <Select name="isEquity" label="សិស្សសមធម៌" options={YES_NO} defaultValue="ទេ" />
                    <Select name="isScholarship" label="អាហារូបករណ៍" options={YES_NO} defaultValue="ទេ" />
                  </StatusCard>
                </div>
              </SectionCard>

              {/* Section 4: Guardians */}
              <SectionCard id="guardians" number="4" title="ព័ត៌មានឪពុកម្តាយ និងអាណាព្យាបាល"
                description="បញ្ចូលព័ត៌មានទំនាក់ទំនងដែលពាក់ព័ន្ធតាមដែលមាន។" icon={Users}
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-divider bg-paper p-4 transition-shadow hover:shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Users className="h-4 w-4" /></span>
                      <p className="text-sm font-extrabold text-text-heading">ឪពុក</p>
                    </div>
                    <div className="grid gap-4">
                      <TextField label="ឈ្មោះឪពុក" name="fatherName" placeholder="ឈ្មោះពេញ" />
                      <TextField label="មុខរបរ" name="fatherJob" placeholder="មុខរបរ" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-divider bg-paper p-4 transition-shadow hover:shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"><Users className="h-4 w-4" /></span>
                      <p className="text-sm font-extrabold text-text-heading">ម្តាយ</p>
                    </div>
                    <div className="grid gap-4">
                      <TextField label="ឈ្មោះម្តាយ" name="motherName" placeholder="ឈ្មោះពេញ" />
                      <TextField label="មុខរបរ" name="motherJob" placeholder="មុខរបរ" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-divider bg-paper p-4 transition-shadow hover:shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Users className="h-4 w-4" /></span>
                      <p className="text-sm font-extrabold text-text-heading">អាណាព្យាបាល</p>
                    </div>
                    <div className="grid gap-4">
                      <TextField label="ឈ្មោះអាណាព្យាបាល" name="guardianName" placeholder="ឈ្មោះពេញ" />
                      <TextField label="មុខរបរ" name="guardianJob" placeholder="មុខរបរ" />
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Section 5: Additional */}
              <SectionCard id="additional-details" number="5" title="ព័ត៌មានបន្ថែម"
                description="ព័ត៌មាននេះមិនចាំបាច់ទេ ប៉ុន្តែអាចជួយគាំទ្រការតាមដានសិស្សបានល្អ។" icon={FileText}
              >
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
                  <TextField label="ជនជាតិដើមភាគតិច" name="ethnicity" placeholder="ឧ. ព្នង, គួយ" />
                  <TextField label="លក្ខណៈពិសេស" name="specialFeatures" placeholder="លក្ខណៈផ្សេងៗ" />
                  <TextField label="សេចក្តីផ្សេងៗ" name="otherRemarks" placeholder="ព័ត៌មានបន្ថែម" />
                </div>
              </SectionCard>

              {/* Info box */}
              <aside className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-text-body">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <p className="font-extrabold text-text-heading">មុនពេលរក្សាទុក</p>
                  <p className="mt-1 leading-6">សូមពិនិត្យព័ត៌មានមានសញ្ញា <span className="font-bold text-danger">*</span> ឱ្យបានត្រឹមត្រូវ។ អាយុនឹងគណនាស្វ័យប្រវត្តិតាមថ្ងៃខែឆ្នាំកំណើត។</p>
                </div>
              </aside>

              {/* Sticky Save Bar */}
              <div className="sticky bottom-3 z-20 rounded-2xl border border-divider bg-bg-surface/95 p-3 shadow-lg backdrop-blur sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    <span>ផ្នែកបំពេញរួច <span className="font-extrabold text-text-heading">{completed.size}/{SECTIONS.length}</span></span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" variant="success" loading={isSaving} disabled={isImporting}
                      icon={<Save className="h-4 w-4" aria-hidden="true" />} className="w-full sm:w-auto">
                      រក្សាទុកព័ត៌មានសិស្ស
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Avatar Modal */}
      <Modal open={showAvatarModal} onClose={() => setShowAvatarModal(false)} maxWidth="sm:max-w-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-divider pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Smile className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-text-heading">ជ្រើសរើសរូបតុក្កតាតំណាង</h2>
              <p className="mt-0.5 text-sm text-text-muted">ជ្រើសរើសរូបមួយសម្រាប់សិស្សនេះ។</p>
            </div>
          </div>
          <button type="button" aria-label="បិទ" onClick={() => setShowAvatarModal(false)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-paper hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-1 rounded-xl bg-paper p-1">
          {AVATAR_GROUPS.map((g, idx) => (
            <button key={g.key} type="button" onClick={() => setAvatarTab(idx)}
              className={["flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all",
                avatarTab === idx ? "bg-bg-surface text-brand shadow-sm" : "text-text-muted hover:text-text-body"
              ].join(" ")}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid max-h-[55vh] grid-cols-5 gap-2 overflow-y-auto rounded-xl border border-divider bg-paper p-3 sm:grid-cols-8">
          {AVATAR_GROUPS[avatarTab].seeds.map((seed) => (
            <button key={`${AVATAR_GROUPS[avatarTab].key}-${seed}`} type="button"
              onClick={() => selectAvatar(seed, AVATAR_GROUPS[avatarTab].key)}
              className="overflow-hidden rounded-xl border-2 border-transparent bg-bg-surface p-1 transition hover:border-brand focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.dicebear.com/7.x/${AVATAR_GROUPS[avatarTab].key}/svg?seed=${seed}`} alt={`រូបតំណាងលេខ ${seed}`} />
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={() => setShowAvatarModal(false)}>បិទ</Button>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={showImportModal} onClose={() => setShowImportModal(false)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-text-heading">នាំចូលទិន្នន័យសិស្ស</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">នាំចូលពីឯកសារ Excel (.xlsx) ឬ CSV ដែលមានទម្រង់ត្រឹមត្រូវ។</p>
          </div>
          <button type="button" aria-label="បិទ" onClick={() => setShowImportModal(false)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-paper hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-divider bg-paper p-8 text-center transition-colors hover:border-brand/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) {
                const input = importInputRef.current
                if (input) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })) }
              }
            }}>
            <Upload className="h-10 w-10 text-text-muted" />
            <div>
              <p className="text-sm font-bold text-text-heading">ទម្លាក់ឯកសារនៅទីនេះ</p>
              <p className="mt-1 text-xs text-text-muted">ឬចុចដើម្បីជ្រើសរើសឯកសារ</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>
              ជ្រើសរើសឯកសារ
            </Button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleExcelImport} />
          </div>
          <div className="rounded-xl border border-divider bg-paper p-4">
            <p className="text-xs font-extrabold text-text-heading">ត្រូវការជំនួយ?</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">ទាញយកគំរូ Excel ដើម្បីដឹងពីទម្រង់ទិន្នន័យត្រឹមត្រូវ។</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadTemplate}>
              ទាញយកគំរូ Excel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Submit Modal */}
      <Modal open={showConfirmModal} onClose={() => setShowConfirmModal(false)} maxWidth="sm:max-w-md">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-text-heading">បញ្ជាក់ការរក្សាទុក</h2>
            <p className="mt-0.5 text-sm text-text-muted">តើអ្នកប្រាកដជាចង់រក្សាទុកព័ត៌មានសិស្សនេះទេ?</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setShowConfirmModal(false)} disabled={isSaving}>
            ពិនិត្យម្តងទៀត
          </Button>
          <Button type="button" variant="success" loading={isSaving} onClick={confirmSubmit} icon={<Save className="h-4 w-4" />}>
            បញ្ជាក់រក្សាទុក
          </Button>
        </div>
      </Modal>

      {/* Reset Confirm Modal */}
      <Modal open={showResetModal} onClose={() => setShowResetModal(false)} maxWidth="sm:max-w-md">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-text-heading">សម្អាតបែបបទ?</h2>
            <p className="mt-0.5 text-sm text-text-muted">ទិន្នន័យទាំងអស់នឹងត្រូវលុប ហើយមិនអាចទាញយកវិញបានទេ។</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setShowResetModal(false)}>
            បោះបង់
          </Button>
          <Button type="button" variant="danger" onClick={resetForm} icon={<Trash2 className="h-4 w-4" />}>
            បាទ សម្អាត
          </Button>
        </div>
      </Modal>
    </main>
  )
}