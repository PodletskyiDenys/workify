const DAYS  = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DATES = ['17', '18', '19', '20', '21', '22', '23']; 

let state = {
  currentUser: null,

  users: [
    { id: 1, name: 'Анна Коваленко',  email: 'anna@workify.ua',   password: 'anna123',   role: 'employee', initials: 'АК' },
    { id: 2, name: 'Каріна Мельник',  email: 'karina@workify.ua', password: 'karina123', role: 'employee', initials: 'КМ' },
    { id: 3, name: 'Менеджер',         email: 'admin@workify.ua',  password: 'admin123',  role: 'admin',    initials: 'МН' },
  ],

  shifts: [
    { id: 1, userId: 1, employeeName: 'Анна Коваленко', date: '2025-02-17', start: '08:00', end: '16:00', type: 'anna' },
    { id: 2, userId: 1, employeeName: 'Анна Коваленко', date: '2025-02-19', start: '12:00', end: '20:00', type: 'anna' },
    { id: 3, userId: 2, employeeName: 'Каріна Мельник', date: '2025-02-18', start: '08:00', end: '16:00', type: 'karina' },
    { id: 4, userId: 2, employeeName: 'Каріна Мельник', date: '2025-02-19', start: '14:00', end: '22:00', type: 'karina' },
  ],

  requests: [],
};

function switchAuthTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active',
      (tab === 'login' && i === 0) || (tab === 'register' && i === 1)
    );
  });
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearAuthError() {
  document.getElementById('auth-error').style.display = 'none';
}

function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const user = state.users.find(u => u.email === email && u.password === password);

  if (!user) {
    showAuthError('Невірний email або пароль');
    return;
  }
  loginAs(user);
}

function handleRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const role     = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;

  if (!name || !email || !password) {
    showAuthError('Заповніть усі поля');
    return;
  }
  if (state.users.find(u => u.email === email)) {
    showAuthError('Такий email вже існує');
    return;
  }

  const parts    = name.split(' ');
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  const newUser  = { id: state.users.length + 1, name, email, password, role, initials };
  state.users.push(newUser);
  loginAs(newUser);
}

function loginAs(user) {
  state.currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  updateSidebar();
  populateCheckEmployee();
  renderDashboard();
  showPage('dashboard');
}

function handleLogout() {
  state.currentUser = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-email').value    = '';
  document.getElementById('login-password').value = '';
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + pageId).classList.add('active');

  const navMap = { dashboard: 0, schedule: 1, 'my-shifts': 2, conflicts: 3, requests: 4 };
  const items  = document.querySelectorAll('.nav-item');
  if (navMap[pageId] !== undefined) {
    items[navMap[pageId]].classList.add('active');
  }
  if (pageId === 'schedule')  renderSchedule();
  if (pageId === 'my-shifts') renderMyShifts();
  if (pageId === 'conflicts') renderConflicts();
  if (pageId === 'requests')  renderRequests();
}

function updateSidebar() {
  const u = state.currentUser;
  document.getElementById('sidebar-avatar').textContent = u.initials;
  document.getElementById('sidebar-name').textContent   = u.name;
  document.getElementById('sidebar-role').textContent   = u.role === 'admin' ? 'Менеджер' : 'Працівник';
}

function renderDashboard() {
  const conflicts = detectAllConflicts();
  document.getElementById('stat-total').textContent     = state.shifts.length;
  document.getElementById('stat-requests').textContent  = state.requests.filter(r => r.status === 'pending').length;
  document.getElementById('stat-conflicts').textContent = conflicts.length;

  const container = document.getElementById('dashboard-shifts');
  const sorted    = [...state.shifts].sort((a, b) => a.date.localeCompare(b.date));
  container.innerHTML = sorted.map(s => shiftItemHTML(s, conflicts)).join('');
}

function shiftItemHTML(s, conflicts) {
  const dateParts = s.date.split('-');
  const day   = dateParts[2];
  const month = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'][parseInt(dateParts[1]) - 1];
  const hasConflict = conflicts.some(c => c.ids.includes(s.id));

  const badge = hasConflict
    ? `<span class="shift-badge conflict-badge-item">Конфлікт</span>`
    : s.date === '2025-02-17'
      ? `<span class="shift-badge active">Сьогодні</span>`
      : `<span class="shift-badge upcoming">Заплановано</span>`;

  return `
    <div class="shift-item ${s.type}">
      <div class="shift-date-block">
        <div class="shift-day">${day}</div>
        <div class="shift-month">${month}</div>
      </div>
      <div class="shift-divider"></div>
      <div class="shift-info">
        <div class="shift-name-tag">${s.employeeName}</div>
        <div class="shift-time-tag">
          <span class="dot ${s.type}"></span>
          ${s.start} — ${s.end}
        </div>
      </div>
      ${badge}
    </div>`;
}

