-- =============================================================================
--  FURTHER ENGINE — ADMIN PANELİ BACKEND
--
--  Siteye #/admin sayfası ekliyoruz. Bu dosya o sayfanın konuştuğu RPC'leri
--  kurar. Tamamı "security definer" ve HER BİRİ çağıranın gerçekten admin
--  olduğunu kendi içinde kontrol eder.
--
--  GÜVENLİK MODELİ
--   * Yetki kontrolü SUNUCUDA yapılır, tarayıcıda değil. Kullanıcı JS'i
--     kurcalayıp admin sayfasını açsa bile RPC'ler 403 döner.
--   * Bu fonksiyonlar sadece `authenticated` rolüne verilir; `anon` hiçbirini
--     çağıramaz.
--   * profiles.role sütunu 'admin' veya 'founder' olan hesaplar yetkilidir.
--
--  ÖNKOŞUL: docs/supabase-multi-account.sql Bölüm 1-5 çalıştırılmış olmalı.
--  Sırayla çalıştır.
-- =============================================================================


-- =============================================================================
--  BÖLÜM 1 — Yetki kontrolü
-- =============================================================================

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'founder')
  );
$$;

-- Her admin fonksiyonunun başında çağrılır.
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Not authorized'
      using errcode = '42501', hint = 'This action requires an admin account.';
  end if;
end;
$$;

revoke all on function public.is_site_admin()  from public, anon;
revoke all on function public.require_admin()  from public, anon;
grant execute on function public.is_site_admin() to authenticated;


-- Site açılırken "Admin sekmesini göstereyim mi?" sorusunun cevabı.
create or replace function public.admin_whoami()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'is_admin', public.is_site_admin(),
    'role',     coalesce((select role from public.profiles where id = auth.uid()), 'anon'),
    'username', (select username from public.profiles where id = auth.uid())
  );
$$;

revoke all on function public.admin_whoami() from public, anon;
grant execute on function public.admin_whoami() to authenticated;


-- =============================================================================
--  BÖLÜM 2 — Genel bakış sayısıları (panelin üst şeridi)
-- =============================================================================

