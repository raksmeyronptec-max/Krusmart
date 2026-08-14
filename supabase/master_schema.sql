-- ==========================================
-- KRUSMART: Cleaned Master Schema
-- ==========================================

-- 1. STUDENTS
CREATE TABLE public.students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    name_kh TEXT NOT NULL,
    name_en TEXT,
    gender TEXT NOT NULL,
    dob DATE NOT NULL,
    phone TEXT,
    
    -- Birth Place
    birth_province TEXT,
    birth_district TEXT,
    birth_commune TEXT,
    birth_village TEXT,
    
    -- Current Place
    curr_province TEXT,
    curr_district TEXT,
    curr_commune TEXT,
    curr_village TEXT,
    
    -- Status & Scholarships
    is_new_student BOOLEAN DEFAULT false,
    is_repeater BOOLEAN DEFAULT false,
    orphan_status TEXT DEFAULT 'ទេ',
    is_disabled BOOLEAN DEFAULT false,
    poor_status TEXT DEFAULT 'គ្មាន',
    is_equity BOOLEAN DEFAULT false,
    is_scholarship BOOLEAN DEFAULT false,
    
    -- Parents Info
    father_name TEXT,
    father_job TEXT,
    mother_name TEXT,
    mother_job TEXT,
    guardian_name TEXT,
    guardian_job TEXT,
    
    -- Additional Info
    ethnicity TEXT,
    special_features TEXT,
    other_remarks TEXT,
    photo_url TEXT,
    order_index INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own students" ON public.students FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own students" ON public.students FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own students" ON public.students FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own students" ON public.students FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_students_teacher_id ON public.students(teacher_id);


-- 2. ATTENDANCE
CREATE TABLE public.attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'P',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own attendance" ON public.attendance FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own attendance" ON public.attendance FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own attendance" ON public.attendance FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own attendance" ON public.attendance FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_attendance_teacher_date ON public.attendance(teacher_id, date);


-- 3. SEATING LAYOUT
CREATE TABLE public.seating_layout (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{"totalTables": 20, "gridCols": 4, "seatsPerTable": 2, "layout": "grid"}',
    assignments JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.seating_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers can manage their own seating" ON public.seating_layout FOR ALL USING (auth.uid() = teacher_id);


-- 4. SCORES
CREATE TABLE public.scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    subject TEXT NOT NULL,
    score_type TEXT DEFAULT 'monthly',
    score NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, month, subject, score_type)
);

ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own scores" ON public.scores FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own scores" ON public.scores FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own scores" ON public.scores FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own scores" ON public.scores FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_scores_teacher_month ON public.scores(teacher_id, month);


-- 5. HOMEWORK SCORES
CREATE TABLE public.homework_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    month TEXT NOT NULL,
    days JSONB NOT NULL DEFAULT '{}',
    total NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, academic_year, month)
);

ALTER TABLE public.homework_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own homework scores" ON public.homework_scores FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own homework scores" ON public.homework_scores FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own homework scores" ON public.homework_scores FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own homework scores" ON public.homework_scores FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_homework_scores_teacher_month ON public.homework_scores(teacher_id, academic_year, month);


-- 6. HOMEWORK ASSIGNMENTS
CREATE TABLE public.homework_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    image_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own assignments" ON public.homework_assignments FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own assignments" ON public.homework_assignments FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own assignments" ON public.homework_assignments FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own assignments" ON public.homework_assignments FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_homework_assignments_teacher ON public.homework_assignments(teacher_id);


-- 7. NOTIFICATIONS
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_notifications_teacher ON public.notifications(teacher_id);


-- 8. CLEANING SCHEDULES
CREATE TABLE public.cleaning_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leaders JSONB DEFAULT '{"pres": null, "vp1": null, "vp2": null}'::jsonb,
    groups JSONB DEFAULT '{"monday": [], "tuesday": [], "wednesday": [], "thursday": [], "friday": [], "saturday": []}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(teacher_id)
);

ALTER TABLE public.cleaning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers can manage their own schedule" ON public.cleaning_schedules FOR ALL USING (auth.uid() = teacher_id);


-- 9. SETTINGS
CREATE TABLE public.settings (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    surname TEXT,
    name TEXT,
    management_unit_1 TEXT,
    management_unit_2 TEXT,
    school_name TEXT,
    class_name TEXT,
    homeroom_teacher TEXT,
    manager_role TEXT,
    province_for_date TEXT,
    academic_year TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers can manage their own settings" ON public.settings FOR ALL USING (auth.uid() = teacher_id);
