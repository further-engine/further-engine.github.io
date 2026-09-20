(function(){
  'use strict';
  var RAW_URL = 'https://raw.githubusercontent.com/SametGkTe/Funky-Further-Engine/main/updates/modpacks.json';
  var CACHE_KEY = 'fe_modpacks_v1';
  var CACHE_TTL = 5*60*1000; // 5 min
  var allPacks = [];
  var tiers = [];

  function esc(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function el(id){ return document.getElementById(id); }

  function readCache(){
    try{
      var raw = sessionStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      var o = JSON.parse(raw);
      if(!o || Date.now()-o.t > CACHE_TTL) return null;
      return o.d;
    }catch(e){ return null; }
  }
  function writeCache(d){
    try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({t:Date.now(), d:d})); }catch(e){}
  }

  function tierColor(id){
    var t = tiers.find(function(x){ return x.id===id; });
    return t && t.color ? t.color : '#7c3aed';
  }
  function tierLabel(id){
    var t = tiers.find(function(x){ return x.id===id; });
    return t ? t.label : id;
  }

  function renderTiers(){
    var host = el('mp-tiers');
    if(!host) return;
    if(!tiers.length){ host.innerHTML=''; return; }
    host.innerHTML = tiers.map(function(t){
      return '<span class="tier-badge" style="background:'+esc(t.color||'#7c3aed')+'33; border:1px solid '+esc(t.color||'#7c3aed')+'55; color:'+esc(t.color||'#c4b5fd')+'"><span style="width:8px;height:8px;border-radius:50%;background:'+esc(t.color)+'"></span> '+esc(t.label)+' <span style="opacity:.7; font-weight:400; font-size:10px">'+esc(t.description||'')+'</span></span>';
    }).join('');
  }

  function bestUrl(p){
    // priority: directDownloadUrl, githubUrl, mediafireUrl, externalPageUrl, contentCatalogUrl
    if(p.directDownloadUrl) return p.directDownloadUrl;
    if(p.githubUrl) return p.githubUrl;
    if(p.mediafireUrl) return p.mediafireUrl;
    if(p.externalPageUrl) return p.externalPageUrl;
    if(p.contentCatalogUrl) return p.contentCatalogUrl;
    return '';
  }
  function sizeFmt(bytes){
    if(!bytes) return '';
    if(bytes>=1024*1024*1024) return (bytes/1024/1024/1024).toFixed(2)+' GB';
    if(bytes>=1024*1024) return Math.round(bytes/1024/1024)+' MB';
    if(bytes>=1024) return Math.round(bytes/1024)+' KB';
    return bytes+' B';
  }

  function cardHtml(p){
    var url = bestUrl(p);
    var thumb = p.thumbnail || '';
    // fallback thumb: use modpack.png if empty? we don't have hosted thumb, use placeholder
    var thumbHtml = thumb ? '<img src="'+esc(thumb)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#6b7280;font-family:\'VCR OSD Mono\',monospace;font-size:11px;flex-direction:column;gap:6px"><i class="fa-solid fa-cubes" style="font-size:28px;opacity:.5"></i>'+esc(p.displayName||p.id)+'</div>';
    var tags = (p.tags||[]).map(function(t){ return '<span class="tag-fe">'+esc(t)+'</span>'; }).join('');
    var includes = (p.includes||[]).slice(0,8).map(function(m){ return '<span class="includes-pill">'+esc(m)+'</span>'; }).join('');
    if((p.includes||[]).length>8) includes += '<span class="includes-pill">+'+((p.includes||[]).length-8)+' more</span>';
    var tierClr = tierColor(p.tier);
    var actions = [];
    if(p.githubUrl) actions.push('<a href="'+esc(p.githubUrl)+'" target="_blank" rel="noopener" class="primary"><i class="fa-brands fa-github"></i> GitHub</a>');
    if(p.mediafireUrl) actions.push('<a href="'+esc(p.mediafireUrl)+'" target="_blank" rel="noopener"><i class="fa-solid fa-download"></i> MediaFire</a>');
    if(p.directDownloadUrl) actions.push('<a href="'+esc(p.directDownloadUrl)+'" target="_blank" rel="noopener" class="primary">Direct</a>');
    if(p.contentCatalogUrl) actions.push('<a href="'+esc(p.contentCatalogUrl)+'" target="_blank" rel="noopener"><i class="fa-solid fa-link"></i> Catalog</a>');
    if(!actions.length && url) actions.push('<a href="'+esc(url)+'" target="_blank" rel="noopener" class="primary">Download</a>');
    if(!actions.length) actions.push('<span style="font-size:11px;color:#6b7280;font-family:Inter,sans-serif;padding:7px">Soon</span>');
    return '<div class="modpack-card" data-tier="'+esc(p.tier||'')+'" data-name="'+esc((p.displayName||p.id||'').toLowerCase())+'" data-desc="'+esc((p.description||'').toLowerCase())+'">'+
      '<div class="modpack-thumb">'+thumbHtml+'</div>'+
      '<div class="modpack-body">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="tier-badge" style="background:'+esc(tierClr)+'20;border:1px solid '+esc(tierClr)+'40;color:'+esc(tierClr)+'">'+esc(tierLabel(p.tier))+'</span><span style="font-size:10px;color:#6b7280;font-family:\'VCR OSD Mono\',monospace">'+esc(p.versionLabel||p.version||'')+' • '+esc(p.updatedAt||'')+'</span></div>'+
        '<div class="modpack-title">'+esc(p.displayName||p.id)+'</div>'+
        '<div class="modpack-meta"><span><i class="fa-solid fa-user" style="opacity:.6"></i> '+esc(p.author||'Unknown')+'</span><span><i class="fa-solid fa-cubes" style="opacity:.6"></i> '+esc(p.modCount!=null?p.modCount:(p.includes?p.includes.length:'?'))+' mods</span><span><i class="fa-solid fa-hard-drive" style="opacity:.6"></i> '+esc(p.fileSize||sizeFmt(p.fileSizeBytes)||'?')+'</span><span><i class="fa-solid fa-download" style="opacity:.6"></i> '+(p.downloads!=null?p.downloads.toLocaleString():'—')+'</span></div>'+
        '<div class="modpack-desc">'+esc(p.description||'')+'</div>'+
        (p.includes && p.includes.length ? '<div class="includes-list">'+includes+'</div>' : '')+
        (tags ? '<div class="modpack-tags">'+tags+'</div>' : '')+
        (p.changelog ? '<div style="margin-top:8px;padding:8px;background:#080808;border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:11px;color:#9aa0b6;line-height:1.5;font-family:Inter,sans-serif"><b style="color:#d8d6e2;font-family:\'VCR OSD Mono\',monospace;font-size:10px">Changelog:</b> '+esc(p.changelog)+'</div>' : '')+
        '<div class="modpack-actions">'+actions.join('')+'</div>'+ '<div class="further-tool-wrap"><a href="https://github.com/SametGkTe/Further-Tool" target="_blank" rel="noopener" class="further-tool-btn" aria-label="Download with Further Tool"><img src="assets/img/further-tool-icon.png" alt="" width="18" height="18" loading="lazy"> Download With Further Tool</a></div>'+
      '</div>'+
    '</div>';
  }

  function applyFilter(){
    var q = (el('mp-search')? el('mp-search').value.trim().toLowerCase() : '');
    var tier = el('mp-tier')? el('mp-tier').value : 'all';
    var cards = document.querySelectorAll('#mp-grid .modpack-card');
    var visible=0;
    cards.forEach(function(c){
      var name = c.getAttribute('data-name')||'';
      var desc = c.getAttribute('data-desc')||'';
      var ctier = c.getAttribute('data-tier')||'';
      var okTier = tier==='all' || ctier===tier;
      var okSearch = !q || name.indexOf(q)!==-1 || desc.indexOf(q)!==-1 || ctier.indexOf(q)!==-1;
      var show = okTier && okSearch;
      c.style.display = show ? '' : 'none';
      if(show) visible++;
    });
    var empty = el('mp-empty');
    if(empty) empty.style.display = visible? 'none':'block';
  }
  window.filterModpacks = applyFilter;

  function render(data){
    var grid = el('mp-grid');
    var status = el('mp-status');
    if(!grid) return;
    if(!data || !data.modpacks || !data.modpacks.length){
      if(status){ status.textContent='No modpacks found.'; status.style.display='block'; }
      grid.innerHTML='';
      return;
    }
    tiers = data.tiers || [];
    allPacks = data.modpacks || [];
    renderTiers();
    // sort: further first? Keep original order but ensure further last? Keep as is
    grid.innerHTML = allPacks.map(cardHtml).join('');
    if(status) status.style.display='none';
    applyFilter();
  }

  window.loadModpacks = function(force){
    var status = el('mp-status');
    var grid = el('mp-grid');
    if(!force){
      var cached = readCache();
      if(cached){ render(cached); return; }
    }
    if(status){ status.textContent='Loading modpacks…'; status.style.display='block'; }
    if(grid && force) grid.innerHTML='';
    fetch(RAW_URL, {headers:{'Accept':'application/json'}})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){
        // also try to enrich Further modpack via contentCatalogUrl if present
        writeCache(d);
        render(d);
        // optional: fetch contentCatalogUrl for the Further pack to show real mod count
        var further = (d.modpacks||[]).find(function(p){ return p.id==='further' && p.contentCatalogUrl; });
        if(further && further.contentCatalogUrl){
          fetch(further.contentCatalogUrl, {headers:{'Accept':'application/json'}}).then(function(r){ return r.ok? r.json():null; }).then(function(cat){
            if(!cat) return;
            // catalog may be array or object with mods
            var count = Array.isArray(cat) ? cat.length : (cat.mods? cat.mods.length : (cat.count||null));
            if(count){
              // update Further card's mod count in place
              var card = document.querySelector('.modpack-card[data-tier="further"] .modpack-meta');
              // brute: re-render with updated count? we just fetch and re-render? Simpler: update displayed text
              // Instead reload with counts injected? We'll just leave as is but add note
              var note = document.createElement('div');
              note.style.cssText='margin-top:8px;font-size:11px;color:#c4b5fd;font-family:Inter,sans-serif';
              note.textContent='Content catalog: '+count+' mods available — open Catalog to browse.';
              var furtherCard = document.querySelector('.modpack-card[data-tier="further"] .modpack-body');
              if(furtherCard) furtherCard.appendChild(note);
            }
          }).catch(function(){});
        }
      })
      .catch(function(e){
        console.warn('[modpacks] fetch failed', e);
        var cached = readCache();
        if(cached){ render(cached); if(status){ status.textContent='Showing cached data (live fetch failed: '+e.message+')'; status.style.display='block'; status.style.color='#fbbf24'; } }
        else {
          if(status){ status.textContent='Could not load modpacks — '+e.message+' — try Refresh.'; status.style.color='#f87171'; }
        }
      });
  };

  // auto load when DOM ready
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ window.loadModpacks(false); });
  else window.loadModpacks(false);

  // also re-load when modpacks page becomes visible via hash
  window.addEventListener('hashchange', function(){
    if(location.hash.indexOf('modpacks')!==-1) window.loadModpacks(false);
  });
})();
