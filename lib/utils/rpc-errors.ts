import { logger } from '@/lib/utils/logger'

/**
 * SQLSTATEs our own SECURITY DEFINER functions raise with Khmer messages —
 * `create_teacher_organisation` (00017) and `backfill_teacher_enrolments`
 * (00018). Only these are safe to surface to a teacher verbatim; anything
 * else is a raw Postgres/PostgREST error (English, and possibly leaking
 * schema detail), so it is logged and replaced with the caller's fallback.
 *
 * One definition on purpose: this mapping previously lived privately in
 * app/onboarding/actions.ts, and a second RPC caller copying it is exactly
 * how the copies would drift as the functions' error codes evolve.
 */
const KHMER_RPC_ERROR_CODES = new Set(['28000', '22023', '23505', 'P0002'])

export function khmerRpcError(
  error: { message?: string; code?: string } | null,
  fallback: string,
): string {
  if (error?.code && KHMER_RPC_ERROR_CODES.has(error.code) && error.message) {
    return error.message
  }
  logger.error('rpc:', error)
  return fallback
}
