/* =========================================================================
   Further Engine — moderation panel (#/admin)
   -------------------------------------------------------------------------
   Multi-account / alt-account review UI.

   SECURITY NOTE
   Nothing here is a security boundary. Hiding the nav link and the page is
   pure convenience — every RPC this file calls runs `require_admin()` inside
   Postgres and returns 403 for everyone else. A visitor who forces the page
   open with devtools sees empty tables and error toasts, nothing more.

   Backend: docs/supabase-admin-panel.sql
   ========================================================================= */
(function () {
  'use strict';

  // Single source of truth is app.js; these are the fallback if it changes.
  var SB_URL = (window.FurtherEngine && window.FurtherEngine.SB_URL) || 'https://ubhglndbbzidunjgnpqi.supabase.co';
  var SB_KEY = (window.FurtherEngine && window.FurtherEngine.SB_KEY) || 'sb_publishable_xShtsNZot0C3cIDqj3s2Ew_V3zJs_1k';

  var isAdmin = false;
  var currentTab = 'suspects';
  var cache = {};

  // ---------------------------------------------------------------- helpers
  function token() {
    try { return localStorage.getItem('peu_token') || ''; } catch (e) { return ''; }
  }

  function rpc(name, body) {
    if (window.FurtherEngine && window.FurtherEngine.SB_URL) {
      SB_URL = window.FurtherEngine.SB_URL;
      SB_KEY = window.FurtherEngine.SB_KEY;
    }
    var t = token();
    if (!t) return Promise.reject(new Error('not signed in'));
    return fetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + t
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (txt) { throw new Error(txt || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'ok');
  }

  function ago(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return d.toISOString().slice(0, 10);
  }

  function scoreColor(n) {
    if (n >= 70) return 'bg-red-500/15 text-red-300 border-red-500/30';
    if (n >= 40) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/25';
  }

  function panel() { return document.getElementById('admin-panel'); }

  function setLoading() {
    var p = panel();
    if (p) p.innerHTML = '<div class="text-center text-sm text-slate-500 py-10">Loading…</div>';
  }

  function setEmpty(title, note) {
    var p = panel();
    if (!p) return;
    p.innerHTML =
      '<div class="text-center py-12">' +
        '<i class="fa-solid fa-shield-check text-3xl text-emerald-500/40"></i>' +
        '<div class="font-display text-lg mt-3">' + esc(title) + '</div>' +
        '<p class="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">' + esc(note || '') + '</p>' +
      '</div>';
  }

  function setError(err) {
    var msg = String(err && err.message || err);
    // PostgREST answers with a JSON envelope; show only the human part.
    try {
      var parsed = JSON.parse(msg);
      msg = parsed.message || parsed.hint || parsed.details || msg;
    } catch (e) { /* plain text already */ }
    var denied = /Not authorized|42501|permission denied|JWT/i.test(msg);
    var p = panel();
    if (!p) return;
    p.innerHTML =
      '<div class="text-center py-12">' +
        '<i class="fa-solid fa-triangle-exclamation text-3xl text-red-500/50"></i>' +
        '<div class="font-display text-lg mt-3">' + (denied ? 'Not authorized' : 'Could not load') + '</div>' +
        '<p class="text-xs text-slate-500 mt-2 max-w-lg mx-auto break-words">' + esc(msg.slice(0, 300)) + '</p>' +
      '</div>';
  }

  // ------------------------------------------------------------- overview
  function renderOverview(d) {
    var host = document.getElementById('admin-overview');
    if (!host || !d) return;
    var cards = [
      { label: 'PLAYERS',      value: d.total_players,   sub: '+' + (d.new_24h || 0) + ' in 24h', icon: 'fa-users' },
      { label: 'NEW THIS WEEK', value: d.new_7d,         sub: 'accounts created',                 icon: 'fa-user-plus' },
      { label: 'HIDDEN',       value: d.hidden,          sub: (d.banned || 0) + ' banned',        icon: 'fa-eye-slash' },
      { label: 'IPS TRACKED',  value: d.ips_tracked,     sub: (d.multi_ip_groups || 0) + ' shared', icon: 'fa-network-wired' }
    ];
    host.innerHTML = cards.map(function (c) {
      return '<div class="bg-[#12121c] border border-white/10 rounded-2xl p-4">' +
        '<div class="flex items-center gap-2 text-xs tracking-wider text-slate-400 font-semibold">' +
          '<i class="fa-solid ' + c.icon + ' text-violet-400"></i>' + c.label +
        '</div>' +
        '<div class="font-display text-3xl font-semibold mt-1">' + esc(c.value == null ? '—' : c.value) + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">' + esc(c.sub) + '</div>' +
      '</div>';
    }).join('');
  }

  // ------------------------------------------------------------- suspects
  function renderSuspects(rows) {
    if (!rows || !rows.length) {
      setEmpty('No suspicious accounts',
        'Nothing scored above zero. IP history only starts building from the moment a player signs in, so this view gets sharper over the next few days.');
      return;
    }
    var html =
      '<table class="w-full min-w-[720px]"><thead><tr class="text-left text-xs tracking-wider text-slate-400 font-semibold border-b border-white/10">' +
        '<th class="pb-3 pl-1">RISK</th><th class="pb-3">PLAYER</th><th class="pb-3">SIGNALS</th>' +
        '<th class="pb-3">CREATED</th><th class="pb-3">SONGS</th><th class="pb-3 text-right pr-1">ACTIONS</th>' +
      '</tr></thead><tbody class="text-sm">';

    rows.forEach(function (r) {
      var reasons = (r.reasons || []).map(function (x) {
        return '<span class="inline-block bg-white/5 border border-white/10 text-[11px] px-2 py-0.5 rounded-full mr-1 mb-1">' + esc(x) + '</span>';
      }).join('');
      var flags = '';
      if (r.banned) flags += '<span class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">BANNED</span>';
      else if (r.hidden) flags += '<span class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-300 border border-slate-500/25">HIDDEN</span>';

      html +=
        '<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">' +
          '<td class="py-3 pl-1"><span class="inline-block font-display text-sm font-semibold px-2.5 py-1 rounded-lg border ' + scoreColor(r.score) + '">' + esc(r.score) + '</span></td>' +
          '<td class="py-3"><div class="font-semibold">' + esc(r.username || '(no name)') + flags + '</div>' +
              '<div class="text-[11px] text-slate-500 font-mono">' + esc(String(r.user_id).slice(0, 8)) + '</div></td>' +
          '<td class="py-3 max-w-xs">' + (reasons || '<span class="text-slate-600">—</span>') + '</td>' +
          '<td class="py-3 text-slate-400 text-xs whitespace-nowrap">' + esc(ago(r.created_at)) + '</td>' +
          '<td class="py-3 text-slate-400">' + esc(r.songs_played) + '</td>' +
          '<td class="py-3 text-right pr-1 whitespace-nowrap">' +
            '<button onclick="adminToggleHidden(\'' + esc(r.user_id) + '\',' + (r.hidden ? 'false' : 'true') + ')" ' +
              'class="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-3xl transition-colors">' +
              (r.hidden ? 'Unhide' : 'Hide') + '</button> ' +
            '<button onclick="adminToggleBanned(\'' + esc(r.user_id) + '\',' + (r.banned ? 'false' : 'true') + ',\'' + esc(r.username) + '\')" ' +
              'class="ml-1 px-3 py-1.5 text-xs font-semibold ' +
              (r.banned ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/25') +
              ' border rounded-3xl transition-colors">' + (r.banned ? 'Unban' : 'Ban') + '</button>' +
          '</td>' +
        '</tr>';
    });

    panel().innerHTML = html + '</tbody></table>';
  }

  // ------------------------------------------------------------ shared IPs
  function renderIps(rows) {
    if (!rows || !rows.length) {
      setEmpty('No shared IPs yet',
        'Supabase kept no historical auth log, so IP history starts from scratch. Every sign-in from now on adds a row — check back in a few days.');
      return;
    }
    var html =
      '<table class="w-full min-w-[680px]"><thead><tr class="text-left text-xs tracking-wider text-slate-400 font-semibold border-b border-white/10">' +
        '<th class="pb-3 pl-1">IP RANGE</th><th class="pb-3">ACCOUNTS</th><th class="pb-3">PLAYERS</th>' +
        '<th class="pb-3">LAST SEEN</th><th class="pb-3 text-right pr-1">ACTIONS</th>' +
      '</tr></thead><tbody class="text-sm">';

    rows.forEach(function (r) {
      var names = (r.usernames || []).map(function (n) {
        return '<span class="inline-block bg-white/5 border border-white/10 text-[11px] px-2 py-0.5 rounded-full mr-1 mb-1">' + esc(n) + '</span>';
      }).join('');
      html +=
        '<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">' +
          '<td class="py-3 pl-1 font-mono text-xs">' + esc(r.ip_group) + '</td>' +
          '<td class="py-3"><span class="font-display text-lg font-semibold">' + esc(r.account_count) + '</span></td>' +
          '<td class="py-3 max-w-md">' + names + '</td>' +
          '<td class="py-3 text-slate-400 text-xs whitespace-nowrap">' + esc(ago(r.last_seen)) + '</td>' +
          '<td class="py-3 text-right pr-1 whitespace-nowrap">' +
            '<button onclick="adminHideGroup(\'' + esc(r.ip_group) + '\')" ' +
              'class="px-3 py-1.5 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 rounded-3xl transition-colors">' +
              'Hide alts</button>' +
          '</td>' +
        '</tr>';
    });
    panel().innerHTML = html + '</tbody></table>';
  }

  // -------------------------------------------------------- duplicate mail
  function renderEmails(rows) {
    if (!rows || !rows.length) {
      setEmpty('No duplicate mailboxes', 'No two accounts normalise to the same email address.');
      return;
    }
    var html =
      '<p class="text-xs text-slate-500 mb-4 leading-relaxed">Gmail ignores dots and everything after a <span class="font-mono">+</span>, so ' +
      '<span class="font-mono">a.b+x@gmail.com</span> and <span class="font-mono">ab@gmail.com</span> are the same inbox. These accounts normalise to one address.</p>' +
      '<table class="w-full min-w-[620px]"><thead><tr class="text-left text-xs tracking-wider text-slate-400 font-semibold border-b border-white/10">' +
        '<th class="pb-3 pl-1">MAILBOX</th><th class="pb-3">ACCOUNTS</th><th class="pb-3">PLAYERS</th>' +
      '</tr></thead><tbody class="text-sm">';

    rows.forEach(function (r) {
      var names = (r.usernames || []).map(function (n) {
        return '<span class="inline-block bg-white/5 border border-white/10 text-[11px] px-2 py-0.5 rounded-full mr-1 mb-1">' + esc(n) + '</span>';
      }).join('');
      html +=
        '<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">' +
          '<td class="py-3 pl-1 font-mono text-xs">' + esc(r.normalized) + '@' + esc(r.provider) + '</td>' +
          '<td class="py-3"><span class="font-display text-lg font-semibold">' + esc(r.accounts) + '</span></td>' +
          '<td class="py-3 max-w-md">' + names + '</td>' +
        '</tr>';
    });
    panel().innerHTML = html + '</tbody></table>';
  }

  // ------------------------------------------------------------- data load
  var HINTS = {
    suspects: 'Scored by shared IPs, lookalike usernames, empty play history and signup bursts. Review before acting — a shared household or school IP is not cheating.',
    ips:      'Accounts grouped by /24 (IPv4) or /64 (IPv6) so a rotating home IP still groups together.',
    emails:   'Same inbox, different accounts. The strongest signal available without IP history.'
  };

  var loadSeq = 0;
  function load(tab, force) {
    var hint = document.getElementById('admin-hint');
    if (hint) hint.textContent = HINTS[tab] || '';

    if (!force && cache[tab]) {
      dispatch(tab, cache[tab]);
      return;
    }

    var seq = ++loadSeq;   // only the newest request may paint
    setLoading();

    var call = tab === 'suspects' ? rpc('admin_suspects', { limit_rows: 60 })
             : tab === 'ips'      ? rpc('admin_ip_groups', { min_accounts: 2 })
             :                      rpc('admin_email_dupes', {});

    call.then(function (rows) {
      cache[tab] = rows;
      if (seq === loadSeq && currentTab === tab) dispatch(tab, rows);
    }).catch(function (e) {
      if (seq === loadSeq && currentTab === tab) setError(e);
    });
  }

  function dispatch(tab, rows) {
    if (tab === 'suspects') renderSuspects(rows);
    else if (tab === 'ips') renderIps(rows);
    else renderEmails(rows);
  }

  function loadOverview() {
    rpc('admin_overview', {}).then(renderOverview).catch(function () {});
  }

  // ------------------------------------------------------------- public API
  window.adminTab = function (tab) {
    currentTab = tab;
    ['suspects', 'ips', 'emails'].forEach(function (t) {
      var b = document.getElementById('admin-tab-' + t);
      if (!b) return;
      var on = t === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.className = 'px-5 py-2 text-sm font-semibold flex items-center gap-2 transition-colors rounded-3xl ' +
        (on ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white');
    });
    load(tab, false);
  };

  window.adminRefresh = function () {
    cache = {};
    loadOverview();
    load(currentTab, true);
  };

  window.adminToggleHidden = function (uid, hide) {
    rpc('admin_set_hidden', { target: uid, hide: hide })
      .then(function () {
        toast(hide ? 'Account hidden from the leaderboard' : 'Account restored', 'ok');
        window.adminRefresh();
      })
      .catch(function (e) { toast('Failed: ' + String(e.message).slice(0, 80), 'err'); });
  };

  window.adminToggleBanned = function (uid, ban, name) {
    if (ban && !window.confirm('Ban ' + (name || 'this account') + '?\n\nThey will be removed from the leaderboard and blocked from signing in.')) return;
    rpc('admin_set_banned', { target: uid, ban: ban, reason: 'multi-account (panel)' })
      .then(function () {
        toast(ban ? 'Account banned' : 'Ban lifted', 'ok');
        window.adminRefresh();
      })
      .catch(function (e) { toast('Failed: ' + String(e.message).slice(0, 80), 'err'); });
  };

  window.adminHideGroup = function (ip) {
    rpc('admin_hide_ip_group', { group_ip: ip, dry_run: true }).then(function (preview) {
      if (!preview || !preview.length) { toast('Nothing to hide in this group', 'ok'); return; }
      var names = preview.map(function (r) { return r.username; }).join(', ');
      if (!window.confirm('Hide ' + preview.length + ' account(s) from ' + ip + '?\n\n' + names +
                          '\n\nThe oldest account in the group is kept.')) return;
      return rpc('admin_hide_ip_group', { group_ip: ip, dry_run: false }).then(function (done) {
        toast('Hid ' + (done ? done.length : 0) + ' account(s)', 'ok');
        window.adminRefresh();
      });
    }).catch(function (e) { toast('Failed: ' + String(e.message).slice(0, 80), 'err'); });
  };

  // Called after sign-in and on boot: decides whether the Admin tab exists.
  window.adminCheckAccess = function () {
    var links = [document.getElementById('nav-admin'), document.getElementById('nav-admin-mobile')];

    if (!token()) {
      isAdmin = false;
      links.forEach(function (l) { if (l) l.classList.add('hidden'); });
      return Promise.resolve(false);
    }

    return rpc('admin_whoami', {}).then(function (d) {
      isAdmin = !!(d && d.is_admin);
      links.forEach(function (l) {
        if (!l) return;
        l.classList.toggle('hidden', !isAdmin);
        if (isAdmin && l.id === 'nav-admin-mobile') l.classList.add('flex');
      });
      return isAdmin;
    }).catch(function () {
      isAdmin = false;
      links.forEach(function (l) { if (l) l.classList.add('hidden'); });
      return false;
    });
  };

  // Called by the router whenever #/admin becomes the active page.
  // The router can fire this more than once for a single navigation (cold
  // start + hashchange), so it is idempotent within a short window.
  var lastOpen = 0;
  window.adminOpen = function () {
    var denied = document.getElementById('admin-denied');
    var body = document.getElementById('admin-body');
    if (!denied || !body) return;

    if (Date.now() - lastOpen < 700) return;
    lastOpen = Date.now();

    if (!token()) {
      denied.classList.remove('hidden');
      body.classList.add('hidden');
      window.adminCheckAccess();   // also strips the nav link
      return;
    }
    // Optimistically show the panel; the RPCs are the real gate.
    denied.classList.add('hidden');
    body.classList.remove('hidden');
    loadOverview();
    load(currentTab, true);

    window.adminCheckAccess().then(function (ok) {
      if (ok) return;
      denied.classList.remove('hidden');
      body.classList.add('hidden');
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(window.adminCheckAccess, 900);
  });
})();
