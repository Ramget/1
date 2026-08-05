/**
 * LEDGER — Work Management System — Frontend
 * -----------------------------------------------------------------------
 * Vanilla JS. Talks to a Google Apps Script Web App via fetch/async-await.
 * No frameworks, no build step — just open index.html (or serve via
 * GitHub Pages) after setting API_URL below.
 * -----------------------------------------------------------------------
 */

// ⚠️ SET THIS to your deployed Apps Script Web App URL (…/exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbzlE2jiqOueOwMN0Qz7SuoRYN0z4W-maNgJFZOZKkwk_4nucrvqdNblo9xVUCBVwTXmQQ/exec';

const SESSION_KEY = 'ledger_session_v1';
const CACHE_KEY = 'ledger_lists_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes, mirrors backend cache TTL

// -------------------------------------------------------------------
// STATE
// -------------------------------------------------------------------
const state = {
  session: null,        // { id, name, mobileNumber, role }
  currentView: 'dashboard',
  lists: { clients: [], workTypes: [], paymentTypes: [] },
  data: { work: [], payment: [], task: [], amount: [], expense: [] },
  editing: { work: null, payment: null, task: null, amount: null, expense: null },
  activeTaskId: null,
  submitting: false
};

// -------------------------------------------------------------------
// API CLIENT
// -------------------------------------------------------------------
async function api(action, payload) {
  showLoading(true);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script Web Apps
      // cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload: payload || {} })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Something went wrong.');
    return json.data;
  } catch (err) {
    toast(err.message || 'Network error — please try again.', 'error');
    throw err;
  } finally {
    showLoading(false);
  }
}

function showLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !on);
}

// -------------------------------------------------------------------
// TOASTS
// -------------------------------------------------------------------
function toast(message, type) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, 2800);
}

// -------------------------------------------------------------------
// SESSION
// -------------------------------------------------------------------
function saveSession(session) {
  state.session = session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearSession() {
  state.session = null;
  localStorage.removeItem(SESSION_KEY);
}

function isAdmin() {
  return state.session && state.session.role === 'Admin';
}

function applyRoleVisibility() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', !admin);
  });
}

// -------------------------------------------------------------------
// LISTS (Clients / Work Types / Payment Types) — cached client-side
// -------------------------------------------------------------------
function readListCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.lists;
  } catch (e) { return null; }
}
function writeListCache(lists) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), lists }));
}

async function loadLists(force) {
  if (!force) {
    const cached = readListCache();
    if (cached) {
      state.lists = cached;
      populateListDropdowns();
      return;
    }
  }
  const [clients, workTypes, paymentTypes] = await Promise.all([
    api('getClients'),
    api('getWorkTypes'),
    api('getPaymentTypes')
  ]);
  state.lists = { clients, workTypes, paymentTypes };
  writeListCache(state.lists);
  populateListDropdowns();
}

function populateListDropdowns() {
  fillSelect('workClient', state.lists.clients, 'Select client');
  fillSelect('workType', state.lists.workTypes, 'Select work type');
  fillSelect('paymentType', state.lists.paymentTypes, 'Select payment type');
  fillSelect('amountType', state.lists.paymentTypes, 'Select payment type');
  renderChipList('clientChipList', state.lists.clients);
  renderChipList('workTypeChipList', state.lists.workTypes);
}

function fillSelect(id, values, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  ph.disabled = true;
  ph.selected = true;
  select.appendChild(ph);
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  if (values.indexOf(current) !== -1) select.value = current;
}

function renderChipList(id, values) {
  const ul = document.getElementById(id);
  ul.innerHTML = values.length
    ? values.map((v) => `<li>${escapeHtml(v)}</li>`).join('')
    : '<li>No entries yet</li>';
}

// -------------------------------------------------------------------
// UTIL
// -------------------------------------------------------------------
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function statusClass(status) {
  return 'status-' + String(status).replace(/\s+/g, '');
}

