import AuthShell from './_components/AuthShell'
import LoginForm from './_components/LoginForm'

export const metadata = {
  title: 'ចូលគណនី | KruSmart',
}

export default function UniversalLoginPage() {
  return (
    <AuthShell role="universal">
      <LoginForm role="universal" />
    </AuthShell>
  )
}
