-- =============================================================================
--  Further Engine — IP tabanlı çoklu hesap (alt account) tespiti
--  Tarih: 2026-08-27
--
--  AMAÇ
--    Aynı IP'den açılmış birden fazla hesabı tespit etmek, liderlik tablosunu
--    smurf/alt hesaplardan temizlemek ve gerekirse ban uygulamak.
--
--  ÖNCE ŞUNU OKU  ⚠️
--    "Aynı IP = aynı kişi" DEĞİLDİR. Otomatik ban kurarsan masum oyuncu
--    banlarsın. Türkiye'de bu risk özellikle yüksek:
--
--      • CGNAT: Turkcell/Vodafone/TTNET mobil internette BİNLERCE kullanıcı
--        aynı public IP'yi paylaşır. Aynı IP'de 50 hesap görmen normaldir.
--      • Ev: kardeşler, aynı evdeki arkadaşlar → aynı IP, farklı kişiler.
--      • Okul / yurt / internet kafe → onlarca gerçek oyuncu, tek IP.
--      • Dinamik IP: modem resetlenince IP başkasına geçer. Dün banladığın
--        IP'yi yarın masum bir oyuncu alır.
--      • VPN / proxy → aynı çıkış IP'si.
--
--    Bu yüzden bu dosyadaki tasarım şudur:
--      1) IP'leri güvenli şekilde KAYDET (sunucu tarafında, sahtelenemez)
--      2) Şüphelileri RAPORLA (otomatik banlama)
--      3) Bariz durumlarda hesap AÇILIŞINI sınırla (ban yerine önleme)
--      4) Ban kararını SEN ver — tek komutla uygula
--      5) Daha güvenilir sinyal: cihaz kimliği (en sonda)
--
--  Supabase Dashboard > SQL Editor. Bölüm bölüm çalıştır.
-- =============================================================================


-- =============================================================================
-- BÖLÜM 1 — IP KAYIT TABLOSU
-- =============================================================================

create table if not exists public.account_ips (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  ip          inet        not null,
  ip_group    inet        not null,          -- IPv4 /32, IPv6 /64 (aynı aboneyi toplar)
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  hits        integer     not null default 1,
  user_agent  text,
  primary key (user_id, ip)
);

create index if not exists account_ips_group_idx on public.account_ips (ip_group);
create index if not exists account_ips_last_seen_idx on public.account_ips (last_seen desc);

-- IP'ler kişisel veridir (KVKK/GDPR). Kimse okuyamasın; sadece
-- SECURITY DEFINER fonksiyonlar ve service_role erişsin.
alter table public.account_ips enable row level security;
revoke all on public.account_ips from anon, authenticated;


-- IPv6'da her kullanıcıya /64 blok verilir → tek adrese değil bloğa bakmak lazım.
create or replace function public.ip_to_group(addr inet)
returns inet
language sql
immutable
as $$
  select case
    when family(addr) = 6 then network(set_masklen(addr, 64))
    else addr
  end;
$$;


-- =============================================================================
-- BÖLÜM 2 — IP'Yİ SUNUCU TARAFINDA YAKALA (sahtelenemez)
--
--  Tarayıcıdan gelen IP'ye asla güvenme. Supabase'in önünde Cloudflare var;
--  `cf-connecting-ip` başlığını CF kendisi yazar, istemci değiştiremez.
--  x-forwarded-for'da ise gerçek IP EN SONDAKİ değerdir (istemci başa sahte
--  değer ekleyebilir), o yüzden sondan okuyoruz.
-- =============================================================================

create or replace function public.client_ip()
returns inet
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  h    json;
  raw  text;
  parts text[];
  out  inet;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;

  raw := nullif(trim(h ->> 'cf-connecting-ip'), '');

  if raw is null then
    raw := nullif(trim(h ->> 'x-real-ip'), '');
  end if;

  if raw is null and (h ->> 'x-forwarded-for') is not null then
    parts := string_to_array(h ->> 'x-forwarded-for', ',');
    raw := btrim(parts[array_length(parts, 1)]);      -- en sondaki = proxy'nin gördüğü
  end if;

  if raw is null then return null; end if;
  raw := split_part(raw, '%', 1);                      -- IPv6 zone id temizliği

  begin
    out := raw::inet;
  exception when others then
    return null;
  end;

  return out;