// -------------------------------------------------------------------
// LOGIN
// -------------------------------------------------------------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('loginSubmitBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.hidden = true;
  btn.disabled = true;
  try {
    const mobileNumber = document.getElementById('loginMobile').value.trim();
    const password = document.getElementById('loginPassword').value;
    const session = await api('loginUser', { mobileNumber, password });
    saveSession(session);
    await enterApp();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed.';
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    state.submitting = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('sheetLogoutBtn').addEventListener('click', logout);

function logout() {
  clearSession();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

async function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userName').textContent = state.session.name;
  document.getElementById('userRole').textContent = state.session.role;
  document.getElementById('userAvatar').textContent = (state.session.name || '?').charAt(0).toUpperCase();
  applyRoleVisibility();
  await loadLists(false);
  switchView('dashboard');
}

// -------------------------------------------------------------------
// VIEW ROUTING
// -------------------------------------------------------------------
const VIEW_TITLES = {
  dashboard: 'Dashboard', work: 'Work', payment: 'Payment',
  task: 'Task', amount: 'Amount', expense: 'Expense', settings: 'Settings'
};

document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('.bnav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.querySelectorAll('.sheet-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => { closeMoreSheet(); switchView(btn.dataset.view); });
});

function switchView(view) {
  if (view === 'amount' || view === 'settings') {
    if (!isAdmin()) { toast('Admins only.', 'error'); return; }
  }
  state.currentView = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.bnav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || '';
  document.getElementById('globalSearch').value = '';
  const searchable = ['work', 'payment', 'task', 'amount', 'expense'].indexOf(view) !== -1;
  document.getElementById('topbarSearch').classList.toggle('hidden', !searchable);

  loadViewData(view);
}

async function loadViewData(view) {
  try {
    if (view === 'dashboard') {
      const dash = await api('getDashboard');
      renderDashboard(dash);
    } else if (view === 'work') {
      state.data.work = await api('getWorkList');
      renderWorkTable();
    } else if (view === 'payment') {
      state.data.payment = await api('getPaymentList');
      renderPaymentTable();
    } else if (view === 'task') {
      state.data.task = await api('getTaskList');
      renderTaskTable();
    } else if (view === 'amount') {
      state.data.amount = await api('getAmountList');
      renderAmountTable();
    } else if (view === 'expense') {
      state.data.expense = await api('getExpenseList');
      renderExpenseTable();
    } else if (view === 'settings') {
      await loadLists(true);
    }
  } catch (e) { /* toast already shown by api() */ }
}

// -------------------------------------------------------------------
// MOBILE CHROME: menu toggle (sidebar drawer not needed — bottom nav
// covers primary nav on mobile), "More" sheet, search
// -------------------------------------------------------------------
document.getElementById('bnavMore').addEventListener('click', openMoreSheet);
document.getElementById('moreSheetBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'moreSheetBackdrop') closeMoreSheet();
});
function openMoreSheet() { document.getElementById('moreSheetBackdrop').classList.remove('hidden'); }
function closeMoreSheet() { document.getElementById('moreSheetBackdrop').classList.add('hidden'); }

document.getElementById('globalSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const view = state.currentView;
  if (view === 'work') renderWorkTable(q);
  else if (view === 'payment') renderPaymentTable(q);
  else if (view === 'task') renderTaskTable(q);
  else if (view === 'amount') renderAmountTable(q);
  else if (view === 'expense') renderExpenseTable(q);
});

