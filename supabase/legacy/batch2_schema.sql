-- ==========================================
-- KRUSMART: Phase 2 (Batch 2) Schemas
-- Cleaning Schedule
-- ==========================================

-- CLEANING SCHEDULES
CREATE TABLE IF NOT EXISTS public.cleaning_schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leaders JSONB DEFAULT '{"pres": null, "vp1": null, "vp2": null}'::jsonb,
    groups JSONB DEFAULT '{"monday": [], "tuesday": [], "wednesday": [], "thursday": [], "friday": [], "saturday": []}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(teacher_id)
);

ALTER TABLE public.cleaning_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can view their own schedule" ON public.cleaning_schedules;
CREATE POLICY "Teachers can view their own schedule" ON public.cleaning_schedules FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can insert their own schedule" ON public.cleaning_schedules;
CREATE POLICY "Teachers can insert their own schedule" ON public.cleaning_schedules FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can update their own schedule" ON public.cleaning_schedules;
CREATE POLICY "Teachers can update their own schedule" ON public.cleaning_schedules FOR UPDATE USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can delete their own schedule" ON public.cleaning_schedules;
CREATE POLICY "Teachers can delete their own schedule" ON public.cleaning_schedules FOR DELETE USING (auth.uid() = teacher_id);

-- Trigger for updating the updated_at timestamp
CREATE OR REPLACE FUNCTION update_cleaning_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleaning_schedules_updated_at ON public.cleaning_schedules;
CREATE TRIGGER trg_cleaning_schedules_updated_at
BEFORE UPDATE ON public.cleaning_schedules
FOR EACH ROW
EXECUTE FUNCTION update_cleaning_schedules_updated_at();