end;
$$;

revoke all on function public.client_ip() from public;
grant execute on function public.client_ip() to anon, authenticated;


-- Giriş yapmış kullanıcının IP'sini kaydet. Oyun/site açılışta bir kez çağırır.
create or replace function public.record_ip()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  addr inet := public.client_ip();
  ua   text;
begin
  if uid is null or addr is null then return; end if;

  begin
    ua := left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 300);
  exception when others then
    ua := null;
  end;

  insert into public.account_ips as a (user_id, ip, ip_group, user_agent)
  values (uid, addr, public.ip_to_group(addr), ua)
  on conflict (user_id, ip) do update
    set last_seen  = now(),
        hits       = a.hits + 1,
        user_agent = coalesce(excluded.user_agent, a.user_agent);
end;
$$;

revoke all on function public.record_ip() from public;
grant execute on function public.record_ip() to authenticated;


-- =============================================================================
-- BÖLÜM 3 — GEÇMİŞİ DOLDUR  (bedava veri!)
--
--  Supabase Auth zaten her giriş/kayıt için IP'yi auth.audit_log_entries
--  tablosuna yazıyor. Yani hiçbir kod değişikliği yapmadan geçmişe dönük
--  analiz yapabilirsin. Bu fonksiyonu bir kez (ve sonra günlük) çalıştır.
-- =============================================================================

-- DİKKAT: bu fonksiyonun güncel ve daha toleranslı sürümü
-- docs/supabase-multi-account-debug.sql dosyasındadır.
-- Dönüş tipi değiştiği için önce `drop function` gerekir.
-- Ayrıca auth.audit_log_entries.payload sütunu JSON tipindedir (jsonb DEĞİL),
-- `?` operatörü kullanacaksan payload::jsonb diye cast et.
create or replace function public.sync_ips_from_auth_log()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  with rows as (
    select
      (payload ->> 'actor_id')::uuid as user_id,
      ip_address::inet               as ip,
      min(created_at)                as first_seen,
      max(created_at)                as last_seen,
      count(*)::int                  as hits
    from auth.audit_log_entries
    where ip_address is not null
      and ip_address <> ''
      and (payload ->> 'actor_id') is not null
      and (payload ->> 'actor_id') ~ '^[0-9a-fA-F-]{36}$'
    group by 1, 2
  )
  insert into public.account_ips as a (user_id, ip, ip_group, first_seen, last_seen, hits)
  select r.user_id, r.ip, public.ip_to_group(r.ip), r.first_seen, r.last_seen, r.hits
  from rows r
  join auth.users u on u.id = r.user_id
  on conflict (user_id, ip) do update
    set first_seen = least(a.first_seen, excluded.first_seen),
        last_seen  = greatest(a.last_seen, excluded.last_seen),
        hits       = greatest(a.hits, excluded.hits);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_ips_from_auth_log() from public;

-- Şimdi çalıştır:
select public.sync_ips_from_auth_log() as islenen_kayit;


-- =============================================================================
-- BÖLÜM 4 — ŞÜPHELİLERİ RAPORLA  (ban YOK, sadece liste)
-- =============================================================================

-- 4.1  Aynı IP grubunda birden fazla hesap
create or replace view public.ip_multi_accounts as
select
  ai.ip_group,
  count(distinct ai.user_id)                       as hesap_sayisi,
  array_agg(distinct p.username order by p.username) as kullanicilar,
  min(ai.first_seen)                               as ilk_gorulme,
  max(ai.last_seen)                                as son_gorulme,
  count(distinct ai.user_agent)                    as farkli_cihaz_imzasi
from public.account_ips ai
left join public.profiles p on p.id = ai.user_id
group by ai.ip_group
having count(distinct ai.user_id) > 1
order by count(distinct ai.user_id) desc;

revoke all on public.ip_multi_accounts from anon, authenticated;

