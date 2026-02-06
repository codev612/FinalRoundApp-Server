// Material Design Skeleton Utility Functions

function createSkeletonKpi() {
  const div = document.createElement('div');
  div.className = 'skeleton-kpi';
  div.innerHTML = `
    <div class="skeleton skeleton-text short"></div>
    <div class="skeleton skeleton-text medium" style="margin-top: 8px;"></div>
    <div class="skeleton bar" style="height: 10px; margin-top: 8px; border-radius: 999px;"></div>
  `;
  return div;
}

function createSkeletonKpis(count = 3) {
  const container = document.createElement('div');
  container.className = 'kpis';
  for (let i = 0; i < count; i++) {
    container.appendChild(createSkeletonKpi());
  }
  return container;
}

function createSkeletonChart() {
  const div = document.createElement('div');
  div.className = 'skeleton skeleton-chart';
  return div;
}

function createSkeletonTable(rows = 5, cols = 3) {
  const table = document.createElement('table');
  table.className = 'skeleton-table';
  
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let i = 0; i < cols; i++) {
    const th = document.createElement('th');
    th.innerHTML = '<div class="skeleton skeleton-text medium"></div>';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  for (let i = 0; i < rows; i++) {
    const tr = document.createElement('tr');
    for (let j = 0; j < cols; j++) {
      const td = document.createElement('td');
      td.innerHTML = '<div class="skeleton skeleton-text" style="width: ' + (j === cols - 1 ? '60%' : '80%') + ';"></div>';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  
  return table;
}

function createSkeletonPlan() {
  const div = document.createElement('div');
  div.className = 'skeleton-plan plan';
  div.innerHTML = `
    <div class="skeleton skeleton-text short" style="height: 20px; margin-bottom: 12px;"></div>
    <div class="skeleton skeleton-text long" style="height: 14px; margin: 8px 0;"></div>
    <div class="skeleton skeleton-text long" style="height: 14px; margin: 8px 0;"></div>
    <div class="skeleton skeleton-text long" style="height: 14px; margin: 8px 0;"></div>
    <div class="skeleton skeleton-text medium" style="height: 14px; margin: 8px 0;"></div>
  `;
  return div;
}

function createSkeletonPlans(count = 3) {
  const plans = [];
  for (let i = 0; i < count; i++) {
    plans.push(createSkeletonPlan());
  }
  return plans;
}

function createSkeletonSession() {
  const div = document.createElement('div');
  div.className = 'skeleton-session';
  div.innerHTML = `
    <div style="flex: 1;">
      <div class="skeleton skeleton-text short" style="height: 16px; margin-bottom: 6px;"></div>
      <div class="skeleton skeleton-text medium" style="height: 12px;"></div>
    </div>
    <div class="skeleton skeleton-rectangle" style="width: 80px; height: 32px;"></div>
  `;
  return div;
}

function createSkeletonSessions(count = 3) {
  const container = document.createElement('div');
  container.className = 'sessionsList';
  for (let i = 0; i < count; i++) {
    container.appendChild(createSkeletonSession());
  }
  return container;
}

function createSkeletonText(width = '100%') {
  const div = document.createElement('div');
  div.className = 'skeleton skeleton-text';
  div.style.width = width;
  return div;
}

function showSkeleton(elementId, skeletonElement) {
  const el = $(elementId);
  if (!el) return;
  el.innerHTML = '';
  if (skeletonElement instanceof HTMLElement) {
    el.appendChild(skeletonElement);
  } else if (typeof skeletonElement === 'string') {
    el.innerHTML = skeletonElement;
  }
}

function hideSkeleton(elementId) {
  const el = $(elementId);
  if (!el) return;
  // Remove skeleton classes and content
  const skeletons = el.querySelectorAll('.skeleton, .skeleton-kpi, .skeleton-chart, .skeleton-table, .skeleton-plan, .skeleton-session');
  skeletons.forEach(s => s.remove());
}