create or replace function public.admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result json;
begin
  perform public.require_admin();

  select json_build_object(
    'total_players',   (select count(*) from public.profiles),
    'new_7d',          (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_24h',         (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'hidden',          (select count(*) from public.profiles where hidden_from_leaderboard),
    'banned',          (select count(*) from public.banned_accounts),
    'ip_rows',         (select count(*) from public.account_ips),
    'ips_tracked',     (select count(distinct ip) from public.account_ips),
    'multi_ip_groups', (select count(*) from public.ip_multi_accounts)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;


-- =============================================================================
--  BÖLÜM 3 — Şüpheli hesap listesi (IP tabanlı)
-- =============================================================================

create or replace function public.admin_ip_groups(min_accounts integer default 2)
returns table (
  ip_group      text,
  account_count integer,
  usernames     text[],
  user_ids      uuid[],
  first_seen    timestamptz,
  last_seen     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  select
    host(ai.ip_group)::text                                as ip_group,
    count(distinct ai.user_id)::integer                    as account_count,
    array_agg(distinct coalesce(p.username, '(deleted)'))  as usernames,
    array_agg(distinct ai.user_id)                         as user_ids,
    min(ai.first_seen)                                     as first_seen,
    max(ai.last_seen)                                      as last_seen
  from public.account_ips ai
  left join public.profiles p on p.id = ai.user_id
  group by ai.ip_group
  having count(distinct ai.user_id) >= greatest(min_accounts, 2)
  order by count(distinct ai.user_id) desc, max(ai.last_seen) desc
  limit 200;
end;
$$;

revoke all on function public.admin_ip_groups(integer) from public, anon;
grant execute on function public.admin_ip_groups(integer) to authenticated;


-- =============================================================================
--  BÖLÜM 4 — IP OLMADAN şüpheli tespiti
--  (audit log boş olduğu için ilk günlerde asıl işi bu görecek)
-- =============================================================================

create or replace function public.admin_suspects(limit_rows integer default 60)
returns table (
  user_id      uuid,
  username     text,
  created_at   timestamptz,
  songs_played integer,
  role         text,
  hidden       boolean,
  banned       boolean,
  score        integer,
  reasons      text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  with base as (
    select
      p.id,
      p.username,
      p.created_at,
      coalesce(p.songs_played, 0)                                     as songs,
      coalesce(p.role, 'player')                                      as role,
      coalesce(p.hidden_from_leaderboard, false)                      as hidden,
      exists (select 1 from public.banned_accounts b where b.user_id = p.id) as banned,
      -- aynı gün açılan hesap sayısı
      (select count(*) from public.profiles q
        where q.created_at::date = p.created_at::date)                as same_day,
      -- adı bu hesabın adının uzantısı olan başka hesap var mı
      (select count(*) from public.profiles q
        where q.id <> p.id
          and length(p.username) >= 4
          and (q.username ilike p.username || '%' or p.username ilike q.username || '%')
          and abs(extract(epoch from (q.created_at - p.created_at))) < 86400) as similar_name,
      -- IP paylaşımı
      (select count(distinct a2.user_id)
         from public.account_ips a1
         join public.account_ips a2 on a2.ip_group = a1.ip_group and a2.user_id <> a1.user_id
        where a1.user_id = p.id)                                      as ip_siblings
    from public.profiles p
  ),
  scored as (
    select
      b.*,
      (
        case when b.ip_siblings >= 3 then 45
             when b.ip_siblings = 2  then 35
             when b.ip_siblings = 1  then 25
             else 0 end
        + case when b.similar_name > 0 then 30 else 0 end
        + case when b.songs = 0 and b.created_at < now() - interval '3 days' then 20 else 0 end
        + case when b.same_day >= 5 then 15
               when b.same_day >= 3 then 8
               else 0 end
      )::integer as score,
      (
        array_remove(array[
          case when b.ip_siblings > 0
               then b.ip_siblings || ' account(s) share this IP' end,
          case when b.similar_name > 0
               then 'Similar username created within 24h' end,
          case when b.songs = 0 and b.created_at < now() - interval '3 days'
               then 'Never played a song' end,
          case when b.same_day >= 3
               then b.same_day || ' accounts created the same day' end
        ], null)
      ) as reasons
    from base b
  )
  select s.id, s.username, s.created_at, s.songs::integer, s.role,
         s.hidden, s.banned, s.score, s.reasons
  from scored s
  where s.score > 0
  order by s.score desc, s.created_at desc
  limit greatest(limit_rows, 1);
end;
$$;

revoke all on function public.admin_suspects(integer) from public, anon;
grant execute on function public.admin_suspects(integer) to authenticated;


-- Aynı e-posta kutusundan açılmış hesaplar (gmail nokta/artı hilesi dahil)
create or replace function public.admin_email_dupes()
returns table (
  normalized text,
  provider   text,
  accounts   integer,
  usernames  text[],
  user_ids   uuid[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  select
    n.norm,
    n.provider,
    count(*)::integer,
    array_agg(coalesce(p.username, '(no profile)') order by u.created_at),
    array_agg(u.id order by u.created_at)
  from auth.users u
  cross join lateral (
    select
      lower(split_part(replace(split_part(u.email, '@', 1), '.', ''), '+', 1)) as norm,
      lower(split_part(u.email, '@', 2))                                       as provider
  ) n
  left join public.profiles p on p.id = u.id
  where u.email is not null and u.email <> ''
  group by n.norm, n.provider
  having count(*) > 1
  order by count(*) desc
  limit 100;
end;
$$;

revoke all on function public.admin_email_dupes() from public, anon;
grant execute on function public.admin_email_dupes() to authenticated;


-- =============================================================================
--  BÖLÜM 5 — Eylemler (gizle / banla)
-- =============================================================================

create or replace function public.admin_set_hidden(target uuid, hide boolean)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
begin
  perform public.require_admin();

  select coalesce(role, 'player') into target_role from public.profiles where id = target;
  if target_role is null then
    raise exception 'No such profile' using errcode = 'P0002';
  end if;
  if target_role in ('admin', 'founder') then
    raise exception 'Cannot moderate an admin account' using errcode = '42501';
  end if;

  update public.profiles set hidden_from_leaderboard = hide where id = target;

  return json_build_object('ok', true, 'user_id', target, 'hidden', hide);
end;
$$;

revoke all on function public.admin_set_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;


create or replace function public.admin_set_banned(
  target uuid,
  ban    boolean,
  reason text default 'multi-account'
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
begin
  perform public.require_admin();

  select coalesce(role, 'player') into target_role from public.profiles where id = target;
  if target_role is null then
    raise exception 'No such profile' using errcode = 'P0002';
  end if;
  if target_role in ('admin', 'founder') then
    raise exception 'Cannot moderate an admin account' using errcode = '42501';
  end if;

  if ban then
    insert into public.banned_accounts (user_id, reason, banned_by)
    values (target, coalesce(nullif(reason, ''), 'multi-account'), auth.uid())
    on conflict (user_id) do update
      set reason = excluded.reason, banned_at = now(), banned_by = excluded.banned_by;
    update public.profiles set hidden_from_leaderboard = true where id = target;
  else
    delete from public.banned_accounts where user_id = target;
  end if;

  return json_build_object('ok', true, 'user_id', target, 'banned', ban);
end;
$$;

revoke all on function public.admin_set_banned(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_banned(uuid, boolean, text) to authenticated;


-- Bir IP grubundaki EN ESKİ hesabı bırakıp diğerlerini toplu gizler.
create or replace function public.admin_hide_ip_group(group_ip text, dry_run boolean default true)
returns table (username text, user_id uuid, action text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  with members as (
    select distinct ai.user_id, p.username, p.created_at, coalesce(p.role, 'player') as role
    from public.account_ips ai
    join public.profiles p on p.id = ai.user_id
    where host(ai.ip_group) = group_ip
  ),
  ranked as (
    select m.*, row_number() over (order by m.created_at) as rn from members m
  ),
  victims as (
    select r.user_id, r.username from ranked r
    where r.rn > 1 and r.role not in ('admin', 'founder')
  ),
  done as (
    update public.profiles p
       set hidden_from_leaderboard = true
      from victims v
     where p.id = v.user_id and not dry_run
    returning p.id
  )
  select v.username, v.user_id,
         case when dry_run then 'would hide' else 'hidden' end
  from victims v
  where dry_run or exists (select 1 from done d where d.id = v.user_id);
end;
$$;

revoke all on function public.admin_hide_ip_group(text, boolean) from public, anon;
grant execute on function public.admin_hide_ip_group(text, boolean) to authenticated;


-- =============================================================================
--  BÖLÜM 6 — Doğrulama
-- =============================================================================

-- anon HİÇBİRİNİ çağıramamalı (hepsi false olmalı):
select
  p.proname,
  has_function_privilege('anon',          p.oid, 'execute') as anon_cagirabilir,
  has_function_privilege('authenticated', p.oid, 'execute') as uye_cagirabilir
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'admin\_%' escape '\'
     or p.proname in ('is_site_admin', 'require_admin')
order by 1;

-- Kendini admin yap (KENDİ kullanıcı adını yaz):
--   update public.profiles set role = 'founder' where username = 'SametGkTe';

-- Test (admin hesabınla giriş yaptıktan sonra siteden çağrılır):
--   select public.admin_whoami();
--   select * from public.admin_suspects(20);
