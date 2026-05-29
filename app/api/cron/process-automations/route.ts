import { NextResponse } from 'next/server'
import { processScheduledSteps } from '@/lib/automations/engine'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processScheduledSteps()
  return NextResponse.json(result)
}
