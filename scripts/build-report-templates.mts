/**
 * Builds the document templates that ship with the app.
 *
 *     npm run build:templates
 *     node scripts/build-report-templates.mts
 *
 * The templates are structured into modular builder files under `scripts/report-templates/`:
 *   - scores.mts        (score_monthly_v1, score_monthly_v2, score_semester_v1)
 *   - ranking.mts       (ranking_monthly_v1, ranking_semester_v1, ranking_annual_v1)
 *   - honor.mts         (honor_v1)
 *   - certificate.mts   (certificate_v1)
 *   - yearly.mts        (annual family templates)
 *   - tracking.mts      (student_tracking_record_book_v1)
 *   - common.mts        (shared table & form builders, fonts, borders, styles)
 *
 * Output binaries are organized into clear folders in `lib/reporting/templates/`:
 *   - scores/
 *   - ranking/
 *   - honor/
 *   - certificate/
 *   - yearly/
 *   - tracking/
 */

import {
  buildAttendanceMonthlyV1, buildAttendanceYearlyV1,
} from './report-templates/attendance.mts'
import { buildCertificateV1 } from './report-templates/certificate.mts'
import { buildHonorV1, buildHonorV2 } from './report-templates/honor.mts'
import {
  buildRankingAnnualV1, buildRankingAnnualV2,
  buildRankingMonthlyV1, buildRankingMonthlyV2,
  buildRankingSemesterV1, buildRankingSemesterV2,
} from './report-templates/ranking.mts'
import {
  buildScoreMonthlyV1, buildScoreMonthlyV2,
  buildScoreSemesterV1, buildScoreSemesterV2,
} from './report-templates/scores.mts'
import { buildRecordBookV1 } from './report-templates/tracking.mts'
import {
  buildAnnualFamily,
  buildAnnualMonthlyAverageV2, buildAnnualMonthlyRankingV2,
  buildAnnualPromotionListsV2, buildAnnualSubjectResultsV2,
  buildAnnualSubjectV2, buildAnnualSummaryV2,
} from './report-templates/yearly.mts'

console.log('Building report document templates...')

// 1. Scores family
await buildScoreMonthlyV1()
await buildScoreMonthlyV2()
await buildScoreSemesterV1()
await buildScoreSemesterV2()

// 2. Ranking family
await buildRankingMonthlyV1()
await buildRankingSemesterV1()
await buildRankingAnnualV1()
await buildRankingMonthlyV2()
await buildRankingSemesterV2()
await buildRankingAnnualV2()

// 3. Honor family
await buildHonorV1()
await buildHonorV2()

// 4. Certificate family
await buildCertificateV1()

// 5. Yearly family
await buildAnnualFamily()
await buildAnnualMonthlyAverageV2()
await buildAnnualSummaryV2()
await buildAnnualMonthlyRankingV2()
await buildAnnualSubjectV2()
await buildAnnualSubjectResultsV2()
await buildAnnualPromotionListsV2()

// 6. Tracking family
await buildRecordBookV1()

// 7. Attendance family
await buildAttendanceMonthlyV1()
await buildAttendanceYearlyV1()

console.log('Done.')
