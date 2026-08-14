-- 00005_homework_assignments_schema.sql

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
