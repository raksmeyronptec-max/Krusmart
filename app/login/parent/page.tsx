import AuthShell from '../_components/AuthShell'
import LoginForm from '../_components/LoginForm'

export const metadata = {
  title: 'ចូលគណនីអាណាព្យាបាលសិស្ស | KruSmart',
}

export default function ParentLoginPage() {
  return (
    <AuthShell role="parent">
      <LoginForm role="parent" hideRegister={true} />
    </AuthShell>
  )
}
