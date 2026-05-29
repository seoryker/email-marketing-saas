# Analytics Dashboard (Sub-project 5) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 5 of 9
**Scope:** Replace the /dashboard home page with a tabbed analytics dashboard — Overview, Subscribers, Campaigns, Automations tabs. All data from existing tables via SQL views.

---

## Key Decision

The current `/dashboard` page (basic KPI cards + empty state) is replaced by this 4-tab analytics dashboard. No new routes — same `/dashboard` URL.

---

## Database: SQL Views (Migration 006)

```sql
-- Subscriber growth per day
create or replace view public.subscriber_growth_daily as
select
  organization_id,
  date_trunc('day', created_at)::date as day,
  count(*) as new_contacts
from public.contacts
group by 1, 2;

-- Unsubscribes per day
create or replace view public.unsubscribe_daily as
select
  organization_id,
  date_trunc('day', updated_at)::date as day,
  count(*) as unsubscribed
from public.contacts
where status = 'unsubscribed'
group by 1, 2;

-- Campaign performance per day (avg open/click rates on send date)
create or replace view public.campaign_performance_daily as
select
  c.organization_id,
  date_trunc('day', c.sent_at)::date as day,
  count(distinct c.id) as campaigns_sent,
  round(avg(
    case when s.total_sent > 0 then s.opened::numeric / s.total_sent * 100 else 0 end
  ), 1) as avg_open_rate,
  round(avg(
    case when s.total_sent > 0 then s.clicked::numeric / s.total_sent * 100 else 0 end
  ), 1) as avg_click_rate
from public.campaigns c
join public.campaign_stats s on s.campaign_id = c.id
where c.status = 'sent' and c.sent_at is not null
group by 1, 2;
```

RLS: all views inherit org scoping from underlying tables (no separate RLS needed — views use `security_invoker`).

---

## File Structure

```
app/(dashboard)/dashboard/
├── page.tsx                        # Replace existing page — Server Component
└── DashboardClient.tsx             # Client: tab state + recharts charts

lib/dashboard/
└── queries.ts                      # getOverviewStats, getSubscriberStats,
                                    # getCampaignStats, getAutomationFunnels

components/dashboard/
├── OverviewTab.tsx                 # KPIs + combined chart + recent campaigns
├── SubscribersTab.tsx              # Net growth chart + list health
├── CampaignsTab.tsx                # Open rate trend + top campaigns
└── AutomationsTab.tsx             # Per-automation funnel cards
```

---

## Data Queries (lib/dashboard/queries.ts)

### getOverviewStats(orgId, days=30)
Returns:
- `total_contacts`: count of all contacts
- `active_contacts`: count where status = 'active'
- `emails_sent_this_month`: sum of recipient_count for sent campaigns this month
- `avg_open_rate`: avg open rate across all sent campaigns
- `growth_chart`: array of `{ day, new_contacts, emails_sent }` for last N days (joined subscriber_growth_daily + campaign sends)

### getSubscriberStats(orgId, weeks=12)
Returns:
- `total`, `active`, `unsubscribed`, `bounced`: contact counts by status
- `health_pct`: `round(active/total*100)`
- `net_growth_chart`: array of `{ week, net_new }` for last N weeks (new_contacts - unsubscribed per week)

### getCampaignStats(orgId)
Returns:
- `campaigns_this_month`: count
- `avg_open_rate`, `avg_click_rate`: averages across all campaigns
- `prev_avg_open_rate`: prior month average (for delta)
- `open_rate_trend`: array of `{ day, avg_open_rate }` for last 90 days
- `top_campaigns`: top 5 campaigns by open rate (name + open_rate + sent_at)

### getAutomationFunnels(orgId)
Returns array of:
```typescript
{
  automation_id, name, status,
  enrolled: number,
  steps: Array<{ step_id, type, label, position_y, completed: number }>
  completion_rate: number  // completed_enrollments / enrolled
}
```
Computed from: `automations` → `automation_steps` (ordered by position_y) → `automation_step_states` (count completed per step).

---

## Tab Designs

### Overview Tab
- **3 KPI cards:** Total Contacts (with % change vs last month), Avg Open Rate (with pp change), Emails Sent This Month
- **Combined line/bar chart:** 30-day view with two series — emails sent (bars, blue) and new contacts (line, green). Uses recharts `ComposedChart`
- **Recent campaigns table:** last 5 sent campaigns with name, open rate, click rate, date

### Subscribers Tab
- **4 stat cards:** Total, Active, Unsubscribed, Bounced
- **Net growth bar chart:** 12-week view, each bar = new contacts minus unsubscribes that week. Green bars
- **List health bar:** `active/total` percentage with color (green >80%, amber 60-80%, red <60%)

### Campaigns Tab
- **3 stat cards:** Campaigns Sent This Month, Avg Open Rate (with delta from last month), Avg Click Rate (with delta)
- **Open rate trend chart:** 12-week line chart of avg_open_rate per week. Uses recharts `LineChart`
- **Top campaigns:** horizontal bar list — top 5 by open rate, with name + bar + % label. Purple bars

### Automations Tab
- **Per-automation funnel cards:** for each active automation, show:
  - Name + enrolled count header
  - Vertical bar chart: one bar per step, height = completed count / enrolled × max_height
  - First bar = blue (trigger), last bar = green (end), others = light blue
  - Completion rate % shown below
- Empty state if no active automations

---

## What Is Explicitly Out of Scope

- Date range picker / custom time periods (use fixed periods: 30d, 12w, 90d)
- Export to PDF/CSV
- Real-time updates (Supabase Realtime)
- Revenue analytics
- Geographic / device breakdown (those live in the per-campaign analytics at /analytics)
- Email deliverability score / spam reports
