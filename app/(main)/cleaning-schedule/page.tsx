"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, Save, Printer, Crown, Users, X, CalendarDays, Shuffle, Check } from "lucide-react";
import { createClient } from '../../../lib/supabase/client'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import type { CleaningGroups, CleaningLeaders, Student } from '@/lib/types'
import { randomiseCleaningGroups } from '@/lib/utils/cleaning-random'

/** The three class-committee slots. */
type LeaderRole = keyof CleaningLeaders

const days = [
  { id: 'monday', name: 'ថ្ងៃច័ន្ទ', color: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
  { id: 'tuesday', name: 'ថ្ងៃអង្គារ', color: 'bg-brand-100', text: 'text-brand', border: 'border-divider' },
  { id: 'wednesday', name: 'ថ្ងៃពុធ', color: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  { id: 'thursday', name: 'ថ្ងៃព្រហស្បតិ៍', color: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  { id: 'friday', name: 'ថ្ងៃសុក្រ', color: 'bg-brand-100', text: 'text-brand', border: 'border-divider' },
  { id: 'saturday', name: 'ថ្ងៃសៅរ៍', color: 'bg-danger/10', text: 'text-danger', border: 'border-danger/30' }
];

export default function CleaningSchedulePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchKeys, setSearchKeys] = useState<{ [key: string]: string }>({});
  const [leaders, setLeaders] = useState<CleaningLeaders>({ pres: null, vp1: null, vp2: null });
  const [groups, setGroups] = useState<CleaningGroups>({
    monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: []
  });
  
  // Memoised so `fetchData` keeps a stable identity. `createBrowserClient`
  // happens to cache internally, but the effect must not depend on that.
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const [studentsRes, scheduleRes] = await Promise.all([
        supabase.from('students').select('*').eq('teacher_id', userData.user.id).order('name_kh', { ascending: true }),
        supabase.from('cleaning_schedules').select('*').eq('teacher_id', userData.user.id).single()
      ]);

      if (studentsRes.error) {
        logger.error(studentsRes.error);
        alert('មានបញ្ហាក្នុងការទាញបញ្ជីសិស្ស');
      } else if (studentsRes.data) {
        setStudents(studentsRes.data);
      }

      // PGRST116 just means this teacher has no saved schedule yet.
      if (scheduleRes.error && scheduleRes.error.code !== 'PGRST116') {
        logger.error(scheduleRes.error);
      } else if (scheduleRes.data) {
        if (scheduleRes.data.leaders) setLeaders(scheduleRes.data.leaders);
        if (scheduleRes.data.groups) setGroups(scheduleRes.data.groups);
      }
    } catch (e) {
      logger.error(e);
      alert('មានបញ្ហាក្នុងការទាញទិន្នន័យ');
    } finally {
    }
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    fetchData();
  }, [fetchData]);

