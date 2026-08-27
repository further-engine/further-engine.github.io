/* =========================================================================
   Further Engine — client-side router
   -------------------------------------------------------------------------
   The site used to switch "pages" with onclick="showPage('faq')", which meant
   the URL never changed: no deep links, no browser back button, and search
   engines only ever saw the home page.

   This wraps the existing showPage() so that every navigation also:
     • writes a real URL   (#/leaderboard, #/faq, #/credits)
     • updates <title> and <meta name="description">
     • updates the canonical link + nav highlighting
     • responds to back/forward and to a shared link opened cold
   No markup rewrite required — the anchors are real <a href> links now, and
   old inline showPage() calls keep working.
   ========================================================================= */
(function () {
  'use strict';

  var ROUTES = {
    home:    { hash: '',            title: 'Further Engine — Built for All | Free FNF Engine',                    desc: 'Further Engine is a free, open-source Psych Engine fork for Friday Night Funkin\u2019 with global leaderboards, cloud saves and native Android, Windows, Linux, macOS and iOS builds.' },
    online:  { hash: 'leaderboard', title: 'Global Leaderboard — Further Engine',                                 desc: 'Live global leaderboard for Further Engine: top scores, achievements, and player rankings from every platform.' },
    faq:     { hash: 'faq',         title: 'FAQ — Further Engine',                                                desc: 'Answers to the most common Further Engine questions: installation, mod support, accounts, cloud saves and platform availability.' },
    credits: { hash: 'credits',     title: 'Credits — Further Engine',                                            desc: 'The people and projects behind Further Engine, the community-built Psych Engine fork.' },
    admin:   { hash: 'admin',       title: 'Moderation — Further Engine',                                         desc: 'Staff-only moderation tools.', noindex: true }
  };

  var HASH_TO_PAGE = {};
  Object.keys(ROUTES).forEach(function (id) { HASH_TO_PAGE[ROUTES[id].hash] = id; });

  var SITE_URL = 'https://further-engine.github.io/';
  var suppress = false; // guards the hashchange we trigger ourselves

  function setMeta(id) {
    var route = ROUTES[id];
    if (!route) return;
    document.title = route.title;

    // Staff pages must never enter a search index or overwrite the canonical URL.
    var robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    if (!robots.dataset.default) robots.dataset.default = robots.getAttribute('content') || 'index, follow';

    if (route.noindex) {
      robots.setAttribute('content', 'noindex, nofollow');
      return;   // leave title/canonical/OG pointing at the last public page
    }
    robots.setAttribute('content', robots.dataset.default);

    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', route.desc);

    var ogT = document.querySelector('meta[property="og:title"]');
    if (ogT) ogT.setAttribute('content', route.title);

    var ogD = document.querySelector('meta[property="og:description"]');
    if (ogD) ogD.setAttribute('content', route.desc);

    var url = SITE_URL + (route.hash ? '#/' + route.hash : '');
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', url);

    var ogU = document.querySelector('meta[property="og:url"]');
    if (ogU) ogU.setAttribute('content', url);
  }

  function highlight(id) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === id;
      a.classList.toggle('nav-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function pageFromHash() {
    // Filters live in a query string after the route (#/leaderboard?country=Turkey).
    var raw = (window.location.hash || '').split('?')[0]
      .replace(/^#\/?/, '').replace(/\/$/, '').toLowerCase();
    if (raw === 'download' || raw === 'downloads') return { id: 'home', scrollTo: 'downloads' };
    return { id: HASH_TO_PAGE[raw] || 'home', scrollTo: null };
  }

  function install() {
    if (typeof window.showPage !== 'function') return false;

    var base = window.showPage;

    window.showPage = function (id, el, opts) {
      if (!ROUTES[id]) id = 'home';
      base(id, el);
      highlight(id);
      setMeta(id);
      if (id === 'admin' && typeof window.adminOpen === 'function') window.adminOpen();

      if (!opts || opts.updateHash !== false) {
        var want = ROUTES[id].hash ? '#/' + ROUTES[id].hash : '';
        var current = (window.location.hash || '').split('?')[0];
        if (current !== want && !(want === '' && current === '')) {
          suppress = true;
          if (want) window.location.hash = want;
          else history.pushState('', document.title, window.location.pathname + window.location.search);
          setTimeout(function () { suppress = false; }, 0);
        }
      }
      return true;
    };

    window.addEventListener('hashchange', function () {
      if (suppress) { suppress = false; return; }
      var r = pageFromHash();
      window.showPage(r.id, null, { updateHash: false });
      if (r.scrollTo) {
        var target = document.getElementById(r.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Cold start / shared link
    var initial = pageFromHash();
    window.showPage(initial.id, null, { updateHash: false });
    if (initial.scrollTo) {
      setTimeout(function () {
        var target = document.getElementById(initial.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
    return true;
  }

  function boot() {
    if (install()) return;
    // app.js defines showPage; if it has not run yet, retry briefly.
    var tries = 0;
    var timer = setInterval(function () {
      if (install() || ++tries > 40) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
