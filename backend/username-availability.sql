-- Returns only availability, never account IDs, email addresses, or profile information.
create or replace function public.rfl_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(trim(p_username)) ~ '^[a-z0-9_]{3,20}$'
    then not exists (
      select 1 from public.rfl_profiles
      where lower(username) = lower(trim(p_username))
    )
    else false
  end;
$$;

revoke all on function public.rfl_username_available(text) from public;
grant execute on function public.rfl_username_available(text) to anon, authenticated;