-- Bak bakalım tablo ne diyor:
select * from public.ip_multi_accounts limit 50;


-- 4.2  Daha akıllı skor: sadece "aynı IP" değil, şüphe seviyesi
--      (aynı user-agent + kısa zaman aralığı + az oyun = yüksek şüphe)
create or replace view public.alt_account_suspects as
with pairs as (
  select
    a.user_id                                        as hesap_a,
    b.user_id                                        as hesap_b,
    a.ip_group,
    (a.user_agent is not distinct from b.user_agent) as ayni_cihaz,
    abs(extract(epoch from (a.first_seen - b.first_seen))) / 3600.0 as saat_farki
  from public.account_ips a
  join public.account_ips b
    on a.ip_group = b.ip_group
   and a.user_id < b.user_id
)
select
  pr.ip_group,
  pa.username as hesap_1,
  pb.username as hesap_2,
  pr.ayni_cihaz,
  round(pr.saat_farki::numeric, 1) as kayit_arasi_saat,
  coalesce(sa.songs_played, 0) as sarki_1,
  coalesce(sb.songs_played, 0) as sarki_2,
  -- kaba bir şüphe skoru (0-100)
  least(100,
      40 * (case when pr.ayni_cihaz then 1 else 0 end)
    + 30 * (case when pr.saat_farki < 24 then 1 else 0 end)
    + 30 * (case when coalesce(sa.songs_played,0) < 5 or coalesce(sb.songs_played,0) < 5 then 1 else 0 end)
  ) as suphe_skoru
from pairs pr
left join public.profiles pa on pa.id = pr.hesap_a
left join public.profiles pb on pb.id = pr.hesap_b
left join public.profiles sa on sa.id = pr.hesap_a
left join public.profiles sb on sb.id = pr.hesap_b
order by suphe_skoru desc, pr.saat_farki asc;

revoke all on public.alt_account_suspects from anon, authenticated;

-- ⚠️ NOT: suphe_skoru 100 bile olsa TEK BAŞINA kanıt değildir.
--    Kardeşler aynı telefondan aynı gün hesap açmış olabilir.
select * from public.alt_account_suspects where suphe_skoru >= 70 limit 50;


-- =============================================================================
-- BÖLÜM 5 — ÖNLEME  (banlamaktan çok daha iyisi)
--
--  Ban geçmişi temizlemez, insanları kızdırır ve yanlış olabilir.
--  Bunun yerine: aynı IP'den 3'ten fazla hesap AÇILMASIN.
--  Site kayıt olmadan önce bunu çağırır; false dönerse kayıt engellenir.
-- =============================================================================

create or replace function public.can_register_from_here(max_accounts integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  addr    inet := public.client_ip();
  grp     inet;
  toplam  integer;
  son24s  integer;
begin
  -- IP okunamadıysa engelleme (fail-open): kimseyi mağdur etme.
  if addr is null then
    return jsonb_build_object('allowed', true, 'reason', 'no_ip');
  end if;

  grp := public.ip_to_group(addr);

  select count(distinct user_id) into toplam
  from public.account_ips where ip_group = grp;

  select count(distinct user_id) into son24s
  from public.account_ips
  where ip_group = grp and first_seen > now() - interval '24 hours';

  if son24s >= 2 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'message', 'Too many accounts were created from this connection today. Try again tomorrow.');
  end if;

  if toplam >= max_accounts then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'too_many_accounts',
      'message', 'This connection already has the maximum number of accounts. Contact support if you share a network.');
  end if;

  return jsonb_build_object('allowed', true, 'accounts_here', toplam);
end;
$$;

revoke all on function public.can_register_from_here(integer) from public;
grant execute on function public.can_register_from_here(integer) to anon, authenticated;

-- Test:
select public.can_register_from_here(3);


-- =============================================================================
-- BÖLÜM 6 — BAN  (kararı SEN veriyorsun, otomatik değil)
--
--  Not: ban tablosunun adı sende farklıysa (bans / banned_users / profiles.is_banned)
--  aşağıdaki INSERT'leri kendi şemana göre düzelt.
-- =============================================================================

