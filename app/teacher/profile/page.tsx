import { redirect } from 'next/navigation'

/**
 * The live deployment historically served the profile at /teacher/profile;
 * this repo's canonical route is /profile. Keep old links working instead of
 * 404ing them.
 */
export default function TeacherProfileRedirect() {
  redirect('/profile')
}
