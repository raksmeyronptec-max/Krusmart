'use client'

import { useMemo } from 'react'
import { Copy } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'

/** province → district → commune → village[], as served by /locations.json. */
export type LocationTree = Record<string, Record<string, Record<string, string[]>>>

export interface LocationValue {
  province: string
  district: string
  commune: string
  village?: string
}

export interface LocationCascadeProps {
  /** Unique per usage so three cascades on one page keep distinct control ids. */
  idPrefix: string
  levels: 3 | 4
  locations: LocationTree | null
  loading: boolean
  value: LocationValue
  onChange: (value: LocationValue) => void
  disabled?: boolean
  /** Renders a one-tap copy-forward button, e.g. "ដូចទីកន្លែងកំណើត". */
  copyFrom?: { label: string; value: LocationValue }
}

/**
 * One Cambodian administrative-location cascade (ខេត្ត → ស្រុក → ឃុំ → ភូមិ),
 * previously duplicated select-by-select in enrollment and the profile.
 * Changing an upstream level resets everything downstream, and each level is
 * disabled until its parent is chosen.
 */
export default function LocationCascade({
  idPrefix,
  levels,
  locations,
  loading,
  value,
  onChange,
  disabled = false,
  copyFrom,
}: LocationCascadeProps) {
  const { province, district, commune, village = '' } = value

  const provinceOptions = useMemo(() => (locations ? Object.keys(locations) : []), [locations])
  const districtOptions = useMemo(
    () => Object.keys(locations?.[province] ?? {}),
    [locations, province],
  )
  const communeOptions = useMemo(
    () => Object.keys(locations?.[province]?.[district] ?? {}),
    [locations, province, district],
  )
  const villageOptions = useMemo(
    () => locations?.[province]?.[district]?.[commune] ?? [],
    [locations, province, district, commune],
  )

  return (
    <div>
      {copyFrom && (
        <button
          type="button"
          disabled={disabled || !copyFrom.value.province}
          onClick={() => onChange({ ...copyFrom.value })}
          className="tap-target mb-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-2 text-[13px] font-bold text-brand transition hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Copy aria-hidden className="h-3.5 w-3.5" />
          <span lang="km">{copyFrom.label}</span>
        </button>
      )}

      <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${levels === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <SearchableSelect
          id={`${idPrefix}-province`}
          label="រាជធានី/ខេត្ត"
          options={provinceOptions}
          value={province}
          loading={loading}
          disabled={disabled}
          clearable
          placeholder="ជ្រើសរើសរាជធានី/ខេត្ត"
          onChange={(v) => onChange({ province: v, district: '', commune: '', village: '' })}
        />
        <SearchableSelect
          id={`${idPrefix}-district`}
          label="ក្រុង/ស្រុក/ខណ្ឌ"
          options={districtOptions}
          value={district}
          disabled={disabled || !province}
          clearable
          placeholder={province ? 'ជ្រើសរើសក្រុង/ស្រុក/ខណ្ឌ' : 'ជ្រើសរើសខេត្តជាមុន...'}
          onChange={(v) => onChange({ province, district: v, commune: '', village: '' })}
        />
        <SearchableSelect
          id={`${idPrefix}-commune`}
          label="ឃុំ/សង្កាត់"
          options={communeOptions}
          value={commune}
          disabled={disabled || !district}
          clearable
          placeholder={district ? 'ជ្រើសរើសឃុំ/សង្កាត់' : 'ជ្រើសរើសស្រុកជាមុន...'}
          onChange={(v) => onChange({ province, district, commune: v, village: '' })}
        />
        {levels === 4 && (
          <SearchableSelect
            id={`${idPrefix}-village`}
            label="ភូមិ"
            options={villageOptions}
            value={village}
            disabled={disabled || !commune}
            clearable
            placeholder={commune ? 'ជ្រើសរើសភូមិ' : 'ជ្រើសរើសឃុំជាមុន...'}
            onChange={(v) => onChange({ province, district, commune, village: v })}
          />
        )}
      </div>
    </div>
  )
}
