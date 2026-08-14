'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getScores(scoreType: string, scorePeriod: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)

    if (error) {
        console.error(error)
        return []
    }

    return data || []
}

export async function saveScores(scoreType: string, scorePeriod: string, scoresData: any[]) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // scoresData is an array of objects: { student_id, subject, score_value }
    // We'll prepare upsert payload
    const upsertPayload = scoresData.map(s => ({
        teacher_id: user.id,
        student_id: s.student_id,
        subject: s.subject,
        score_type: scoreType,
        score_period: scorePeriod,
        score_value: s.score_value === '' || s.score_value === null ? null : parseFloat(s.score_value),
        updated_at: new Date().toISOString()
    }))

    const { error } = await supabase
        .from('scores')
        .upsert(upsertPayload, {
            onConflict: 'student_id, subject, score_type, score_period'
        })

    if (error) {
        console.error(error)
        return { error: error.message }
    }

    revalidatePath('/score/enter')
    return { success: true }
}