// -------------------------------------------------------------------
// MODULE TABS (New entry / List) inside each view
// -------------------------------------------------------------------
document.querySelectorAll('.module-tabs').forEach((tabBar) => {
  const view = tabBar.closest('.view');
  tabBar.querySelectorAll('.module-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      tabBar.querySelectorAll('.module-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      view.querySelectorAll('.module-pane').forEach((p) => p.classList.remove('active'));
      view.querySelector(`.module-pane[data-pane="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
});
function showListTab(view) {
  const viewEl = document.getElementById('view-' + view);
  viewEl.querySelectorAll('.module-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'list'));
  viewEl.querySelectorAll('.module-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === 'list'));
}
function showFormTab(view) {
  const viewEl = document.getElementById('view-' + view);
  viewEl.querySelectorAll('.module-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'form'));
  viewEl.querySelectorAll('.module-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === 'form'));
}

// -------------------------------------------------------------------
// DASHBOARD RENDER
// -------------------------------------------------------------------
function renderDashboard(dash) {
  document.getElementById('statTotalPending').textContent = money(dash.totalPendingAmount);
  document.getElementById('statTotalPendingSub').textContent =
    `${money(dash.totalWork)} billed · ${money(dash.totalPayment)} received`;
  document.getElementById('statMonthExpense').textContent = money(dash.currentMonthExpense);
  document.getElementById('statBalance').textContent = money(dash.currentBalance);
  document.getElementById('statTaskPending').textContent = dash.taskSummary.pending;
  document.getElementById('statTaskProgress').textContent = dash.taskSummary.inProgress;
  document.getElementById('statTaskDone').textContent = dash.taskSummary.completed;

  const grid = document.getElementById('clientPendingGrid');
  if (!dash.clientWisePending.length) {
    grid.innerHTML = '<div class="empty-state">Add a client in Settings to see balances here.</div>';
  } else {
    grid.innerHTML = dash.clientWisePending.map(renderClientCard).join('');
  }

  const taskList = document.getElementById('pendingTaskList');
  if (!dash.pendingTasks.length) {
    taskList.innerHTML = '<div class="empty-state">No pending tasks — nice work.</div>';
  } else {
    taskList.innerHTML = dash.pendingTasks.map(renderTaskRow).join('');
    taskList.querySelectorAll('.task-row').forEach((row) => {
      row.addEventListener('click', () => openTaskModal(row.dataset.id, row.dataset.title));
    });
  }
}

function renderClientCard(c) {
  const total = c.workTotal > 0 ? c.workTotal : 1;
  const paidRatio = Math.max(0, Math.min(1, c.paymentTotal / total));
  const r = 22, circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - paidRatio);
  const pendingClass = c.pending <= 0 ? 'settled' : 'owing';
  return `
    <div class="client-card">
      <svg class="client-ring" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5"
          stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          transform="rotate(-90 28 28)"/>
        <text x="28" y="32" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${Math.round(paidRatio * 100)}%</text>
      </svg>
      <div class="client-info">
        <span class="client-name">${escapeHtml(c.client)}</span>
        <span class="client-pending ${pendingClass}">${c.pending <= 0 ? 'Settled' : money(c.pending) + ' due'}</span>
        <span class="client-breakdown">${money(c.workTotal)} billed · ${money(c.paymentTotal)} paid</span>
      </div>
    </div>`;
}

function renderTaskRow(t) {
  return `
    <div class="task-row" data-id="${t.id}" data-title="${escapeHtml(t.taskTitle)}">
      <span class="task-dot"></span>
      <span class="task-row-title">${escapeHtml(t.taskTitle)}</span>
      <span class="task-row-date">${escapeHtml(t.createdDate)}</span>
    </div>`;
}

// -------------------------------------------------------------------
// TASK STATUS MODAL (dashboard quick-update)
// -------------------------------------------------------------------
function openTaskModal(id, title) {
  state.activeTaskId = id;
  document.getElementById('taskModalTitle').textContent = 'Update task';
  document.getElementById('taskModalDesc').textContent = title;
  document.getElementById('taskModalStatus').value = 'Pending';
  document.getElementById('taskModalBackdrop').classList.remove('hidden');
}
document.getElementById('taskModalCancel').addEventListener('click', () => {
  document.getElementById('taskModalBackdrop').classList.add('hidden');
});
document.getElementById('taskModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'taskModalBackdrop') document.getElementById('taskModalBackdrop').classList.add('hidden');
});
document.getElementById('taskModalSave').addEventListener('click', async () => {
  const status = document.getElementById('taskModalStatus').value;
  try {
    await api('updateTask', { id: state.activeTaskId, taskStatus: status });
    toast('Task updated.', 'success');
    document.getElementById('taskModalBackdrop').classList.add('hidden');
    if (state.currentView === 'dashboard') loadViewData('dashboard');
  } catch (e) { /* handled */ }
});

// =====================================================================
// WORK MODULE
// =====================================================================
document.getElementById('workForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('workSubmitBtn');
  btn.disabled = true;
  try {
    const id = document.getElementById('workId').value;
    const payload = {
      clientName: document.getElementById('workClient').value,
      workType: document.getElementById('workType').value,
      workDescription: document.getElementById('workDescription').value,
      amount: parseFloat(document.getElementById('workAmount').value) || 0
    };
    if (id) {
      payload.id = id;
      await api('updateWork', payload);
      toast('Work entry updated.', 'success');
    } else {
      await api('addWork', payload);
      toast('Work entry saved.', 'success');
    }
    resetWorkForm();
    state.data.work = await api('getWorkList');
    renderWorkTable();
    showListTab('work');
  } catch (e) { /* handled */ }
  finally { btn.disabled = false; state.submitting = false; }
});
document.getElementById('workCancelBtn').addEventListener('click', resetWorkForm);

function resetWorkForm() {
  document.getElementById('workForm').reset();
  document.getElementById('workId').value = '';
  document.getElementById('workCancelBtn').hidden = true;
  document.getElementById('workSubmitBtn').textContent = 'Save work entry';
  state.editing.work = null;
}

function renderWorkTable(filter) {
  const tbody = document.querySelector('#workTable tbody');
  let rows = state.data.work;
  if (filter) {
    rows = rows.filter((r) => (r.clientName + r.workType + r.workDescription).toLowerCase().includes(filter));
  }
  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.createdDate)}</td>
      <td>${escapeHtml(r.clientName)}</td>
      <td>${escapeHtml(r.workType)}</td>
      <td>${escapeHtml(r.workDescription)}</td>
      <td class="num">${money(r.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty-state">No work entries yet.</td></tr>`;
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => editWorkEntry(tr.dataset.id));
  });
}

