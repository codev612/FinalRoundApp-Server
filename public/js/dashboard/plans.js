function renderPlansInto(containerId, currentPlanKey, subscription = null) {
  const plansEl = $(containerId);
  if (!plansEl) return;
  plansEl.innerHTML = '';
  const currentIdx = planOffers.findIndex(p => p.key === currentPlanKey);
  planOffers.forEach((p, idx) => {
    const isCurrent = p.key === currentPlanKey;
    const div = document.createElement('div');
    div.className = 'plan' + (isCurrent ? ' current' : '');
    const isBilling = containerId === 'plansBilling';
    let actionBtn = '';
    if (isCurrent && isBilling) {
      // Show Manage button for paid plans with active subscription
      const isPaidPlan = currentPlanKey === 'pro' || currentPlanKey === 'pro_plus';
      const hasActiveSubscription = subscription && subscription.status && subscription.status.toUpperCase() === 'ACTIVE';
      if (isPaidPlan && hasActiveSubscription) {
        actionBtn = `<div class="paypalWrap" style="margin-top:10px;"><a href="#manage" class="btn btn-primary btn-sm">Manage</a></div>`;
      }
    } else if (!isCurrent && isBilling) {
      const hasActiveSubscription = subscription && subscription.status && subscription.status.toUpperCase() === 'ACTIVE';
      if (idx < currentIdx) {
        // Lower tier plan - show Downgrade
        if (hasActiveSubscription) {
          // If user has active subscription, use data attribute to trigger plan-change flow
          actionBtn = `<div class="paypalWrap" style="margin-top:10px;"><a href="#payment/${p.key}" class="btn btn-light btn-sm" data-plan-change="downgrade" data-target-plan="${p.key}">Downgrade</a></div>`;
        } else {
          // No active subscription, just navigate normally
          actionBtn = `<div class="paypalWrap" style="margin-top:10px;"><a href="#payment/${p.key}" class="btn btn-light btn-sm">Downgrade</a></div>`;
        }
      } else {
        // Higher tier plan - show Upgrade
        if (hasActiveSubscription) {
          // Active subscription: treat upgrade as plan change (cancel + new sub)
          actionBtn = `<div class="paypalWrap" style="margin-top:10px;"><a href="#payment/${p.key}" class="btn btn-primary btn-sm" data-plan-change="upgrade" data-target-plan="${p.key}">Upgrade</a></div>`;
        } else {
          actionBtn = `<div class="paypalWrap" style="margin-top:10px;"><a href="#payment/${p.key}" class="btn btn-primary btn-sm">Upgrade</a></div>`;
        }
      }
    }
    div.innerHTML = `
          <div class="name">${p.name}${isCurrent ? '<span class="badge">Current</span>' : ''}</div>
          <ul>
            <li>${fmt(p.minutes)} transcription minutes / month</li>
            <li>${fmt(p.tokens)} AI tokens / month</li>
            <li>${fmt(p.requests)} AI requests / month</li>
            <li>Summary: ${p.summary ? 'enabled' : 'not included'}</li>
          </ul>
          ${actionBtn}
        `;
    plansEl.appendChild(div);
  });
}

function setKpi(prefix, data) {
  const t = data.transcription || {};
  const a = data.ai || {};
  const plan = String(data.plan || 'free');
  const planDisplay = formatPlanName(plan);

  const planEl = $(prefix + 'planValue');
  const minutesEl = $(prefix + 'minutesValue');
  const minutesBarEl = $(prefix + 'minutesBar');
  const tokensEl = $(prefix + 'tokensValue');
  const tokensBarEl = $(prefix + 'tokensBar');

  if (planEl) planEl.textContent = planDisplay;
  if (minutesEl) minutesEl.textContent = fmt(t.remainingMinutes) + ' min';
  if (minutesBarEl) {
    const minPct = t.limitMinutes ? (100 * (t.usedMinutes / t.limitMinutes)) : 0;
    minutesBarEl.style.width = clampPct(minPct) + '%';
  }
  if (tokensEl) tokensEl.textContent = fmt(a.remainingTokens) + ' tokens';
  if (tokensBarEl) {
    const tokPct = a.limitTokens ? (100 * (a.usedTokens / a.limitTokens)) : 0;
    tokensBarEl.style.width = clampPct(tokPct) + '%';
  }
}

function setPeriodText(data) {
  const start = data.billingPeriod?.start || '—';
  const end = data.billingPeriod?.end || '—';
  const el = $('periodText');
  if (el) el.textContent = 'Billing period: ' + start + ' → ' + end;
}
