"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Save, Printer, Crown, Users, X, Shuffle, CalendarDays, ArrowLeft } from "lucide-react";
import { createClient } from '../../../lib/supabase/client'
import Link from "next/link";
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import type { CleaningGroups, CleaningLeaders, Student } from '@/lib/types'

/** The three class-committee slots. */
type LeaderRole = keyof CleaningLeaders

const days = [
  { id: 'monday', name: 'ថ្ងៃច័ន្ទ', color: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  { id: 'tuesday', name: 'ថ្ងៃអង្គារ', color: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { id: 'wednesday', name: 'ថ្ងៃពុធ', color: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  { id: 'thursday', name: 'ថ្ងៃព្រហស្បតិ៍', color: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { id: 'friday', name: 'ថ្ងៃសុក្រ', color: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { id: 'saturday', name: 'ថ្ងៃសៅរ៍', color: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' }
];

export default function CleaningSchedulePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchKeys, setSearchKeys] = useState<{ [key: string]: string }>({});
  const [leaders, setLeaders] = useState<CleaningLeaders>({ pres: null, vp1: null, vp2: null });
  const [groups, setGroups] = useState<CleaningGroups>({
    monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: []
  });
  
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

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
      
      {/* Top Header Section */}
      <div className="bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-3xl shadow-sm border border-white/50 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-blue-100 gap-4">
              <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-gradient-to-br from-blue-100 to-sky-100 rounded-2xl shadow-sm border border-white">
                      <CalendarDays className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                      <p className="text-sm font-bold text-blue-500 mb-1">PTEC កម្មវិធីកត់ត្រា</p>
                      <h1 className="kh-moul text-xl md:text-2xl bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-sky-600">រៀបចំវេនសម្អាតប្រចាំសប្ដាហ៍</h1>
                  </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                  <button onClick={handleSave} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center gap-2 disabled:opacity-50">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} រក្សាទុក
                  </button>
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-sm flex items-center gap-2">
                      <Printer className="w-4 h-4" /> មើលតារាងបោះពុម្ព
                  </button>
              </div>
          </div>

          {/* Leaders Section */}
          <div className="mt-8">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Crown className="w-5 h-5 text-amber-500" /> គណៈកម្មការថ្នាក់
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                  {(['pres', 'vp1', 'vp2'] as const).map((role) => (
                      <div key={role} className="relative group">
                          <label className="block text-sm font-bold text-blue-800 mb-1.5 ml-1">
                             {role === 'pres' ? 'ប្រធានថ្នាក់' : role === 'vp1' ? 'អនុប្រធានទី១' : 'អនុប្រធានទី២'}
                          </label>
                          
                          {leaders[role] ? (
                              <div className="flex items-center justify-between bg-white border border-blue-200 p-2.5 rounded-xl shadow-sm">
                                  <div className="flex items-center gap-2">
                                      {leaders[role].image ? (
                                        <img src={leaders[role].image} className="w-8 h-8 rounded-full object-cover border border-slate-200" alt="img" />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">{leaders[role].name.charAt(0)}</div>
                                      )}
                                      <span className="text-sm font-bold text-slate-700">{leaders[role].name}</span>
                                  </div>
                                  <button onClick={() => handleRemove(role)} className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 rounded-lg">
                                    <X className="w-4 h-4" />
                                  </button>
                              </div>
                          ) : (
                              <div className="relative">
                                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input 
                                    type="text" 
                                    placeholder="ស្វែងរកសិស្ស..." 
                                    className="w-full pl-3 pr-10 py-2.5 border border-blue-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={searchKeys[role] || ""}
                                    onChange={(e) => setSearchKeys({...searchKeys, [role]: e.target.value})}
                                  />
                                  {searchKeys[role] && (
                                     <div className="absolute top-full left-0 z-50 w-full mt-1 bg-white border border-blue-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                        {students.filter(s => s.name_kh.includes(searchKeys[role])).map(s => (
                                          <div key={s.id} onClick={() => handleSelect(role, s)} className="p-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2 border-b border-gray-50 last:border-0 text-sm">
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
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Users className="w-5 h-5 text-indigo-500" /> បែងចែកសមាជិកតាមវេន
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {days.map((day) => (
                      <div key={day.id} className={`${day.color} border ${day.border} p-5 rounded-2xl flex flex-col h-full shadow-sm`}>
                          <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/5">
                              <h4 className={`font-bold ${day.text} flex items-center gap-2`}>
                                  <CalendarDays className="w-4 h-4" /> {day.name}
                              </h4>
                              <span className="text-xs font-bold bg-white/50 px-2 py-1 rounded-full text-slate-600">
                                  {groups[day.id]?.length || 0} នាក់
                              </span>
                          </div>
                          
                          <div className="flex-1 space-y-2 mb-4">
                             {groups[day.id]?.map(member => (
                                <div key={member.id} className="bg-white/80 backdrop-blur-sm border border-white p-2 rounded-xl flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-2">
                                        {member.image ? (
                                          <img src={member.image} className="w-6 h-6 rounded-full object-cover" alt="img" />
                                        ) : (
                                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{member.name.charAt(0)}</div>
                                        )}
                                        <span className="text-sm font-bold text-slate-700">{member.name}</span>
                                    </div>
                                    <button onClick={() => handleRemove('group', day.id, member.id)} className="text-rose-400 hover:text-rose-600">
                                      <X className="w-4 h-4" />
                                    </button>
                                </div>
                             ))}
                          </div>
                          
                          <div className="relative mt-auto">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="text" 
                                placeholder="បន្ថែមសិស្ស..." 
                                className="w-full pl-9 pr-3 py-2 border border-white/60 bg-white/60 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none placeholder:text-slate-500"
                                value={searchKeys[day.id] || ""}
                                onChange={(e) => setSearchKeys({...searchKeys, [day.id]: e.target.value})}
                              />
                              {searchKeys[day.id] && (
                                 <div className="absolute bottom-full left-0 z-50 w-full mb-1 bg-white border border-blue-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                    {students.filter(s => s.name_kh.includes(searchKeys[day.id])).map(s => (
                                      <div key={s.id} onClick={() => handleSelect('group', s, day.id)} className="p-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2 border-b border-gray-50 last:border-0 text-sm">
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
      
    </div>
  );
}
