let _paypalConfigPromise = null;
let _paypalSdkPromise = null;

async function loadPayPalConfig() {
  if (_paypalConfigPromise) return _paypalConfigPromise;
  _paypalConfigPromise = (async () => {
    const res = await fetch('/api/billing/paypal/config', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  })();
  return _paypalConfigPromise;
}

function ensurePayPalSdkLoaded(clientId) {
  if (_paypalSdkPromise) return _paypalSdkPromise;
  _paypalSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paypal-sdk="1"]');
    if (existing && window.paypal) return resolve(window.paypal);

    const s = document.createElement('script');
    s.setAttribute('data-paypal-sdk', '1');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&disable-funding=credit,paylater,venmo`;
    s.async = true;
    s.onload = () => resolve(window.paypal);
    s.onerror = () => reject(new Error('Failed to load PayPal SDK'));
    document.head.appendChild(s);
  });
  return _paypalSdkPromise;
}

async function attachSubscription(subscriptionId) {
  const res = await fetch('/api/billing/paypal/attach-subscription', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscriptionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
  return data;
}

function showPaymentMessage(message, isSuccess) {
  const msgEl = document.getElementById('payment-message');
  if (!msgEl) return;
  msgEl.style.display = 'block';
  msgEl.textContent = message;
  msgEl.style.background = isSuccess ? '#e8f5e9' : '#ffebee';
  msgEl.style.color = isSuccess ? '#2e7d32' : '#c62828';
  msgEl.style.border = `1px solid ${isSuccess ? '#4caf50' : '#ef5350'}`;
}

function hidePaymentMessage() {
  const msgEl = document.getElementById('payment-message');
  if (msgEl) msgEl.style.display = 'none';
}

async function renderPayPalForPlan(planKey, planId) {
  const mount = document.getElementById(`paypalBtn_${planKey}`);
  const note = document.getElementById(`paypalNote_${planKey}`);
  if (!mount) return;
  if (mount.getAttribute('data-rendered') === '1') return;

  if (!planId) {
    if (note) note.textContent = 'PayPal plan_id not configured on server.';
    showPaymentMessage('PayPal plan_id not configured on server.', false);
    return;
  }

  const cfg = await loadPayPalConfig();
  if (!cfg.enabled) {
    if (note) note.textContent = 'PayPal is not enabled on this server.';
    showPaymentMessage('PayPal is not enabled on this server.', false);
    return;
  }

  const paypal = await ensurePayPalSdkLoaded(cfg.clientId);
  if (!paypal || !paypal.Buttons) {
    if (note) note.textContent = 'PayPal SDK not available.';
    showPaymentMessage('PayPal SDK not available.', false);
    return;
  }

  mount.setAttribute('data-rendered', '1');
  paypal.Buttons({
    style: { layout: 'vertical', label: 'subscribe' },
    createSubscription: (_data, actions) => actions.subscription.create({
      plan_id: planId,
      subscriber: {},
      application_context: {
        brand_name: "FinalRoundApp",
        shipping_preference: 'NO_SHIPPING',
        phone_required: false,
        return_url: 'https://app.finalroundapp.com/dashboard',
        cancel_url: 'https://app.finalroundapp.com/dashboard'
      }
    }),
    onApprove: async (data) => {
      try {
        hidePaymentMessage();
        if (note) note.textContent = 'Finalizing subscription…';
        const result = await attachSubscription(data.subscriptionID);
        const planName = formatPlanName(result.plan || planKey);
        showPaymentMessage(`✓ Subscription activated successfully! Your plan is now ${planName}. Refreshing…`, true);
        if (note) note.textContent = 'Subscription activated. Refreshing…';
        if (typeof load === 'function') {
          await load();
          setTimeout(() => {
            showPaymentMessage(`✓ Subscription activated successfully! Your plan is now ${planName}.`, true);
          }, 500);
        }
      } catch (e) {
        const errorMsg = String(e.message || e);
        showPaymentMessage(`✗ Subscription failed: ${errorMsg}`, false);
        if (note) note.textContent = errorMsg;
        mount.removeAttribute('data-rendered');
      }
    },
    onError: (err) => {
      const errorMsg = String(err && (err.message || err) || 'PayPal error');
      showPaymentMessage(`✗ Payment error: ${errorMsg}`, false);
      if (note) note.textContent = errorMsg;
      mount.removeAttribute('data-rendered');
    },
    onCancel: () => {
      showPaymentMessage('Payment cancelled. You can try again anytime.', false);
    },
  }).render(mount);
}

async function renderPayPalUpgradeUi(currentPlanKey, selectedPlan) {
  try {
    const cfg = await loadPayPalConfig();
    if (!cfg.enabled) {
      ['pro', 'pro_plus'].forEach((k) => {
        const note = document.getElementById(`paypalNote_${k}`);
        if (note) note.textContent = 'PayPal not configured (missing env vars).';
      });
      return;
    }

    const plansToRender = selectedPlan
      ? [selectedPlan]
      : ['pro', 'pro_plus'];
    for (const planKey of plansToRender) {
      if (currentPlanKey !== planKey) {
        await renderPayPalForPlan(planKey, cfg.planIds?.[planKey]);
      }
    }
  } catch (e) {
    ['pro', 'pro_plus'].forEach((k) => {
      const note = document.getElementById(`paypalNote_${k}`);
      if (note) note.textContent = String(e.message || e);
    });
  }
}

function showCancelSubscriptionModal() {
  const modal = document.getElementById('cancel-subscription-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideCancelSubscriptionModal() {
  const modal = document.getElementById('cancel-subscription-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function performCancelSubscription() {
  const msgEl = document.getElementById('subscription-message');
  const btnEl = document.getElementById('cancel-subscription-btn');
  
  hideCancelSubscriptionModal();
  
  if (!btnEl) return;
  
  btnEl.disabled = true;
  if (msgEl) {
    msgEl.style.display = 'none';
  }
  
  try {
    const res = await fetch('/api/billing/paypal/cancel-subscription', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        reason: 'User requested cancellation via dashboard',
        cancelAtPeriodEnd: true, // Always cancel at end of period
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || ('HTTP ' + res.status));
    }
    
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.textContent = '✓ Subscription will be cancelled at the end of your billing period. You will continue to have access until then.';
      msgEl.style.background = '#e8f5e9';
      msgEl.style.color = '#2e7d32';
      msgEl.style.border = '1px solid #4caf50';
    }
    
    // Refresh billing info to update plan
    if (typeof load === 'function') {
      await load();
    }
  } catch (e) {
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.textContent = '✗ Failed to cancel subscription: ' + String(e.message || e);
      msgEl.style.background = '#ffebee';
      msgEl.style.color = '#c62828';
      msgEl.style.border = '1px solid #ef5350';
    }
  } finally {
    btnEl.disabled = false;
  }
}

function cancelSubscription() {
  showCancelSubscriptionModal();
}

function showDowngradeModal(targetPlan, changeType) {
  const modal = document.getElementById('downgrade-modal');
  if (modal) {
    modal.setAttribute('data-target-plan', targetPlan);
    modal.setAttribute('data-change-type', changeType || 'change');
    modal.style.display = 'flex';
    // Clear any previous messages
    const msgEl = document.getElementById('downgrade-message');
    if (msgEl) {
      msgEl.style.display = 'none';
    }
  }
}

function hideDowngradeModal() {
  const modal = document.getElementById('downgrade-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.removeAttribute('data-target-plan');
    modal.removeAttribute('data-change-type');
  }
}

async function performDowngrade() {
  const modal = document.getElementById('downgrade-modal');
  const targetPlan = modal?.getAttribute('data-target-plan');
  const changeType = modal?.getAttribute('data-change-type') || 'change';
  const msgEl = document.getElementById('downgrade-message');
  const confirmBtn = document.getElementById('downgrade-modal-confirm-btn');
  const cancelBtn = document.getElementById('downgrade-modal-cancel-btn');
  
  if (!targetPlan) return;
  
  if (confirmBtn) confirmBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  if (msgEl) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'Cancelling current subscription…';
    msgEl.style.background = '#fff3cd';
    msgEl.style.color = '#856404';
    msgEl.style.border = '1px solid #ffc107';
  }
  
  try {
    // Cancel current subscription immediately (for plan change, we cancel immediately)
    const cancelRes = await fetch('/api/billing/paypal/cancel-subscription', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        reason: changeType === 'downgrade'
          ? 'Downgrade to lower tier plan'
          : changeType === 'upgrade'
            ? 'Upgrade to higher tier plan'
            : 'Change subscription plan',
        cancelAtPeriodEnd: false, // Immediate cancellation for plan change
        isDowngrade: changeType === 'downgrade',
        isUpgrade: changeType === 'upgrade',
      }),
    });
    
    const cancelData = await cancelRes.json().catch(() => ({}));
    if (!cancelRes.ok) {
      throw new Error(cancelData.error || cancelData.message || ('HTTP ' + cancelRes.status));
    }
    
    if (msgEl) {
      const refunded = cancelData.refunded === true;
      let message = '✓ Current subscription cancelled.';
      if (refunded) {
        message += ' A refund has been processed.';
      }
      message += ' Redirecting to payment page…';
      msgEl.textContent = message;
      msgEl.style.background = '#e8f5e9';
      msgEl.style.color = '#2e7d32';
      msgEl.style.border = '1px solid #4caf50';
    }
    
    // Refresh billing info
    if (typeof load === 'function') {
      await load();
    }
    
    // Navigate to payment page for the target plan after a short delay
    setTimeout(() => {
      hideDowngradeModal();
      window.location.hash = `#payment/${targetPlan}`;
    }, 1000);
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = '✗ Failed to cancel subscription: ' + String(e.message || e);
      msgEl.style.background = '#ffebee';
      msgEl.style.color = '#c62828';
      msgEl.style.border = '1px solid #ef5350';
    }
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

