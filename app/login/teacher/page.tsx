import AuthShell from '../_components/AuthShell'
import LoginForm from '../_components/LoginForm'

export const metadata = {
  title: 'ចូលគណនីលោកគ្រូអ្នកគ្រូ | KruSmart',
}

export default function TeacherLoginPage() {
  return (
    <AuthShell role="teacher">
      <LoginForm role="teacher" hideRegister={true} />
    </AuthShell>
  )
}
