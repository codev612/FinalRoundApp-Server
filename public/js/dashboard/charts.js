function drawDailyTokensChart(points, canvasId) {
  const id = canvasId || 'dailyTokensChart';
  const canvas = $(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Resize to match CSS size (high-DPI safe)
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 46, padR = 16, padT = 12, padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  if (plotW <= 10 || plotH <= 10) return;

  const maxY = Math.max(10, ...points.map(p => p.tokens || 0));
  const minY = 0;
  const n = points.length;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.02)';
  ctx.fillRect(padL, padT, plotW, plotH);

  // Grid + Y labels
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';

  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + (plotH * i / ticks);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    const val = Math.round(maxY * (1 - i / ticks));
    ctx.fillText(val >= 1000 ? (Math.round(val / 1000) + 'k') : String(val), 6, y + 4);
  }

  // X labels (show every ~5th day)
  const step = Math.max(1, Math.round(n / 6));
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < n; i += step) {
    const x = padL + (plotW * (n === 1 ? 0 : i / (n - 1)));
    const day = points[i].date ? points[i].date.slice(-2) : '';
    ctx.fillText(day, x - 6, padT + plotH + 18);
  }

  // Line
  const toX = (i) => padL + (plotW * (n === 1 ? 0 : i / (n - 1)));
  const toY = (v) => padT + plotH - (plotH * ((v - minY) / (maxY - minY)));

  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = toX(i);
    const y = toY(points[i].tokens || 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Points
  ctx.fillStyle = '#8b5cf6';
  for (let i = 0; i < n; i++) {
    const x = toX(i);
    const y = toY(points[i].tokens || 0);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function loadDailyTokens() {
  return new Promise(async (resolve) => {
  const errEl = $('dailyChartError');
  if (errEl) errEl.style.display = 'none';
  
  // Show skeleton for chart
  const chartContainer = document.getElementById('dailyTokensChart')?.parentElement;
  const chartUsageContainer = document.getElementById('dailyTokensChartUsage')?.parentElement;
  
  if (chartContainer && typeof createSkeletonChart === 'function') {
    const canvas = $('dailyTokensChart');
    if (canvas) {
      canvas.style.display = 'none';
      const skeleton = createSkeletonChart();
      skeleton.id = 'skeleton-dailyTokensChart';
      chartContainer.insertBefore(skeleton, canvas);
    }
  }
  
  if (chartUsageContainer && typeof createSkeletonChart === 'function') {
    const canvas = $('dailyTokensChartUsage');
    if (canvas) {
      canvas.style.display = 'none';
      const skeleton = createSkeletonChart();
      skeleton.id = 'skeleton-dailyTokensChartUsage';
      chartUsageContainer.insertBefore(skeleton, canvas);
    }
  }
  
  try {
    const hasCustom = !!(chartStart && chartEnd);
    const url = hasCustom
      ? ('/api/billing/ai-daily-tokens?start=' + encodeURIComponent(chartStart) + '&end=' + encodeURIComponent(chartEnd))
      : ('/api/billing/ai-daily-tokens?days=' + encodeURIComponent(String(chartRangeDays)));
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    const days = Array.isArray(data.days) ? data.days : [];
    dailyPoints = days;
    
    // Hide skeletons and show charts
    const skeleton1 = document.getElementById('skeleton-dailyTokensChart');
    const skeleton2 = document.getElementById('skeleton-dailyTokensChartUsage');
    const canvas1 = $('dailyTokensChart');
    const canvas2 = $('dailyTokensChartUsage');
    
    if (skeleton1 && canvas1) {
      skeleton1.remove();
      canvas1.style.display = 'block';
    }
    if (skeleton2 && canvas2) {
      skeleton2.remove();
      canvas2.style.display = 'block';
    }
    
    drawDailyTokensChart(dailyPoints, 'dailyTokensChart');
    drawDailyTokensChart(dailyPoints, 'dailyTokensChartUsage');
    resolve();
  } catch (e) {
    // Remove skeletons on error
    const skeleton1 = document.getElementById('skeleton-dailyTokensChart');
    const skeleton2 = document.getElementById('skeleton-dailyTokensChartUsage');
    const canvas1 = $('dailyTokensChart');
    const canvas2 = $('dailyTokensChartUsage');
    
    if (skeleton1) skeleton1.remove();
    if (skeleton2) skeleton2.remove();
    if (canvas1) canvas1.style.display = 'block';
    if (canvas2) canvas2.style.display = 'block';
    
    if (errEl) {
      errEl.textContent = String(e.message || e);
      errEl.style.display = 'block';
    }
    resolve();
  }
  });
}
