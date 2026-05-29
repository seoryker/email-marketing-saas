-- Subscriber growth view (daily new contacts)
create or replace view public.subscriber_growth_daily as
select
  organization_id,
  date_trunc('day', created_at)::date as day,
  count(*) as new_contacts
from public.contacts
group by 1, 2;

-- Unsubscribe tracking view (daily unsubscriptions)
create or replace view public.unsubscribe_daily as
select
  organization_id,
  date_trunc('day', updated_at)::date as day,
  count(*) as unsubscribed
from public.contacts
where status = 'unsubscribed'
group by 1, 2;

-- Campaign performance aggregation (daily metrics)
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