function renderSchedule() {
  const grid      = document.getElementById('schedule-grid');
  const conflicts = detectAllConflicts();
  let html = '<div></div>';
  DAYS.forEach((d, i) => {
    html += `<div class="sg-header ${DATES[i] === '17' ? 'today' : ''}">
      ${d}<br/><small style="font-size:9px;color:var(--text-dim)">${DATES[i]}/02</small>
    </div>`;
  });
  const employees = [
    { id: 1, name: 'Анна',   cls: 'a', shiftCls: '' },
    { id: 2, name: 'Каріна', cls: 'k', shiftCls: 'k-shift' },
  ];

  employees.forEach(emp => {
    html += `<div class="sg-name">
      <div class="sg-avatar ${emp.cls}">${emp.cls.toUpperCase()}</div>
      <div class="sg-employee-name">${emp.name}</div>
    </div>`;

    DATES.forEach(d => {
      const dateStr    = `2025-02-${d}`;
      const shift      = state.shifts.find(s => s.userId === emp.id && s.date === dateStr);
      const isConflict = shift && conflicts.some(c => c.ids.includes(shift.id));

      if (shift) {
        html += `<div class="sg-cell shift ${isConflict ? 'conflict' : emp.shiftCls}">
          <div class="shift-time">${shift.start}</div>
          <div class="shift-label">—</div>
          <div class="shift-time">${shift.end}</div>
          ${isConflict ? '<span class="conflict-badge">!</span>' : ''}
        </div>`;
      } else {
        html += `<div class="sg-cell">–</div>`;
      }
    });
  });

  grid.innerHTML = html;
}

