-- 00006_notifications_schema.sql

CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target TEXT NOT NULL, -- 'all' or student_id
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'info', 'alert', 'success'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = teacher_id);

CREATE INDEX idx_notifications_teacher ON public.notifications(teacher_id);
