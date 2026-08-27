/* =========================================================================
   Further Engine — live release data
   -------------------------------------------------------------------------
   Everything version-related used to be hard-coded in the HTML: the navbar
   badge said v1.0.4 and every desktop card linked to the 1.0.4 tag, while the
   repository had already moved on (and had even been renamed). The "GitHub
   downloads" counter was a localStorage number that went up when *you*
   clicked a button — not a real statistic.

   This module fetches the real data once per page load (cached for 30 min)
   and wires it into the DOM:
     • navbar / hero version badge      -> [data-latest-version]
     • per-platform direct asset links  -> [data-platform="android|windows|…"]
     • real total download count        -> #totalDownloads
     • release date + "what's new" link -> [data-release-date], [data-release-link]
   If GitHub is unreachable or rate-limits us, the markup keeps whatever the
   HTML shipped with — the page never breaks.
   ========================================================================= */
(function () {
  'use strict';

  var REPO = 'SametGkTe/Funky-Further-Engine';
  var API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=100';
  var CACHE_KEY = 'fe_releases_v1';
  var CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Which asset belongs to which download card.
  var MATCHERS = {
    android: function (n) { return /\.apk$/i.test(n); },
    ios:     function (n) { return /\.ipa$/i.test(n) || /ios/i.test(n); },
    windows: function (n) { return /windows/i.test(n); },
    linux:   function (n) { return /linux/i.test(n); },
    macos:   function (n) { return /mac ?os/i.test(n) && /arm64/i.test(n); }
  };

  function readCache() {
    try {
      var raw = window.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.t > CACHE_TTL) return null;
      return obj.d;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  }

  function humanSize(bytes) {
    if (!bytes) return '';
    var mb = bytes / (1024 * 1024);
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function countUp(el, target) {
    if (!el) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target < 20) { el.textContent = target.toLocaleString(); return; }
    var start = performance.now(), dur = 900;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function apply(releases) {
    if (!Array.isArray(releases) || !releases.length) return;

    // Real total: every asset of every published release.
    var total = 0;
    releases.forEach(function (r) {
      (r.assets || []).forEach(function (a) { total += (a.download_count || 0); });
    });
    countUp(document.getElementById('totalDownloads'), total);

    // Latest *stable* release: skip drafts, prereleases and CI dev builds.
    var stable = releases.filter(function (r) {
      return !r.draft && !r.prerelease && /^v?\d+\.\d+/.test(r.tag_name || '');
    });
    var latest = stable[0] || releases[0];
    if (!latest) return;

    var version = String(latest.tag_name || '').replace(/^v/, '');

    document.querySelectorAll('[data-latest-version]').forEach(function (el) {
      el.textContent = 'v' + version;
    });
    document.querySelectorAll('[data-release-date]').forEach(function (el) {
      el.textContent = formatDate(latest.published_at);
    });
    document.querySelectorAll('[data-release-link]').forEach(function (el) {
      el.href = latest.html_url;
    });
    document.querySelectorAll('[data-release-name]').forEach(function (el) {
      // Keep the strip short on phones; the full release title becomes a tooltip.
      el.textContent = 'Further Engine ' + version;
      if (latest.name && latest.name.trim()) el.title = latest.name.trim();
    });

    var assets = latest.assets || [];
    Object.keys(MATCHERS).forEach(function (platform) {
      var card = document.querySelector('[data-platform="' + platform + '"]');
      if (!card) return;

      var asset = null;
      for (var i = 0; i < assets.length; i++) {
        if (MATCHERS[platform](assets[i].name)) { asset = assets[i]; break; }
      }
      if (!asset) { card.href = latest.html_url; return; }

      card.href = asset.browser_download_url;
      var meta = card.querySelector('[data-asset-meta]');
      if (meta) {
        var size = humanSize(asset.size);
        meta.textContent = meta.getAttribute('data-asset-meta') + (size ? ' • ' + size : '');
      }
    });

    // macOS ships both Intel and Apple Silicon builds -> send people to the
    // release page instead of guessing their CPU.
    var mac = document.querySelector('[data-platform="macos"]');
    if (mac && assets.filter(function (a) { return /mac ?os/i.test(a.name); }).length > 1) {
      mac.href = latest.html_url;
    }
  }

  function load() {
    var cached = readCache();
    if (cached) { apply(cached); return; }

    fetch(API, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('GitHub ' + r.status)); })
      .then(function (data) {
        var slim = data.map(function (r) {
          return {
            tag_name: r.tag_name, name: r.name, draft: r.draft, prerelease: r.prerelease,
            published_at: r.published_at, html_url: r.html_url,
            assets: (r.assets || []).map(function (a) {
              return { name: a.name, size: a.size, download_count: a.download_count, browser_download_url: a.browser_download_url };
            })
          };
        });
        writeCache(slim);
        apply(slim);
      })
      .catch(function (e) {
        console.info('[Further Engine] Release info unavailable:', e.message);
      });
  }

  window.loadReleaseInfo = load;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
