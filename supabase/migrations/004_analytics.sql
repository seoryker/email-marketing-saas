-- Add link_url to campaign_sends for click tracking
alter table public.campaign_sends
  add column if not exists link_url text;

-- Aggregate view for fast stats per campaign
create or replace view public.campaign_stats as
select
  campaign_id,
  count(*) filter (where status != 'queued')                          as total_sent,
  count(*) filter (where status in ('delivered','opened','clicked'))  as delivered,
  count(*) filter (where status in ('opened','clicked'))              as opened,
  count(*) filter (where status = 'clicked')                          as clicked,
  count(*) filter (where status = 'bounced')                          as bounced,
  count(*) filter (where status = 'unsubscribed')                     as unsubscribed
from public.campaign_sends
group by campaign_id;
