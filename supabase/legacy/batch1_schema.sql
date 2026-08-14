-- ==========================================
-- KRUSMART: Phase 2 (Batch 1) Schemas
-- Homework Assignments & Notifications
-- ==========================================

-- 1. HOMEWORK ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.homework_assignments (
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

DROP POLICY IF EXISTS "Teachers can view their own assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can view their own assignments" ON public.homework_assignments FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can insert their own assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can insert their own assignments" ON public.homework_assignments FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can update their own assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can update their own assignments" ON public.homework_assignments FOR UPDATE USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can delete their own assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can delete their own assignments" ON public.homework_assignments FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS idx_homework_assignments_teacher ON public.homework_assignments(teacher_id);


-- 2. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target TEXT NOT NULL, -- 'all' or student_id
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'info', 'alert', 'success'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can view their own notifications" ON public.notifications;
CREATE POLICY "Teachers can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can insert their own notifications" ON public.notifications;
CREATE POLICY "Teachers can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can update their own notifications" ON public.notifications;
CREATE POLICY "Teachers can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can delete their own notifications" ON public.notifications;
CREATE POLICY "Teachers can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS idx_notifications_teacher ON public.notifications(teacher_id);
