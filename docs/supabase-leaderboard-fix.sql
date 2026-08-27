-- =============================================================================
--  Further Engine — liderlik tablosu 401 hatası düzeltmesi
--  Tarih: 2026-08-27
--
--  BELİRTİ
--    GET /rest/v1/global_leaderboard      -> 401
--    GET /rest/v1/achievement_leaderboard -> 401
--    {"code":"42501","message":"permission denied for function is_banned"}
--
--  TEŞHİS (canlı API testiyle doğrulandı)
--    public.is_banned(p_user_id uuid) fonksiyonu VAR ve çalışıyor,
--    ama `anon` rolünün üzerinde EXECUTE yetkisi YOK.
--    Ban sistemini eklerken bu fonksiyonu ya view'ların içine ya da
--    tabloların RLS policy'lerine koydun. Policy ifadeleri ve
--    security_invoker view'lar SORGUYU YAPAN rolün yetkisiyle çalışır,
--    yani `anon` bu fonksiyonu çağıramayınca tüm sorgu 401 veriyor.
--
--  ÇALIŞMAYA DEVAM EDENLER (bunlara dokunma)
--    public_profiles                      -> 200 OK
--    rpc/get_site_stats()                 -> 200 OK (260 oyuncu)
--    rpc/get_my_rank(user_id)             -> 200 OK
--    rpc/check_username_available(username_input) -> 200 OK
--
--  Supabase Dashboard > SQL Editor'a yapıştır, bölüm bölüm çalıştır.
-- =============================================================================


-- =============================================================================
-- BÖLÜM 0 — ÖNCE TEŞHİS  (hiçbir şeyi değiştirmez, sadece okur)
-- =============================================================================

-- 0.1  is_banned fonksiyonunun imzası ve kimin çalıştırma yetkisi var?
select
  n.nspname                                   as sema,
  p.proname                                   as fonksiyon,
  pg_get_function_identity_arguments(p.oid)   as parametreler,
  case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as guvenlik,
  p.proacl                                    as yetkiler,   -- NULL = varsayılan (PUBLIC)
  has_function_privilege('anon',          p.oid, 'EXECUTE')  as anon_calistirabilir,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')  as uye_calistirabilir
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'is_banned';
-- BEKLENEN SONUÇ ŞU AN: anon_calistirabilir = false  <-- sorun bu


