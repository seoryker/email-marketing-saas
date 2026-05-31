import { redirect } from 'next/navigation'
import { createLandingPage } from '@/lib/landing-pages/actions'
export default async function NewLandingPagePage() {
  const id = await createLandingPage('Untitled Page')
  redirect(`/landing-pages/${id}/edit`)
}