function editWorkEntry(id) {
  if (!isAdmin()) { toast('Only admins can edit work entries.', 'error'); return; }
  const record = state.data.work.find((r) => String(r.id) === String(id));
  if (!record) return;
  document.getElementById('workId').value = record.id;
  document.getElementById('workClient').value = record.clientName;
  document.getElementById('workType').value = record.workType;
  document.getElementById('workDescription').value = record.workDescription;
  document.getElementById('workAmount').value = record.amount;
  document.getElementById('workCancelBtn').hidden = false;
  document.getElementById('workSubmitBtn').textContent = 'Update work entry';
  showFormTab('work');
}

// =====================================================================
// PAYMENT MODULE (client name = searchable autocomplete, not dropdown)
// =====================================================================
const paymentClientInput = document.getElementById('paymentClient');
const paymentClientList = document.getElementById('paymentClientList');

paymentClientInput.addEventListener('input', () => {
  const q = paymentClientInput.value.trim().toLowerCase();
  if (!q) { paymentClientList.classList.remove('open'); return; }
  const matches = state.lists.clients.filter((c) => c.toLowerCase().includes(q));
  if (!matches.length) { paymentClientList.classList.remove('open'); return; }
  paymentClientList.innerHTML = matches.map((m) => `<div class="autocomplete-item">${escapeHtml(m)}</div>`).join('');
  paymentClientList.classList.add('open');
  paymentClientList.querySelectorAll('.autocomplete-item').forEach((item) => {
    item.addEventListener('click', () => {
      paymentClientInput.value = item.textContent;
      paymentClientList.classList.remove('open');
    });
  });
});
document.addEventListener('click', (e) => {
  if (!paymentClientInput.contains(e.target) && !paymentClientList.contains(e.target)) {
    paymentClientList.classList.remove('open');
  }
});

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('paymentSubmitBtn');
  btn.disabled = true;
  try {
    const id = document.getElementById('paymentId').value;
    const payload = {
      clientName: paymentClientInput.value.trim(),
      amount: parseFloat(document.getElementById('paymentAmount').value) || 0,
      paymentType: document.getElementById('paymentType').value,
      paymentReceivedDate: document.getElementById('paymentDate').value
    };
    if (id) {
      payload.id = id;
      await api('updatePayment', payload);
      toast('Payment updated.', 'success');
    } else {
      await api('addPayment', payload);
      toast('Payment saved.', 'success');
    }
    resetPaymentForm();
    state.data.payment = await api('getPaymentList');
    renderPaymentTable();
    showListTab('payment');
  } catch (e) { /* handled */ }
  finally { btn.disabled = false; state.submitting = false; }
});
document.getElementById('paymentCancelBtn').addEventListener('click', resetPaymentForm);

function resetPaymentForm() {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('paymentDate').value = todayISO();
  document.getElementById('paymentCancelBtn').hidden = true;
  document.getElementById('paymentSubmitBtn').textContent = 'Save payment';
  state.editing.payment = null;
}

