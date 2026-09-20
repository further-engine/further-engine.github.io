/* Further Engine — public profile page */
(function(){
  'use strict';

  const FE = window.FurtherEngine || {};
  const SB_URL = FE.SB_URL || "https://ubhglndbbzidunjgnpqi.supabase.co";
  const SB_KEY = FE.SB_KEY || "sb_publishable_xShtsNZot0C3cIDqj3s2Ew_V3zJs_1k";
  const AVATAR_BUCKET = "avatars";
  const BANNER_BUCKET = "banners";

  const FLAGS = FE.FLAGS || {
    "Afghanistan":"🇦🇫","Albania":"🇦🇱","Algeria":"🇩🇿","Argentina":"🇦🇷",
    "Australia":"🇦🇺","Austria":"🇦🇹","Azerbaijan":"🇦🇿","Bangladesh":"🇧🇩",
    "Belarus":"🇧🇾","Belgium":"🇧🇪","Bolivia":"🇧🇴","Brazil":"🇧🇷",
    "Bulgaria":"🇧🇬","Cambodia":"🇰🇭","Canada":"🇨🇦","Chile":"🇨🇱",
    "China":"🇨🇳","Colombia":"🇨🇴","Croatia":"🇭🇷","Czech Republic":"🇨🇿",
    "Denmark":"🇩🇰","Ecuador":"🇪🇨","Egypt":"🇪🇬","Estonia":"🇪🇪",
    "Ethiopia":"🇪🇹","Finland":"🇫🇮","France":"🇫🇷","Georgia":"🇬🇪",
    "Germany":"🇩🇪","Ghana":"🇬🇭","Greece":"🇬🇷","Guatemala":"🇬🇹",
    "Hungary":"🇭🇺","India":"🇮🇳","Indonesia":"🇮🇩","Iran":"🇮🇷",
    "Iraq":"🇮🇶","Ireland":"🇮🇪","Israel":"🇮🇱","Italy":"🇮🇹",
    "Japan":"🇯🇵","Jordan":"🇯🇴","Kazakhstan":"🇰🇿","Kenya":"🇰🇪",
    "Latvia":"🇱🇻","Lebanon":"🇱🇧","Lithuania":"🇱🇹","Malaysia":"🇲🇾",
    "Mexico":"🇲🇽","Morocco":"🇲🇦","Netherlands":"🇳🇱","New Zealand":"🇳🇿",
    "Nigeria":"🇳🇬","Norway":"🇳🇴","Pakistan":"🇵🇰","Peru":"🇵🇪",
    "Philippines":"🇵🇭","Poland":"🇵🇱","Portugal":"🇵🇹","Romania":"🇷🇴",
    "Russia":"🇷🇺","Saudi Arabia":"🇸🇦","Serbia":"🇷🇸","Singapore":"🇸🇬",
    "Slovakia":"🇸🇰","Slovenia":"🇸🇮","South Africa":"🇿🇦","South Korea":"🇰🇷",
    "Spain":"🇪🇸","Sri Lanka":"🇱🇰","Sweden":"🇸🇪","Switzerland":"🇨🇭",
    "Taiwan":"🇹🇼","Thailand":"🇹🇭","Tunisia":"🇹🇳","Turkey":"🇹🇷",
    "Ukraine":"🇺🇦","United Arab Emirates":"🇦🇪","United Kingdom":"🇬🇧",
    "United States":"🇺🇸","Uruguay":"🇺🇾","Uzbekistan":"🇺🇿",
    "Venezuela":"🇻🇪","Vietnam":"🇻🇳","Other":"🌍"
  };

  function escapeHtml(s){
    if(FE.escapeHtml) return FE.escapeHtml(s);
    if(s==null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatUP(v){
    if(FE.formatUP) return FE.formatUP(v);
    return parseFloat(v||0).toFixed(1)+' UP';
  }
  function getAvatarUrl(id, fn){
    if(FE.getAvatarUrl) return FE.getAvatarUrl(id, fn);
    if(!fn || !id) return null;
    return SB_URL + "/storage/v1/object/public/" + AVATAR_BUCKET + "/" + id + "/" + fn;
  }
  function getBannerUrl(id, fn){
    if(FE.getBannerUrl) return FE.getBannerUrl(id, fn);
    if(!fn || !id) return null;
    return SB_URL + "/storage/v1/object/public/" + BANNER_BUCKET + "/" + id + "/" + fn;
  }
  function getRoleCls(role){
    if(role==='founder') return 'bg-amber-900/30 text-amber-300 border-amber-700/30';
    if(role==='admin') return 'bg-violet-800/30 text-violet-300 border-violet-700/30';
    if(role==='moderator') return 'bg-emerald-800/30 text-emerald-300 border-emerald-700/30';
    return 'bg-white/5 text-slate-300 border-white/10';
  }
  function getAchTier(c){
    c = parseInt(c||0);
    if(c>=50) return {label:'MASTER', cls:'bg-amber-800/30 text-amber-300 border-amber-700/30'};
    if(c>=25) return {label:'VETERAN', cls:'bg-violet-700/30 text-violet-300 border-violet-700/30'};
    if(c>=10) return {label:'SKILLED', cls:'bg-emerald-700/30 text-emerald-300 border-emerald-700/30'};
    return {label:'', cls:'bg-white/5 text-slate-400 border-white/5'};
  }
  function lbId(p){ return (p && (p.id||p.player_id||p.user_id))||''; }

  function showToast(msg, type){
    var existing = document.getElementById('fe-toast');
    if(existing) existing.remove();
    var el = document.createElement('div');
    el.id='fe-toast';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:22px;right:18px;z-index:90;padding:10px 14px;border-radius:14px;font-size:12px;font-family:Inter,sans-serif;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,.45);transition:opacity .25s,transform .25s;'+(type==='err'?'background:#7f1d1d;color:#fff;border:1px solid rgba(255,255,255,.12)':'background:#064e3b;color:#d1fae5;border:1px solid rgba(52,211,153,.25)');
    document.body.appendChild(el);
    setTimeout(function(){ el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(function(){ el.remove(); },260); }, 2400);
  }

  async function fetchOne(table, username){
    var headers = { 'apikey': SB_KEY, 'Accept':'application/json' };
    // eq
    try{
      var url = SB_URL + "/rest/v1/" + table + "?select=*&username=eq." + encodeURIComponent(username) + "&limit=1";
      var r = await fetch(url, { headers: headers });
      if(r.ok){
        var j = await r.json();
        if(Array.isArray(j) && j.length) return j[0];
      }
    }catch(e){}
    // ilike fallback (case-insensitive exact)
    try{
      var url2 = SB_URL + "/rest/v1/" + table + "?select=*&username=ilike." + encodeURIComponent(username) + "&limit=1";
      var r2 = await fetch(url2, { headers: headers });
      if(r2.ok){
        var j2 = await r2.json();
        if(Array.isArray(j2) && j2.length) return j2[0];
      }
    }catch(e){}
    return null;
  }

  async function fetchPublicByUsername(username){
    // public_profiles may be queried same as above
    return await fetchOne('public_profiles', username);
  }

  // global rank: fetch ordered list and find position
  async function fetchRank(table, orderCol, username){
    try{
      var headers = { 'apikey': SB_KEY, 'Accept':'application/json' };
      var url = SB_URL + "/rest/v1/" + table + "?select=username,"+orderCol+"&order="+orderCol+".desc&limit=1000";
      var r = await fetch(url, { headers: headers });
      if(!r.ok) return { rank: null, total: null };
      var arr = await r.json();
      if(!Array.isArray(arr) || !arr.length) return { rank:null, total:0 };
      // case-insensitive find
      var low = (username||'').toLowerCase();
      for(var i=0;i<arr.length;i++){
        if(String(arr[i].username||'').toLowerCase()===low){
          return { rank: i+1, total: arr.length };
        }
      }
      return { rank: null, total: arr.length };
    }catch(e){ return { rank:null, total:null }; }
  }

  function setAvatar(el, id, filename, initials){
    if(!el) return;
    if(filename && id){
      var url = getAvatarUrl(id, filename);
      if(url){
        el.innerHTML = '<img src="'+escapeHtml(url)+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\';this.parentNode.textContent=\''+escapeHtml(initials)+'\'">';
        el.style.background='#0f0f0f';
        return;
      }
    }
    el.textContent = initials;
  }

  window.profileCopyLink = function(){
    var url = window.location.href;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ showToast('Profile link copied!'); }, function(){ fallbackCopy(url); });
    } else { fallbackCopy(url); }
  };
  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); showToast('Profile link copied!'); }catch(e){ showToast('Copy failed', 'err'); }
    ta.remove();
  }

  window.loadProfilePage = async function(rawUsername){
    var username = (rawUsername||'').trim();
    if(!username){
      username = (window._profileRequested||'').trim();
    }
    if(!username){
      // try from hash
      var hash = (window.location.hash||'').replace(/^#\/?/,'');
      var parts = hash.split('/');
      if(parts[0].toLowerCase()==='u' && parts[1]) username = decodeURIComponent(parts.slice(1).join('/').trim());
    }
    if(!username) return;

    // UI refs
    var loading = document.getElementById('profile-loading');
    var notfound = document.getElementById('profile-notfound');
    var content = document.getElementById('profile-content');
    var nfNameEl = document.getElementById('profile-notfound-name');
    if(nfNameEl) nfNameEl.textContent = username;

    // ensure page is active
    var page = document.getElementById('page-profile');
    if(page && !page.classList.contains('active')){
      // let router handle? but ensure visible if directly called
      document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
      page.classList.add('active');
    }

    if(loading) loading.style.display='block';
    if(notfound) notfound.style.display='none';
    if(content) content.style.display='none';

    // set document title early
    try{ document.title = username + ' — Player Profile — Further Engine'; }catch(e){}

    try{
      // parallel fetch
      var pGlob = fetchOne('global_leaderboard', username);
      var pPub  = fetchPublicByUsername(username);
      var pAch  = fetchOne('achievement_leaderboard', username);

      var results = await Promise.all([pGlob, pPub, pAch]);
      var glob = results[0];
      var pub  = results[1];
      var ach  = results[2];

      // if both leaderboards miss but pub exists, we still show profile with pub data alone
      // if all miss -> not found
      if(!glob && !pub && !ach){
        if(loading) loading.style.display='none';
        if(notfound) notfound.style.display='block';
        if(content) content.style.display='none';
        var ogTitle = document.querySelector('meta[property="og:title"]');
        if(ogTitle) ogTitle.setAttribute('content', username+' — Player not found — Further Engine');
        return;
      }

      // choose best identifier for avatar/banner: prefer pub.id else glob id
      var userId = (pub && lbId(pub)) || (glob && lbId(glob)) || (ach && lbId(ach)) || '';

      // Determine display username: use canonical from DB (glob or pub) to keep casing
      var displayName = (glob && glob.username) || (pub && pub.username) || (ach && ach.username) || username;
      // Normalize to proper casing for URL param after fetch
      try{ if(displayName!==username) window._profileRequested = displayName; }catch(e){}

      // display core fields – prefer glob for stats, fallback to pub
      var ultra = (glob && glob.ultra_points!=null) ? glob.ultra_points : 0;
      var acc   = (glob && glob.best_accuracy!=null) ? parseFloat(glob.best_accuracy) : 0;
      var songs = (glob && glob.songs_played!=null) ? glob.songs_played : 0;
      var level = (glob && glob.level!=null) ? glob.level : (pub && pub.level) || 1;
      var country = (glob && glob.country) || (pub && pub.country) || 'Other';
      var role = (glob && glob.role) || (pub && pub.role) || 'player';
      var badge = (glob && glob.badge) || (pub && pub.badge) || '';
      var avatarFile = (pub && pub.avatar_url) || (glob && glob.avatar_url) || (ach && ach.avatar_url) || null;
      var bannerFile = (pub && pub.banner_url) || (glob && glob.banner_url) || null;
      var achCount = (ach && ach.achievement_count!=null) ? ach.achievement_count : (glob && glob.achievement_count) || 0;

      // fetch ranks (async after we have username)
      var rankScoreP = glob ? fetchRank('global_leaderboard','ultra_points', displayName) : Promise.resolve({rank:null,total:null});
      var rankAchP   = ach  ? fetchRank('achievement_leaderboard','achievement_count', displayName) : Promise.resolve({rank:null,total:null});
      var rankRes = await Promise.all([rankScoreP, rankAchP]);
      var rankScore = rankRes[0];
      var rankAch = rankRes[1];
      var totalPlayers = rankScore.total || rankAch.total || 0;

      // Populate UI
      if(loading) loading.style.display='none';
      if(content) content.style.display='block';

      // banner
      var bannerEl = document.getElementById('profile-banner');
      if(bannerEl){
        var bUrl = bannerFile && userId ? getBannerUrl(userId, bannerFile) : null;
        if(bUrl){
          bannerEl.style.backgroundImage = "url('"+bUrl.replace(/'/g,"\\'")+"')";
          bannerEl.style.backgroundSize='cover';
          bannerEl.style.backgroundPosition='center';
        } else {
          bannerEl.style.backgroundImage = '';
          bannerEl.style.background = 'linear-gradient(135deg,#1e1b4b 0%, #0a0a0a 55%, #4c1d95 100%)';
        }
      }

      // avatar
      var avEl = document.getElementById('profile-avatar');
      var initials = (displayName||'?').substring(0,2).toUpperCase();
      setAvatar(avEl, userId, avatarFile, initials);

      // username + badge
      var nameEl = document.getElementById('profile-username');
      if(nameEl) nameEl.textContent = displayName;
      var badgeEl = document.getElementById('profile-badge');
      if(badgeEl){
        if(badge && role!=='player'){
          badgeEl.textContent = badge;
          badgeEl.className = 'px-2 py-0.5 text-[10px] font-extrabold rounded-full border ' + getRoleCls(role);
          badgeEl.style.display='inline-block';
        } else {
          badgeEl.style.display='none';
        }
      }
      // country
      var flagEl = document.getElementById('profile-country-flag');
      var cNameEl = document.getElementById('profile-country-name');
      if(flagEl) flagEl.textContent = FLAGS[country] || '🌍';
      if(cNameEl) cNameEl.textContent = country;
      if(flagEl) flagEl.title = country;

      // level pill
      var lvlPill = document.getElementById('profile-level-pill');
      if(lvlPill) lvlPill.innerHTML = '<i class="fa-solid fa-star" style="font-size:10px"></i> Lv.' + (level||1);
      // rank pill
      var rankPill = document.getElementById('profile-rank-pill');
      if(rankPill){
        if(rankScore.rank){
          rankPill.textContent = '#'+rankScore.rank+' global';
          rankPill.style.display='inline-block';
        } else if(rankAch.rank){
          rankPill.textContent = '#'+rankAch.rank+' achievements';
          rankPill.style.display='inline-block';
        } else {
          rankPill.style.display='none';
        }
      }
      // lb link
      var lbLink = document.getElementById('profile-lb-link');
      if(lbLink){
        lbLink.href = '#/leaderboard?q=' + encodeURIComponent(displayName);
        // if we have rankScore, also scroll to page? keep simple
      }

      // stats
      var upEl = document.getElementById('profile-up');
      if(upEl) upEl.textContent = formatUP(ultra);
      var accEl = document.getElementById('profile-acc');
      if(accEl){
        accEl.textContent = (acc||0).toFixed(1)+'%';
        // color by accuracy
        if(acc>=99) accEl.style.color='#fde68a';
        else if(acc>=95) accEl.style.color='#86efac';
        else if(acc>=85) accEl.style.color='#c4b5fd';
        else accEl.style.color='#fff';
      }
      var songsEl = document.getElementById('profile-songs');
      if(songsEl) songsEl.textContent = String(songs||0);
      var lvlEl = document.getElementById('profile-level');
      if(lvlEl) lvlEl.textContent = String(level||1);

      var achEl = document.getElementById('profile-ach');
      if(achEl) achEl.textContent = String(achCount||0) + ' ★';
      var achTierEl = document.getElementById('profile-ach-tier');
      if(achTierEl){
        var tier = getAchTier(achCount);
        if(tier.label){
          achTierEl.innerHTML = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full border '+tier.cls+'">'+tier.label+'</span>';
        } else {
          achTierEl.innerHTML = '<span class="text-[11px] text-slate-500" style="font-family:Inter,sans-serif">No tier yet</span>';
        }
      }

      var rankBigEl = document.getElementById('profile-rank-big');
      var rankPctEl = document.getElementById('profile-rank-pct');
      if(rankBigEl){
        if(rankScore.rank){
          rankBigEl.textContent = '#' + rankScore.rank;
          rankBigEl.style.color='#c4b5fd';
        } else if(rankAch.rank){
          rankBigEl.textContent = '#' + rankAch.rank;
          rankBigEl.style.color='#fbbf24';
        } else {
          rankBigEl.textContent = '—';
        }
      }
      if(rankPctEl){
        if(rankScore.rank && rankScore.total){
          var pct = Math.max(0.1, Math.round((rankScore.rank/rankScore.total)*1000)/10);
          rankPctEl.textContent = 'Top '+pct+'% of '+rankScore.total+' players';
        } else if(rankAch.rank && rankAch.total){
          var pct2 = Math.max(0.1, Math.round((rankAch.rank/rankAch.total)*1000)/10);
          rankPctEl.textContent = 'Top '+pct2+'% for achievements';
        } else {
          rankPctEl.textContent = totalPlayers ? totalPlayers+' players total' : '';
        }
      }

      // extra chips
      var extra = document.getElementById('profile-extra');
      if(extra){
        var chips = [];
        if(country) chips.push('<span style="padding:4px 10px;border-radius:999px;background:#0f0f0f;border:1px solid rgba(255,255,255,.08);font-size:11px;color:#d8d6e2;font-family:Inter,sans-serif">'+escapeHtml(FLAGS[country]||'🌍')+' '+escapeHtml(country)+'</span>');
        if(role && role!=='player') chips.push('<span style="padding:4px 10px;border-radius:999px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.25);font-size:11px;color:#c4b5fd;font-family:\'VCR OSD Mono\',monospace">'+escapeHtml(role.toUpperCase())+(badge?' • '+escapeHtml(badge):'')+'</span>');
        // join date if available
        var joined = (pub && pub.created_at) || (glob && glob.created_at) || null;
        if(joined){
          try{
            var d = new Date(joined);
            var ds = d.toLocaleDateString('en-US', { month:'short', year:'numeric' });
            chips.push('<span style="padding:4px 10px;border-radius:999px;background:#0f0f0f;border:1px solid rgba(255,255,255,.08);font-size:11px;color:#9aa0b6;font-family:Inter,sans-serif">Joined '+escapeHtml(ds)+'</span>');
          }catch(e){}
        }
        // ach rank if both
        if(rankAch.rank && rankScore.rank){
          chips.push('<span style="padding:4px 10px;border-radius:999px;background:#0f0f0f;border:1px solid rgba(255,255,255,.08);font-size:11px;color:#fbbf24;font-family:\'VCR OSD Mono\',monospace">Ach #'+rankAch.rank+'</span>');
        }
        extra.innerHTML = chips.join('');
      }

      // OG meta
      try{
        var ogT2 = document.querySelector('meta[property="og:title"]');
        if(ogT2) ogT2.setAttribute('content', displayName + ' — Further Engine Profile');
        var ogD = document.querySelector('meta[property="og:description"]');
        if(ogD) ogD.setAttribute('content', displayName+' — Lv.'+(level||1)+' • '+formatUP(ultra)+' • '+songs+' songs • '+parseFloat(acc||0).toFixed(1)+'%');
      }catch(e){}

      window.scrollTo(0,0);

    }catch(err){
      console.error('profile load failed', err);
      if(loading) loading.style.display='none';
      if(notfound) notfound.style.display='block';
      if(content) content.style.display='none';
      showToast('Failed to load profile', 'err');
    }
  };

  // auto-load if hash already is profile on page load
  function autoLoadIfProfile(){
    var rawFull = (window.location.hash||'').replace(/^#\/?/, '').replace(/\/$/,'');
    var low = rawFull.toLowerCase();
    if(low.indexOf('u/')===0 || low.indexOf('user/')===0 || low.indexOf('profile/')===0){
      var parts = rawFull.split('/');
      var name = decodeURIComponent(parts.slice(1).join('/').trim());
      if(name){
        window._profileRequested = name;
        // delay until DOM ready
        if(document.readyState==='loading'){
          document.addEventListener('DOMContentLoaded', function(){ window.loadProfilePage(name); });
        } else {
          setTimeout(function(){ window.loadProfilePage(name); }, 80);
        }
      }
    }
  }
  autoLoadIfProfile();

})();
