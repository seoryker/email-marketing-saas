export type PageStatus = 'draft' | 'published'
export type LandingPage = {
  id: string; organization_id: string; name: string; slug: string
  status: PageStatus; content_json: Record<string, unknown> | null
  content_html: string | null; add_to_list_id: string | null
  submission_count: number; created_at: string; updated_at: string
}
