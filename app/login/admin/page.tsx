import AuthShell from '../_components/AuthShell'
import LoginForm from '../_components/LoginForm'

export const metadata = {
  title: 'ចូលគណនីអ្នកគ្រប់គ្រងសាលា | KruSmart',
}

export default function AdminLoginPage() {
  return (
    <AuthShell role="admin">
      <LoginForm role="admin" hideRegister={true} />
    </AuthShell>
  )
}
