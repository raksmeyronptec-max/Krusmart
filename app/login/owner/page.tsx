import AuthShell from '../_components/AuthShell'
import LoginForm from '../_components/LoginForm'

export const metadata = {
  title: 'ចូលគណនីម្ចាស់សាលា | KruSmart',
}

export default function OwnerLoginPage() {
  return (
    <AuthShell role="owner">
      <LoginForm role="owner" hideRegister={true} />
    </AuthShell>
  )
}
