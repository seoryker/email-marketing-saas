import { redirect } from 'next/navigation'

export default function SignupPage() {
  redirect('/login')
}

export const dynamic = 'force-dynamic'