-- 0.2  View'lar security_invoker mı? (true ise sorgulayanın yetkisiyle çalışır)
select
  c.relname as view_adi,
  pg_get_userbyid(c.relowner) as sahibi,
  coalesce(
    (select option_value from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'), 'false') as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in ('global_leaderboard', 'achievement_leaderboard', 'public_profiles');


-- 0.3  is_banned'i hangi RLS policy'ler kullanıyor?
select schemaname, tablename, policyname, cmd,
       coalesce(qual, '') || ' ' || coalesce(with_check, '') as ifade
from pg_policies
where coalesce(qual, '') || coalesce(with_check, '') ilike '%is_banned%';


-- 0.4  View'ları anon okuyabiliyor mu?
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('global_leaderboard', 'achievement_leaderboard')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee;



-- =============================================================================
-- BÖLÜM 1 — ASIL DÜZELTME  (tek satır, sorunu çözen komut)
-- =============================================================================

grant execute on function public.is_banned(uuid) to anon, authenticated;

-- Fonksiyonun parametre tipi farklıysa (0.1 sorgusundaki "parametreler"
-- sütununa bak) yukarıdaki satır hata verir. O zaman şunu kullan —
-- is_banned adındaki TÜM aşırı yüklemelere yetki verir:
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_banned'
  loop
    execute format('grant execute on function %s to anon, authenticated', f.imza);
    raise notice 'Yetki verildi: %', f.imza;
  end loop;
end $$;



-- =============================================================================
-- BÖLÜM 2 — FONKSİYONU DOĞRU ŞEKİLDE SERTLEŞTİR  (önerilir)
--
--  Ban kontrolü genelde anon'un OKUYAMAYACAĞI bir tabloya bakar
--  (bans / banned_users / profiles.is_banned gibi). Fonksiyon
--  SECURITY INVOKER kalırsa, EXECUTE yetkisi versen bile içerideki
--  tabloya erişemediği için yine patlar. SECURITY DEFINER bunu çözer:
--  fonksiyon sahibinin yetkisiyle çalışır, ama dışarıya sadece
--  true/false döner — ban tablosu gizli kalır.
--
--  ÖNEMLİ: Aşağıdaki gövdeyi KENDİ tablo/sütun adlarınla değiştir.
--  Mevcut tanımını görmek için:  select pg_get_functiondef(oid)
--                                from pg_proc where proname='is_banned';
-- =============================================================================

create or replace function public.is_banned(p_user_id uuid)
returns boolean
language sql
stable                    -- aynı sorguda tekrar tekrar hesaplanmaz (hız)
security definer          -- sahibinin yetkisiyle çalışır
set search_path = public, pg_temp   -- search_path kaçırma saldırısına karşı
as $$
  -- ↓↓↓ BURAYI KENDİ ŞEMANA GÖRE DÜZENLE ↓↓↓
  select exists (
    select 1
    from public.bans b
    where b.user_id = p_user_id
      and (b.expires_at is null or b.expires_at > now())
  );
$$;

-- Yetkileri temiz bir şekilde yeniden kur
revoke all on function public.is_banned(uuid) from public;
grant execute on function public.is_banned(uuid) to anon, authenticated, service_role;



-- =============================================================================
-- BÖLÜM 3 — VIEW YETKİLERİ  (BÖLÜM 1'den sonra hâlâ hata alırsan)
--
--  Yeni hata "permission denied for table profiles/scores/..." şeklindeyse
--  view'lar security_invoker = true demektir. İki seçeneğin var:
-- =============================================================================

-- Seçenek A (önerilen): view'lar sahibinin yetkisiyle çalışsın.
-- Böylece anon alttaki tablolara doğrudan erişmeden view'ı okuyabilir.
alter view public.global_leaderboard      set (security_invoker = false);
alter view public.achievement_leaderboard set (security_invoker = false);

grant select on public.global_leaderboard      to anon, authenticated;
grant select on public.achievement_leaderboard to anon, authenticated;

-- Seçenek B: view'lar security_invoker kalsın; o zaman alttaki tablolarda
-- anon için "herkes okuyabilir" RLS policy'si gerekir. Örnek:
--
--   alter table public.profiles enable row level security;
--   create policy "public profiles are viewable"
--     on public.profiles for select
--     to anon, authenticated
--     using (not public.is_banned(id));



-- =============================================================================
-- BÖLÜM 4 — DOĞRULAMA  (fix'ten sonra çalıştır)
-- =============================================================================

-- 4.1  Yetki gerçekten verilmiş mi?
select has_function_privilege('anon', 'public.is_banned(uuid)', 'EXECUTE') as anon_ok;
-- Beklenen: true

-- 4.2  EN ÖNEMLİ TEST — kendini anon rolüne sokup siteyle aynı sorguyu at:
begin;
  set local role anon;
  select count(*) as gorunen_satir from public.global_leaderboard;
  select count(*) as gorunen_satir from public.achievement_leaderboard;
rollback;
-- Hata vermeden sayı dönerse iş bitti. Hata verirse mesajdaki
-- tablo/fonksiyon adına bak, BÖLÜM 3'teki mantığı ona uygula.



-- =============================================================================
-- BÖLÜM 5 — BUNUN BİR DAHA OLMAMASI İÇİN
--
--  Supabase'de yeni fonksiyonlar varsayılan olarak PUBLIC'e açıktır; demek ki
--  bir yerde REVOKE çalıştırıldı (ya da fonksiyon farklı bir şemada üretildi).
--  Bundan sonra public şemada üretilen fonksiyonların otomatik yetkilenmesi:
-- =============================================================================

alter default privileges in schema public
  grant execute on functions to anon, authenticated;

-- Ban sistemine ait BAŞKA yardımcı fonksiyonlar da varsa, hepsini
-- tek seferde tarayıp yetkilendir (adında ban/rank/leaderboard geçenler):
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.proname ilike '%ban%'
        or p.proname ilike '%rank%'
        or p.proname ilike '%leaderboard%')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to anon, authenticated', f.imza);
    raise notice 'Eksik yetki tamamlandı: %', f.imza;
  end loop;
end $$;



-- =============================================================================
-- BÖLÜM 6 — SİTE TARAFI HATIRLATMASI
--
--  Fix çalıştıktan sonra status.json'daki bakım uyarısını kaldırmayı unutma:
--
--      { "title": "", "message": "" }
--
--  Tarayıcıdan hızlı test (SQL'siz):
--    curl -s -H "apikey: <publishable_key>" \
--         "https://ubhglndbbzidunjgnpqi.supabase.co/rest/v1/global_leaderboard?select=username&limit=1"
--  200 + JSON dönerse liderlik tablosu sitede de çalışıyor demektir.
-- =============================================================================
