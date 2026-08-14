-- 00003_attendance_scores_schema.sql

-- 1. Create `attendance` table
CREATE TABLE public.attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'P', -- P: Present, L: Leave, A: Absent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own attendance" ON public.attendance FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own attendance" ON public.attendance FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own attendance" ON public.attendance FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own attendance" ON public.attendance FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_attendance_teacher_date ON public.attendance(teacher_id, date);

-- 2. Create `seating_layout` table
CREATE TABLE public.seating_layout (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{"totalTables": 20, "gridCols": 4, "seatsPerTable": 2, "layout": "grid"}',
    assignments JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.seating_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage their own seating" ON public.seating_layout FOR ALL USING (auth.uid() = teacher_id);

-- 3. Create `scores` table
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
