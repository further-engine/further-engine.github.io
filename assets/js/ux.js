/* Further Engine — intentional feel / conscious loading
   Adds micro-animations + deliberate 300-600ms delays to most interactions
   so the site feels heavier / more polished, not instant.
   Safe: wraps existing functions, never blocks critical auth/storage.
*/
(function(){
  'use strict';
  var INTENTIONAL = 420; // base delay ms for nav
  var BTN_DELAY = 520;   // for external links / tool
  var LB_MIN_SKELETON = 650; // leaderboard must show skeleton at least this long

  // ----- global top bar -----
  function ensureBar(){
    var b = document.getElementById('ux-loading-bar');
    if(b) return b;
    b = document.createElement('div');
    b.id = 'ux-loading-bar';
    document.body.appendChild(b);
    return b;
  }
  function showBar(){
    var b = ensureBar();
    b.classList.add('on');
    b.style.width = '0%';
    // trickle
    requestAnimationFrame(function(){
      b.style.transition = 'width .9s cubic-bezier(.4,0,.2,1)';
      b.style.width = '62%';
    });
    clearTimeout(b._t);
    b._t = setTimeout(function(){ b.style.width='86%'; }, 400);
  }
  function hideBar(){
    var b = document.getElementById('ux-loading-bar');
    if(!b) return;
    clearTimeout(b._t);
    b.style.transition = 'width .35s cubic-bezier(.4,0,.2,1), opacity .25s';
    b.style.width = '100%';
    setTimeout(function(){
      b.style.opacity='0';
      setTimeout(function(){ b.classList.remove('on'); b.style.width='0%'; b.style.opacity=''; }, 260);
    }, 160);
  }
  window._uxShowBar = showBar;
  window._uxHideBar = hideBar;

  // ----- button loading helper -----
  function setBtnLoading(btn, on){
    if(!btn) return;
    if(on){
      if(btn.classList.contains('is-loading')) return;
      btn.classList.add('is-loading');
      if(!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
      var label = (btn.textContent||'').trim().split('\n')[0].slice(0,28);
      // keep icon if exists, replace text
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + (label || 'Loading…');
      btn.setAttribute('aria-busy','true');
    } else {
      btn.classList.remove('is-loading');
      if(btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
      btn.removeAttribute('aria-busy');
    }
  }
  window._uxBtnLoading = setBtnLoading;

  // ----- wrap showPage with intentional delay + animation -----
  function installPageDelay(){
    if(typeof window.showPage !== 'function') return false;
    // avoid double wrap
    if(window.showPage._uxWrapped) return true;
    var origShowPage = window.showPage;
    window.showPage = function(id, el){
      var target = document.getElementById('page-' + id);
      // if target doesn't exist, fallback immediately
      if(!target){
        return origShowPage.apply(this, arguments);
      }
      var current = document.querySelector('.page.active');
      // if already active, just call original (no delay)
      if(current === target){
        return origShowPage.apply(this, arguments);
      }
      // add switching class for exit animation
      if(current) current.classList.add('is-switching');
      showBar();
      // disable nav clicks briefly
      document.body.style.pointerEvents='none';
      var args = arguments;
      setTimeout(function(){
        document.body.style.pointerEvents='';
        if(current) current.classList.remove('is-switching');
        origShowPage.apply(window, args);
        // bump animation on new page
        var now = document.getElementById('page-' + id);
        if(now){
          now.classList.remove('is-switching');
          // trigger reflow
          void now.offsetWidth;
        }
        hideBar();
      }, INTENTIONAL);
      return true;
    };
    window.showPage._uxWrapped = true;
    return true;
  }

  // ----- wrap auth functions for minimum feel time -----
  function wrapWithMinTime(fnName, minMs){
    if(typeof window[fnName] !== 'function' || window[fnName]._uxWrapped) return;
    var orig = window[fnName];
    window[fnName] = function(){
      var start = Date.now();
      var btnId = fnName==='doLogin' ? 'l-btn' : fnName==='doRegister' ? 'r-btn' : fnName==='saveProfile' ? 'ps-save-btn' : null;
      var btn = btnId ? document.getElementById(btnId) : null;
      // let original handle its own spinner, we just ensure minimum time
      var result = orig.apply(this, arguments);
      // result may be promise (async) — normalize
      Promise.resolve(result).catch(function(){}).finally(function(){
        var elapsed = Date.now() - start;
        var remain = Math.max(0, minMs - elapsed);
        if(remain>0 && btn){
          // keep button in loading state for remain
          var prevDisabled = btn.disabled;
          btn.disabled = true;
          if(!btn.classList.contains('is-loading')){
            setBtnLoading(btn, true);
          }
          setTimeout(function(){
            // don't force hide — original function already reset button in finally,
            // we just ensure we don't hide too early; check if still loading and restore
            // The original's finally already set innerHTML back, but we keep it a bit longer.
            // So we re-apply original html after remain? Actually original already did.
            // We just ensure button re-enabled after remain if needed.
            if(btn.disabled) btn.disabled = prevDisabled;
            // if still shows spinner, restore?
            // we stored origHtml, so restore after remain
            if(btn.classList.contains('is-loading')){
              setBtnLoading(btn,false);
            }
          }, remain);
        }
      });
      return result;
    };
    window[fnName]._uxWrapped = true;
  }

  // ----- leaderboard skeleton min time -----
  function wrapFetchLB(){
    if(typeof window.fetchLB !== 'function' || window.fetchLB._uxWrapped) return;
    // fetchLB is not global directly — it's inside app.js closure, not window.
    // So we can't wrap it directly. Instead we monkey-patch the loading UI:
    // intercept showLBLoading to enforce minimum display time.
    // We look for showLBLoading global? It's also inside closure.
    // Workaround: observe #lb-loading visibility and enforce min 650ms.
  }
  // Instead we handle via CSS: keep skeleton visible 650ms after fetch starts
  // by patching fetch via global fetch interceptor for leaderboard endpoints
  (function(){
    var origFetch = window.fetch;
    var lbStart = 0;
    var lbMin = LB_MIN_SKELETON;
    window.fetch = function(input, init){
      var url = typeof input==='string' ? input : (input && input.url) || '';
      var isLB = url.indexOf('global_leaderboard')!==-1 || url.indexOf('achievement_leaderboard')!==-1 || url.indexOf('modpacks.json')!==-1;
      if(isLB){
        lbStart = Date.now();
        showBar();
        // show skeleton immediately (if modpacks)
        var mpStatus = document.getElementById('mp-status');
        var lbLoading = document.getElementById('lb-loading');
        if(mpStatus && url.indexOf('modpacks.json')!==-1){
          mpStatus.style.display='block';
          mpStatus.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Loading modpacks…';
        }
        if(lbLoading && (url.indexOf('global_leaderboard')!==-1 || url.indexOf('achievement_leaderboard')!==-1)){
          lbLoading.style.display='block';
        }
      }
      return origFetch.apply(this, arguments).then(function(res){
        if(isLB){
          var elapsed = Date.now() - lbStart;
          var need = Math.max(0, lbMin - elapsed);
          if(need>0){
            return new Promise(function(resolve){
              setTimeout(function(){ hideBar(); resolve(res); }, need);
            });
          } else {
            hideBar();
          }
        }
        return res;
      }).catch(function(err){
        hideBar();
        throw err;
      });
    };
  })();

  // ----- intercept nav clicks for intentional delay (fallback if showPage wrap missed) -----
  // Also handle external / modpack links
  document.addEventListener('click', function(e){
    // Any Further-Tool link — special (banner + per-card buttons)
    var toolBtn = e.target.closest('.further-tool-btn') || e.target.closest('a[href*="Further-Tool"]');
    if(toolBtn){
      e.preventDefault();
      if(toolBtn.classList.contains('is-loading')) return;
      setBtnLoading(toolBtn, true);
      showBar();
      setTimeout(function(){
        setBtnLoading(toolBtn,false);
        hideBar();
        window.open(toolBtn.href, '_blank', 'noopener');
        // bump
        toolBtn.classList.add('ux-bump');
        setTimeout(function(){ toolBtn.classList.remove('ux-bump'); }, 500);
      }, BTN_DELAY);
      return;
    }
    // Downloads / modpack external GitHub links
    var ext = e.target.closest('.modpack-actions a, .Downloads a');
    if(ext && ext.href && ext.target==='_blank' && !ext.href.startsWith('#')){
      // don't double-handle further-tool-btn (already handled)
      if(ext.classList.contains('further-tool-btn')) return;
      e.preventDefault();
      if(ext.classList.contains('is-loading')) return;
      setBtnLoading(ext,true);
      showBar();
      setTimeout(function(){
        setBtnLoading(ext,false);
        hideBar();
        window.open(ext.href, '_blank','noopener');
      }, 480);
      return;
    }
  }, true);

  // ----- pagination / leaderboard controls with feel -----
  // FIXED: removed eval (blocked by CSP) — use direct function calls
  document.addEventListener('click', function(e){
    var pg = e.target.closest('#lb-pages button, #lb-pages a, #lb-pager button');
    if(pg){
      if(pg.classList.contains('is-loading')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setBtnLoading(pg,true);
      showBar();
      var onclick = pg.getAttribute('onclick') || '';
      setTimeout(function(){
        setBtnLoading(pg,false);
        hideBar();
        try{
          // safe parse without eval (CSP blocks eval)
          var mm = onclick.match(/lbGoToPage\s*\(\s*(\d+)\s*\)/);
          if(mm && typeof window.lbGoToPage === 'function'){
            window.lbGoToPage(parseInt(mm[1],10));
          } else if(typeof pg.onclick === 'function'){
            // fallback: call the element's onclick handler directly
            pg.onclick.call(pg, e);
          }
        }catch(err){ console.error(err); }
      }, 300);
      return;
    }
    var filterBtn = e.target.closest('button[onclick*="filterModpacks"], button[onclick*="loadModpacks"]');
    if(filterBtn){
      e.preventDefault();
      if(filterBtn.classList.contains('is-loading')) return;
      setBtnLoading(filterBtn,true);
      showBar();
      var oc = filterBtn.getAttribute('onclick')||'';
      setTimeout(function(){
        setBtnLoading(filterBtn,false); hideBar();
        try{
          if(oc.indexOf('filterModpacks')!==-1 && typeof window.filterModpacks==='function') window.filterModpacks();
          else if(oc.indexOf('loadModpacks')!==-1 && typeof window.loadModpacks==='function'){
            var arg = oc.indexOf('true')!==-1;
            window.loadModpacks(arg);
          } else if(typeof filterBtn.onclick==='function') filterBtn.onclick.call(filterBtn, e);
        }catch(_){}
      }, 380);
      return;
    }
  }, true);

  // debounce modpack search with loading hint
  (function(){
    var mpSearch = document.getElementById('mp-search');
    if(!mpSearch) return;
    var tmr=null;
    mpSearch.addEventListener('input', function(){
      clearTimeout(tmr);
      mpSearch.style.opacity='.6';
      tmr=setTimeout(function(){ mpSearch.style.opacity=''; }, 260);
    });
  })();

  // ----- micro hover bump for FunkinButtons without nav -----
  // FIXED: removed eval (CSP blocks unsafe-eval) — parse tab and call directly
  document.addEventListener('click', function(e){
    var btn = e.target.closest('.FunkinButton, .TabButton');
    if(!btn || btn.closest('a[href^="#/"]') || btn.classList.contains('is-loading')) return;
    var oc = btn.getAttribute('onclick') || '';
    if(oc.indexOf('openModal')!==-1){
      e.preventDefault();
      e.stopImmediatePropagation();
      setBtnLoading(btn,true);
      showBar();
      setTimeout(function(){
        setBtnLoading(btn,false);
        hideBar();
        try{
          var mm = oc.match(/openModal\s*\(\s*['"](.*?)['"]\s*\)/);
          var tab = mm ? mm[1] : 'login';
          if(typeof window.openModal === 'function') window.openModal(tab);
          else if(typeof btn.onclick === 'function') btn.onclick.call(btn, e);
        }catch(err){ console.error(err); }
        btn.classList.add('ux-bump');
        setTimeout(function(){ btn.classList.remove('ux-bump'); }, 460);
      }, 220);
      return;
    }
  }, true);

  // ----- reveal stagger for cards on load -----
  function revealCards(){
    var cards = document.querySelectorAll('.modpack-card, .Coolbox, .Downloads a, .podium-card-fe');
    cards.forEach(function(c, i){
      c.style.animationDelay = (i*0.04)+'s';
    });
  }
  // after modpack grid rendered, re-apply
  var obs = new MutationObserver(function(muts){
    muts.forEach(function(m){
      if(m.target && m.target.id==='mp-grid'){
        setTimeout(revealCards, 30);
      }
    });
  });
  // boot
  function boot(){
    installPageDelay();
    // auth wraps — delay until app.js defines them
    var tries=0;
    var timer=setInterval(function(){
      var ok = true;
      ['doLogin','doRegister','saveProfile'].forEach(function(n){
        if(typeof window[n]==='function' && !window[n]._uxWrapped){
          wrapWithMinTime(n, 620);
        }
        if(typeof window[n]!=='function') ok=false;
      });
      if(ok || ++tries>50) clearInterval(timer);
    }, 120);
    // ----- wrap tab / filter functions with intentional feel -----
    function wrapDelayed(fnName, delay){
      if(typeof window[fnName] !== 'function' || window[fnName]._uxWrapped2) return;
      var orig = window[fnName];
      window[fnName] = function(){
        var args = arguments;
        var self = this;
        showBar();
        // visual loading on the trigger element if possible
        var active = document.activeElement;
        if(active && active.classList && (active.classList.contains('TabButton')||active.id.indexOf('lb-')===0||active.id.indexOf('admin-')===0)){
          setBtnLoading(active,true);
          setTimeout(function(){ setBtnLoading(active,false); }, delay);
        }
        setTimeout(function(){
          hideBar();
          // bump
          if(active) { active.classList.add('ux-bump'); setTimeout(function(){ active.classList.remove('ux-bump'); }, 400); }
          orig.apply(self, args);
        }, delay);
        return;
      };
      window[fnName]._uxWrapped2 = true;
    }
    // retry installPageDelay a few times for router wrapper
    var t2=0;
    var ti2=setInterval(function(){
      installPageDelay();
      ['switchLBTab','setLBCountry','setLBSort','lbSearch','clearLBSearch','clearLBFilters','adminTab','adminRefresh','filterModpacks'].forEach(function(n){ wrapDelayed(n, 260); });
      if(++t2>20) clearInterval(ti2);
    }, 150);
    revealCards();
    var mpGrid=document.getElementById('mp-grid');
    if(mpGrid) obs.observe(mpGrid, {childList:true, subtree:true});
    // FAQ accordion smooth + intentional tiny delay
    document.querySelectorAll('.faq-item summary').forEach(function(s){
      s.addEventListener('click', function(ev){
        ev.preventDefault();
        var item = s.closest('.faq-item');
        var ans = item.querySelector('.faq-answer');
        var isOpen = !ans.classList.contains('hidden');
        // close all others with 80ms stagger
        document.querySelectorAll('.faq-item .faq-answer').forEach(function(a){ a.classList.add('hidden'); });
        document.querySelectorAll('.faq-item summary i').forEach(function(ic){ ic.style.transform=''; });
        if(!isOpen){
          showBar();
          setTimeout(function(){
            ans.classList.remove('hidden');
            ans.style.animation='uxCardIn .35s ease';
            var ic = s.querySelector('i');
            if(ic) ic.style.transform='rotate(180deg)';
            hideBar();
          }, 180);
        } else {
          hideBar();
        }
      });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // after ux loads, re-attempt installPageDelay when router finishes
  window.addEventListener('load', function(){ setTimeout(installPageDelay, 400); });
})();
