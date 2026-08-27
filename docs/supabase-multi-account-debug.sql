-- =============================================================================
--  DÜZELTİLMİŞ TEŞHİS  (v2)
--
--  İki hata düzeltildi:
--   1) auth.audit_log_entries.payload sütunu JSON tipinde, JSONB değil.
--      `?` operatörü sadece jsonb'de var  ->  payload::jsonb ? 'key'
--   2) CREATE OR REPLACE FUNCTION dönüş tipini DEĞİŞTİREMEZ. Yeni sync
--      fonksiyonu bu yüzden oluşmadı ve sen eski (integer dönen) sürümü
--      çalıştırdın; "0" çıktısı ondan geliyor. Önce DROP gerekiyor.
--
--  Sırayla çalıştır.
-- =============================================================================


-- 1) Tabloda veri var mı?
select count(*) as ip_kaydi from public.account_ips;


-- 2) Audit log'da ham veri var mı?   << ASIL SORU BU
select
  count(*)                                                             as toplam_log,
  count(*) filter (where ip_address is not null and ip_address <> '')  as ipli_log,
  min(created_at)                                                      as en_eski,
  max(created_at)                                                      as en_yeni
from auth.audit_log_entries;
-- toplam_log = 0  -> Supabase audit log'u saklamıyor/temizlemiş. Geçmiş yok,
--                    ama record_ip() bugünden itibaren topluyor. Sorun değil.
-- toplam_log > 0  -> devam et, alan adları uyuşmuyordur (3. ve 4. sorgu).


-- 3) Bir satır gerçekte neye benziyor?
select id, created_at, ip_address, payload::text as payload
from auth.audit_log_entries
order by created_at desc
limit 5;


-- 4) payload içinde hangi alanlar var? (json -> jsonb cast'i ile)
select k as alan_adi, count(*) as kac_satirda
from auth.audit_log_entries,
     lateral jsonb_object_keys(payload::jsonb) k
group by k
order by 2 desc;


-- 5) Olay tipleri
select payload ->> 'action' as olay, count(*)
from auth.audit_log_entries
group by 1 order by 2 desc limit 20;



-- =============================================================================
--  YENİ SYNC FONKSİYONU  (önce DROP — dönüş tipi değişiyor)
-- =============================================================================

drop function if exists public.sync_ips_from_auth_log();

create function public.sync_ips_from_auth_log()
returns table (islenen integer, atlanan_kimliksiz integer, atlanan_bozuk_ip integer, atlanan_silinmis integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ok       integer := 0;
  yok_uid  integer := 0;
  bozuk_ip integer := 0;
  silinmis integer := 0;
  r        record;
  uid      uuid;
  addr     inet;
begin
  for r in
    select created_at, ip_address, payload::jsonb as pl
    from auth.audit_log_entries
    where ip_address is not null and ip_address <> ''
  loop
    -- kullanıcı kimliğini bilinen tüm olası alanlardan çıkarmayı dene
    uid := null;
    begin
      uid := coalesce(
        nullif(r.pl ->> 'actor_id', ''),
        nullif(r.pl ->> 'user_id', ''),
        nullif(r.pl -> 'traits' ->> 'user_id', ''),
        nullif(r.pl -> 'traits' ->> 'actor_id', '')
      )::uuid;
    exception when others then
      uid := null;
    end;

    if uid is null then
      yok_uid := yok_uid + 1;
      continue;
    end if;

    begin
      addr := split_part(split_part(r.ip_address, '%', 1), ',', 1)::inet;
    exception when others then
      bozuk_ip := bozuk_ip + 1;
      continue;
    end;

    if not exists (select 1 from auth.users u where u.id = uid) then
      silinmis := silinmis + 1;
      continue;
    end if;

    insert into public.account_ips as a (user_id, ip, ip_group, first_seen, last_seen, hits)
    values (uid, addr, public.ip_to_group(addr), r.created_at, r.created_at, 1)
    on conflict (user_id, ip) do update
      set first_seen = least(a.first_seen, excluded.first_seen),
          last_seen  = greatest(a.last_seen, excluded.last_seen),
          hits       = a.hits + 1;

    ok := ok + 1;
  end loop;

  return query select ok, yok_uid, bozuk_ip, silinmis;
end;
$$;

revoke all on function public.sync_ips_from_auth_log() from public, anon, authenticated;


-- Çalıştır — artık 4 sütun dönmeli (eski sürüm tek sütun dönüyordu):
select * from public.sync_ips_from_auth_log();

--  islenen > 0                 -> veri geldi, aşağıdaki raporlara bak
--  islenen = 0, hepsi 0        -> audit log boş (2. sorgu bunu doğrular)
--  atlanan_kimliksiz yüksek    -> payload alan adı farklı (4. sorgunun
--                                 çıktısını bana at, fonksiyonu ona göre yazayım)


-- Sonuç raporları:
select count(*) as ip_kaydi, count(distinct user_id) as hesap from public.account_ips;
select * from public.ip_multi_accounts limit 30;
select * from public.alt_account_suspects where suphe_skoru >= 70 limit 30;



-- =============================================================================
--  AUDIT LOG BOŞSA: IP'siz tespit  (bu sorgular her zaman çalışır)
-- =============================================================================

-- 1) Aynı gün açılıp hiç oynamamış hesap kümeleri (klasik smurf imzası)
select
  date_trunc('day', created_at)::date as gun,
  count(*)                            as acilan_hesap,
  count(*) filter (where coalesce(songs_played, 0) = 0) as hic_oynamayan,
  array_agg(username order by created_at)
    filter (where coalesce(songs_played, 0) = 0)        as bos_hesaplar
from public.profiles
group by 1
having count(*) filter (where coalesce(songs_played, 0) = 0) >= 3
order by 1 desc
limit 20;


-- 2) Birbirine benzeyen kullanıcı adları, kısa süre arayla açılmış
select a.username as hesap_1, b.username as hesap_2,
       a.created_at::date as tarih_1, b.created_at::date as tarih_2,
       round(abs(extract(epoch from (a.created_at - b.created_at))) / 60.0) as dakika_farki
from public.profiles a
join public.profiles b
  on a.id < b.id
 and abs(extract(epoch from (a.created_at - b.created_at))) < 3600
 and (
      left(a.username, greatest(length(a.username) - 1, 1))
        = left(b.username, greatest(length(b.username) - 1, 1))
   or a.username ilike b.username || '%'
   or b.username ilike a.username || '%'
 )
order by a.created_at desc
limit 30;


-- 3) Aynı e-posta örüntüsü (gmail nokta/plus hilesi: a.b.c@gmail = abc@gmail)
select
  lower(replace(split_part(email, '@', 1), '.', '')) as normalize_ad,
  split_part(email, '@', 2)                          as saglayici,
  count(*)                                           as hesap_sayisi,
  array_agg(email order by created_at)               as adresler
from auth.users
where email is not null
group by 1, 2
having count(*) > 1
order by 3 desc
limit 30;
-- NOT: bu sorgu auth.users'a bakar, SQL Editor'da çalışır (service role).