-- 6.1  Ban tablosu yoksa örnek şema
create table if not exists public.bans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text not null default 'multi_account',
  note       text,
  banned_at  timestamptz not null default now(),
  expires_at timestamptz,                       -- null = kalıcı
  banned_by  uuid
);
alter table public.bans enable row level security;
revoke all on public.bans from anon, authenticated;


-- 6.2  Bir IP grubundaki hesaplardan EN ESKİSİNİ bırak, diğerlerini banla.
--      dry_run = true iken hiçbir şey yazmaz, sadece ne olacağını gösterir.
create or replace function public.ban_alts_on_ip(
  target_ip inet,
  dry_run   boolean default true,
  note      text default null
)
returns table (user_id uuid, username text, action text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grp inet := public.ip_to_group(target_ip);
begin
  return query
  with ranked as (
    select
      ai.user_id,
      p.username,
      row_number() over (order by min(ai.first_seen)) as sira
    from public.account_ips ai
    left join public.profiles p on p.id = ai.user_id
    where ai.ip_group = grp
    group by ai.user_id, p.username
  ),
  hedef as (
    select r.user_id, r.username from ranked r where r.sira > 1
  ),
  uygulanan as (
    insert into public.bans (user_id, reason, note)
    select h.user_id, 'multi_account', coalesce(note, 'IP: ' || host(grp))
    from hedef h
    where not dry_run
    on conflict (user_id) do nothing
    returning bans.user_id
  )
  select h.user_id, h.username,
         case when dry_run then 'BANLANACAK (dry run)' else 'BANLANDI' end
  from hedef h;
end;
$$;

revoke all on function public.ban_alts_on_ip(inet, boolean, text) from public;

-- Kullanım:
--   select * from public.ban_alts_on_ip('88.230.12.34');           -- önizleme
--   select * from public.ban_alts_on_ip('88.230.12.34', false);    -- uygula


-- =============================================================================
-- BÖLÜM 7 — DAHA YUMUŞAK ÇÖZÜM: BANLAMA, LİDERLİKTEN GİZLE
--
--  Çoğu durumda istediğin şey "bu kişi oynamasın" değil,
--  "tablo şişmesin, tek kişi ilk 10'da 4 kere görünmesin".
-- =============================================================================

alter table public.profiles
  add column if not exists hidden_from_leaderboard boolean not null default false;

-- Aynı IP'deki hesaplardan sadece EN YÜKSEK PUANLI olanı tabloda göster:
create or replace function public.hide_alt_accounts(dry_run boolean default true)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  with ranked as (
    select
      p.id,
      row_number() over (
        partition by ai.ip_group
        order by coalesce(p.ultra_points, 0) desc, p.created_at asc
      ) as sira
    from public.account_ips ai
    join public.profiles p on p.id = ai.user_id
  ),
  hedef as (select id from ranked where sira > 1)
  update public.profiles
     set hidden_from_leaderboard = true
   where id in (select id from hedef)
     and not dry_run;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Sonra liderlik view'ına tek satır ekle:
--   ... where not p.hidden_from_leaderboard and not public.is_banned(p.id)


-- =============================================================================
-- BÖLÜM 8 — BAKIM: VERİYİ SÜRESİZ TUTMA (KVKK / GDPR)
--
--  IP adresi kişisel veridir. Süresiz saklamak hem gereksiz hem riskli.
--  90 günden eski, tek hesaba ait kayıtları temizle.
-- =============================================================================

create or replace function public.prune_account_ips(keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  delete from public.account_ips
  where last_seen < now() - make_interval(days => keep_days)
    and ip_group not in (select ip_group from public.ip_multi_accounts);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Supabase > Database > Cron ile günlük çalıştır:
--   select cron.schedule('sync-ips',  '0 * * * *', $$select public.sync_ips_from_auth_log()$$);
--   select cron.schedule('prune-ips', '30 3 * * *', $$select public.prune_account_ips(90)$$);


-- =============================================================================
-- BÖLÜM 9 — DAHA GÜVENİLİR SİNYAL: CİHAZ KİMLİĞİ
--
--  IP yanıltıcıdır; cihaz kimliği çok daha kesindir. Oyun Android'de
--  Settings.Secure.ANDROID_ID (veya kendi ürettiğin ve dosyaya kaydettiğin
--  bir UUID) gönderirse, "aynı telefondan 6 hesap" tespiti neredeyse
--  hatasız olur. IP ile birlikte kullanınca yanlış pozitif çok düşer.
-- =============================================================================

create table if not exists public.account_devices (
  user_id    uuid not null references auth.users(id) on delete cascade,
  device_id  text not null,                    -- oyundan gelen hash
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  platform   text,
  primary key (user_id, device_id)
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from anon, authenticated;
create index if not exists account_devices_device_idx on public.account_devices (device_id);

create or replace function public.record_device(p_device_id text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_device_id is null or length(p_device_id) < 8 then return; end if;

  insert into public.account_devices as d (user_id, device_id, platform)
  values (uid, encode(digest(p_device_id, 'sha256'), 'hex'), p_platform)  -- ham id'yi saklama
  on conflict (user_id, device_id) do update set last_seen = now();
end;
$$;
-- digest() için:  create extension if not exists pgcrypto;

grant execute on function public.record_device(text, text) to authenticated;

create or replace view public.device_multi_accounts as
select device_id, count(distinct user_id) as hesap_sayisi,
       array_agg(distinct user_id) as hesaplar, max(last_seen) as son_gorulme
from public.account_devices
group by device_id
having count(distinct user_id) > 1
order by 2 desc;

revoke all on public.device_multi_accounts from anon, authenticated;


-- =============================================================================
-- BÖLÜM 10 — SİTE / OYUN TARAFINDA YAPILACAKLAR
--
--  1) Giriş başarılı olduktan hemen sonra (site ve oyun):
--       POST /rest/v1/rpc/record_ip        (Authorization: Bearer <access_token>)
--
--  2) Kayıt formundan önce:
--       POST /rest/v1/rpc/can_register_from_here   -> { "allowed": false, "message": "..." }
--       false dönerse kaydı durdur ve mesajı göster.
--
--  3) Oyun (Haxe/Android) girişten sonra:
--       POST /rest/v1/rpc/record_device  { "p_device_id": "<ANDROID_ID>", "p_platform": "android" }
--
--  4) Kurallar sayfasına/FAQ'ya "oyuncu başına tek hesap" maddesi ekle ve
--     IP kaydettiğini yaz — KVKK açısından bilgilendirme şart.
-- =============================================================================