function renderMyShifts() {
  const u = state.currentUser;
  document.getElementById('my-shifts-subtitle').textContent =
    u.role === 'admin' ? 'Усі зміни системи' : `Зміни для ${u.name}`;

  const list     = document.getElementById('my-shifts-list');
  const myShifts = u.role === 'admin'
    ? state.shifts
    : state.shifts.filter(s => s.userId === u.id);

  if (!myShifts.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-text">Змін не знайдено</div>
    </div>`;
    return;
  }

  const conflicts = detectAllConflicts();
  list.innerHTML  = myShifts.map(s => shiftItemHTML(s, conflicts)).join('');
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(s1, e1, s2, e2) {
  return timeToMinutes(s1) < timeToMinutes(e2) &&
         timeToMinutes(s2) < timeToMinutes(e1);
}

function detectAllConflicts() {
  const found  = [];
  const byDate = {};
  state.shifts.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });
  Object.values(byDate).forEach(dayShifts => {
    for (let i = 0; i < dayShifts.length; i++) {
      for (let j = i + 1; j < dayShifts.length; j++) {
        const a = dayShifts[i];
        const b = dayShifts[j];
        if (overlaps(a.start, a.end, b.start, b.end)) {
          found.push({ ids: [a.id, b.id], a, b });
        }
      }
    }
  });

  return found;
}

function renderConflicts() {
  const checkDate  = document.getElementById('check-date').value;
  const checkStart = document.getElementById('check-start').value;
  const checkEnd   = document.getElementById('check-end').value;
  if (!checkDate && !checkStart && !checkEnd) {
    document.getElementById('conflict-result').style.display = 'none';
  }

  const conflicts = detectAllConflicts();
  document.getElementById('stat-conflicts').textContent = conflicts.length;

  const list = document.getElementById('all-conflicts-list');

  if (!conflicts.length) {
    list.innerHTML = `<div class="no-conflicts">✅ Конфліктів у розкладі не виявлено</div>`;
    return;
  }

  list.innerHTML = `<div class="all-conflicts-list">` +
    conflicts.map(c => `
      <div class="conflict-item">
        <span class="conflict-icon">⚡</span>
        <div class="conflict-desc">
          <strong>${c.a.date}</strong> — накладання:
          <span style="color:var(--accent)">${c.a.employeeName}</span> (${c.a.start}–${c.a.end})
          та <span style="color:var(--accent-2)">${c.b.employeeName}</span> (${c.b.start}–${c.b.end})
        </div>
      </div>`
    ).join('') + `</div>`;
}

function populateCheckEmployee() {
  const sel = document.getElementById('check-employee');
  sel.innerHTML = '<option value="">Оберіть...</option>';
  state.users
    .filter(u => u.role === 'employee')
    .forEach(u => {
      sel.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });
}

function checkConflict() {
  const date   = document.getElementById('check-date').value;
  const start  = document.getElementById('check-start').value;
  const end    = document.getElementById('check-end').value;
  const empId  = parseInt(document.getElementById('check-employee').value);
  const result = document.getElementById('conflict-result');

  if (!date || !start || !end || !empId) {
    showToast('Заповніть усі поля', 'error');
    return;
  }
  if (timeToMinutes(start) >= timeToMinutes(end)) {
    showToast('Час початку має бути раніше за кінець', 'error');
    return;
  }

  const dayShifts = state.shifts.filter(s => s.date === date);
  const conflicts = dayShifts.filter(s => overlaps(start, end, s.start, s.end));

  result.style.display = 'block';

  if (!conflicts.length) {
    result.className = 'conflict-result ok';
    result.innerHTML = `
      <div class="conflict-result-title">✅ Конфліктів немає</div>
      <div class="conflict-result-body">Зміна ${start}–${end} на ${date} не перетинається з іншими.</div>`;
  } else {
    result.className = 'conflict-result error';
    result.innerHTML = `
      <div class="conflict-result-title">❌ Виявлено конфлікт!</div>
      <div class="conflict-result-body">Перетин із: ${
        conflicts.map(c => `${c.employeeName} (${c.start}–${c.end})`).join(', ')
      }</div>`;
  }
}

function submitRequest() {
  const type   = document.querySelector('input[name="req-type"]:checked').value;
  const from   = document.getElementById('req-date-from').value;
  const to     = document.getElementById('req-date-to').value;
  const reason = document.getElementById('req-reason').value.trim();
  const u      = state.currentUser;

  if (!from || !to) {
    showToast('Вкажіть дати', 'error');
    return;
  }

  const typeLabels = {
    vacation: '🏖️ Відпустка',
    sick:     '🤒 Лікарняний',
    dayoff:   '☀️ Вихідний',
  };

  state.requests.push({
    id:        state.requests.length + 1,
    userId:    u.id,
    userName:  u.name,
    type,
    typeLabel: typeLabels[type],
    from, to, reason,
    status:    'pending',
    createdAt: new Date().toLocaleDateString('uk-UA'),
  });
  document.getElementById('req-date-from').value = '';
  document.getElementById('req-date-to').value   = '';
  document.getElementById('req-reason').value    = '';

  showToast('Заяву подано успішно!', 'success');
  renderRequests();
  renderDashboard();
}

function renderRequests() {
  const u     = state.currentUser;
  const list  = document.getElementById('requests-list');
  const title = document.getElementById('requests-list-title');

  const myRequests = u.role === 'admin'
    ? state.requests
    : state.requests.filter(r => r.userId === u.id);

  title.textContent = u.role === 'admin' ? '📋 Усі заяви (управління)' : '📋 Мої заяви';

  if (!myRequests.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-text">Заяв не знайдено</div>
    </div>`;
    return;
  }

  const statusLabels = { pending: 'На розгляді', approved: 'Схвалено', rejected: 'Відхилено' };
  const typeIcons    = { vacation: '🏖️', sick: '🤒', dayoff: '☀️' };

  list.innerHTML = myRequests.slice().reverse().map(r => {
    const adminBtns = u.role === 'admin' && r.status === 'pending'
      ? `<div class="req-actions">
          <button class="btn-approve" onclick="updateRequestStatus(${r.id}, 'approved')">Схвалити</button>
          <button class="btn-reject"  onclick="updateRequestStatus(${r.id}, 'rejected')">Відхилити</button>
         </div>`
      : '';

    return `<div class="req-item">
      <div class="req-type-icon ${r.type}">${typeIcons[r.type]}</div>
      <div class="req-info">
        <div class="req-title">${r.typeLabel} — ${r.userName}</div>
        <div class="req-meta">${r.from} → ${r.to}${r.reason ? ' · ' + r.reason : ''} · Подано: ${r.createdAt}</div>
      </div>
      <span class="req-status ${r.status}">${statusLabels[r.status]}</span>
      ${adminBtns}
    </div>`;
  }).join('');
}

function updateRequestStatus(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (req) req.status = status;

  const msg  = status === 'approved' ? 'Заяву схвалено' : 'Заяву відхилено';
  const type = status === 'approved' ? 'success' : 'error';
  showToast(msg, type);
  renderRequests();
  renderDashboard();
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
document.getElementById('check-date').valueAsDate = new Date('2025-02-17');