;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const payload = {
        teacher_id: userData.user.id,
        leaders,
        groups
      };

      const { error } = await supabase.from('cleaning_schedules').upsert(payload, { onConflict: 'teacher_id' });
      if (error) throw error;
      alert('រក្សាទុករួចរាល់!');
    } catch (e: unknown) {
      logger.error(e);
      alert('មានបញ្ហាក្នុងការរក្សាទុក: ' + getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // --- Automatic assignment (ចាត់តាំងវេនសម្អាតដោយស្វ័យប្រវត្តិ) ---------------
  const [isRandomOpen, setIsRandomOpen] = useState(false);
  const [randomDays, setRandomDays] = useState<string[]>(days.slice(0, 5).map(d => d.id));

  const toggleRandomDay = (dayId: string) => {
    setRandomDays(prev => prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]);
  };

  const handleRandomise = () => {
    if (randomDays.length === 0) {
      alert('សូមជ្រើសរើសយ៉ាងហោចណាស់មួយថ្ងៃ!');
      return;
    }
    if (students.length === 0) {
      alert('មិនទាន់មានបញ្ជីសិស្សនៅឡើយទេ');
      return;
    }
    // Only the ticked days are rebuilt; any day the teacher arranged by hand and
    // left unticked is carried through untouched.
    setGroups(randomiseCleaningGroups({ students, leaders, selectedDays: randomDays, existing: groups }));
    setIsRandomOpen(false);
  };

  const handleSelect = (type: LeaderRole | 'group', student: Student, dayId?: string) => {
    if (dayId) {
       setGroups({ ...groups, [dayId]: [...groups[dayId], { id: student.id, name: student.name_kh, image: student.photo_url }] });
       setSearchKeys({ ...searchKeys, [dayId]: "" });
    } else if (type !== 'group') {
       setLeaders({ ...leaders, [type]: { id: student.id, name: student.name_kh, image: student.photo_url } });
       setSearchKeys({ ...searchKeys, [type]: "" });
    }
  };

  const handleRemove = (type: LeaderRole | 'group', dayId?: string, studentId?: string) => {
    if (dayId && studentId) {
       setGroups({ ...groups, [dayId]: groups[dayId].filter(s => s.id !== studentId) });
    } else if (type !== 'group') {
       setLeaders({ ...leaders, [type]: null });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in relative pb-20">
      {/* The toolbar's print button had no print stylesheet, so it printed the
          whole app chrome. A4 portrait, one table of the week's rota. */}
      <style jsx global>{`
        .cleaning-print { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { background: #fff !important; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .cleaning-print { display: block !important; }
          .cleaning-table th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cleaning-table tr { break-inside: avoid; }
        }
        .cleaning-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        .cleaning-table th, .cleaning-table td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        .cleaning-table th { font-family: 'Moul', cursive; font-weight: normal; font-size: 11pt; text-align: center; }
      `}</style>
      
      {/* Top Header Section */}
      <div className="no-print bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-xl shadow-sm border border-white/50 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-divider gap-4">
              <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-brand-100 to-brand-100 rounded-xl shadow-sm border border-white">
                      <CalendarDays className="w-7 h-7 text-brand" />
                  </div>
                  <div>
                      <p className="text-sm font-bold text-brand-500 mb-1">PTEC កម្មវិធីកត់ត្រា</p>
                      <h1 className="kh-moul text-xl md:text-2xl bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-500">រៀបចំវេនសម្អាតប្រចាំសប្ដាហ៍</h1>
                  </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                  <button onClick={handleSave} disabled={saving} className="bg-success hover:bg-success text-white px-5 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center gap-2 disabled:opacity-50">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} រក្សាទុក
                  </button>
                  <button onClick={() => setIsRandomOpen(true)} className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center gap-2">
                      <Shuffle className="w-4 h-4" /> ចាត់តាំងស្វ័យប្រវត្តិ
                  </button>
                  <button onClick={() => window.print()} className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center gap-2">
                      <Printer className="w-4 h-4" /> មើលតារាងបោះពុម្ព
                  </button>
              </div>
          </div>

          {/* Leaders Section */}
          <div className="mt-8">
              <h3 className="font-bold text-text-heading mb-4 flex items-center gap-2">
                 <Crown className="w-5 h-5 text-warning" /> គណៈកម្មការថ្នាក់
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-brand-100/50 p-5 rounded-xl border border-divider">
                  {(['pres', 'vp1', 'vp2'] as const).map((role) => (
                      <div key={role} className="relative group">
                          <label className="block text-sm font-bold text-brand-800 mb-1.5 ml-1">
                             {role === 'pres' ? 'ប្រធានថ្នាក់' : role === 'vp1' ? 'អនុប្រធានទី១' : 'អនុប្រធានទី២'}
                          </label>
                          
                          {leaders[role] ? (
                              <div className="flex items-center justify-between bg-white border border-divider p-2.5 rounded-xl shadow-sm">
                                  <div className="flex items-center gap-2">
                                      {leaders[role].image ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                        <img src={leaders[role].image} className="w-8 h-8 rounded-full object-cover border border-divider" alt="img" />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand font-bold">{leaders[role].name.charAt(0)}</div>
                                      )}
                                      <span className="text-sm font-bold text-text-body">{leaders[role].name}</span>
                                  </div>
                                  <button onClick={() => handleRemove(role)} className="text-danger hover:text-danger p-1 bg-danger/10 rounded-lg">
                                    <X className="w-4 h-4" />
                                  </button>
                              </div>
                          ) : (
                              <div className="relative">
                                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                  <input 
                                    type="text" 
                                    placeholder="ស្វែងរកសិស្ស..." 
                                    className="w-full pl-3 pr-10 py-2.5 border border-divider rounded-xl text-sm focus:ring-2 focus:ring-focus-ring outline-none"
                                    value={searchKeys[role] || ""}
                                    onChange={(e) => setSearchKeys({...searchKeys, [role]: e.target.value})}
                                  />
                                  {searchKeys[role] && (
                                     <div className="absolute top-full left-0 z-50 w-full mt-1 bg-white border border-divider rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                        {students.filter(s => s.name_kh.includes(searchKeys[role])).map(s => (
                                          <div key={s.id} onClick={() => handleSelect(role, s)} className="p-2 hover:bg-brand-100 cursor-pointer flex items-center gap-2 border-b border-divider last:border-0 text-sm">
                                            {s.name_kh}
                                          </div>
                                        ))}
                                     </div>
                                  )}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>

          {/* Groups Section */}
          <div className="mt-8">
              <h3 className="font-bold text-text-heading mb-4 flex items-center gap-2">
                 <Users className="w-5 h-5 text-brand-500" /> បែងចែកសមាជិកតាមវេន
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {days.map((day) => (
                      <div key={day.id} className={`${day.color} border ${day.border} p-5 rounded-xl flex flex-col h-full shadow-sm`}>
                          <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/5">
                              <h4 className={`font-bold ${day.text} flex items-center gap-2`}>
                                  <CalendarDays className="w-4 h-4" /> {day.name}
                              </h4>
                              <span className="text-xs font-bold bg-white/50 px-2 py-1 rounded-full text-text-body">
                                  {groups[day.id]?.length || 0} នាក់
                              </span>
                          </div>
                          
                          <div className="flex-1 space-y-2 mb-4">
                             {groups[day.id]?.map(member => (
                                <div key={member.id} className="bg-white/80 backdrop-blur-sm border border-white p-2 rounded-xl flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-2">
                                        {member.image ? (
                                          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                          <img src={member.image} className="w-6 h-6 rounded-full object-cover" alt="img" />
                                        ) : (
                                          <div className="w-6 h-6 rounded-full bg-divider flex items-center justify-center text-xs font-bold text-text-body">{member.name.charAt(0)}</div>
                                        )}
                                        <span className="text-sm font-bold text-text-body">{member.name}</span>
                                        {member.role && member.role !== 'សមាជិក' && (
                                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand">{member.role}</span>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemove('group', day.id, member.id)} className="text-danger hover:text-danger">
                                      <X className="w-4 h-4" />
                                    </button>
                                </div>
                             ))}
                          </div>
                          
                          <div className="relative mt-auto">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                              <input 
                                type="text" 
                                placeholder="បន្ថែមសិស្ស..." 
                                className="w-full pl-9 pr-3 py-2 border border-white/60 bg-white/60 rounded-xl text-sm focus:ring-2 focus:ring-focus-ring outline-none placeholder:text-text-muted"
                                value={searchKeys[day.id] || ""}
                                onChange={(e) => setSearchKeys({...searchKeys, [day.id]: e.target.value})}
                              />
                              {searchKeys[day.id] && (
                                 <div className="absolute bottom-full left-0 z-50 w-full mb-1 bg-white border border-divider rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                    {students.filter(s => s.name_kh.includes(searchKeys[day.id])).map(s => (
                                      <div key={s.id} onClick={() => handleSelect('group', s, day.id)} className="p-2 hover:bg-brand-100 cursor-pointer flex items-center gap-2 border-b border-divider last:border-0 text-sm">
                                        {s.name_kh}
                                      </div>
                                    ))}
                                 </div>
                              )}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Printable roster */}
      <div className="cleaning-print bg-white text-black">
        <div className="mb-5 text-center">
          <h3 className="kh-moul text-[13pt]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
          <h3 className="kh-moul text-[13pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
        </div>
        <h2 className="kh-moul mb-1 text-center text-[14pt]">តារាងវេនសម្អាតថ្នាក់រៀន</h2>
        <p className="mb-5 text-center text-[11pt] font-bold">ប្រចាំសប្ដាហ៍</p>

        <table className="cleaning-table mb-6">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>ថ្ងៃ</th>
              <th>សមាជិកទទួលបន្ទុក</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id}>
                <td className="text-center font-bold">{day.name}</td>
                <td>
                  {(groups[day.id] ?? []).length === 0
                    ? '\u00a0'
                    : (groups[day.id] ?? [])
                        .map((m) => (m.role && m.role !== 'សមាជិក' ? `${m.name} (${m.role})` : m.name))
                        .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="cleaning-table">
          <thead>
            <tr><th colSpan={2}>គណៈកម្មការថ្នាក់</th></tr>
          </thead>
          <tbody>
            {([['pres', 'ប្រធានថ្នាក់'], ['vp1', 'អនុប្រធានទី១'], ['vp2', 'អនុប្រធានទី២']] as const).map(([k, label]) => (
              <tr key={k}>
                <td style={{ width: '30%' }} className="text-center font-bold">{label}</td>
                <td>{leaders[k]?.name ?? '\u00a0'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-8 text-center">
          <div className="kh-moul leading-relaxed">
            <p className="mb-2 text-[11pt]">បានឃើញ និងឯកភាព</p>
            <p className="text-[12pt]">នាយកសាលា</p>
            <div className="h-20" />
          </div>
          <div className="kh-moul leading-relaxed">
            <p className="mb-2 text-[11pt]">ថ្ងៃទី......ខែ......ឆ្នាំ......</p>
            <p className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</p>
            <div className="h-20" />
          </div>
        </div>
      </div>

      {/* Automatic assignment */}
      {isRandomOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="random-title">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="random-title" className="kh-moul text-lg text-brand">ចាត់តាំងវេនសម្អាតដោយស្វ័យប្រវត្តិ</h3>
                <p className="mt-1.5 text-sm text-text-muted">
                  បែងចែកសិស្សស្មើៗគ្នាតាមភេទ។ គណៈកម្មការថ្នាក់មិនត្រូវបានរាប់បញ្ចូលទេ។
                </p>
              </div>
              <button onClick={() => setIsRandomOpen(false)} aria-label="បិទ" className="rounded-lg p-1.5 text-text-muted hover:bg-paper hover:text-text-body">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-sm font-bold text-text-body">ជ្រើសរើសថ្ងៃ</p>
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {days.map(day => {
                const on = randomDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleRandomDay(day.id)}
                    aria-pressed={on}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${on ? 'border-divider bg-brand-100 text-brand' : 'border-divider bg-white text-text-muted hover:border-divider'}`}
                  >
                    {on && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {day.name}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
              សិស្សដែលអាចចាត់តាំងបាន៖ <b>{students.length - [leaders.pres, leaders.vp1, leaders.vp2].filter(Boolean).length}</b> នាក់
              {randomDays.length > 0 && <> · ប្រហែល <b>{Math.ceil((students.length - [leaders.pres, leaders.vp1, leaders.vp2].filter(Boolean).length) / randomDays.length)}</b> នាក់ក្នុងមួយថ្ងៃ</>}
              <br />
              ថ្ងៃដែលមិនបានជ្រើសរើស នឹងរក្សាទុកដូចដើម។
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setIsRandomOpen(false)} className="flex-1 rounded-xl bg-paper px-4 py-3 font-bold text-text-body transition hover:bg-divider">
                បោះបង់
              </button>
              <button onClick={handleRandomise} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-bold text-white shadow transition hover:bg-brand-hover">
                <Shuffle className="h-4 w-4" /> ចាត់តាំង
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-text-muted">
              លទ្ធផលនឹងមិនត្រូវបានរក្សាទុកទេ រហូតដល់អ្នកចុច «រក្សាទុក»។
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
