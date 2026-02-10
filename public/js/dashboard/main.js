function routeMeta(route) {
  switch (route) {
    case 'overview': return { title: 'Overview', sub: 'Plan snapshot and quick actions' };
    case 'usage': return { title: 'Usage', sub: 'Plan, limits, and usage details' };
    case 'profile': return { title: 'Profile', sub: 'Update your account details' };
    case 'settings': return { title: 'Settings', sub: 'Preferences and account settings' };
    case 'spending': return { title: 'Spending', sub: 'Costs and usage spend' };
    case 'billing': return { title: 'Billing & invoices', sub: 'Plans and invoices' };
    case 'payment': return { title: 'Payment', sub: 'Subscribe with PayPal' };
    case 'manage': return { title: 'Manage Subscription', sub: 'Manage your current subscription' };
    case 'docs': return { title: 'Docs', sub: 'Product and API documentation' };
    case 'contact': return { title: 'Contact us', sub: 'Get help from support' };
    case 'notifications': return { title: 'Notifications', sub: 'All messages about your account' };
    default: return { title: 'Overview', sub: 'Plan snapshot and quick actions' };
  }
}

function routeFromHash() {
  const h = (window.location.hash || '').replace('#', '').trim();
  if (h === 'payment' || h.startsWith('payment/')) return 'payment';
  return h || 'overview';
}

function paymentPageSelectedPlan() {
  const h = (window.location.hash || '').replace('#', '').trim();
  if (h === 'payment/pro') return 'pro';
  if (h === 'payment/pro_plus') return 'pro_plus';
  return null;
}

function setRoute(route) {
  const r = route || 'overview';
  currentRoute = r;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById('view-' + r);
  if (view) view.classList.add('active');

  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
  const link = document.querySelector(`.nav a[data-route="${r}"]`);
  if (link) link.classList.add('active');
  // Payment and manage pages have no nav item; keep billing highlighted when on these pages
  if (r === 'payment' || r === 'manage') {
    const billingLink = document.querySelector('.nav a[data-route="billing"]');
    if (billingLink) billingLink.classList.add('active');
  }

  const meta = routeMeta(r);
  const pageTitle = $('pageTitle');
  const pageSub = $('pageSub');
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSub) pageSub.textContent = meta.sub;

  // Chart needs a visible canvas size to render correctly.
  if (r === 'overview') {
    if (Array.isArray(dailyPoints) && dailyPoints.length > 0) {
      setTimeout(() => drawDailyTokensChart(dailyPoints, 'dailyTokensChart'), 0);
    } else {
      loadDailyTokens();
    }
  }

  if (r === 'usage') {
    if (Array.isArray(dailyPoints) && dailyPoints.length > 0) {
      setTimeout(() => drawDailyTokensChart(dailyPoints, 'dailyTokensChartUsage'), 0);
    } else {
      loadDailyTokens();
    }
    loadMonthlyUsageTable();
  }

  if (r === 'settings') {
    loadAuthSessions();
  }

  if (r === 'profile') {
    if (typeof loadProfileMe === 'function') loadProfileMe();
  }

  if (r === 'billing') {
    loadInvoicesTable();
  }

  if (r === 'notifications') {
    if (typeof loadNotificationsPage === 'function') {
      loadNotificationsPage();
    }
  }

  if (r === 'manage') {
    // Ensure billing info is loaded (load() will automatically render subscription management)
    if (!billingInfoLoaded) {
      load();
    } else if (typeof window.renderSubscriptionManagement === 'function') {
      // Already loaded, just render with current data
      const subscription = window.__lastSubscriptionData || null;
      const planKey = window.__currentPlanKey || 'free';
      requestAnimationFrame(() => {
        window.renderSubscriptionManagement(subscription, planKey);
      });
    }
  }

  if (r === 'payment') {
    const selectedPlan = paymentPageSelectedPlan() || 'pro';
    const proEl = document.getElementById('payment-plan-pro');
    const proPlusEl = document.getElementById('payment-plan-pro_plus');
    const labelEl = document.getElementById('payment-plan-label');
    const msgEl = document.getElementById('payment-message');
    if (proEl) proEl.style.display = selectedPlan === 'pro' ? 'block' : 'none';
    if (proPlusEl) proPlusEl.style.display = selectedPlan === 'pro_plus' ? 'block' : 'none';
    if (labelEl) labelEl.textContent = 'Subscribe with your PayPal account or card.';
    if (msgEl) msgEl.style.display = 'none';
    // Clear container so PayPal re-renders into visible element (SDK often fails when container was hidden)
    const mount = document.getElementById('paypalBtn_' + selectedPlan);
    if (mount) {
      mount.innerHTML = '';
      mount.removeAttribute('data-rendered');
    }
    const render = () => {
      if (typeof window.renderPayPalUpgradeUi === 'function') {
        const subscription = window.__lastSubscriptionData || null;
        window.renderPayPalUpgradeUi(window.__currentPlanKey || null, selectedPlan, subscription);
      }
    };
    requestAnimationFrame(() => render());
  }
}