function renderSubscriptionManagement(subscription, plan) {
  const infoEl = document.getElementById('subscription-info');
  const btnEl = document.getElementById('cancel-subscription-btn');
  const msgEl = document.getElementById('subscription-message');
  
  if (!infoEl || !btnEl) return;
  
  // Only show for paid plans (pro or pro_plus) with active subscription
  const isPaidPlan = plan === 'pro' || plan === 'pro_plus';
  const hasActiveSubscription = subscription && subscription.status && subscription.status.toUpperCase() === 'ACTIVE';
  
  if (!isPaidPlan || !hasActiveSubscription) {
    infoEl.textContent = 'No active subscription found.';
    btnEl.style.display = 'none';
    return;
  }
  
  // Format next billing time
  let nextBillingText = '';
  if (subscription.nextBillingTime) {
    try {
      const nextBilling = new Date(subscription.nextBillingTime);
      nextBillingText = `Next billing: ${nextBilling.toLocaleDateString()} ${nextBilling.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (_) {
      nextBillingText = `Next billing: ${subscription.nextBillingTime}`;
    }
  }
  
  const planName = formatPlanName(plan);
  const cancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;
  const statusText = cancelAtPeriodEnd ? 'Active (Cancelling at period end)' : subscription.status;
  
  infoEl.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Plan:</strong> ${planName}</div>
    <div style="margin-bottom:8px;"><strong>Status:</strong> ${statusText}</div>
    ${cancelAtPeriodEnd ? '<div style="margin-bottom:8px; padding:8px; background:rgba(255,193,7,0.15); border-radius:6px; color:#ffc107; font-size:13px;"><strong>⚠ Cancellation scheduled:</strong> Your subscription will be cancelled at the end of your billing period.</div>' : ''}
    ${nextBillingText ? `<div><strong>${nextBillingText}</strong></div>` : ''}
  `;
  
  // Hide cancel button if already scheduled for cancellation
  if (cancelAtPeriodEnd) {
    btnEl.style.display = 'none';
  } else {
    btnEl.style.display = 'block';
    btnEl.onclick = cancelSubscription;
  }
  
  if (msgEl) {
    msgEl.style.display = 'none';
  }
}

// Initialize downgrade modal handlers
(function initDowngradeModal() {
  const modal = document.getElementById('downgrade-modal');
  const confirmBtn = document.getElementById('downgrade-modal-confirm-btn');
  const cancelBtn = document.getElementById('downgrade-modal-cancel-btn');
  
  if (modal && confirmBtn && cancelBtn) {
    // Close modal when clicking overlay
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideDowngradeModal();
      }
    });
    
    // Confirm button
    confirmBtn.addEventListener('click', () => {
      performDowngrade();
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
      hideDowngradeModal();
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        hideDowngradeModal();
      }
    });
  }
  
  // Intercept plan-change (upgrade/downgrade) link clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-plan-change]');
    if (link) {
      e.preventDefault();
      const targetPlan = link.getAttribute('data-target-plan');
      const changeType = link.getAttribute('data-plan-change') || 'change';
      if (targetPlan) {
        showDowngradeModal(targetPlan, changeType);
      }
    }
  });
})();

// Initialize cancel subscription modal handlers
(function initCancelModal() {
  const modal = document.getElementById('cancel-subscription-modal');
  const confirmBtn = document.getElementById('cancel-modal-confirm-btn');
  const cancelBtn = document.getElementById('cancel-modal-cancel-btn');
  
  if (modal && confirmBtn && cancelBtn) {
    // Close modal when clicking overlay
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideCancelSubscriptionModal();
      }
    });
    
    // Confirm button
    confirmBtn.addEventListener('click', () => {
      performCancelSubscription();
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
      hideCancelSubscriptionModal();
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        hideCancelSubscriptionModal();
      }
    });
  }
})();

window.renderPayPalUpgradeUi = renderPayPalUpgradeUi;
window.renderSubscriptionManagement = renderSubscriptionManagement;
window.cancelSubscription = cancelSubscription;
window.showCancelSubscriptionModal = showCancelSubscriptionModal;
window.hideCancelSubscriptionModal = hideCancelSubscriptionModal;
window.performCancelSubscription = performCancelSubscription;
window.showDowngradeModal = showDowngradeModal;
window.hideDowngradeModal = hideDowngradeModal;
window.performDowngrade = performDowngrade;