function renderPaymentTable(filter) {
  const tbody = document.querySelector('#paymentTable tbody');
  let rows = state.data.payment;
  if (filter) rows = rows.filter((r) => (r.clientName + r.paymentType).toLowerCase().includes(filter));
  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.paymentReceivedDate)}</td>
      <td>${escapeHtml(r.clientName)}</td>
      <td>${escapeHtml(r.paymentType)}</td>
      <td class="num">${money(r.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="empty-state">No payments recorded yet.</td></tr>`;
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => editPaymentEntry(tr.dataset.id));
  });
}

function editPaymentEntry(id) {
  if (!isAdmin()) { toast('Only admins can edit payments.', 'error'); return; }
  const record = state.data.payment.find((r) => String(r.id) === String(id));
  if (!record) return;
  document.getElementById('paymentId').value = record.id;
  paymentClientInput.value = record.clientName;
  document.getElementById('paymentAmount').value = record.amount;
  document.getElementById('paymentType').value = record.paymentType;
  document.getElementById('paymentDate').value = record.paymentReceivedDate;
  document.getElementById('paymentCancelBtn').hidden = false;
  document.getElementById('paymentSubmitBtn').textContent = 'Update payment';
  showFormTab('payment');
}

// =====================================================================
// TASK MODULE
// =====================================================================
document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('taskSubmitBtn');
  btn.disabled = true;
  try {
    const id = document.getElementById('taskId').value;
    const payload = {
      taskTitle: document.getElementById('taskTitle').value,
      taskDescription: document.getElementById('taskDescription').value,
      taskStatus: document.getElementById('taskStatus').value
    };
    if (id) {
      payload.id = id;
      await api('updateTask', payload);
      toast('Task updated.', 'success');
    } else {
      await api('addTask', payload);
      toast('Task created.', 'success');
    }
    resetTaskForm();
    state.data.task = await api('getTaskList');
    renderTaskTable();
    showListTab('task');
  } catch (e) { /* handled */ }
  finally { btn.disabled = false; state.submitting = false; }
});
document.getElementById('taskCancelBtn').addEventListener('click', resetTaskForm);

function resetTaskForm() {
  document.getElementById('taskForm').reset();
  document.getElementById('taskId').value = '';
  document.getElementById('taskCancelBtn').hidden = true;
  document.getElementById('taskSubmitBtn').textContent = 'Save task';
  state.editing.task = null;
}

function renderTaskTable(filter) {
  const tbody = document.querySelector('#taskTable tbody');
  let rows = state.data.task;
  if (filter) rows = rows.filter((r) => (r.taskTitle + r.taskDescription).toLowerCase().includes(filter));
  const admin = isAdmin();
  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.createdDate)}</td>
      <td>${escapeHtml(r.taskTitle)}</td>
      <td><span class="status-pill ${statusClass(r.taskStatus)}">${escapeHtml(r.taskStatus)}</span></td>
      <td>${escapeHtml(r.taskCompletedDate || '—')}</td>
      <td class="admin-only ${admin ? '' : 'hidden'}"><button class="row-delete-btn" data-del="${r.id}" title="Delete task">✕</button></td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty-state">No tasks yet.</td></tr>`;

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.row-delete-btn')) return;
      editTaskEntry(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('.row-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!isAdmin()) { toast('Only admins can delete tasks.', 'error'); return; }
      if (!confirm('Delete this task? This cannot be undone.')) return;
      try {
        await api('deleteTask', { id: btn.dataset.del });
        toast('Task deleted.', 'success');
        state.data.task = await api('getTaskList');
        renderTaskTable();
      } catch (err) { /* handled */ }
    });
  });
}

function editTaskEntry(id) {
  const record = state.data.task.find((r) => String(r.id) === String(id));
  if (!record) return;
  document.getElementById('taskId').value = record.id;
  document.getElementById('taskTitle').value = record.taskTitle;
  document.getElementById('taskDescription').value = record.taskDescription;
  document.getElementById('taskStatus').value = record.taskStatus;
  document.getElementById('taskCancelBtn').hidden = false;
  document.getElementById('taskSubmitBtn').textContent = 'Update task';
  showFormTab('task');
}

// =====================================================================
// AMOUNT MODULE (admin only)
// =====================================================================
document.getElementById('amountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('amountSubmitBtn');
  btn.disabled = true;
  try {
    const id = document.getElementById('amountId').value;
    const payload = {
      payer: document.getElementById('amountPayer').value,
      amount: parseFloat(document.getElementById('amountValue').value) || 0,
      paymentType: document.getElementById('amountType').value
    };
    if (id) {
      payload.id = id;
      await api('updateAmount', payload);
      toast('Amount entry updated.', 'success');
    } else {
      await api('addAmount', payload);
      toast('Amount entry saved.', 'success');
    }
    resetAmountForm();
    state.data.amount = await api('getAmountList');
    renderAmountTable();
    showListTab('amount');
  } catch (e) { /* handled */ }
  finally { btn.disabled = false; state.submitting = false; }
});
document.getElementById('amountCancelBtn').addEventListener('click', resetAmountForm);

