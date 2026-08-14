-- 00002_students_schema.sql

-- 1. Create the `students` table
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

-- 2. Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Teachers can only select their own students
CREATE POLICY "Teachers can view their own students" 
    ON public.students 
    FOR SELECT 
    USING (auth.uid() = teacher_id);

-- Teachers can insert their own students
CREATE POLICY "Teachers can insert their own students" 
    ON public.students 
    FOR INSERT 
    WITH CHECK (auth.uid() = teacher_id);

-- Teachers can update their own students
CREATE POLICY "Teachers can update their own students" 
    ON public.students 
    FOR UPDATE 
    USING (auth.uid() = teacher_id);

-- Teachers can delete their own students
CREATE POLICY "Teachers can delete their own students" 
    ON public.students 
    FOR DELETE 
    USING (auth.uid() = teacher_id);

-- 4. Create an index for faster querying by teacher_id
CREATE INDEX idx_students_teacher_id ON public.students(teacher_id);
