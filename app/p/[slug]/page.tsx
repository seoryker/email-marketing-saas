import { notFound } from 'next/navigation'
import { getLandingPageBySlug } from '@/lib/landing-pages/queries'
type Props = { params: Promise<{ slug: string }> }
export default async function PublicLandingPage({ params }: Props) {
  const { slug } = await params
  const page = await getLandingPageBySlug(slug)
  if (!page || page.status !== 'published') notFound()

  const formScript = `document.querySelectorAll('form').forEach(function(form){form.addEventListener('submit',async function(e){e.preventDefault();var d={};new FormData(form).forEach(function(v,k){d[k]=v;});var b=form.querySelector('button[type=submit],input[type=submit]');if(b)b.disabled=true;try{await fetch('/api/forms/${page.slug}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});form.innerHTML='<div style="text-align:center;padding:32px;font-size:18px">✅ Thank you!</div>';}catch(err){if(b)b.disabled=false;}});});`

  return (
    <html lang="en">
      <head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{page.name}</title></head>
      <body style={{ margin: 0, padding: 0 }}>
        <div dangerouslySetInnerHTML={{ __html: page.content_html ?? '<p style="text-align:center;padding:48px">Coming soon.</p>' }} />
        <script dangerouslySetInnerHTML={{ __html: formScript }} />
      </body>
    </html>
  )
}