async function load() {
  clearErrors();
  const refreshBtn = $('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    refreshBtn.setAttribute('aria-busy', 'true');
    refreshBtn.setAttribute('title', 'Refreshing…');
  }
  billingInfoLoaded = false;

  // Load system notification badge (check for unread messages)
  if (typeof window.loadNotificationBadge === 'function') {
    await window.loadNotificationBadge();
  }

  // Show skeletons for KPIs (preserve structure, just show skeleton content)
  const planValueEl = $('planValue');
  const minutesValueEl = $('minutesValue');
  const tokensValueEl = $('tokensValue');
  const minutesBarEl = $('minutesBar');
  const tokensBarEl = $('tokensBar');
  const periodTextEl = $('periodText');
  
  if (planValueEl) {
    planValueEl.innerHTML = '<div class="skeleton skeleton-text" style="width: 60px; height: 18px;"></div>';
  }
  if (minutesValueEl) {
    minutesValueEl.innerHTML = '<div class="skeleton skeleton-text" style="width: 80px; height: 18px;"></div>';
  }
  if (tokensValueEl) {
    tokensValueEl.innerHTML = '<div class="skeleton skeleton-text" style="width: 100px; height: 18px;"></div>';
  }
  if (minutesBarEl) {
    minutesBarEl.style.width = '0%';
  }
  if (tokensBarEl) {
    tokensBarEl.style.width = '0%';
  }
  if (periodTextEl) {
    periodTextEl.innerHTML = '<div class="skeleton skeleton-text" style="width: 60%; height: 13px;"></div>';
  }
  
  // Show skeletons for plans
  const plansOverviewEl = $('plansOverview');
  if (plansOverviewEl && typeof createSkeletonPlans === 'function') {
    plansOverviewEl.innerHTML = '';
    const skeletonPlans = createSkeletonPlans(3);
    skeletonPlans.forEach(plan => plansOverviewEl.appendChild(plan));
  }
  
  const plansBillingEl = $('plansBilling');
  if (plansBillingEl && typeof createSkeletonPlans === 'function') {
    plansBillingEl.innerHTML = '';
    const skeletonPlans = createSkeletonPlans(3);
    skeletonPlans.forEach(plan => plansBillingEl.appendChild(plan));
  }

  try {
    const res = await fetch('/api/billing/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || ('HTTP ' + res.status);
      throw new Error(msg);
    }

    // User identity (name/email) for avatar dropdown.
    try {
      const name = String(data?.user?.name || '').trim();
      const email = String(data?.user?.email || userEmail || '').trim();
      const userNameTextEl = $('userNameText');
      const userEmailTextEl = $('userEmailText');
      const userAvatarTextEl = $('userAvatarText');
      const fallbackName = email ? String(email.split('@')[0] || '').trim() : '';
      if (userNameTextEl) userNameTextEl.textContent = name || fallbackName || '—';
      if (userEmailTextEl) userEmailTextEl.textContent = email || '—';
      const avatarSeed = (name || fallbackName || email || 'U').trim();
      if (userAvatarTextEl) userAvatarTextEl.textContent = (avatarSeed.slice(0, 1) || 'U').toUpperCase();
    } catch (_) {
      // ignore
    }

    // Clear skeleton content before setting values
    const planValueEl = $('planValue');
    const minutesValueEl = $('minutesValue');
    const tokensValueEl = $('tokensValue');
    const periodTextEl = $('periodText');
    
    if (planValueEl) planValueEl.innerHTML = '';
    if (minutesValueEl) minutesValueEl.innerHTML = '';
    if (tokensValueEl) tokensValueEl.innerHTML = '';
    if (periodTextEl) periodTextEl.innerHTML = '';
    
    setPeriodText(data);
    setKpi('', data); // overview ids
    // usage ids have a suffix; map via a small prefix trick
    // (we use explicit ids in the DOM, not dynamic creation)
    const minutesUsageEl = $('minutesValueUsage');
    const tokensUsageEl = $('tokensValueUsage');
    if (minutesUsageEl) minutesUsageEl.textContent = fmt((data.transcription || {}).remainingMinutes) + ' min';
    if (tokensUsageEl) tokensUsageEl.textContent = fmt((data.ai || {}).remainingTokens) + ' tokens';
    const t = data.transcription || {};
    const a = data.ai || {};
    const minutesBarUsage = $('minutesBarUsage');
    const tokensBarUsage = $('tokensBarUsage');
    if (minutesBarUsage) minutesBarUsage.style.width = clampPct(t.limitMinutes ? (100 * (t.usedMinutes / t.limitMinutes)) : 0) + '%';
    if (tokensBarUsage) tokensBarUsage.style.width = clampPct(a.limitTokens ? (100 * (a.usedTokens / a.limitTokens)) : 0) + '%';

    const planKey = String(data.plan || 'free');
    window.__currentPlanKey = planKey;
    window.__lastSubscriptionData = data.subscription || null;
    
    // Render plans - will re-render when API data loads if needed
    if (typeof renderPlansInto === 'function') {
      renderPlansInto('plansOverview', planKey);
      renderPlansInto('plansBilling', planKey, data.subscription || null);
    }
    if (currentRoute === 'payment' && typeof window.renderPayPalUpgradeUi === 'function') {
      const selectedPlan = paymentPageSelectedPlan() || 'pro';
      window.renderPayPalUpgradeUi(planKey, selectedPlan);
    }
    
    // Store subscription data for manage page
    window.__lastSubscriptionData = data.subscription || null;
    
    // Render subscription management UI on manage page
    if (currentRoute === 'manage' && typeof window.renderSubscriptionManagement === 'function') {
      window.renderSubscriptionManagement(data.subscription || null, planKey);
    }

    // Spending view snapshot
    const usedSpendEl = $('tokensUsedSpending');
    const remSpendEl = $('tokensRemainingSpending');
    const barSpendEl = $('tokensBarSpending');
    if (usedSpendEl) usedSpendEl.textContent = fmt(a.usedTokens) + ' / ' + fmt(a.limitTokens) + ' tokens';
    if (remSpendEl) remSpendEl.textContent = fmt(a.remainingTokens) + ' tokens';
    if (barSpendEl) {
      const tokPct = a.limitTokens ? (100 * (a.usedTokens / a.limitTokens)) : 0;
      barSpendEl.style.width = clampPct(tokPct) + '%';
    }

    // Initialize date pickers (allow selecting previous months; only cap max to today UTC).
    try {
      const bpStartIso = data.billingPeriod?.start;
      const bpEndIso = data.billingPeriod?.end; // end is exclusive start-of-next-period
      if (bpStartIso && bpEndIso) {
        const bpStart = new Date(bpStartIso);
        billingPeriodStartYmd = ymdUTC(bpStart);
        const today = ymdUTC(new Date());
        maxSelectableDay = today;
        // Keep minSelectableDay = null to allow selecting previous months.

        // Default date range reflects the active (30D) selection (ending today).
        const endYmd = maxSelectableDay;
        const startYmd = clampYmd(addDaysUTC(endYmd, -(chartRangeDays - 1)), minSelectableDay, maxSelectableDay);
        setDateInputs(startYmd, endYmd);
      }
    } catch (_) {
      // If parsing fails, inputs remain unconstrained.
    }

    billingInfoLoaded = true;
    loadDailyTokens();
    if (currentRoute === 'usage') {
      loadMonthlyUsageTable();
    }
  } catch (e) {
    // Clear skeleton content on error
    const planValueEl = $('planValue');
    const minutesValueEl = $('minutesValue');
    const tokensValueEl = $('tokensValue');
    const periodTextEl = $('periodText');
    
    if (planValueEl) planValueEl.innerHTML = '—';
    if (minutesValueEl) minutesValueEl.innerHTML = '—';
    if (tokensValueEl) tokensValueEl.innerHTML = '—';
    if (periodTextEl) periodTextEl.innerHTML = 'Loading…';
    
    showError(String(e.message || e));
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('loading');
      refreshBtn.removeAttribute('aria-busy');
      refreshBtn.setAttribute('title', 'Refresh');
    }
  }
}

