import { getIntegrationSettings } from '@/lib/integrations/actions'
import IntegrationsClient from './IntegrationsClient'
export default async function IntegrationsPage() {
  const settings = await getIntegrationSettings()
  return <IntegrationsClient settings={settings} />
}