function resetAmountForm() {
  document.getElementById('amountForm').reset();
  document.getElementById('amountId').value = '';
  document.getElementById('amountCancelBtn').hidden = true;
  document.getElementById('amountSubmitBtn').textContent = 'Save amount';
  state.editing.amount = null;
}

function renderAmountTable(filter) {
  const tbody = document.querySelector('#amountTable tbody');
  let rows = state.data.amount;
  if (filter) rows = rows.filter((r) => (r.payer + r.paymentType).toLowerCase().includes(filter));
  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.createdDate)}</td>
      <td>${escapeHtml(r.payer)}</td>
      <td>${escapeHtml(r.paymentType)}</td>
      <td class="num">${money(r.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="empty-state">No amount entries yet.</td></tr>`;
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => editAmountEntry(tr.dataset.id));
  });
}

function editAmountEntry(id) {
  const record = state.data.amount.find((r) => String(r.id) === String(id));
  if (!record) return;
  document.getElementById('amountId').value = record.id;
  document.getElementById('amountPayer').value = record.payer;
  document.getElementById('amountValue').value = record.amount;
  document.getElementById('amountType').value = record.paymentType;
  document.getElementById('amountCancelBtn').hidden = false;
  document.getElementById('amountSubmitBtn').textContent = 'Update amount';
  showFormTab('amount');
}

// =====================================================================
// EXPENSE MODULE
// =====================================================================
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.submitting) return;
  state.submitting = true;
  const btn = document.getElementById('expenseSubmitBtn');
  btn.disabled = true;
  try {
    const id = document.getElementById('expenseId').value;
    const payload = {
      expenseItem: document.getElementById('expenseItem').value,
      amount: parseFloat(document.getElementById('expenseAmount').value) || 0
    };
    if (id) {
      payload.id = id;
      await api('updateExpense', payload);
      toast('Expense updated.', 'success');
    } else {
      await api('addExpense', payload);
      toast('Expense saved.', 'success');
    }
    resetExpenseForm();
    state.data.expense = await api('getExpenseList');
    renderExpenseTable();
    showListTab('expense');
  } catch (e) { /* handled */ }
  finally { btn.disabled = false; state.submitting = false; }
});
document.getElementById('expenseCancelBtn').addEventListener('click', resetExpenseForm);

function resetExpenseForm() {
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseId').value = '';
  document.getElementById('expenseCancelBtn').hidden = true;
  document.getElementById('expenseSubmitBtn').textContent = 'Save expense';
  state.editing.expense = null;
}

function renderExpenseTable(filter) {
  const tbody = document.querySelector('#expenseTable tbody');
  let rows = state.data.expense;
  if (filter) rows = rows.filter((r) => r.expenseItem.toLowerCase().includes(filter));
  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.createdDate)}</td>
      <td>${escapeHtml(r.expenseItem)}</td>
      <td class="num">${money(r.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="3" class="empty-state">No expenses recorded yet.</td></tr>`;
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => editExpenseEntry(tr.dataset.id));
  });
}

function editExpenseEntry(id) {
  const record = state.data.expense.find((r) => String(r.id) === String(id));
  if (!record) return;
  document.getElementById('expenseId').value = record.id;
  document.getElementById('expenseItem').value = record.expenseItem;
  document.getElementById('expenseAmount').value = record.amount;
  document.getElementById('expenseCancelBtn').hidden = false;
  document.getElementById('expenseSubmitBtn').textContent = 'Update expense';
  showFormTab('expense');
}

// =====================================================================
// SETTINGS — Client & Work Type management
// =====================================================================
document.getElementById('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newClientName');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('addClient', { name });
    toast('Client added.', 'success');
    input.value = '';
    await loadLists(true);
  } catch (err) { /* handled */ }
});

document.getElementById('workTypeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newWorkTypeName');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('addWorkType', { name });
    toast('Work type added.', 'success');
    input.value = '';
    await loadLists(true);
  } catch (err) { /* handled */ }
});

// -------------------------------------------------------------------
// BOOTSTRAP
// -------------------------------------------------------------------
(function init() {
  document.getElementById('paymentDate').value = todayISO();
  const existing = loadSession();
  if (existing) {
    state.session = existing;
    enterApp();
  }
})();