// Wire events + init after DOM is parsed (this file is loaded with defer).
(() => {
  // Responsive sidebar drawer (mobile)
  const appRoot = $('appRoot');
  const sidebarToggleBtn = $('sidebarToggleBtn');
  const sidebarCloseBtn = $('sidebarCloseBtn');
  const sidebarBackdrop = $('sidebarBackdrop');

  function isSidebarOpen() {
    return !!(appRoot && appRoot.classList.contains('sidebarOpen'));
  }
  function setSidebarOpen(open) {
    if (!appRoot) return;
    appRoot.classList.toggle('sidebarOpen', !!open);
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (sidebarBackdrop) sidebarBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  function toggleSidebar() { setSidebarOpen(!isSidebarOpen()); }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', (e) => { e.preventDefault(); toggleSidebar(); });
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', (e) => { e.preventDefault(); setSidebarOpen(false); });
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));

  function signOut() {
    localStorage.removeItem('token');
    window.location.href = '/';
  }

  // Avatar + user menu
  const userMenuWrap = $('userMenuWrap');
  const userMenuBtn = $('userMenuBtn');
  const userMenu = $('userMenu');
  const userAvatarTextEl = $('userAvatarText');
  const userNameTextEl = $('userNameText');
  const userEmailTextEl = $('userEmailText');
  const menuSignOut = $('menuSignOut');

  const emailFallback = (typeof userEmail === 'string' ? userEmail : '').trim();
  const nameFallback = emailFallback ? String(emailFallback.split('@')[0] || '').trim() : '';
  if (userNameTextEl) userNameTextEl.textContent = nameFallback || '—';
  if (userEmailTextEl) userEmailTextEl.textContent = emailFallback || '—';
  if (userAvatarTextEl) userAvatarTextEl.textContent = (typeof userAvatarText === 'string' && userAvatarText.length ? userAvatarText : 'U');

  function closeUserMenu() {
    if (!userMenuWrap || !userMenuBtn || !userMenu) return;
    userMenuWrap.classList.remove('open');
    userMenuBtn.setAttribute('aria-expanded', 'false');
    userMenu.setAttribute('aria-hidden', 'true');
  }
  function toggleUserMenu() {
    if (!userMenuWrap || !userMenuBtn || !userMenu) return;
    const open = userMenuWrap.classList.toggle('open');
    userMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    userMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  if (userMenuBtn) userMenuBtn.addEventListener('click', (e) => { e.preventDefault(); toggleUserMenu(); });
  if (menuSignOut) menuSignOut.addEventListener('click', () => signOut());
  document.addEventListener('click', (e) => {
    if (!userMenuWrap) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (!userMenuWrap.contains(t)) closeUserMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserMenu();
      closeNotificationMenu();
      setSidebarOpen(false);
    }
  });

  // Notification bell menu
  const notificationMenuWrap = $('notificationMenuWrap');
  const notificationBellBtn = $('notificationBellBtn');
  const notificationMenu = $('notificationMenu');
  const notificationContent = $('notificationContent');
  const notificationBadge = $('notificationBadge');

  function closeNotificationMenu() {
    if (!notificationMenuWrap || !notificationBellBtn || !notificationMenu) return;
    notificationMenuWrap.classList.remove('open');
    notificationBellBtn.setAttribute('aria-expanded', 'false');
    notificationMenu.setAttribute('aria-hidden', 'true');
  }
  function toggleNotificationMenu() {
    if (!notificationMenuWrap || !notificationBellBtn || !notificationMenu) return;
    const open = notificationMenuWrap.classList.toggle('open');
    notificationBellBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    notificationMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    // Load notification content when opening
    if (open) {
      loadNotificationContent();
    }
  }

  let currentNotificationIds = [];

  async function loadNotificationBadge() {
    if (!notificationBadge) return;
    try {
      const res = await fetch('/api/notifications?limit=1&unreadOnly=true', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json().catch(() => ({}));
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      if (res.ok && notifications.length > 0) {
        notificationBadge.style.display = 'block';
        currentNotificationIds = notifications.map(n => n.id).filter(Boolean);
      } else {
        notificationBadge.style.display = 'none';
        currentNotificationIds = [];
      }
    } catch (_) {
      notificationBadge.style.display = 'none';
      currentNotificationIds = [];
    }
  }
  
  // Expose to window so load() can call it
  window.loadNotificationBadge = loadNotificationBadge;

  async function loadNotificationContent(showAll = false) {
    if (!notificationContent) return;
    try {
      const limit = showAll ? 100 : 3;
      const res = await fetch(`/api/notifications?limit=${limit}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json().catch(() => ({}));
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];

      if (res.ok && notifications.length > 0) {
        currentNotificationIds = notifications.map(n => n.id).filter(Boolean);

        const listHtml = notifications.map((n) => {
          const createdAt = n.createdAt ? new Date(n.createdAt) : null;
          const timeText = createdAt && Number.isFinite(createdAt.getTime())
            ? createdAt.toLocaleString()
            : '';
          const isRead = !!n.isRead;
          const bgColor = isRead ? 'rgba(0,0,0,0.02)' : 'rgba(25,118,210,0.06)';
          const borderColor = isRead ? 'rgba(0,0,0,0.04)' : 'rgba(25,118,210,0.25)';
          const buttonHtml = n.buttonUrl
            ? `<div style="margin-top:6px;"><a href="${escapeHtml(n.buttonUrl)}" target="_blank" rel="noopener noreferrer" class="notificationLinkBtn">${escapeHtml(n.buttonLabel || 'Open')}</a></div>`
            : '';
          return `
            <div style="padding:10px 10px; margin:4px 0; border-radius:8px; border:1px solid ${borderColor}; background:${bgColor};">
              ${timeText ? `<div style="font-size:12px; color:#555; margin-bottom:4px;">${escapeHtml(timeText)}</div>` : ''}
              <div style="white-space:pre-wrap; font-size:13px; color:#111;">${renderNotificationMessage(n.message || '')}</div>
              ${buttonHtml}
            </div>
          `;
        }).join('');

        notificationContent.innerHTML = `
          <div style="max-height:${showAll ? '320px' : '260px'}; overflow-y:auto; padding-right:4px;">
            ${listHtml}
          </div>
          ${
            showAll
              ? ''
              : '<button id="viewAllNotificationsBtn" class="menuItem" style="width:100%; text-align:center; border-top:1px solid rgba(0,0,0,0.08); background:transparent; font-size:12px; color:#4c1d95; text-decoration:underline;">View all messages</button>'
          }
        `;

        if (!showAll) {
          const viewAllBtn = document.getElementById('viewAllNotificationsBtn');
          if (viewAllBtn) {
            viewAllBtn.addEventListener('click', (e) => {
              e.preventDefault();
              // Navigate to full notifications page and ensure it loads
              window.location.hash = '#notifications';
              setRoute('notifications');
              if (typeof loadNotificationsPage === 'function') {
                loadNotificationsPage();
              }
              closeNotificationMenu();
            });
          }
        }

        // Mark all unread notifications in this batch as read
        const unreadIds = notifications
          .filter((n) => n.id && !n.isRead)
          .map((n) => n.id);
        if (unreadIds.length > 0) {
          try {
            await Promise.all(
              unreadIds.map((id) =>
                fetch('/api/notification/read', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                  },
                  body: JSON.stringify({ notificationId: id }),
                })
              )
            );
          } catch (_) {
            // ignore errors
          }
          // Refresh badge after marking as read
          loadNotificationBadge();
        }
      } else {
        notificationContent.innerHTML = '<div style="text-align:center; color:#757575; padding:20px;">No notifications</div>';
        currentNotificationIds = [];
      }
    } catch (_) {
      notificationContent.innerHTML = '<div style="text-align:center; color:#757575; padding:20px;">Failed to load notifications</div>';
      currentNotificationIds = [];
    }
  }

  // Full notifications page (route: #notifications)
  async function loadNotificationsPage() {
    const container = $('notificationsPageContent');
    if (!container) return;
    container.innerHTML = `
      <div class="loader">
        <div class="spinner"></div>
      </div>
    `;
    try {
      const res = await fetch('/api/notifications?limit=100', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json().catch(() => ({}));
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      if (!res.ok) {
        container.innerHTML = `<div class="error" style="display:block;">${escapeHtml(data.error || 'Failed to load notifications.')}</div>`;
        return;
      }
      if (notifications.length === 0) {
        container.innerHTML = '<div class="muted" style="padding:20px 0;">No notifications yet.</div>';
        return;
      }
      const itemsHtml = notifications.map((n) => {
        const createdAt = n.createdAt ? new Date(n.createdAt) : null;
        const timeText = createdAt && Number.isFinite(createdAt.getTime())
          ? createdAt.toLocaleString()
          : '';
        const isRead = !!n.isRead;
        const bgColor = isRead ? 'rgba(0,0,0,0.02)' : 'rgba(25,118,210,0.06)';
        const borderColor = isRead ? 'rgba(0,0,0,0.04)' : 'rgba(25,118,210,0.25)';
        const buttonHtml = n.buttonUrl
          ? `<div style="margin-top:6px;"><a href="${escapeHtml(n.buttonUrl)}" target="_blank" rel="noopener noreferrer" class="notificationLinkBtn">${escapeHtml(n.buttonLabel || 'Open')}</a></div>`
          : '';
        return `
          <div style="padding:10px 12px; margin:6px 0; border-radius:10px; border:1px solid ${borderColor}; background:${bgColor};">
            ${timeText ? `<div style="font-size:12px; color:#555; margin-bottom:4px;">${escapeHtml(timeText)}</div>` : ''}
            <div style="white-space:pre-wrap; font-size:13px; color:#111;">${renderNotificationMessage(n.message || '')}</div>
            ${buttonHtml}
          </div>
        `;
      }).join('');
      container.innerHTML = itemsHtml;
    } catch (e) {
      container.innerHTML = '<div class="error" style="display:block;">Failed to load notifications.</div>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Render notification message and auto-convert URLs into link buttons
  function renderNotificationMessage(raw) {
    if (typeof raw !== 'string' || !raw) return '';
    // Escape HTML first so user text is safe
    let escaped = escapeHtml(raw);
    // Simple URL detection (http/https)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    escaped = escaped.replace(urlRegex, (url) => {
      const safeUrl = url;
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="notificationLinkBtn">${safeUrl}</a>`;
    });
    return escaped;
  }

  if (notificationBellBtn) {
    notificationBellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleNotificationMenu();
    });
  }
  document.addEventListener('click', (e) => {
    if (!notificationMenuWrap) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (!notificationMenuWrap.contains(t)) closeNotificationMenu();
  });

  const refreshBtn = $('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', load);

  // Settings: active sessions + delete account
  const revokeOthersBtn = $('revokeOthersBtn');
  if (revokeOthersBtn) {
    revokeOthersBtn.addEventListener('click', async () => {
      const errEl = $('sessionsError');
      if (errEl) errEl.style.display = 'none';
      try {
        revokeOthersBtn.disabled = true;
        const res = await fetch('/api/auth/sessions/revoke-others', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
        await loadAuthSessions({ append: false });
      } catch (e) {
        if (errEl) {
          errEl.textContent = String(e.message || e);
          errEl.style.display = 'block';
        }
      } finally {
        revokeOthersBtn.disabled = false;
      }
    });
  }

  const sessionsShowMoreBtn = $('sessionsShowMoreBtn');
  if (sessionsShowMoreBtn) {
    sessionsShowMoreBtn.addEventListener('click', async () => {
      await loadAuthSessions({ append: true });
    });
  }

  const deletePasswordEl = $('deletePassword');
  const deleteConfirmEl = $('deleteConfirm');
  const deleteBtn = $('deleteAccountBtn');
  function updateDeleteBtn() {
    if (!deleteBtn) return;
    const p = String(deletePasswordEl?.value || '');
    const c = String(deleteConfirmEl?.value || '');
    deleteBtn.disabled = !(p.length > 0 && c === 'DELETE');
  }
  if (deletePasswordEl) deletePasswordEl.addEventListener('input', updateDeleteBtn);
  if (deleteConfirmEl) deleteConfirmEl.addEventListener('input', updateDeleteBtn);
  updateDeleteBtn();

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const errEl = $('deleteError');
      if (errEl) errEl.style.display = 'none';
      const password = String(deletePasswordEl?.value || '');
      const confirm = String(deleteConfirmEl?.value || '');
      try {
        deleteBtn.disabled = true;
        const res = await fetch('/api/auth/delete-account', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password, confirm }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
        localStorage.removeItem('token');
        window.location.href = '/';
      } catch (e) {
        if (errEl) {
          errEl.textContent = String(e.message || e);
          errEl.style.display = 'block';
        }
        updateDeleteBtn();
      }
    });
  }

  // Sidebar navigation + route switching
  window.addEventListener('hashchange', () => {
    setRoute(routeFromHash());
    setSidebarOpen(false);
  });
  window.addEventListener('resize', () => {
    if (currentRoute === 'overview' && Array.isArray(dailyPoints) && dailyPoints.length > 0) {
      drawDailyTokensChart(dailyPoints, 'dailyTokensChart');
    }
    if (currentRoute === 'usage' && Array.isArray(dailyPoints) && dailyPoints.length > 0) {
      drawDailyTokensChart(dailyPoints, 'dailyTokensChartUsage');
    }
  });

  // Range selector for chart
  const rangeEl = $('dailyRange');
  if (rangeEl) {
    rangeEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-days]');
      if (!btn) return;
      const days = parseInt(btn.getAttribute('data-days'), 10);
      if (!Number.isFinite(days) || days <= 0) return;
      chartRangeDays = days;
      chartStart = null;
      chartEnd = null;
      rangeEl.querySelectorAll('button[data-days]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Sync date inputs to match the quick range (ending today).
      if (maxSelectableDay) {
        const endYmd = maxSelectableDay;
        const startYmd = clampYmd(addDaysUTC(endYmd, -(chartRangeDays - 1)), minSelectableDay, maxSelectableDay);
        setDateInputs(startYmd, endYmd);
      }
      loadDailyTokens();
    });
  }

  // Custom date range apply
  const applyBtn = $('dailyApply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const errEl = $('dailyChartError');
      if (errEl) errEl.style.display = 'none';
      const s = $('dailyStart')?.value;
      const e = $('dailyEnd')?.value;
      if (!s || !e) return;
      const startYmd = clampYmd(s, minSelectableDay, maxSelectableDay);
      const endYmd = clampYmd(e, minSelectableDay, maxSelectableDay);
      if (startYmd > endYmd) {
        if (errEl) {
          errEl.textContent = 'Start date must be on or before end date.';
          errEl.style.display = 'block';
        }
        return;
      }
      chartStart = startYmd;
      chartEnd = endYmd;
      setDateInputs(chartStart, chartEnd);
      // Clear quick-range active state to avoid confusion.
      const rangeEl2 = $('dailyRange');
      if (rangeEl2) rangeEl2.querySelectorAll('button[data-days]').forEach(b => b.classList.remove('active'));
      loadDailyTokens();
    });
  }

  const nav = $('nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-route]');
      const quick = e.target.closest('a[data-route-link]');
      if (a) {
        setSidebarOpen(false);
        return;
      }
      if (quick) {
        const r = quick.getAttribute('data-route-link');
        if (r) window.location.hash = '#' + r;
      }
    });
  }

  setRoute(routeFromHash());
  load();
})();
