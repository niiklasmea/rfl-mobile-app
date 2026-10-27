-- Web Push. Subscription endpoints and private keys are never readable by app users.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table if not exists public.rfl_push_config (
  id integer primary key check (id=1),
  worker_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  vapid jsonb
);
insert into public.rfl_push_config(id) values(1) on conflict do nothing;
create table if not exists public.rfl_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  locale text not null default 'de',
  news boolean not null default true,
  friends boolean not null default true,
  created_at timestamptz not null default now(),
  last_test_at timestamptz
);
create index if not exists rfl_push_subscriptions_user on public.rfl_push_subscriptions(user_id);
create table if not exists public.rfl_push_jobs (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.rfl_push_subscriptions(id) on delete cascade,
  event_id text not null,
  kind text not null check(kind in ('news','friends','test')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  delivered_at timestamptz,
  unique(subscription_id,event_id)
);
create index if not exists rfl_push_pending on public.rfl_push_jobs(next_attempt_at) where delivered_at is null;
create table if not exists public.rfl_push_news (id text primary key, published_at timestamptz not null);
alter table public.rfl_push_config enable row level security;
alter table public.rfl_push_subscriptions enable row level security;
alter table public.rfl_push_jobs enable row level security;
alter table public.rfl_push_news enable row level security;
revoke all on public.rfl_push_config,public.rfl_push_subscriptions,public.rfl_push_jobs,public.rfl_push_news from public,anon,authenticated;
grant all on public.rfl_push_config,public.rfl_push_subscriptions,public.rfl_push_jobs,public.rfl_push_news to service_role;
grant usage,select on sequence public.rfl_push_jobs_id_seq to service_role;

create or replace function public.rfl_push_public_key() returns text
language sql stable security definer set search_path=public as $$
  select vapid->>'publicKey' from public.rfl_push_config where id=1
$$;
create or replace function public.rfl_push_save(p_subscription jsonb,p_news boolean,p_friends boolean,p_locale text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid := auth.uid(); e text := p_subscription->>'endpoint'; k jsonb := p_subscription->'keys'; existing uuid;
begin
  if u is null then raise exception 'Sign in required'; end if;
  if e is null or length(e)>2048 or e !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' then raise exception 'Invalid push endpoint'; end if;
  if coalesce(k->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(k->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Invalid push keys'; end if;
  select user_id into existing from public.rfl_push_subscriptions where endpoint=e;
  if existing is distinct from u and (select count(*) from public.rfl_push_subscriptions where user_id=u)>=10 then raise exception 'Device limit reached'; end if;
  -- A browser subscription belongs to one signed-in account at a time.
  delete from public.rfl_push_jobs where subscription_id in (select id from public.rfl_push_subscriptions where endpoint=e and user_id<>u);
  insert into public.rfl_push_subscriptions(user_id,endpoint,keys,locale,news,friends)
  values(u,e,k,case when p_locale='en' then 'en' else 'de' end,coalesce(p_news,true),coalesce(p_friends,true))
  on conflict(endpoint) do update set user_id=u, keys=excluded.keys, locale=excluded.locale,news=excluded.news,friends=excluded.friends,
    created_at=case when rfl_push_subscriptions.user_id<>u then now() else rfl_push_subscriptions.created_at end;
  return jsonb_build_object('news',coalesce(p_news,true),'friends',coalesce(p_friends,true));
end $$;
create or replace function public.rfl_push_status(p_endpoint text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('news',news,'friends',friends) from public.rfl_push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint
$$;
create or replace function public.rfl_push_remove(p_endpoint text) returns void
language sql security definer set search_path=public as $$
  delete from public.rfl_push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint
$$;
create or replace function public.rfl_push_test(p_endpoint text) returns void
language plpgsql security definer set search_path=public as $$
declare s public.rfl_push_subscriptions;
begin
  select * into s from public.rfl_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid() for update;
  if s.id is null then raise exception 'Subscription required'; end if;
  if s.last_test_at>now()-interval '1 minute' then raise exception 'Please wait one minute'; end if;
  update public.rfl_push_subscriptions set last_test_at=now() where id=s.id;
  insert into public.rfl_push_jobs(subscription_id,event_id,kind,payload) values(s.id,'test:'||gen_random_uuid(),'test',jsonb_build_object(
    'title','RFL-APP','body',case when s.locale='en' then '🔔 Notifications are working!' else '🔔 Deine Benachrichtigungen funktionieren!' end,'action','settings'));
end $$;
create or replace function public.rfl_push_friend_event() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' then
    insert into public.rfl_push_jobs(subscription_id,event_id,kind,payload)
    select id,'friend:'||new.id,'friends',jsonb_build_object('title','RFL-APP','body',case when locale='en' then '👋 You have a new friend request.' else '👋 Du hast eine neue Freundschaftsanfrage.' end,'action','friends','requestId',new.id)
    from public.rfl_push_subscriptions where user_id=new.to_id and friends on conflict do nothing;
  end if;
  return new;
end $$;
create trigger rfl_push_friend_insert after insert on public.rfl_friend_requests for each row execute function public.rfl_push_friend_event();
create or replace function public.rfl_push_claim() returns setof public.rfl_push_jobs
language sql security definer set search_path=public as $$
  update public.rfl_push_jobs set attempts=attempts+1,next_attempt_at=now()+interval '3 minutes'
  where id in (select id from public.rfl_push_jobs where delivered_at is null and attempts<5 and next_attempt_at<=now() and created_at>now()-interval '2 days' order by id for update skip locked limit 50)
  returning *
$$;
revoke all on function public.rfl_push_public_key(),public.rfl_push_save(jsonb,boolean,boolean,text),public.rfl_push_status(text),public.rfl_push_remove(text),public.rfl_push_test(text),public.rfl_push_friend_event(),public.rfl_push_claim() from public,anon,authenticated;
grant execute on function public.rfl_push_public_key() to anon,authenticated;
grant execute on function public.rfl_push_save(jsonb,boolean,boolean,text),public.rfl_push_status(text),public.rfl_push_remove(text),public.rfl_push_test(text) to authenticated;
grant execute on function public.rfl_push_claim() to service_role;
select cron.schedule('rfl-web-push','* * * * *',$cron$
  select net.http_post(url:='https://wecrosfultwswyswwkwt.supabase.co/functions/v1/rfl-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-rfl-worker',(select worker_token from public.rfl_push_config where id=1)),body:='{}'::jsonb,timeout_milliseconds:=50000);
$cron$);
commit;
