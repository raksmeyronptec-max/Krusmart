-- 00004_homework_scores_schema.sql

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