-- =============================================================================
-- EK NOT (canlı testte tespit edildi, 2026-08-27)
--
--  Supabase projelerinde şöyle bir default privilege ayarı vardır:
--    alter default privileges in schema public
--      grant all on functions to postgres, anon, authenticated, service_role;
--
--  Yani `revoke all ... from public` yazsan bile `anon` rolüne AÇIKÇA verilmiş
--  yetki durmaya devam eder. Test ettim: record_ip() anon anahtarıyla da
--  çağrılabiliyor (HTTP 204). Zararsız — auth.uid() null olduğu için hiçbir
--  şey yazmıyor — ama temiz olsun diye anon'dan almakta fayda var:
-- =============================================================================

revoke execute on function public.record_ip()                       from anon;
revoke execute on function public.sync_ips_from_auth_log()          from anon, authenticated;
revoke execute on function public.prune_account_ips(integer)        from anon, authenticated;
revoke execute on function public.ban_alts_on_ip(inet, boolean, text) from anon, authenticated;
revoke execute on function public.hide_alt_accounts(boolean)        from anon, authenticated;

-- Bunlar anon'da KALMALI (site kayıt öncesi çağırıyor):
grant execute on function public.can_register_from_here(integer) to anon, authenticated;
grant execute on function public.record_ip()                     to authenticated;

-- Doğrulama:
select p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as uye
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('record_ip','client_ip','can_register_from_here',
                    'sync_ips_from_auth_log','prune_account_ips',
                    'ban_alts_on_ip','hide_alt_accounts','is_banned')
order by 1;
