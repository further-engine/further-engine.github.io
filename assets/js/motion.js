/* =========================================================================
   Further Engine — motion & home leaderboard preview
   -------------------------------------------------------------------------
   Two jobs:
     1. Scroll reveals. Sections fade/rise into place once, then the observer
        lets them go. Nothing is hidden until JS confirms it can un-hide it
        (html.js-reveal), so a failed script never leaves a blank page.
     2. The "Who's on top right now" strip on the home page, fed by the same
        leaderboard view the /leaderboard page uses.

   Everything here is decorative and fails silently.
   ========================================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------- scroll reveal
  function initReveal() {
    if (reduced || !('IntersectionObserver' in window)) return;

    // Only now is it safe to hide things.
    document.documentElement.classList.add('js-reveal');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);            // reveal once, then stop watching
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

    // Anything already on screen at load should not wait for a scroll event.
    requestAnimationFrame(function () {
      document.querySelectorAll('.reveal').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.95) { el.classList.add('is-in'); io.unobserve(el); }
      });
    });

    // Safety net: content must never stay invisible. If anything is still
    // hidden after 4s (observer wedged, print stylesheet, odd browser), show
    // it unconditionally — a missed animation beats a blank section.
    setTimeout(function () {
      document.querySelectorAll('.reveal:not(.is-in)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.5) el.classList.add('is-in');
      });
    }, 4000);

    // Printing must show everything.
    if (window.matchMedia) {
      var mq = window.matchMedia('print');
      var showAll = function () {
        document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });
      };
      if (mq.addEventListener) mq.addEventListener('change', showAll);
      window.addEventListener('beforeprint', showAll);
    }
  }

  // ------------------------------------------------------- hero frame tilt
  function initHero() {
    var frame = document.getElementById('hero-frame');
    if (!frame) return;
    if (reduced) { frame.classList.add('is-level'); return; }
    // Straighten shortly after paint so the tilt is actually seen.
    setTimeout(function () { frame.classList.add('is-level'); }, 420);
  }

  // -------------------------------------------------- home leaderboard strip
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var FLAGS = null;
  function flagFor(country) {
    if (!country) return '';
    if (!FLAGS && window.FurtherEngine && window.FurtherEngine.FLAGS) FLAGS = window.FurtherEngine.FLAGS;
    return (FLAGS && FLAGS[country]) || '';
  }

  function renderTop(rows) {
    var host = document.getElementById('home-top');
    if (!host) return;

    if (!rows || !rows.length) {
      host.innerHTML = '<li class="text-center text-sm text-slate-500 py-6">Rankings are warming up — check back shortly.</li>';
      return;
    }

    host.innerHTML = rows.slice(0, 5).map(function (r, i) {
      var rank = i + 1;
      var chip = rank <= 3 ? 'rank-chip rank-' + rank : 'rank-chip bg-white/5 text-slate-400';
      var initials = (r.username || '?').substring(0, 2).toUpperCase();

      // avatar_url is a bare filename in storage, not a URL — app.js knows the bucket.
      var fe = window.FurtherEngine || {};
      var src = (r.avatar_url && r.id && typeof fe.getAvatarUrl === 'function')
        ? fe.getAvatarUrl(r.id, r.avatar_url) : null;

      // Initials sit underneath; a broken image just hides itself and reveals them.
      var avatar =
        '<span class="relative w-8 h-8 shrink-0 rounded-full bg-violet-500/15 text-violet-300 ' +
        'text-[11px] font-bold flex items-center justify-center overflow-hidden">' +
          esc(initials) +
          (src ? '<img src="' + esc(src) + '" alt="" width="32" height="32" loading="lazy" ' +
                 'class="absolute inset-0 w-full h-full object-cover" ' +
                 'onerror="this.remove()">' : '') +
        '</span>';

      return '<li class="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-colors">' +
               '<span class="' + chip + '">' + rank + '</span>' +
               avatar +
               '<span class="font-semibold text-sm truncate">' + esc(r.username || 'Unknown') + '</span>' +
               '<span class="text-sm">' + esc(flagFor(r.country)) + '</span>' +
               '<span class="ml-auto font-display text-sm font-semibold text-violet-200 tabular-nums whitespace-nowrap">' +
                 esc(parseFloat(r.ultra_points || 0).toFixed(1)) + ' UP</span>' +
             '</li>';
    }).join('');
  }

  function loadTop() {
    var host = document.getElementById('home-top');
    if (!host) return;

    var fe = window.FurtherEngine || {};
    var url = fe.SB_URL, key = fe.SB_KEY;
    if (!url || !key) return;   // app.js has not booted yet; retried by caller

    fetch(url + '/rest/v1/global_leaderboard?select=id,username,country,avatar_url,ultra_points&order=ultra_points.desc&limit=5', {
      headers: { 'apikey': key, 'Accept': 'application/json' }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(renderTop)
      .catch(function () {
        host.innerHTML = '<li class="text-center text-sm text-slate-500 py-6">Could not reach the leaderboard right now.</li>';
      });
    return true;
  }

  function bootTop() {
    if (loadTop()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (loadTop() || ++tries > 40) clearInterval(t);
    }, 100);
  }

  function boot() {
    initReveal();
    initHero();
    bootTop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
