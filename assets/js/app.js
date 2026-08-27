
    // Shows the notice only if /status.json contains a non-empty "message".
    // Example: { "title": "UYARI", "message": "SUNUCU BAKIMDA, LİDERLİK DEVRE DIŞI" }
    async function loadSiteStatus() {
      const bar = document.getElementById('site-status-bar');
      const title = document.getElementById('site-status-title');
      const message = document.getElementById('site-status-message');

      try {
        // Same-origin URL works both on GitHub Pages and on a custom domain.
        // The timestamp avoids GitHub Pages/browser cache delaying an urgent notice.
        const response = await fetch(`./status.json?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;

        const status = await response.json();
        if (!status || typeof status !== 'object' || typeof status.message !== 'string' || !status.message.trim()) return;

        const statusTitle = typeof status.title === 'string' ? status.title.trim() : '';
        title.textContent = statusTitle ? `${statusTitle}:` : '';
        message.textContent = status.message.trim();
        bar.classList.remove('hidden');
      } catch (error) {
        // Empty, invalid, or missing JSON deliberately leaves the bar hidden.
        console.info('[Further Engine] No site status message to display.');
      }
    }

    loadSiteStatus();

    // Tailwind script
    function initTailwind() {
      document.documentElement.style.setProperty('--accent', '#6366f1');
    }
    
    // CONFIG (kept from original)
    const SB_URL = "https://ubhglndbbzidunjgnpqi.supabase.co";
    const SB_KEY = "sb_publishable_xShtsNZot0C3cIDqj3s2Ew_V3zJs_1k";
    const AVATAR_BUCKET = "avatars";
    const BANNER_BUCKET = "banners";
    
    const FLAGS = {
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
    
    const BADWORDS = ["fuck","shit","ass","bitch","dick","cunt","nigga","nigger","faggot","retard","sik","orospu","piç","amk","yarrak","ibne","pezevenk"];
    
    // STATE
    let allData = [], lbLoaded = false, currentUser = null;
    let currentFilter = 'all';
    let currentLBTab = 'score';
    let achData = [];
    let pendingAvatarFile = null, pendingAvatarDataURL = null, avatarToRemove = null;
    let pendingBannerFile = null, pendingBannerDataURL = null, bannerToRemove = null;
    let storageAvailable = true;

    // Safe localStorage helpers (bulletproof for sandboxed iframes like Arena preview)
    // NOTE: In strict sandboxes (Arena, file://, cross-origin blobs), direct localStorage access throws SecurityError.
    // We use window. + full try/catch + early flag. Never reference bare `localStorage` outside try.
    function isStorageAvailable() {
      try {
        const testKey = '__fe_test__' + Date.now();
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return true;
      } catch (e) {
        return false;
      }
    }

    function safeGet(key) {
      if (!storageAvailable) return null;
      try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage.getItem(key);
      } catch (e) {
        storageAvailable = false;
        return null;
      }
    }
    function safeSet(key, value) {
      if (!storageAvailable) return;
      try {
        if (typeof window === 'undefined' || !window.localStorage) { storageAvailable = false; return; }
        window.localStorage.setItem(key, value);
      } catch (e) {
        storageAvailable = false;
      }
    }
    function safeRemove(key) {
      if (!storageAvailable) return;
      try {
        if (typeof window === 'undefined' || !window.localStorage) { storageAvailable = false; return; }
        window.localStorage.removeItem(key);
      } catch (e) { storageAvailable = false; }
    }

    // Detect sandbox very early (before any other code runs)
    (function detectSandbox() {
      storageAvailable = isStorageAvailable();
      if (!storageAvailable) {
        console.log('%c[Further Engine] Sandbox / restricted environment detected — storage disabled (graceful mode).', 'color:#64748b');
      }
    })();
    
    // ===================== UTILITIES =====================
    function initTailwindStyles() {
      // Tailwind already loaded via CDN
    }
    
    function buildCountryOptions() {
      const opts = Object.entries(FLAGS).map(([name, flag]) =>
        `<option value="${name}">${flag} ${name}</option>`
      ).join('');
      
      const selects = ['r-country', 'ps-country'];
      selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
      });
    }
    
    function showToast(msg, type = 'ok') {
      const toast = document.createElement('div');
      toast.className = `fixed bottom-5 right-5 px-4 py-[9px] text-xs font-semibold rounded-3xl shadow-xl flex items-center gap-2 z-[90] ${type === 'ok' ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'}`;
      toast.innerHTML = `
        <div class="px-1">${msg}</div>
      `;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.transition = 'all .25s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
      }, 2600);
    }
    
    function sbFetch(path, opts = {}) {
      const headers = {
        'apikey': SB_KEY,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      };
      
      const token = safeGet('peu_token');
      if (token) headers['Authorization'] = 'Bearer ' + token;
      
      return fetch(SB_URL + path, { ...opts, headers });
    }
    
    function getAvatarUrl(userId, filename) {
      if (!filename || !userId) return null;
      return `${SB_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${userId}/${filename}`;
    }

    function getBannerUrl(userId, filename) {
      if (!filename || !userId) return null;
      return `${SB_URL}/storage/v1/object/public/${BANNER_BUCKET}/${userId}/${filename}`;
    }
    
    function formatUP(val) {
      return parseFloat(val || 0).toFixed(1) + ' UP';
    }
    
    function getRoleCls(role) {
      if (role === 'founder') return 'bg-amber-900/30 text-amber-300';
      if (role === 'admin') return 'bg-violet-800/30 text-violet-300';
      if (role === 'moderator') return 'bg-emerald-800/30 text-emerald-300';
      return '';
    }

    function escapeJs(str) {
      if (!str && str !== 0) return '';
      return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
    }
    
    // ===================== PAGE NAV =====================
    function showPage(id, el) {
      // Hide all pages
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      
      // Show target
      const target = document.getElementById('page-' + id);
      if (target) target.classList.add('active');
      
      // Update nav active states
      document.querySelectorAll('nav a[data-nav]').forEach(a => a.classList.remove('nav-active'));
      document.querySelectorAll('.mobile-nav a').forEach(a => a.classList.remove('nav-active'));
      
      if (el) el.classList.add('nav-active');
      
      // Mobile nav active
      const mobileLinks = document.querySelectorAll('#mobile-nav a');
      mobileLinks.forEach(link => {
        if (link.textContent.trim().toLowerCase() === id) {
          link.classList.add('nav-active');
        }
      });
      
      window.scrollTo(0, 0);
      
      // Load leaderboard if needed
      if (id === 'online' && !lbLoaded) {
        lbLoaded = true;
        fetchLB();
        if (currentLBTab === 'achievements') fetchAchievementLB();
      }
      
      closeUserMenu();
      closeMobileNav();
    }
    
    function scrollToDownloads() {
      showPage('home');
      setTimeout(() => {
        const dl = document.getElementById('downloads');
        if (dl) dl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
    
    // ===================== MOBILE NAV =====================
    function toggleMobileNav() {
      const nav = document.getElementById('mobile-nav');
      nav.classList.toggle('hidden');
      nav.classList.toggle('flex');
      syncMobileNavA11y();
    }

    function closeMobileNav() {
      const nav = document.getElementById('mobile-nav');
      nav.classList.add('hidden');
      nav.classList.remove('flex');
      syncMobileNavA11y();
    }

    // Keeps the hamburger button's screen-reader state in sync with the panel.
    function syncMobileNavA11y() {
      const nav = document.getElementById('mobile-nav');
      const btn = document.getElementById('mobile-nav-toggle');
      if (!nav || !btn) return;
      const open = !nav.classList.contains('hidden');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
    }
    
    // ===================== FAQ =====================
    function toggleFaq(el) {
      const answer = el.nextElementSibling;
      const icon = el.querySelector('i');
      
      const isOpen = !answer.classList.contains('hidden');
      
      // Close all
      document.querySelectorAll('.faq-item .faq-answer').forEach(a => a.classList.add('hidden'));
      document.querySelectorAll('.faq-item i').forEach(i => i.classList.remove('fa-rotate-180'));
      
      if (!isOpen) {
        answer.classList.remove('hidden');
        icon.classList.add('fa-rotate-180');
      }
    }
    
    // ===================== AUTH MODAL =====================
    function openModal(tab) {
      const overlay = document.getElementById('modal-overlay');
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
      
      switchTab(tab);
      document.body.style.overflow = 'hidden';
    }
    
    function closeModal() {
      const overlay = document.getElementById('modal-overlay');
      overlay.classList.remove('flex');
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
    
    function closeModalOutside(e) {
      if (e.target.id === 'modal-overlay') closeModal();
    }
    
    function switchTab(t) {
      const loginForm = document.getElementById('mform-login');
      const regForm = document.getElementById('mform-reg');
      
      const loginTab = document.getElementById('mtab-login');
      const regTab = document.getElementById('mtab-reg');
      
      if (t === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        loginTab.classList.add('bg-white/5', 'text-white');
        loginTab.classList.remove('text-slate-400');
        regTab.classList.remove('bg-white/5', 'text-white');
        regTab.classList.add('text-slate-400');
      } else {
        regForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        regTab.classList.add('bg-white/5', 'text-white');
        regTab.classList.remove('text-slate-400');
        loginTab.classList.remove('bg-white/5', 'text-white');
        loginTab.classList.add('text-slate-400');
      }
      
      document.getElementById('l-err').textContent = '';
      document.getElementById('r-err').textContent = '';
      document.getElementById('r-ok').textContent = '';
    }
    
    // ===================== USER MENU =====================
    function toggleUserMenu() {
      const menu = document.getElementById('user-menu');
      menu.classList.toggle('hidden');
    }
    
    function closeUserMenu() {
      document.getElementById('user-menu').classList.add('hidden');
    }
    
    // ===================== AUTH =====================
    // ===================== ANTI ALT-ACCOUNT =====================
    // The IP is read server-side from the Cloudflare header inside record_ip();
    // nothing here is trusted and nothing is sent from the browser.
    async function recordSessionIp() {
      const token = safeGet('peu_token');
      if (!token) return;
      try {
        await fetch(`${SB_URL}/rest/v1/rpc/record_ip`, {
          method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: '{}'
        });
      } catch (e) {
        // Purely a background signal — never let it affect the session.
      }
    }

    // Asks the backend whether this connection may create another account.
    // Fails OPEN: a network error, a missing RPC or an unreadable IP must
    // never stop a legitimate player from registering.
    async function checkRegistrationAllowed() {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/can_register_from_here`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ max_accounts: 3 })
        });
        if (!r.ok) return { allowed: true };
        const d = await r.json();
        if (!d || typeof d !== 'object') return { allowed: true };
        return d;
      } catch (e) {
        return { allowed: true };
      }
    }

    function setLoggedIn(username, email, avatarUrl, bannerUrl) {
      currentUser = { username, email, avatarUrl: avatarUrl || null, bannerUrl: bannerUrl || null };

      // Log this session's IP (multi-account detection). Fire and forget.
      setTimeout(recordSessionIp, 0);

      // Staff accounts get the Admin tab; the check is re-run server-side.
      setTimeout(function () {
        if (typeof window.adminCheckAccess === 'function') window.adminCheckAccess();
      }, 0);
      const initials = (username || '?').substring(0, 2).toUpperCase();

      // Update user menu banner (beautiful banner strip)
      const menuBanner = document.getElementById('um-banner');
      if (menuBanner) {
        if (bannerUrl) {
          menuBanner.style.backgroundImage = `url('${bannerUrl}')`;
          menuBanner.style.backgroundSize = 'cover';
          menuBanner.style.backgroundPosition = 'center';
          menuBanner.style.backgroundRepeat = 'no-repeat';
        } else {
          menuBanner.style.backgroundImage = '';
          menuBanner.style.background = 'linear-gradient(135deg, #433c6e, #27253a)';
        }
      }
      
      // Desktop nav
      const authArea = document.getElementById('nav-auth-area');
      authArea.innerHTML = `
        <div onclick="toggleUserMenu()" class="flex items-center gap-x-2 cursor-pointer px-1 py-1 pr-3 rounded-3xl hover:bg-white/5 transition-colors">
            <div class="w-7 h-7 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center text-xs font-extrabold">
            ${avatarUrl ? 
              `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='${initials}'">` : 
              `<span>${initials}</span>`}
          </div>
          <span class="font-semibold text-sm">${username}</span>
        </div>
      `;
      
      // Mobile
      const mobileAuth = document.getElementById('mobile-auth-area');
      if (mobileAuth) {
        mobileAuth.innerHTML = `
          <div onclick="toggleUserMenu(); closeMobileNav();" class="flex items-center gap-x-3 cursor-pointer px-4 py-[10px] bg-white/5 rounded-2xl">
            <div class="w-8 h-8 flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-[#1e1b4b] flex items-center justify-center text-sm font-extrabold">
              ${avatarUrl ? 
                `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='${initials}'">` : 
                `<span>${initials}</span>`}
            </div>
            <div>
              <div class="font-semibold">${username}</div>
              <div class="text-xs text-slate-300">View profile</div>
            </div>
          </div>
        `;
      }
      
      // User menu
      const bigAv = document.getElementById('um-big-av');
      bigAv.innerHTML = avatarUrl 
        ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='<span class=\\'text-sm font-bold\\'>${initials}</span>'">` 
        : `<span class="font-extrabold">${initials}</span>`;
      
      document.getElementById('um-name').textContent = username;
      document.getElementById('um-email').textContent = email || '';
    }
    
    function signOut() {
      currentUser = null;
      ['peu_token','peu_refresh','peu_user','peu_email','peu_avatar','peu_banner','peu_uid'].forEach(k => safeRemove(k));

      // Drop the Admin tab and bounce off the admin page.
      ['nav-admin','nav-admin-mobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
      });
      const adminPage = document.getElementById('page-admin');
      if (adminPage && adminPage.classList.contains('active')) showPage('home');
      
      const authHtml = `
        <button onclick="openModal('login')" class="px-5 py-[9px] text-xs font-semibold tracking-wider border border-white/10 hover:border-white/20 transition-colors text-slate-300 hover:text-white px-4 rounded-3xl text-[13px]">
          Sign in
        </button>
        <button onclick="openModal('register')" class="px-5 py-[9px] text-xs font-semibold tracking-wider bg-white text-[#0a0a12] hover:bg-slate-100 transition-all rounded-3xl text-[13px] px-4">
          Register
        </button>
      `;
      
      document.getElementById('nav-auth-area').innerHTML = authHtml;
      
      const mobileAuth = document.getElementById('mobile-auth-area');
      if (mobileAuth) {
        mobileAuth.innerHTML = `
          <button onclick="openModal('login'); closeMobileNav()" class="px-4 py-[9px] w-full text-xs font-semibold tracking-wider border border-white/10 hover:bg-white/5 transition-colors rounded-3xl">Sign in</button>
          <button onclick="openModal('register'); closeMobileNav()" class="px-4 py-[9px] w-full text-xs font-semibold tracking-wider bg-white text-[#0a0a12] hover:bg-slate-100 transition-all rounded-3xl">Register</button>
        `;
      }
      
      closeUserMenu();
      showToast('Signed out successfully.', 'ok');
    }
    
    // ===================== LOGIN (email + password, no username enumeration) =====================
    async function doLogin() {
      const email = document.getElementById('l-user').value.trim();
      const pass = document.getElementById('l-pass').value;
      const errEl = document.getElementById('l-err');
      const btn = document.getElementById('l-btn');
      
      if (!email || !pass) {
        errEl.textContent = 'Please fill in all fields.';
        return;
      }
      if (!email.includes('@')) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = `<span class="flex items-center justify-center gap-2"><i class="fa-solid fa-spinner fa-spin"></i> SIGNING IN...</span>`;
      errEl.textContent = '';
      errEl.style.color = '';
      
      try {
        // Direct Supabase Auth login with email+password (no email leaks)
        const lr = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass, grant_type: 'password' })
        });
        const ld = await lr.json();
        
        if (!ld.access_token) {
          // Don't reveal whether the email exists or password is wrong
          errEl.textContent = ld.error_description || ld.msg || 'Invalid email or password.';
          btn.disabled = false;
          btn.innerHTML = 'SIGN IN';
          return;
        }
        
        const uid = ld.user?.id || '';
        const emailFromAuth = ld.user?.email || email;
        
        // Pull public profile (no email exposed) from public_profiles view using auth token
        let avatarFilename = null, bannerFilename = null, username = emailFromAuth.split('@')[0], country = null;
        try {
          const pr = await fetch(`${SB_URL}/rest/v1/public_profiles?select=username,country,avatar_url,banner_url&id=eq.${uid}`, {
            headers: {
              'apikey': SB_KEY,
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + ld.access_token
            }
          });
          const pd = await pr.json();
          if (Array.isArray(pd) && pd[0]) {
            username = pd[0].username || username;
            country = pd[0].country || null;
            avatarFilename = pd[0].avatar_url || null;
            bannerFilename = pd[0].banner_url || null;
          }
        } catch(e){}
        
        const avatarUrl = (avatarFilename && uid) ? getAvatarUrl(uid, avatarFilename) : null;
        const bannerUrl = (bannerFilename && uid) ? getBannerUrl(uid, bannerFilename) : null;
        
        // Save state
        safeSet('peu_token', ld.access_token);
        safeSet('peu_refresh', ld.refresh_token || '');
        safeSet('peu_user', username);
        safeSet('peu_email', emailFromAuth);
        safeSet('peu_uid', uid);
        safeSet('peu_country', country || '');
        
        if (avatarUrl) safeSet('peu_avatar', avatarUrl); else safeRemove('peu_avatar');
        if (bannerUrl) safeSet('peu_banner', bannerUrl); else safeRemove('peu_banner');
        
        setLoggedIn(username, emailFromAuth, avatarUrl, bannerUrl);
        closeModal();
        showToast(`Welcome back, ${username}!`, 'ok');
        
      } catch(e) {
        errEl.textContent = 'Connection error. Please try again.';
        console.error(e);
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'SIGN IN';
      }
    }
    
    // ===================== FORGOT PASSWORD =====================
    async function doForgot() {
      const email = document.getElementById('l-user').value.trim();
      const errEl = document.getElementById('l-err');
      
      if (!email.includes('@')) {
        errEl.style.color = '';
        errEl.textContent = 'Please enter your email address in the EMAIL field above, then click Forgot password.';
        return;
      }
      
      try {
        await fetch(`${SB_URL}/auth/v1/recover`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
      } catch(e) {}
      
      errEl.style.color = '#4ade80';
      errEl.textContent = 'If an account exists, a password reset link has been sent to your email.';
    }
    
    // ===================== REGISTER =====================
    async function doRegister() {
      const user = document.getElementById('r-user').value.trim();
      const email = document.getElementById('r-email').value.trim();
      const pass = document.getElementById('r-pass').value;
      const country = document.getElementById('r-country').value;
      const errEl = document.getElementById('r-err');
      const okEl = document.getElementById('r-ok');
      const btn = document.getElementById('r-btn');
      
      errEl.textContent = '';
      okEl.textContent = '';
      
      if (user.length < 4) { errEl.textContent = 'Username must be at least 4 characters.'; return; }
      if (!/^[a-zA-Z0-9_]+$/.test(user) || user.includes('@')) { errEl.textContent = 'Only letters, numbers, and underscores allowed (no @).'; return; }
      if (!email.includes('@')) { errEl.textContent = 'Please enter a valid email.'; return; }
      if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
      if (BADWORDS.some(w => user.toLowerCase().includes(w))) { errEl.textContent = 'Username contains inappropriate words.'; return; }
      
      btn.disabled = true;
      btn.innerHTML = 'CHECKING...';

      try {
        // Multi-account guard: is this connection allowed one more account?
        const gate = await checkRegistrationAllowed();
        if (gate && gate.allowed === false) {
          errEl.textContent = gate.message || 'Too many accounts have been created from this connection.';
          btn.disabled = false;
          btn.innerHTML = 'CREATE ACCOUNT';
          return;
        }

        // Check username availability
        const cr = await fetch(`${SB_URL}/rest/v1/rpc/check_username_available`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username_input: user })
        });
        
        const available = await cr.json();
        
        if (!available) {
          errEl.textContent = 'Username is already taken.';
          btn.disabled = false;
          btn.innerHTML = 'CREATE ACCOUNT';
          return;
        }
        
        btn.innerHTML = 'CREATING...';
        
        const r = await fetch(`${SB_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            password: pass, 
            data: { username: user, country } 
          })
        });
        
        const d = await r.json();
        
        if (d.id || d.access_token) {
          okEl.textContent = '✓ Account created successfully! You can now sign in.';
          
          if (d.access_token) {
            safeSet('peu_token', d.access_token);
            safeSet('peu_user', user);
            safeSet('peu_email', email);
            safeSet('peu_uid', d.user?.id || d.id || '');
            
            setLoggedIn(user, email, null, null);
            showToast(`Welcome to Further Engine, ${user}!`, 'ok');
            setTimeout(() => {
              closeModal();
            }, 1300);
          } else {
            setTimeout(() => switchTab('login'), 1500);
          }
        } else {
          const msg = d.msg || d.error_description || d.error || 'Registration failed.';
          errEl.textContent = msg.includes('already registered') ? 'This email is already registered.' : msg;
        }
        
      } catch(e) {
        errEl.textContent = 'Connection error. Please try again.';
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'CREATE ACCOUNT';
      }
    }
    
    // ===================== PROFILE =====================
    function openProfileSettings() {
      if (!currentUser) {
        openModal('login');
        return;
      }
      
      closeUserMenu();
      
      // Reset states
      pendingAvatarFile = null;
      pendingAvatarDataURL = null;
      avatarToRemove = null;
      
      document.getElementById('ps-msg').textContent = '';
      document.getElementById('av-upload-msg').textContent = '';
      document.getElementById('av-progress-wrap').style.display = 'none';
      document.getElementById('av-progress-bar').style.width = '0%';
      
      // Username
      document.getElementById('ps-username').value = currentUser.username || '';
      document.getElementById('ps-username-hint').textContent = 'Min. 4 characters — letters, numbers, underscores only';
      document.getElementById('ps-username-hint').className = 'text-xs text-slate-400 mt-1.5';
      
      // Avatar preview
      const initials = (currentUser.username || '?').substring(0, 2).toUpperCase();
      const prevEl = document.getElementById('ps-av-preview');
      
      if (currentUser.avatarUrl) {
        prevEl.innerHTML = `
          <img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='<span class=\\'text-3xl font-extrabold text-violet-300\\'>${initials}</span>'">
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
            <i class="fa-solid fa-camera text-white text-xl"></i>
          </div>
        `;
        document.getElementById('ps-remove-av-btn').classList.remove('hidden');
      } else {
        prevEl.innerHTML = `
          <span id="ps-av-initials" class="text-3xl font-extrabold text-violet-300">${initials}</span>
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
            <i class="fa-solid fa-camera text-white text-xl"></i>
          </div>
        `;
        document.getElementById('ps-remove-av-btn').classList.add('hidden');
      }
      
      // Country
      fetchCurrentCountry();

      // Load current banner
      loadCurrentBannerPreview();

      document.getElementById('profile-modal-overlay').classList.remove('hidden');
      document.getElementById('profile-modal-overlay').classList.add('flex');
      document.body.style.overflow = 'hidden';
    }
    
    async function fetchCurrentCountry() {
      const uid = safeGet('peu_uid');
      if (!uid) return;

      try {
        const r = await sbFetch(`/rest/v1/profiles?select=country,banner_url&id=eq.${uid}`, {
          headers: { 'Accept': 'application/json' }
        });
        const d = await r.json();

        if (d.length) {
          const sel = document.getElementById('ps-country');
          if (sel && d[0].country) sel.value = d[0].country;

          // store current banner for preview
          if (d[0].banner_url) {
            window.currentProfileBanner = d[0].banner_url;
          }
        }
      } catch(e) {}
    }

    function loadCurrentBannerPreview() {
      const preview = document.getElementById('ps-banner-preview');
      const removeBtn = document.getElementById('ps-remove-banner-btn');

      const bannerUrl = currentUser?.bannerUrl || window.currentProfileBanner || null;

      if (bannerUrl) {
        preview.innerHTML = `
          <img src="${bannerUrl}" style="width:100%;height:100%;object-fit:cover" 
               onerror="this.outerHTML='<div class=\\'flex items-center justify-center h-full text-xs text-slate-500\\'>Banner failed to load</div>'">
          <div class="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30"></div>
          <div class="absolute bottom-1 right-1 text-[9px] px-1.5 py-px bg-black/60 rounded text-white">Current</div>
        `;
        if (removeBtn) removeBtn.classList.remove('hidden');
      } else {
        preview.innerHTML = `
          <div class="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30"></div>
          <div class="relative z-10 text-center">
            <i class="fa-solid fa-image text-slate-400 text-xl mb-1"></i>
            <div class="text-[10px] text-slate-400">Click to upload banner (recommended 1200×300)</div>
          </div>
          <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
            <div class="text-xs font-semibold px-3 py-1 bg-white/90 text-black rounded-xl">Change Banner</div>
          </div>
        `;
        if (removeBtn) removeBtn.classList.add('hidden');
      }

      // Update the live profile preview card
      updateProfileBannerPreview(bannerUrl);
    }

    // Live preview for the profile card inside settings
    function updateProfileBannerPreview(bannerUrl) {
      const bannerEl = document.getElementById('preview-banner');
      const avEl = document.getElementById('preview-avatar');
      const nameEl = document.getElementById('preview-username');
      const countryEl = document.getElementById('preview-country');

      if (!bannerEl || !avEl || !nameEl) return;

      if (bannerUrl) {
        bannerEl.style.backgroundImage = `url('${bannerUrl}')`;
        bannerEl.style.backgroundSize = 'cover';
        bannerEl.style.backgroundPosition = 'center';
      } else {
        bannerEl.style.backgroundImage = 'linear-gradient(135deg, #433c6e, #27253a)';
      }

      const initials = (currentUser?.username || '??').substring(0, 2).toUpperCase();
      if (currentUser?.avatarUrl) {
        avEl.innerHTML = `<img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover">`;
      } else {
        avEl.innerHTML = `<span class="font-extrabold text-white">${initials}</span>`;
      }

      nameEl.textContent = currentUser?.username || 'YourName';
      if (countryEl) {
        countryEl.textContent = currentUser?.country ? (FLAGS[currentUser.country] || '') : '';
      }
    }
    
    function closeProfileSettings() {
      const overlay = document.getElementById('profile-modal-overlay');
      overlay.classList.remove('flex');
      overlay.classList.add('hidden');
      document.body.style.overflow = '';

      pendingAvatarFile = null;
      pendingAvatarDataURL = null;
      avatarToRemove = null;
      pendingBannerFile = null;
      pendingBannerDataURL = null;
      bannerToRemove = null;
      document.getElementById('avatar-file-input').value = '';
      document.getElementById('banner-file-input').value = '';
    }
    
    function closeProfileOutside(e) {
      if (e.target.id === 'profile-modal-overlay') closeProfileSettings();
    }
    
    function handleAvatarFile(e) {
      const file = e.target.files[0];
      if (!file) return;

      if (!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) {
        setAvMsg('Only PNG, JPG, GIF or WEBP files are allowed.', true);
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        setAvMsg('File is too large. Maximum 2MB.', true);
        return;
      }

      pendingAvatarFile = file;
      avatarToRemove = null;

      const reader = new FileReader();
      reader.onload = function(ev) {
        pendingAvatarDataURL = ev.target.result;

        const prevEl = document.getElementById('ps-av-preview');
        prevEl.innerHTML = `
          <img src="${pendingAvatarDataURL}" style="width:100%;height:100%;object-fit:cover">
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
            <i class="fa-solid fa-camera text-white text-xl"></i>
          </div>
        `;

        document.getElementById('ps-remove-av-btn').classList.remove('hidden');
        setAvMsg('Ready to upload. Click Save Changes.', false);
      };
      reader.readAsDataURL(file);
    }

    // ===================== BANNER HANDLING =====================
    function handleBannerFile(e) {
      const file = e.target.files[0];
      if (!file) return;

      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
        setBannerMsg('Only PNG, JPG or WEBP files are allowed for banner.', true);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setBannerMsg('Banner is too large. Maximum 5MB.', true);
        return;
      }

      pendingBannerFile = file;
      bannerToRemove = null;

      const reader = new FileReader();
      reader.onload = function(ev) {
        pendingBannerDataURL = ev.target.result;

        const preview = document.getElementById('ps-banner-preview');
        preview.innerHTML = `
          <img src="${pendingBannerDataURL}" style="width:100%;height:100%;object-fit:cover" />
          <div class="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30"></div>
          <div class="absolute bottom-1 right-1 text-[9px] px-1.5 py-px bg-black/60 rounded text-white">New Banner</div>
        `;

        const removeBtn = document.getElementById('ps-remove-banner-btn');
        if (removeBtn) removeBtn.classList.remove('hidden');

        setBannerMsg('Banner ready. Click Save Changes.', false);
        updateProfileBannerPreview(pendingBannerDataURL); // live preview
      };
      reader.readAsDataURL(file);
    }

    function removeBanner() {
      const preview = document.getElementById('ps-banner-preview');
      const removeBtn = document.getElementById('ps-remove-banner-btn');

      if (currentUser && currentUser.bannerUrl) {
        bannerToRemove = currentUser.bannerUrl;
      }

      pendingBannerFile = null;
      pendingBannerDataURL = null;

      preview.innerHTML = `
        <div class="absolute inset-0 bg-gradient-to-b from-black/10 to-black/30"></div>
        <div class="relative z-10 text-center">
          <i class="fa-solid fa-image text-slate-400 text-xl mb-1"></i>
          <div class="text-[10px] text-slate-400">Click to upload banner (recommended 1200×300)</div>
        </div>
        <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
          <div class="text-xs font-semibold px-3 py-1 bg-white/90 text-black rounded-xl">Change Banner</div>
        </div>
      `;

      if (removeBtn) removeBtn.classList.add('hidden');
      setBannerMsg('Banner will be removed when you save.', false);

      // Update live preview
      updateProfileBannerPreview(null);
    }

    function setBannerMsg(msg, isErr) {
      const el = document.getElementById('banner-upload-msg');
      if (!el) return;
      el.textContent = msg;
      el.style.color = isErr ? '#f87171' : '#4ade80';
    }

    async function uploadBannerToStorage(uid, file) {
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `banner_${Date.now()}.${ext}`;
      const path = `${uid}/${filename}`;

      const token = await getValidToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const uploadUrl = `${SB_URL}/storage/v1/object/${BANNER_BUCKET}/${path}`;
      
      let r = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Content-Type': file.type,
          'Authorization': 'Bearer ' + token,
          'x-upsert': 'true'
        },
        body: file
      });

      if (!r.ok && r.status === 409) {
        r = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'apikey': SB_KEY,
            'Content-Type': file.type,
            'Authorization': 'Bearer ' + token
          },
          body: file
        });
      }

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const msg = err.message || '';
        
        if (r.status === 404 || msg.toLowerCase().includes('bucket') || msg.includes('not found')) {
          throw new Error('Banner upload failed (storage issue).');
        }
        
        throw new Error(msg || `Banner upload failed (${r.status}).`);
      }

      return filename;
    }

    async function deleteOldBanner(uid, oldBannerUrl) {
      if (!oldBannerUrl) return;

      const parts = oldBannerUrl.split(`/${BANNER_BUCKET}/${uid}/`);
      if (parts.length < 2) return;

      const filename = parts[1].split('?')[0];
      const path = `${uid}/${filename}`;

      const token = await getValidToken();
      const headers = { 'apikey': SB_KEY };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      try {
        await fetch(`${SB_URL}/storage/v1/object/${BANNER_BUCKET}/${path}`, {
          method: 'DELETE',
          headers
        });
      } catch(e) {
        console.warn('Old banner deletion failed:', e);
      }
    }
    
    function removeAvatar() {
      const initials = (currentUser.username || '?').substring(0, 2).toUpperCase();
      if (currentUser.avatarUrl) avatarToRemove = currentUser.avatarUrl;
      
      pendingAvatarFile = null;
      pendingAvatarDataURL = null;
      
      const prevEl = document.getElementById('ps-av-preview');
      prevEl.innerHTML = `
        <span class="text-3xl font-extrabold text-violet-300">${initials}</span>
        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
          <i class="fa-solid fa-camera text-white text-xl"></i>
        </div>
      `;
      
      document.getElementById('ps-remove-av-btn').classList.add('hidden');
      setAvMsg('Avatar will be removed when you save.', false);
    }
    
    function setAvMsg(msg, isErr) {
      const el = document.getElementById('av-upload-msg');
      el.textContent = msg;
      el.style.color = isErr ? '#f87171' : '#4ade80';
    }
    
    function onUsernameInput() {
      const hint = document.getElementById('ps-username-hint');
      hint.textContent = 'Min. 4 characters — letters, numbers, underscores only';
      hint.className = 'text-xs text-slate-400 mt-1.5';
    }
    
    async function checkUsernameAvail() {
      const val = document.getElementById('ps-username').value.trim();
      const hint = document.getElementById('ps-username-hint');
      
      if (val.length < 4) {
        hint.textContent = 'Too short. Must be at least 4 characters.';
        hint.className = 'text-xs text-red-300 mt-1.5';
        return;
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(val)) {
        hint.textContent = 'Only letters, numbers and underscores.';
        hint.className = 'text-xs text-red-300 mt-1.5';
        return;
      }
      
      if (val.toLowerCase() === (currentUser.username || '').toLowerCase()) {
        hint.textContent = 'This is your current username.';
        hint.className = 'text-xs text-slate-300 mt-1.5';
        return;
      }
      
      hint.textContent = 'Checking availability...';
      hint.className = 'text-xs text-slate-300 mt-1.5';
      
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/check_username_available`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username_input: val })
        });
        
        const available = await r.json();
        
        if (available) {
          hint.textContent = '✓ Username is available!';
          hint.className = 'text-xs text-emerald-300 mt-1.5';
        } else {
          hint.textContent = '✗ Username already taken.';
          hint.className = 'text-xs text-red-300 mt-1.5';
        }
      } catch(e) {
        hint.textContent = 'Could not check availability.';
        hint.className = 'text-xs text-red-300 mt-1.5';
      }
    }
    
    async function uploadAvatarToStorage(uid, file) {
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `avatar_${Date.now()}.${ext}`;
      const path = `${uid}/${filename}`;
      
      document.getElementById('av-progress-wrap').style.display = 'block';
      document.getElementById('av-progress-bar').style.width = '30%';
      
      const token = await getValidToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      
      let r = await fetch(`${SB_URL}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Content-Type': file.type,
          'Authorization': 'Bearer ' + token,
          'x-upsert': 'true'
        },
        body: file
      });
      
      if (!r.ok && r.status === 409) {
        r = await fetch(`${SB_URL}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
          method: 'PUT',
          headers: {
            'apikey': SB_KEY,
            'Content-Type': file.type,
            'Authorization': 'Bearer ' + token
          },
          body: file
        });
      }
      
      document.getElementById('av-progress-bar').style.width = '100%';
      
      setTimeout(() => {
        document.getElementById('av-progress-wrap').style.display = 'none';
      }, 550);
      
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || 'Avatar upload failed.');
      }
      
      return filename;
    }
    
    async function deleteOldAvatar(uid, oldAvatarUrl) {
      if (!oldAvatarUrl) return;
      
      const parts = oldAvatarUrl.split(`/${AVATAR_BUCKET}/${uid}/`);
      if (parts.length < 2) return;
      
      const filename = parts[1].split('?')[0];
      const path = `${uid}/${filename}`;
      
      const token = await getValidToken();
      const headers = { 'apikey': SB_KEY };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      
      try {
        await fetch(`${SB_URL}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
          method: 'DELETE',
          headers
        });
      } catch(e) {
        console.warn('Old avatar deletion failed:', e);
      }
    }
    
    async function saveProfile() {
      const uid = safeGet('peu_uid');
      const newUsername = document.getElementById('ps-username').value.trim();
      const newCountry = document.getElementById('ps-country').value;
      const hint = document.getElementById('ps-username-hint');
      const saveBtn = document.getElementById('ps-save-btn');
      
      if (!uid) {
        setProfileMsg('Session error. Please sign in again.', true);
        return;
      }
      
      if (newUsername.length < 4) {
        hint.textContent = 'Username must be at least 4 characters.';
        hint.className = 'text-xs text-red-300 mt-1.5';
        return;
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
        hint.textContent = 'Only letters, numbers and underscores.';
        hint.className = 'text-xs text-red-300 mt-1.5';
        return;
      }
      
      if (BADWORDS.some(w => newUsername.toLowerCase().includes(w))) {
        hint.textContent = 'Inappropriate username.';
        hint.className = 'text-xs text-red-300 mt-1.5';
        return;
      }
      
      saveBtn.disabled = true;
      saveBtn.innerHTML = 'SAVING...';
      setProfileMsg('', false);
      
      try {
        let newAvatarFilename = null;
        const oldAvatarUrl = currentUser.avatarUrl || null;
        
        if (pendingAvatarFile) {
          setAvMsg('Uploading avatar...', false);
          newAvatarFilename = await uploadAvatarToStorage(uid, pendingAvatarFile);
          setAvMsg('Avatar uploaded successfully!', false);
          
          if (oldAvatarUrl) await deleteOldAvatar(uid, oldAvatarUrl);
        } else if (avatarToRemove) {
          await deleteOldAvatar(uid, avatarToRemove);
          newAvatarFilename = '';
        }
        
        const updates = { country: newCountry };
        
        if (newUsername !== currentUser.username) {
          const chkR = await fetch(`${SB_URL}/rest/v1/rpc/check_username_available`, {
            method: 'POST',
            headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username_input: newUsername })
          });
          
          const available = await chkR.json();
          if (!available) {
            hint.textContent = 'Username is already taken.';
            hint.className = 'text-xs text-red-300 mt-1.5';
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'SAVE CHANGES';
            return;
          }
          
          updates.username = newUsername;
          updates.username_lower = newUsername.toLowerCase();
        }
        
      if (pendingAvatarFile && newAvatarFilename) {
        updates.avatar_url = newAvatarFilename;
      } else if (avatarToRemove) {
        updates.avatar_url = null;
      }

      // Banner handling
      let newBannerFilename = null;
      const oldBannerUrl = currentUser.bannerUrl || null;

      if (pendingBannerFile) {
        setBannerMsg('Uploading banner...', false);
        newBannerFilename = await uploadBannerToStorage(uid, pendingBannerFile);
        setBannerMsg('Banner uploaded!', false);

        if (oldBannerUrl) await deleteOldBanner(uid, oldBannerUrl);
      } else if (bannerToRemove) {
        await deleteOldBanner(uid, bannerToRemove);
        newBannerFilename = '';
      }

      if (pendingBannerFile && newBannerFilename) {
        updates.banner_url = newBannerFilename;
      } else if (bannerToRemove) {
        updates.banner_url = null;
      }

      const token = await getValidToken();
      if (!token) {
        setProfileMsg('Session expired. Please sign in again.', true);
        return;
      }

      const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${uid}`, {
        method: 'PATCH',
        headers: {
          'apikey': SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(updates)
      });
        
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          const rawMsg = err.message || err.error || '';
          
          let friendly = 'Profile update failed.';
          if (rawMsg.toLowerCase().includes('row-level security') || rawMsg.includes('RLS')) {
            friendly = 'RLS error: Your profile row is blocked by security rules. Please run the latest banner_sql.sql (full version) in Supabase SQL Editor.';
          } else if (rawMsg.toLowerCase().includes('bucket')) {
            friendly = 'Storage error. Check Supabase Storage configuration.';
          }
          
          console.error('Supabase PATCH error:', err);
          throw new Error(friendly + ' ' + (rawMsg ? '(' + rawMsg + ')' : ''));
        }
        
        // Update state
        if (updates.username) {
          currentUser.username = updates.username;
          safeSet('peu_user', updates.username);
        }
        
        if (pendingAvatarFile && newAvatarFilename) {
          const newUrl = getAvatarUrl(uid, newAvatarFilename);
          currentUser.avatarUrl = newUrl;
          safeSet('peu_avatar', newUrl);
        } else if (avatarToRemove) {
          currentUser.avatarUrl = null;
          safeRemove('peu_avatar');
        }

        // Banner state update
        if (pendingBannerFile && newBannerFilename) {
          const newBannerUrl = getBannerUrl(uid, newBannerFilename);
          currentUser.bannerUrl = newBannerUrl;
          safeSet('peu_banner', newBannerUrl);
        } else if (bannerToRemove) {
          currentUser.bannerUrl = null;
          safeRemove('peu_banner');
        }

        setLoggedIn(currentUser.username, currentUser.email, currentUser.avatarUrl, currentUser.bannerUrl);
        setProfileMsg('Profile updated successfully!', false);
        showToast('Profile updated!', 'ok');
        
        pendingAvatarFile = null;
        pendingAvatarDataURL = null;
        avatarToRemove = null;
        
        document.getElementById('avatar-file-input').value = '';
        
        setTimeout(() => {
          closeProfileSettings();
        }, 1400);
        
      } catch(e) {
        let msg = e.message || 'Unknown error';
        if (msg.toLowerCase().includes('row-level security') || msg.includes('violates row-level')) {
          msg = 'Permission denied. Make sure you only edit your own profile.';
        }
        setProfileMsg('Error: ' + msg, true);
        console.error('saveProfile error:', e);
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'SAVE CHANGES';
      }
    }
    
    function setProfileMsg(msg, isErr) {
      const el = document.getElementById('ps-msg');
      el.textContent = msg;
      el.style.color = isErr ? '#f87171' : '#4ade80';
    }
    
    // ===================== LEADERBOARD =====================
    // Rewritten: country filter, sorting, pagination, mobile layout, escaping.
    //
    // State lives in one object so filters, sorting and paging can be combined,
    // restored from the URL and re-applied after every background refresh.
    const LB_PER_PAGE = 25;

    let lbState = {
      time: 'all',        // all | week | today
      country: 'all',     // country name from the profile data
      q: '',              // search query
      sort: 'rank',       // rank | level | acc | songs
      page: 1
    };

    // --- helpers -----------------------------------------------------------

    // Usernames, badges and countries are user-controlled: never inject raw.
    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function lbRows() {
      return currentLBTab === 'score' ? (allData || []) : (achData || []);
    }

    function lbPlayerId(p) {
      return p.id || p.player_id || '';
    }

    function lbScore(p) {
      return currentLBTab === 'score' ? parseFloat(p.ultra_points || 0) : (p.achievement_count || 0);
    }

    // Global rank is assigned once, on the full data set, so a filtered or
    // searched row still shows the player's real position in the world.
    function lbAssignRanks(rows) {
      rows.forEach(function (p, i) { p._rank = i + 1; });
      return rows;
    }

    function lbFiltersActive() {
      return lbState.time !== 'all' || lbState.country !== 'all' || !!lbState.q || lbState.sort !== 'rank';
    }

    function lbFiltered() {
      let data = lbRows().slice();

      if (lbState.time !== 'all') {
        const since = lbState.time === 'today'
          ? (function () { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        data = data.filter(function (p) {
          const stamp = p.updated_at || p.last_unlock_at;
          return stamp && new Date(stamp) >= since;
        });
      }

      if (lbState.country !== 'all') {
        data = data.filter(function (p) { return (p.country || 'Other') === lbState.country; });
      }

      if (lbState.q) {
        const q = lbState.q.toLowerCase();
        data = data.filter(function (p) { return (p.username || '').toLowerCase().includes(q); });
      }

      if (lbState.sort === 'level')      data.sort(function (a, b) { return (b.level || 0) - (a.level || 0); });
      else if (lbState.sort === 'acc')   data.sort(function (a, b) { return parseFloat(b.best_accuracy || 0) - parseFloat(a.best_accuracy || 0); });
      else if (lbState.sort === 'songs') data.sort(function (a, b) { return (b.songs_played || 0) - (a.songs_played || 0); });

      return data;
    }

    // --- URL sync (deep-linkable filters) ----------------------------------

    function lbSyncUrl() {
      // Only ever rewrite the URL while the leaderboard route is showing.
      if ((window.location.hash || '').indexOf('#/leaderboard') !== 0) return;
      const params = [];
      if (currentLBTab !== 'score') params.push('tab=' + currentLBTab);
      if (lbState.country !== 'all') params.push('country=' + encodeURIComponent(lbState.country));
      if (lbState.time !== 'all') params.push('time=' + lbState.time);
      if (lbState.sort !== 'rank') params.push('sort=' + lbState.sort);
      if (lbState.q) params.push('q=' + encodeURIComponent(lbState.q));
      if (lbState.page > 1) params.push('page=' + lbState.page);

      const hash = '#/leaderboard' + (params.length ? '?' + params.join('&') : '');
      // replaceState avoids a hashchange (which would scroll the page to top).
      try { history.replaceState(null, '', hash); } catch (e) {}
    }

    let lbUrlRead = false;

    // Idempotent: the first render (whichever it is) restores state from the URL.
    function lbEnsureUrlState() {
      if (lbUrlRead) return;
      lbUrlRead = true;
      lbReadUrl();
      lbApplyUrlToControls();
    }

    function lbReadUrl() {
      // The URL is the source of truth: anything it does not mention goes back
      // to its default, so navigating to a bare #/leaderboard really is unfiltered.
      lbState.country = 'all';
      lbState.time = 'all';
      lbState.sort = 'rank';
      lbState.q = '';
      lbState.page = 1;
      currentFilter = 'all';
      currentLBTab = 'score';

      const raw = (window.location.hash || '').split('?')[1];
      if (!raw) return;
      const params = new URLSearchParams(raw);
      if (params.get('tab') === 'achievements') currentLBTab = 'achievements';
      if (params.get('country')) lbState.country = params.get('country');
      if (params.get('time')) lbState.time = params.get('time');
      if (params.get('sort')) lbState.sort = params.get('sort');
      if (params.get('q')) lbState.q = params.get('q');
      if (params.get('page')) lbState.page = Math.max(1, parseInt(params.get('page'), 10) || 1);
    }

    // --- loading / error / empty states ------------------------------------

    function lbSkeleton(rows) {
      let html = '';
      for (let i = 0; i < rows; i++) {
        html += '<div class="flex items-center gap-3 px-3 py-2.5"><div class="skeleton w-5 h-3 rounded"></div>' +
                '<div class="skeleton w-9 h-9 rounded-2xl"></div><div class="skeleton h-3 rounded flex-1 max-w-[160px]"></div>' +
                '<div class="skeleton h-3 w-12 rounded ml-auto"></div></div>';
      }
      return html;
    }

    function showLBLoading() {
      const loading = document.getElementById('lb-loading');
      const table = document.getElementById('lb-table');
      const empty = document.getElementById('lb-empty');
      const pager = document.getElementById('lb-pager');
      if (table) table.style.display = 'none';
      if (empty) empty.style.display = 'none';
      if (pager) pager.style.display = 'none';
      if (loading) {
        loading.style.display = 'block';
        loading.innerHTML = '<div class="space-y-1" role="status" aria-live="polite">' +
          '<span class="sr-only">Loading leaderboard…</span>' + lbSkeleton(8) + '</div>';
      }
    }

    function showLBError(message, retryFn, detail) {
      const loading = document.getElementById('lb-loading');
      const table = document.getElementById('lb-table');
      const empty = document.getElementById('lb-empty');
      const pager = document.getElementById('lb-pager');
      if (table) table.style.display = 'none';
      if (empty) empty.style.display = 'none';
      if (pager) pager.style.display = 'none';
      if (!loading) return;

      loading.style.display = 'block';
      loading.innerHTML = `
        <div class="text-center py-8">
          <div class="mx-auto w-11 h-11 rounded-2xl bg-red-500/10 text-red-300 flex items-center justify-center mb-3">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          </div>
          <div class="text-sm font-semibold text-slate-200">${escapeHtml(message)}</div>
          <div class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">${escapeHtml(detail || 'The ranking service is unreachable right now. Your scores are safe — nothing was lost.')}</div>
          <button class="retry-lb-btn mt-4 px-4 py-2 text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors rounded-2xl bg-white/5 text-white">
            <i class="fa-solid fa-redo mr-1 text-[10px]" aria-hidden="true"></i> Try again
          </button>
        </div>
      `;
      const btn = loading.querySelector('.retry-lb-btn');
      if (btn && typeof retryFn === 'function') {
        btn.onclick = function () { showLBLoading(); retryFn(); };
      }
    }

    function lbEmptyState() {
      const empty = document.getElementById('lb-empty');
      if (!empty) return;
      const filtered = lbFiltersActive();
      empty.style.display = 'flex';
      empty.innerHTML = filtered
        ? `<div class="text-center">
             <div class="text-sm font-semibold text-slate-200">No players match these filters</div>
             <div class="text-xs text-slate-400 mt-1">Try a different country, time range or search term.</div>
             <button onclick="lbResetFilters()" class="mt-4 px-4 py-2 text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors rounded-2xl bg-white/5 text-white">Clear filters</button>
           </div>`
        : `<div class="text-center">
             <div class="text-sm font-semibold text-slate-200">No players yet</div>
             <div class="text-xs text-slate-400 mt-1">Be the first to submit a score — play a song with your account signed in.</div>
           </div>`;
    }

    // --- tabs ---------------------------------------------------------------

    function switchLBTab(tab) {
      currentLBTab = tab;
      lbState.page = 1;

      const score = document.getElementById('lb-tab-score');
      const ach = document.getElementById('lb-tab-achievements');
      [[score, tab === 'score'], [ach, tab === 'achievements']].forEach(function (pair) {
        const el = pair[0], on = pair[1];
        if (!el) return;
        el.classList.toggle('bg-white/10', on);
        el.classList.toggle('text-white', on);
        el.classList.toggle('text-slate-400', !on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      // Accuracy/songs only exist on the score board (hidden *and* disabled,
      // because Safari ignores display:none on <option>).
      document.querySelectorAll('[data-score-only]').forEach(function (el) {
        el.style.display = tab === 'score' ? '' : 'none';
        if ('disabled' in el) el.disabled = tab !== 'score';
      });
      if (tab !== 'score' && (lbState.sort === 'acc' || lbState.sort === 'songs')) {
        lbState.sort = 'rank';
        const sortEl = document.getElementById('lb-sort');
        if (sortEl) sortEl.value = 'rank';
      }

      if (tab === 'score') {
        if (allData.length) { lbRenderAll(); } else { fetchLB(); }
      } else {
        if (achData.length) { lbRenderAll(); } else { fetchAchievementLB(); }
      }
      lbSyncUrl();
    }

    // --- filter controls (called from markup) -------------------------------

    function setFilter(f, btn) {
      lbState.time = f;
      currentFilter = f;
      lbState.page = 1;
      document.querySelectorAll('.filter-btn').forEach(function (b) {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.classList.toggle('bg-white/5', on);
        b.classList.toggle('text-white', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      lbRenderAll();
    }

    function setLBCountry(country) {
      lbState.country = country || 'all';
      lbState.page = 1;
      const select = document.getElementById('lb-country');
      if (select && select.value !== lbState.country) select.value = lbState.country;
      lbRenderAll();
    }

    function setLBSort(sort) {
      lbState.sort = sort || 'rank';
      lbState.page = 1;
      lbRenderAll();
    }

    function lbSearch(value) {
      lbState.q = (value || '').trim();
      lbState.page = 1;
      lbRenderAll();
    }

    // Kept for backwards compatibility with the old inline handler.
    function filterTable() {
      const el = document.getElementById('lb-search');
      lbSearch(el ? el.value : '');
    }

    function lbResetFilters() {
      lbState.time = 'all';
      lbState.country = 'all';
      lbState.q = '';
      lbState.sort = 'rank';
      lbState.page = 1;
      currentFilter = 'all';

      const search = document.getElementById('lb-search');
      if (search) search.value = '';
      const select = document.getElementById('lb-country');
      if (select) select.value = 'all';
      const sort = document.getElementById('lb-sort');
      if (sort) sort.value = 'rank';
      document.querySelectorAll('.filter-btn').forEach(function (b, i) {
        b.classList.toggle('active', i === 0);
        b.classList.toggle('bg-white/5', i === 0);
        b.classList.toggle('text-white', i === 0);
      });
      lbRenderAll();
    }

    function lbGoToPage(page) {
      lbState.page = Math.max(1, page);
      lbRenderAll();
      const anchor = document.getElementById('lb-table-top');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Mirrors state restored from the URL back into the filter controls.
    function lbApplyUrlToControls() {
      const search = document.getElementById('lb-search');
      if (search) search.value = lbState.q;

      const sort = document.getElementById('lb-sort');
      if (sort) sort.value = lbState.sort;

      currentFilter = lbState.time;
      document.querySelectorAll('.filter-btn').forEach(function (b, i) {
        const on = ['all', 'week', 'today'][i] === lbState.time;
        b.classList.toggle('active', on);
        b.classList.toggle('bg-white/5', on);
        b.classList.toggle('text-white', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (currentLBTab === 'achievements') {
        const scoreTab = document.getElementById('lb-tab-score');
        const achTab = document.getElementById('lb-tab-achievements');
        if (scoreTab && achTab) {
          scoreTab.classList.remove('bg-white/10', 'text-white');
          scoreTab.classList.add('text-slate-400');
          achTab.classList.add('bg-white/10', 'text-white');
          achTab.classList.remove('text-slate-400');
        }
      }
    }

    // --- country UI ---------------------------------------------------------

    function lbBuildCountryFilter() {
      lbEnsureUrlState();
      const select = document.getElementById('lb-country');
      if (!select) return;

      const counts = {};
      lbRows().forEach(function (p) {
        const c = p.country || 'Other';
        counts[c] = (counts[c] || 0) + 1;
      });

      // "Unknown"/"Other" are placeholders, not countries: keep them selectable
      // but always at the bottom of the list.
      const PLACEHOLDER = { 'Unknown': 1, 'Other': 1, '': 1 };
      const names = Object.keys(counts).sort(function (a, b) {
        const pa = PLACEHOLDER[a] ? 1 : 0, pb = PLACEHOLDER[b] ? 1 : 0;
        if (pa !== pb) return pa - pb;
        return counts[b] - counts[a] || a.localeCompare(b);
      });

      const total = lbRows().length;
      let html = `<option value="all">🌍 All countries (${total})</option>`;
      names.forEach(function (c) {
        html += `<option value="${escapeHtml(c)}">${FLAGS[c] || '🌍'} ${escapeHtml(c)} (${counts[c]})</option>`;
      });
      select.innerHTML = html;

      // A country from the URL that nobody plays from any more: fall back.
      if (lbState.country !== 'all' && !counts[lbState.country]) lbState.country = 'all';
      if (lbState.country !== 'all') lbState.page = Math.max(1, lbState.page);
      select.value = lbState.country;

      lbRenderCountryChips(counts);
    }

    // Compact "top countries" strip — doubles as a one-tap filter.
    function lbRenderCountryChips(counts) {
      const wrap = document.getElementById('lb-country-chips');
      if (!wrap) return;

      const PLACEHOLDER = { 'Unknown': 1, 'Other': 1, '': 1 };
      const names = Object.keys(counts)
        .filter(function (c) { return !PLACEHOLDER[c]; })     // no "Unknown 189" chip
        .sort(function (a, b) { return counts[b] - counts[a]; })
        .slice(0, 6);
      if (names.length < 2) { wrap.innerHTML = ''; return; }

      const myCountry = currentUser && currentUser.country;
      if (myCountry && counts[myCountry] && names.indexOf(myCountry) === -1) {
        names.pop();
        names.push(myCountry);
      }

      wrap.innerHTML = names.map(function (c) {
        const on = lbState.country === c;
        return `<button type="button" onclick="setLBCountry('${escapeHtml(c).replace(/'/g, "\\'")}')"
          class="px-3 py-1.5 text-xs font-semibold rounded-3xl border transition-colors ${on ? 'border-violet-400/50 bg-violet-500/15 text-violet-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}"
          aria-pressed="${on}">
          <span class="mr-1">${FLAGS[c] || '🌍'}</span>${escapeHtml(c)}
          <span class="text-slate-500 ml-1">${counts[c]}</span>
        </button>`;
      }).join('');
    }

    // --- stats row ----------------------------------------------------------

    function updateStatsRow(data) {
      const players = document.getElementById('lb-p');
      const songs = document.getElementById('lb-s');
      const top = document.getElementById('lb-t');
      if (!players) return;

      players.textContent = data.length.toLocaleString();
      songs.textContent = data.reduce(function (a, p) { return a + (p.songs_played || 0); }, 0).toLocaleString();
      top.textContent = data.length ? formatUP(data[0].ultra_points) : '—';

      document.getElementById('lb-s-label').textContent = 'SONGS PLAYED';
      document.getElementById('lb-t-label').textContent = 'TOP ULTRA PTS';
    }

    function updateAchStats(data) {
      document.getElementById('lb-p').textContent = data.length.toLocaleString();
      document.getElementById('lb-s').textContent = data.reduce(function (a, p) { return a + (p.achievement_count || 0); }, 0).toLocaleString();
      document.getElementById('lb-t').textContent = data.length ? (data[0].achievement_count || 0) : '—';
      document.getElementById('lb-s-label').textContent = 'TOTAL UNLOCKED';
      document.getElementById('lb-t-label').textContent = 'TOP PLAYER';
    }

    function getAchTier(count) {
      if (count >= 50) return { label: 'MASTER', cls: 'bg-amber-800/30 text-amber-300' };
      if (count >= 25) return { label: 'VETERAN', cls: 'bg-violet-700/30 text-violet-300' };
      if (count >= 10) return { label: 'SKILLED', cls: 'bg-emerald-700/30 text-emerald-300' };
      return { label: '', cls: 'bg-white/5 text-slate-300' };
    }

    // --- podium -------------------------------------------------------------

    function lbAvatarHtml(p, size) {
      const init = escapeHtml((p.username || '?').substring(0, 2).toUpperCase());
      const id = lbPlayerId(p);
      if (p.avatar_url && id) {
        return `<img src="${escapeHtml(getAvatarUrl(id, p.avatar_url))}" alt="" loading="lazy"
                     style="width:100%;height:100%;object-fit:cover"
                     onerror="this.style.display='none';this.parentNode.textContent='${init}'">`;
      }
      return init;
    }

    function renderPodium(data) {
      const podium = document.getElementById('podium');
      if (!podium) return;

      if (!data.length) { podium.style.display = 'none'; return; }
      podium.style.display = 'flex';

      const isScore = currentLBTab === 'score';

      [1, 2, 3].forEach(function (n) {
        const card = document.getElementById('pod' + n);
        const p = data[n - 1];
        if (!card) return;
        if (!p) { card.style.display = 'none'; return; }
        card.style.display = '';

        document.getElementById('pod' + n + '-av').innerHTML = lbAvatarHtml(p);

        const nameEl = document.getElementById('pod' + n + '-name');
        nameEl.textContent = p.username || 'Unknown';

        const flagEl = document.getElementById('pod' + n + '-flag');
        const scoreEl = document.getElementById('pod' + n + '-score');
        const metaEl = document.getElementById('pod' + n + '-meta');

        if (isScore) {
          flagEl.textContent = FLAGS[p.country] || '🌍';
          flagEl.title = p.country || '';
          scoreEl.textContent = formatUP(p.ultra_points);
          metaEl.textContent = `Lv.${p.level || 1} • ${parseFloat(p.best_accuracy || 0).toFixed(1)}%`;
        } else {
          const tier = getAchTier(p.achievement_count);
          flagEl.textContent = '⭐';
          scoreEl.textContent = (p.achievement_count || 0) + ' Ach';
          metaEl.textContent = tier.label ? `Lv.${p.level || 1} • ${tier.label}` : `Lv.${p.level || 1}`;
        }
      });
    }

    function renderAchPodium(data) { renderPodium(data); }

    // --- table --------------------------------------------------------------

    function lbRankCell(rank) {
      if (rank === 1) return '<span class="text-base" title="1st">🥇</span>';
      if (rank === 2) return '<span class="text-base" title="2nd">🥈</span>';
      if (rank === 3) return '<span class="text-base" title="3rd">🥉</span>';
      const cls = rank <= 10 ? 'text-violet-300' : 'text-slate-400';
      return `<span class="font-extrabold text-xs ${cls}">${rank}</span>`;
    }

    function lbScoreRow(p, me) {
      const flag = FLAGS[p.country] || '🌍';
      const acc = parseFloat(p.best_accuracy || 0).toFixed(1);
      const accCls = acc >= 99 ? 'text-amber-300' : acc >= 95 ? 'text-emerald-300' : acc >= 85 ? 'text-violet-300' : 'text-slate-300';
      const roleCls = getRoleCls(p.role);
      const badge = (p.badge && p.role !== 'player')
        ? `<span class="px-1.5 py-px text-[10px] font-extrabold rounded-xl ${roleCls}">${escapeHtml(p.badge)}</span>` : '';
      const isMe = me && lbPlayerId(p) === me;

      return `
        <tr class="${isMe ? 'bg-[#1e1b4b]' : ''}">
          <td class="px-2 sm:px-3 py-[9px] align-middle">${lbRankCell(p._rank)}</td>
          <td class="px-2 sm:px-3 py-[9px]">
            <div class="flex items-center gap-x-3 min-w-0">
              <div class="w-9 h-9 flex-shrink-0 rounded-2xl overflow-hidden bg-[#27253a] flex items-center justify-center text-sm font-extrabold border border-white/10">${lbAvatarHtml(p)}</div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-medium truncate">${escapeHtml(p.username || 'Unknown')}</span>
                  ${isMe ? '<span class="text-[10px] font-bold text-violet-300 flex-shrink-0">YOU</span>' : ''}
                  ${badge}
                </div>
                <div class="sm:hidden text-[11px] text-slate-400 mt-0.5">
                  <span title="${escapeHtml(p.country || '')}">${flag}</span> · Lv.${p.level || 1} · ${acc}%
                </div>
              </div>
            </div>
          </td>
          <td class="hidden sm:table-cell px-3 py-[9px]"><span class="text-lg" title="${escapeHtml(p.country || '')}">${flag}</span></td>
          <td class="hidden sm:table-cell px-3 py-[9px]"><span class="px-2.5 py-px text-xs font-bold bg-white/5 rounded-[2rem]">Lv.${p.level || 1}</span></td>
          <td class="px-2 sm:px-3 py-[9px] text-right sm:text-left"><span class="font-semibold text-sm text-violet-200">${formatUP(p.ultra_points)}</span></td>
          <td class="hidden md:table-cell px-3 py-[9px]"><span class="${accCls} font-bold text-xs">${acc}%</span></td>
          <td class="hidden md:table-cell px-3 py-[9px]"><span class="text-xs font-medium">${p.songs_played || 0}</span></td>
        </tr>`;
    }

    function lbAchRow(p, me) {
      const tier = getAchTier(p.achievement_count);
      const isMe = me && lbPlayerId(p) === me;
      const lastDate = p.last_unlock_at
        ? new Date(p.last_unlock_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

      return `
        <tr class="${isMe ? 'bg-[#1e1b4b]' : ''}">
          <td class="px-2 sm:px-3 py-[9px] align-middle">${lbRankCell(p._rank)}</td>
          <td class="px-2 sm:px-3 py-[9px]">
            <div class="flex items-center gap-x-3 min-w-0">
              <div class="w-9 h-9 flex-shrink-0 rounded-2xl overflow-hidden bg-[#27253a] flex items-center justify-center text-sm font-extrabold border border-white/10">${lbAvatarHtml(p)}</div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-medium truncate">${escapeHtml(p.username || 'Unknown')}</span>
                  ${isMe ? '<span class="text-[10px] font-bold text-violet-300">YOU</span>' : ''}
                </div>
                <div class="sm:hidden text-[11px] text-slate-400 mt-0.5">Lv.${p.level || 1}${tier.label ? ' · ' + tier.label : ''}</div>
              </div>
            </div>
          </td>
          <td class="hidden sm:table-cell px-3 py-[9px]"><span class="px-2.5 py-px text-xs font-bold bg-white/5 rounded-[2rem]">Lv.${p.level || 1}</span></td>
          <td class="px-2 sm:px-3 py-[9px] text-right sm:text-left"><span class="font-semibold text-sm">⭐ ${p.achievement_count || 0}</span></td>
          <td class="hidden sm:table-cell px-3 py-[9px]">${tier.label ? `<span class="px-2 py-px text-[11px] rounded-xl ${tier.cls}">${tier.label}</span>` : ''}</td>
          <td class="hidden md:table-cell px-3 py-[9px]"><span class="text-xs text-slate-400">${lastDate}</span></td>
        </tr>`;
    }

    function lbRenderHead() {
      const thead = document.getElementById('lb-thead');
      if (!thead) return;
      const th = 'px-2 sm:px-3 py-[7px] font-semibold text-[10px] tracking-[.5px] uppercase text-slate-400';
      thead.innerHTML = currentLBTab === 'score'
        ? `<th class="${th} w-10">#</th>
           <th class="${th}">Player</th>
           <th class="${th} hidden sm:table-cell w-12">Country</th>
           <th class="${th} hidden sm:table-cell">Level</th>
           <th class="${th} text-right sm:text-left">Ultra Pts</th>
           <th class="${th} hidden md:table-cell">Acc</th>
           <th class="${th} hidden md:table-cell">Songs</th>`
        : `<th class="${th} w-10">#</th>
           <th class="${th}">Player</th>
           <th class="${th} hidden sm:table-cell">Level</th>
           <th class="${th} text-right sm:text-left">Achievements</th>
           <th class="${th} hidden sm:table-cell">Tier</th>
           <th class="${th} hidden md:table-cell">Last unlock</th>`;
    }

    function lbRenderPager(totalRows, from, to) {
      const pager = document.getElementById('lb-pager');
      if (!pager) return;

      const pages = Math.ceil(totalRows / LB_PER_PAGE);
      if (totalRows === 0) { pager.style.display = 'none'; return; }
      pager.style.display = 'flex';

      const counter = document.getElementById('lb-count');
      if (counter) {
        counter.textContent = `Showing ${from}–${to} of ${totalRows.toLocaleString()} player${totalRows === 1 ? '' : 's'}`;
      }

      const nav = document.getElementById('lb-pages');
      if (!nav) return;
      if (pages <= 1) { nav.innerHTML = ''; return; }

      const page = lbState.page;
      const btn = function (label, target, opts) {
        opts = opts || {};
        if (opts.disabled) {
          return `<span class="px-3 py-1.5 text-xs text-slate-600 select-none">${label}</span>`;
        }
        const active = opts.active;
        return `<button type="button" onclick="lbGoToPage(${target})" ${active ? 'aria-current="page"' : ''}
          class="px-3 py-1.5 text-xs font-semibold rounded-2xl border transition-colors ${active
            ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
            : 'border-white/10 text-slate-300 hover:bg-white/5'}">${label}</button>`;
      };

      // Window of page numbers around the current page.
      const nums = [];
      const first = Math.max(1, Math.min(page - 2, pages - 4));
      const last = Math.min(pages, Math.max(page + 2, 5));
      for (let i = first; i <= last; i++) nums.push(i);

      let html = btn('‹ Prev', page - 1, { disabled: page === 1 });
      if (first > 1) html += btn('1', 1) + '<span class="px-1 text-slate-600">…</span>';
      nums.forEach(function (n) { html += btn(String(n), n, { active: n === page }); });
      if (last < pages) html += '<span class="px-1 text-slate-600">…</span>' + btn(String(pages), pages);
      html += btn('Next ›', page + 1, { disabled: page === pages });

      nav.innerHTML = html;
    }

    // Master render: filters -> stats -> podium -> rows -> pager.
    function lbRenderAll() {
      lbEnsureUrlState();
      const loading = document.getElementById('lb-loading');
      const table = document.getElementById('lb-table');
      const empty = document.getElementById('lb-empty');
      const tbody = document.getElementById('lb-body');
      if (!table || !tbody) return;

      if (loading) loading.style.display = 'none';

      const isScore = currentLBTab === 'score';
      if (isScore) updateStatsRow(allData); else updateAchStats(achData);

      const data = lbFiltered();
      const filtersOn = lbFiltersActive();

      // Podium only makes sense for the unfiltered top 3.
      const podium = document.getElementById('podium');
      const showPodium = !filtersOn && data.length > 0;
      if (podium) podium.style.display = showPodium ? '' : 'none';
      if (showPodium) renderPodium(data);

      const active = document.getElementById('lb-active-filters');
      if (active) {
        active.style.display = filtersOn ? 'flex' : 'none';
        const label = document.getElementById('lb-active-label');
        if (label) {
          const bits = [];
          if (lbState.country !== 'all') bits.push(`${FLAGS[lbState.country] || '🌍'} ${lbState.country}`);
          if (lbState.time !== 'all') bits.push(lbState.time === 'week' ? 'this week' : 'today');
          if (lbState.q) bits.push(`“${lbState.q}”`);
          if (lbState.sort !== 'rank') bits.push('sorted by ' + ({ level: 'level', acc: 'accuracy', songs: 'songs' }[lbState.sort] || lbState.sort));
          label.textContent = bits.join(' · ');
        }
      }

      if (!data.length) {
        table.style.display = 'none';
        lbEmptyState();
        lbRenderPager(0, 0, 0);
        lbSyncUrl();
        return;
      }
      if (empty) empty.style.display = 'none';

      // The podium already shows ranks 1-3, so skip them in the table then.
      const rows = showPodium ? data.slice(3) : data;
      const pages = Math.max(1, Math.ceil(rows.length / LB_PER_PAGE));
      if (lbState.page > pages) lbState.page = pages;

      const start = (lbState.page - 1) * LB_PER_PAGE;
      const slice = rows.slice(start, start + LB_PER_PAGE);

      const me = safeGet('peu_uid');
      lbRenderHead();
      tbody.innerHTML = slice.map(function (p) {
        return isScore ? lbScoreRow(p, me) : lbAchRow(p, me);
      }).join('');

      table.style.display = 'table';
      lbRenderPager(rows.length, start + 1, start + slice.length);
      lbSyncUrl();
    }

    // Legacy names kept so older call sites keep working.
    function renderTable() { lbRenderAll(); }
    function renderAchTable() { lbRenderAll(); }

    // --- fetching -----------------------------------------------------------

    function lbHeaders() {
      return { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Accept': 'application/json' };
    }

    function lbStamp() {
      const el = document.getElementById('lb-upd');
      if (!el) return;
      const now = new Date();
      el.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    }

    async function fetchLB() {
      try {
        if (!allData.length) showLBLoading();

        const r = await fetch(`${SB_URL}/rest/v1/global_leaderboard?select=*`, { headers: lbHeaders() });

        if (!r.ok) {
          const errorText = await r.text().catch(function () { return ''; });
          console.error('Leaderboard fetch failed:', r.status, errorText);
          const err = new Error(`Supabase error ${r.status}`);
          err.status = r.status;
          err.body = errorText;
          throw err;
        }

        const data = await r.json();
        allData = lbAssignRanks(
          (Array.isArray(data) ? data : []).sort(function (a, b) {
            return parseFloat(b.ultra_points || 0) - parseFloat(a.ultra_points || 0);
          })
        );

        lbBuildCountryFilter();
        if (currentLBTab === 'score') lbRenderAll();
        lbStamp();
        loadMyRank();
      } catch (e) {
        console.error('fetchLB error:', e);
        const permission = e.status === 401 || e.status === 403 || /permission denied/i.test(e.body || '');
        showLBError(
          permission ? 'Leaderboard is temporarily unavailable' : 'Could not load the leaderboard',
          fetchLB,
          permission
            ? 'The ranking service is not accepting public requests right now — this is a server-side setting, not a problem with your account.'
            : undefined
        );
      }
    }

    async function fetchAchievementLB() {
      try {
        if (!achData.length) showLBLoading();

        const r = await fetch(`${SB_URL}/rest/v1/achievement_leaderboard?select=*&order=achievement_count.desc&limit=200`, { headers: lbHeaders() });

        if (!r.ok) {
          const errorText = await r.text().catch(function () { return ''; });
          console.error('Achievement LB fetch failed:', r.status, errorText);
          const err = new Error(`Supabase error ${r.status}`);
          err.status = r.status;
          err.body = errorText;
          throw err;
        }

        const data = await r.json();
        achData = lbAssignRanks((Array.isArray(data) ? data : []).filter(function (p) { return p.achievement_count > 0; }));

        lbBuildCountryFilter();
        if (currentLBTab === 'achievements') lbRenderAll();
        lbStamp();
      } catch (e) {
        console.error('fetchAchievementLB error:', e);
        const permission = e.status === 401 || e.status === 403 || /permission denied/i.test(e.body || '');
        showLBError(
          permission ? 'Achievements are temporarily unavailable' : 'Could not load achievements',
          fetchAchievementLB,
          permission
            ? 'The ranking service is not accepting public requests right now — this is a server-side setting, not a problem with your account.'
            : undefined
        );
      }
    }

    // --- "my rank" ----------------------------------------------------------

    async function loadMyRank() {
      const uid = safeGet('peu_uid');
      const card = document.getElementById('lb-my-rank');
      if (!uid || !currentUser) { if (card) card.style.display = 'none'; return; }

      const me = allData.find(function (p) { return lbPlayerId(p) === uid; });
      if (!me) {
        if (card) {
          card.style.display = 'flex';
          card.innerHTML = `
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-2xl bg-[#27253a] flex items-center justify-center text-violet-300"><i class="fa-solid fa-trophy" aria-hidden="true"></i></div>
              <div>
                <div class="text-sm font-semibold">You are not ranked yet</div>
                <div class="text-xs text-slate-400">Finish a song while signed in to appear on the board.</div>
              </div>
            </div>`;
        }
        return;
      }

      renderMyRankRow(me, me._rank);
    }

    // Pinned summary card above the table — always visible, whatever the filters.
    function renderMyRankRow(me, rank) {
      const card = document.getElementById('lb-my-rank');
      if (!card) return;

      const total = allData.length || 1;
      const pct = Math.max(0.1, Math.round((rank / total) * 1000) / 10);
      const flag = FLAGS[me.country] || '🌍';

      card.style.display = 'flex';
      card.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 flex-shrink-0 rounded-2xl overflow-hidden bg-[#27253a] flex items-center justify-center text-sm font-extrabold border border-violet-500/40">${lbAvatarHtml(me)}</div>
          <div class="min-w-0">
            <div class="text-sm font-semibold truncate">${escapeHtml(me.username || 'You')} <span class="text-violet-300 text-xs">(YOU)</span></div>
            <div class="text-xs text-slate-400">${flag} ${escapeHtml(me.country || 'Unknown')} · Lv.${me.level || 1} · ${formatUP(me.ultra_points)} UP</div>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="font-display text-xl font-bold text-violet-200">#${rank}</div>
          <div class="text-[11px] text-slate-400">top ${pct}%</div>
        </div>`;
    }

    // ===================== HERO STATS =====================
    async function loadHeroStats() {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/get_site_stats`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        if (r.ok) {
          const d = await r.json();
          if (d && d.total_players !== undefined) {
            document.getElementById('activePlayers').textContent = parseInt(d.total_players).toLocaleString();
            // total_downloads intentionally ignored here — the download stat is
            // owned by loadReleaseInfo() and comes from the GitHub API.
            return;
          }
        }
      } catch(e) {}
      
      // Fallback: use public_profiles view (RLS-safe, no email)
      try {
        const r = await fetch(`${SB_URL}/rest/v1/public_profiles?select=id`, {
          headers: { 'apikey': SB_KEY, 'Accept': 'application/json', 'Prefer': 'count=exact', 'Range': '0-0' }
        });

        const count = r.headers.get('content-range')?.split('/')[1];
        // Never invent a number: if the count is unavailable we simply keep the dash.
        document.getElementById('activePlayers').textContent = count ? parseInt(count).toLocaleString() : '—';
      } catch(e) {
        document.getElementById('activePlayers').textContent = '—';
      }
    }
    
    // ===================== TOKEN HELPERS =====================
    function isTokenExpired(token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 < Date.now() + 60000;
      } catch(e) { 
        return true; 
      }
    }
    
    async function refreshToken() {
      const refresh = safeGet('peu_refresh');
      if (!refresh) return null;
      
      try {
        const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh })
        });
        
        const d = await r.json();
        
        if (d.access_token) {
          safeSet('peu_token', d.access_token);
          safeSet('peu_refresh', d.refresh_token || refresh);
          return d.access_token;
        }
      } catch(e) {}
      return null;
    }
    
    async function getValidToken() {
      const token = safeGet('peu_token');
      if (!token) return null;
      
      if (isTokenExpired(token)) {
        const newToken = await refreshToken();
        if (!newToken) {
          signOut();
          return null;
        }
        return newToken;
      }
      return token;
    }
    
    // ===================== AUTO LOGIN =====================
    function autoLogin() {
      if (!storageAvailable) {
        console.log('[Further] Storage disabled (sandbox) — skipping auto-login.');
        return;
      }
      try {
        const token = safeGet('peu_token');
        const user = safeGet('peu_user');
        const email = safeGet('peu_email');
        const avatar = safeGet('peu_avatar');
        const banner = safeGet('peu_banner');
        
        if (token && user) {
          if (isTokenExpired(token)) {
            refreshToken().then(newToken => {
              if (newToken) {
                setLoggedIn(user, email || '', avatar || null, banner || null);
              } else {
                signOut();
              }
            }).catch(() => {});
          } else {
            setLoggedIn(user, email || '', avatar || null, banner || null);
          }
        }
      } catch (e) {
        console.warn('autoLogin guard:', e);
      }
    }
    
    // ===================== INITIALIZATION =====================
    // Credits icon bump animation (FNF heartbeat style) - now continuous loop
    function bumpIcon(el) {
      if (!el) return;
      el.classList.remove('fnf-bump');
      void el.offsetWidth; // force reflow
      el.classList.add('fnf-bump');
      // continuous via CSS infinite
    }

    // Auto-start continuous bump on credits icon
    function startCreditsBump() {
      const el = document.getElementById('credits-icon');
      if (el) {
        el.classList.remove('fnf-bump');
        void el.offsetWidth;
        el.classList.add('fnf-bump');
      }
    }

    // View any player's public profile (from leaderboard click)
    function viewPlayerProfile(playerId, username, avatarUrl, country, level, up, acc) {
      if (!playerId) return;

      const initials = (username || '?').substring(0, 2).toUpperCase();
      const flag = FLAGS[country] || '🌍';
      const lv = level || 1;
      const upVal = formatUP(up);
      const accVal = parseFloat(acc || 0).toFixed(1);

      // Create a nice floating profile viewer modal
      let viewer = document.getElementById('player-viewer');
      if (viewer) viewer.remove();

      viewer = document.createElement('div');
      viewer.id = 'player-viewer';
      viewer.className = 'fixed inset-0 bg-black/70 z-[95] flex items-center justify-center';
      viewer.innerHTML = `
        <div onclick="event.stopImmediatePropagation()" class="w-full max-w-[320px] mx-4 glass border border-white/10 rounded-3xl overflow-hidden">
          <div class="px-5 py-4 flex justify-between items-center border-b border-white/10">
            <div class="font-display text-lg font-semibold">Player Profile</div>
            <button onclick="document.getElementById('player-viewer').remove()" class="text-xl leading-none text-slate-400 hover:text-white">×</button>
          </div>
          
          <div class="p-5">
            <!-- Banner-like header (gradient fallback) -->
            <div class="h-20 w-full rounded-2xl mb-4 flex items-end p-3 bg-gradient-to-r from-violet-700/70 to-indigo-800/60" style="background-size:cover;background-position:center;">
              <div class="flex items-center gap-3 w-full">
                <div class="w-11 h-11 rounded-2xl overflow-hidden border border-white/20 flex-shrink-0 bg-violet-700 flex items-center justify-center">
                  ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='<span class=\\'font-bold text-lg\\'>${initials}</span>'">` : `<span class="font-bold text-lg">${initials}</span>`}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-lg leading-tight">${username}</div>
                  <div class="text-xs text-violet-200 flex items-center gap-1">
                    <span>${flag}</span> 
                    <span class="opacity-70">Lv.${lv}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="bg-[#161622] rounded-2xl p-3">
                <div class="text-[10px] text-slate-400">ULTRA POINTS</div>
                <div class="font-display text-xl font-bold text-violet-200">${upVal}</div>
              </div>
              <div class="bg-[#161622] rounded-2xl p-3">
                <div class="text-[10px] text-slate-400">ACCURACY</div>
                <div class="font-display text-xl font-bold">${accVal}%</div>
              </div>
            </div>

            <div class="mt-4 text-[10px] text-center text-slate-500">Rank data is live from the leaderboard</div>
          </div>
        </div>
      `;
      document.body.appendChild(viewer);
      viewer.onclick = () => viewer.remove();
    }

    // Increment total downloads counter (local + UI)
    // Download clicks are no longer faked into the counter.
    // The "GitHub downloads" stat comes straight from the GitHub Releases API
    // (see loadReleaseInfo), so it is always a real, verifiable number.
    function incrementDownloadCount() {
      showToast('Your download is starting…', 'ok');
    }

    function init() {
      try {
        initTailwindStyles();
        buildCountryOptions();
      
      // Attach event listeners for enter keys
      const lPass = document.getElementById('l-pass');
      if (lPass) {
        lPass.addEventListener('keydown', e => {
          if (e.key === 'Enter') doLogin();
        });
      }
      
      const lUser = document.getElementById('l-user');
      if (lUser) {
        lUser.addEventListener('keydown', e => {
          if (e.key === 'Enter') doLogin();
        });
      }
      
      // Close user menu on outside click
      document.addEventListener('click', function(e) {
        const menu = document.getElementById('user-menu');
        const pill = document.querySelector('#nav-auth-area .flex');
        
        if (!menu || menu.classList.contains('hidden')) return;
        
        if (pill && !pill.contains(e.target) && !menu.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
      
      // Load hero stats
      loadHeroStats();
      
      // Auto login
      autoLogin();
      
      // Initial page visible — but never fight the router: if it already opened
      // a deep-linked page (#/leaderboard, #/faq …), leave that one alone.
      if (!document.querySelector('.page.active')) {
        const homePage = document.getElementById('page-home');
        if (homePage) homePage.classList.add('active');

        const firstNav = document.querySelector('nav a[data-nav="home"]');
        if (firstNav) firstNav.classList.add('nav-active');
      }

      // Start continuous credits bump animation (looping)
      setTimeout(startCreditsBump, 800);
      
      // Periodic leaderboard refresh
      setInterval(() => {
        const page = document.getElementById('page-online');
        if (!lbLoaded || !page || !page.classList.contains('active')) return;
        if (document.hidden) return;                  // don't poll a background tab
        if (currentLBTab === 'score') fetchLB(); else fetchAchievementLB();
      }, 42000);
      
      // Real release data (version badge, per-platform links, download totals)
      loadReleaseInfo();

      // Restore leaderboard filters from the URL (#/leaderboard?country=Turkey&sort=level)
      lbEnsureUrlState();
      
      // A pasted/back-navigated leaderboard URL re-applies its filters.
      window.addEventListener('hashchange', function () {
        if ((window.location.hash || '').indexOf('#/leaderboard') !== 0) return;
        const previousTab = currentLBTab;
        lbReadUrl();
        const nextTab = currentLBTab;
        lbApplyUrlToControls();
        const select = document.getElementById('lb-country');
        if (select) select.value = lbState.country;

        if (nextTab !== previousTab) {
          currentLBTab = previousTab;   // let switchLBTab do the transition properly
          switchLBTab(nextTab);
        } else if (allData.length || achData.length) {
          lbRenderAll();
        }
      });

      // Escape closes whatever overlay is open (modal, profile, menus, mobile nav)
      document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('modal-overlay');
        const profile = document.getElementById('profile-modal-overlay');
        const nav = document.getElementById('mobile-nav');
        if (modal && !modal.classList.contains('hidden')) { closeModal(); return; }
        if (profile && !profile.classList.contains('hidden')) { closeProfileSettings(); return; }
        if (nav && !nav.classList.contains('hidden')) { closeMobileNav(); return; }
        closeUserMenu();
      });

      // Keyboard shortcut for leaderboard
      document.addEventListener('keydown', function(e) {
        if (e.key === '/' && document.activeElement.tagName === 'BODY') {
          e.preventDefault();
          showPage('online');
          setTimeout(() => {
            const search = document.getElementById('lb-search');
            if (search) search.focus();
          }, 500);
        }
      });

      // Attach download counter increment to ALL platform download cards pointing at GitHub Releases
      setTimeout(() => {
        // Primary Android card (inline onclick)
        const androidBtn = document.querySelector('a[onclick*="incrementDownloadCount"]');
        if (androidBtn) {
          androidBtn.addEventListener('click', () => {
            incrementDownloadCount();
          }, { once: true });
        }
        // Any other link that points to GitHub Releases = a download card click
        document.querySelectorAll('a[href*="github.com/"][href*="/releases/"]').forEach(a => {
          if (a.closest('#downloads')) {
            a.addEventListener('click', () => {
              incrementDownloadCount();
            }, { once: true });
          }
        });
      }, 800);
      
      console.log('%c[Further Engine] Modern website initialized.', 'color:#64748b');
      if (!storageAvailable) {
        const note = document.createElement('div');
        note.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);font-size:10px;background:#1e1b4b;color:#64748b;padding:2px 10px;border-radius:9999px;opacity:0.85;z-index:9999';
        note.textContent = 'Preview mode — storage limited';
        document.body.appendChild(note);
        setTimeout(() => note && note.remove(), 4200);
      }
      } catch(e) {
        console.warn('[Further Engine] Init error (sandboxed environment?)', e);
        // Still try to show home page
        const home = document.getElementById('page-home');
        if (home) home.classList.add('active');
      }
    }
    
    // Boot with extra safety
    window.onload = function() {
      try { init(); } catch(e) { console.error('Boot failed:', e); }
    };
    
    // Global helpers for debugging (optional)
    window.FurtherEngine = {
      showPage: showPage,
      fetchLB: fetchLB,
      SB_URL: SB_URL,
      SB_KEY: SB_KEY,
      FLAGS: FLAGS,
      getAvatarUrl: getAvatarUrl
    };
  