const MONTHS_SHORT = [
  "Січ",
  "Лют",
  "Бер",
  "Кві",
  "Тра",
  "Чер",
  "Лип",
  "Сер",
  "Вер",
  "Жов",
  "Лис",
  "Гру",
];

let state = {
  currentUser: null,
  users: [],
  shifts: [],
  requests: [],
  shiftRequests: [],
  vacations: [],
  chatMessages: [],
  currentChannel: "general",
  unreadChat: 0,
  aiMode: "local",
};

async function loadAppData() {
  try {
    const res = await fetch("data/employees.json");
    const data = await res.json();

    state.users = data.employees || [];
    state.shifts = data.shifts || [];
    state.vacations = data.vacations || [];
    state.chatMessages = data.chat_messages || [];

    state.requests = state.vacations.map((v) => ({
      id: v.id,
      userId: v.userId,
      userName: v.employeeName,
      type: v.type,
      typeLabel: v.typeLabel,
      from: v.from,
      to: v.to,
      reason: v.reason,
      status: v.status,
      createdAt: v.createdAt,
    }));
  } catch (e) {
    console.warn(
      "JSON не завантажено, використовую вбудовані дані:",
      e.message,
    );
    state.users = [
      {
        id: 1,
        name: "Анна Коваленко",
        email: "anna@workify.ua",
        password: "anna123",
        role: "employee",
        initials: "АК",
        position: "Старший касир",
        department: "Торговий зал",
        avatar_color: "#4f7cff",
        hourly_rate: 85,
      },
      {
        id: 2,
        name: "Каріна Мельник",
        email: "karina@workify.ua",
        password: "karina123",
        role: "employee",
        initials: "КМ",
        position: "Касир",
        department: "Торговий зал",
        avatar_color: "#00d4aa",
        hourly_rate: 75,
      },
      {
        id: 3,
        name: "Менеджер Адмін",
        email: "admin@workify.ua",
        password: "admin123",
        role: "admin",
        initials: "МН",
        position: "Менеджер зміни",
        department: "Адміністрація",
        avatar_color: "#ffa94d",
        hourly_rate: 120,
      },
      {
        id: 4,
        name: "Олег Петренко",
        email: "oleg@workify.ua",
        password: "oleg123",
        role: "employee",
        initials: "ОП",
        position: "Вантажник",
        department: "Склад",
        avatar_color: "#ff4f6b",
        hourly_rate: 70,
      },
      {
        id: 5,
        name: "Марина Савченко",
        email: "marina@workify.ua",
        password: "marina123",
        role: "employee",
        initials: "МС",
        position: "Продавець-консультант",
        department: "Торговий зал",
        avatar_color: "#7c5fff",
        hourly_rate: 78,
      },
    ];
    state.shifts = [
      {
        id: 1,
        userId: 1,
        employeeName: "Анна Коваленко",
        date: "2026-06-17",
        start: "08:00",
        end: "16:00",
        type: "anna",
      },
      {
        id: 2,
        userId: 1,
        employeeName: "Анна Коваленко",
        date: "2026-06-19",
        start: "12:00",
        end: "20:00",
        type: "anna",
      },
      {
        id: 3,
        userId: 2,
        employeeName: "Каріна Мельник",
        date: "2026-06-18",
        start: "08:00",
        end: "16:00",
        type: "karina",
      },
      {
        id: 4,
        userId: 2,
        employeeName: "Каріна Мельник",
        date: "2026-06-19",
        start: "14:00",
        end: "22:00",
        type: "karina",
      },
      {
        id: 5,
        userId: 4,
        employeeName: "Олег Петренко",
        date: "2026-06-17",
        start: "06:00",
        end: "14:00",
        type: "oleg",
      },
      {
        id: 6,
        userId: 5,
        employeeName: "Марина Савченко",
        date: "2026-06-18",
        start: "10:00",
        end: "18:00",
        type: "marina",
      },
    ];
    state.chatMessages = [
      {
        id: 1,
        senderId: 1,
        senderName: "Анна Коваленко",
        senderInitials: "АК",
        text: "Привіт усім! Хтось може поміняти зміну 21 червня?",
        timestamp: "2026-06-17T08:30:00",
        channel: "general",
      },
    ];
  }
}

function getScheduleWeek() {
  if (!state.shifts.length) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const days = [],
      dates = [],
      fullDates = [];
    const dayNames = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(dayNames[d.getDay()]);
      dates.push(String(d.getDate()).padStart(2, "0"));
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      fullDates.push(`${d.getFullYear()}-${mm}-${dd}`);
    }
    return {
      days,
      dates,
      fullDates,
      monthLabel: `${dayNames[1]} ${dates[0]}.${String(monday.getMonth() + 1).padStart(2, "0")} — ${dates[6]}.${String(monday.getMonth() + 1).padStart(2, "0")}`,
    };
  }

  const sortedDates = [...new Set(state.shifts.map((s) => s.date))].sort();
  const firstDate = new Date(sortedDates[0]);
  const dayOfWeek = firstDate.getDay();
  const monday = new Date(firstDate);
  monday.setDate(firstDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const days = [],
    dates = [],
    fullDates = [];
  const dayNames = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const monthNames = [
    "Січень",
    "Лютий",
    "Березень",
    "Квітень",
    "Травень",
    "Червень",
    "Липень",
    "Серпень",
    "Вересень",
    "Жовтень",
    "Листопад",
    "Грудень",
  ];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(dayNames[d.getDay()]);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    dates.push(dd);
    fullDates.push(`${d.getFullYear()}-${mm}-${dd}`);
  }

  const monthLabel = monthNames[monday.getMonth()] + " " + monday.getFullYear();
  return { days, dates, fullDates, monthLabel };
}

function switchAuthTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    btn.classList.toggle(
      "active",
      (tab === "login" && i === 0) || (tab === "register" && i === 1),
    );
  });
  document.getElementById("login-form").style.display =
    tab === "login" ? "" : "none";
  document.getElementById("register-form").style.display =
    tab === "register" ? "" : "none";
  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.style.display = "block";
}
function clearAuthError() {
  document.getElementById("auth-error").style.display = "none";
}

function quickLogin(email, pwd) {
  document.getElementById("login-email").value = email;
  document.getElementById("login-password").value = pwd;
  handleLogin();
}

function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const user = state.users.find(
    (u) => u.email === email && u.password === password,
  );
  if (!user) {
    showAuthError("Невірний email або пароль");
    return;
  }
  loginAs(user);
}

function handleRegister() {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const role = document.getElementById("reg-role").value;
  const password = document.getElementById("reg-password").value;

  if (!name || !email || !password) {
    showAuthError("Заповніть усі поля");
    return;
  }
  if (state.users.find((u) => u.email === email)) {
    showAuthError("Такий email вже існує");
    return;
  }

  const parts = name.split(" ");
  const initials = parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const newUser = {
    id: state.users.length + 1,
    name,
    email,
    password,
    role,
    initials,
    position: role === "admin" ? "Менеджер" : "Працівник",
    department: "Загальний",
    avatar_color: "#4f7cff",
    hourly_rate: 75,
  };
  state.users.push(newUser);
  loginAs(newUser);
}

function loginAs(user) {
  state.currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  updateSidebar();
  populateCheckEmployee();
  populateAddShiftEmployee();
  renderDashboard();
  showPage("dashboard");
}

function handleLogout() {
  state.currentUser = null;
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";
  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const hamburger = document.getElementById("hamburger");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("show");
  hamburger.classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
  document.getElementById("hamburger").classList.remove("open");
}

function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));

  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");

  const navMap = {
    dashboard: "0",
    schedule: "1",
    "my-shifts": "2",
    employees: "3",
    conflicts: "4",
    requests: "5",
    "add-shift": "6",
    "team-chat": "7",
    "ai-assistant": "8",
  };
  const items = document.querySelectorAll(".nav-item");
  if (navMap[pageId] !== undefined)
    items[parseInt(navMap[pageId])]?.classList.add("active");

  if (pageId === "schedule") renderSchedule();
  if (pageId === "my-shifts") renderMyShifts();
  if (pageId === "employees") renderEmployees();
  if (pageId === "conflicts") renderConflicts();
  if (pageId === "requests") renderRequests();
  if (pageId === "add-shift") renderAddShiftPage();
  if (pageId === "team-chat") {
    renderTeamChat();
    resetChatBadge();
  }
  if (pageId === "ai-assistant") renderAiPageSetup();

  closeSidebar();
}

function updateSidebar() {
  const u = state.currentUser;
  if (!u) return;
  const initials = u.initials || u.name[0];
  document.getElementById("sidebar-avatar").textContent = initials;
  document.getElementById("sidebar-name").textContent = u.name;
  document.getElementById("sidebar-role").textContent =
    u.role === "admin" ? "Менеджер" : "Працівник";
  document.getElementById("mobile-avatar").textContent = initials;
}

function renderDashboard() {
  const conflicts = detectAllConflicts();
  const pending =
    state.requests.filter((r) => r.status === "pending").length +
    state.shiftRequests.filter((r) => r.status === "pending").length;
  const empCount = state.users.filter((u) => u.role === "employee").length;

  document.getElementById("stat-total").textContent = state.shifts.length;
  document.getElementById("stat-requests").textContent = pending;
  document.getElementById("stat-conflicts").textContent = conflicts.length;
  document.getElementById("stat-employees").textContent = empCount;

  const sorted = [...state.shifts].sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById("dashboard-shifts").innerHTML =
    sorted
      .slice(0, 5)
      .map((s) => shiftItemHTML(s, conflicts))
      .join("") || emptyState("📭", "Змін не знайдено");

  const activeVacs = state.requests.filter(
    (r) => r.status === "approved" || r.status === "pending",
  );
  document.getElementById("dashboard-vacations").innerHTML = activeVacs.length
    ? activeVacs
        .map(
          (v) => `
        <div class="vacation-item">
          <div class="vacation-icon">${v.type === "vacation" ? "🏖️" : v.type === "sick" ? "🤒" : "☀️"}</div>
          <div class="vacation-info">
            <div class="vacation-name">${v.userName}</div>
            <div class="vacation-dates">${v.from} → ${v.to} · ${v.typeLabel || v.type}</div>
          </div>
          <span class="req-status ${v.status}">${v.status === "approved" ? "Схвалено" : v.status === "pending" ? "На розгляді" : "Відхилено"}</span>
        </div>`,
        )
        .join("")
    : `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">Активних відпусток немає</div></div>`;
}

function shiftItemHTML(s, conflicts) {
  const [, mm, dd] = s.date.split("-");
  const month = MONTHS_SHORT[parseInt(mm) - 1];
  const hasConflict = conflicts.some((c) => c.ids.includes(s.id));
  const todayStr = new Date().toISOString().split("T")[0];
  const badge = hasConflict
    ? `<span class="shift-badge conflict-badge-item">Конфлікт</span>`
    : s.date === todayStr
      ? `<span class="shift-badge active">Сьогодні</span>`
      : `<span class="shift-badge upcoming">Заплановано</span>`;
  const type = s.type || "anna";
  return `
    <div class="shift-item ${type}">
      <div class="shift-date-block">
        <div class="shift-day">${dd}</div>
        <div class="shift-month">${month}</div>
      </div>
      <div class="shift-divider"></div>
      <div class="shift-info">
        <div class="shift-name-tag">${s.employeeName}</div>
        <div class="shift-time-tag">
          <span class="dot ${type}"></span>
          ${s.start} — ${s.end}
          ${s.note ? `· <span style="font-size:11px;color:var(--text-dim)">${s.note}</span>` : ""}
        </div>
      </div>
      ${badge}
    </div>`;
}

function renderSchedule() {
  const grid = document.getElementById("schedule-grid");
  const conflicts = detectAllConflicts();
  const week = getScheduleWeek();

  const subtitle = document.querySelector("#page-schedule .page-header p");
  if (subtitle) subtitle.textContent = "Тижневий розклад — " + week.monthLabel;

  let html = "<div></div>";
  const todayStr = new Date().toISOString().split("T")[0];
  week.days.forEach((d, i) => {
    const mm = week.fullDates[i].split("-")[1];
    const isToday = week.fullDates[i] === todayStr;
    html += `<div class="sg-header ${isToday ? "today" : ""}">
      ${d}<br/><small style="font-size:9px;color:var(--text-dim)">${week.dates[i]}/${mm}</small>
    </div>`;
  });

  const empUsers = state.users.filter((u) => u.role === "employee");
  const avatarCls = { 1: "a", 2: "k", 4: "o", 5: "m" };
  const shiftCls = { 1: "", 2: "k-shift", 4: "o-shift", 5: "m-shift" };

  empUsers.forEach((emp) => {
    const cls = avatarCls[emp.id] || "a";
    html += `<div class="sg-name">
      <div class="sg-avatar ${cls}">${(emp.initials || "?").slice(0, 1)}</div>
      <div class="sg-employee-name">${emp.name.split(" ")[0]}</div>
    </div>`;

    week.fullDates.forEach((dateStr) => {
      const shift = state.shifts.find(
        (s) => s.userId === emp.id && s.date === dateStr,
      );
      const isCon = shift && conflicts.some((c) => c.ids.includes(shift.id));
      if (shift) {
        html += `<div class="sg-cell shift ${isCon ? "conflict" : shiftCls[emp.id] || ""}">
          <div class="shift-time">${shift.start}</div>
          <div class="shift-label">—</div>
          <div class="shift-time">${shift.end}</div>
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
  document.getElementById("my-shifts-subtitle").textContent =
    u.role === "admin" ? "Усі зміни системи" : `Зміни для ${u.name}`;

  const myShifts =
    u.role === "admin"
      ? state.shifts
      : state.shifts.filter((s) => s.userId === u.id);
  const conflicts = detectAllConflicts();

  document.getElementById("my-shifts-list").innerHTML = myShifts.length
    ? myShifts.map((s) => shiftItemHTML(s, conflicts)).join("")
    : emptyState("📭", "Змін не знайдено");
}

function renderEmployees() {
  const empUsers = state.users.filter((u) => u.role === "employee");
  const grid = document.getElementById("employees-grid");

  grid.innerHTML = empUsers
    .map((emp) => {
      const empShifts = state.shifts.filter((s) => s.userId === emp.id);
      const hours = empShifts.reduce(
        (sum, s) => sum + (timeToMinutes(s.end) - timeToMinutes(s.start)) / 60,
        0,
      );
      const vacation = state.requests.find(
        (r) =>
          r.userId === emp.id &&
          r.status === "approved" &&
          (r.type === "vacation" || r.type === "sick" || r.type === "dayoff"),
      );
      const statusDot = vacation
        ? vacation.type === "sick"
          ? "sick"
          : "vacation"
        : "active";
      const statusText = vacation
        ? vacation.type === "sick"
          ? "Лікарняний"
          : "Відпустка"
        : "На роботі";

      const typeColors = {
        1: "linear-gradient(135deg,#4f7cff,#7c5fff)",
        2: "linear-gradient(135deg,#00d4aa,#00a880)",
        4: "linear-gradient(135deg,#ff4f6b,#cc3a55)",
        5: "linear-gradient(135deg,#7c5fff,#5c3fcc)",
      };
      const gradient =
        typeColors[emp.id] || "linear-gradient(135deg,#4f7cff,#7c5fff)";

      return `
      <div class="employee-card" style="--emp-color:${emp.avatar_color || "#4f7cff"}">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${gradient}"></div>
        <div class="emp-header">
          <div class="emp-avatar" style="background:${gradient}">${emp.initials || "?"}</div>
          <div>
            <div class="emp-name">${emp.name}</div>
            <div class="emp-position">${emp.position || "Працівник"}</div>
            <span class="emp-dept">${emp.department || ""}</span>
          </div>
        </div>
        <div class="emp-stats">
          <div class="emp-stat">
            <div class="emp-stat-val">${empShifts.length}</div>
            <div class="emp-stat-label">Змін</div>
          </div>
          <div class="emp-stat">
            <div class="emp-stat-val" style="color:var(--accent-2)">${hours.toFixed(0)}г</div>
            <div class="emp-stat-label">Годин</div>
          </div>
        </div>
        <div class="emp-status">
          <span class="status-dot ${statusDot}"></span>
          <span style="font-size:12px;color:var(--text-muted)">${statusText}</span>
          ${emp.phone ? `<span style="margin-left:auto;font-size:11px;color:var(--text-dim)">${emp.phone}</span>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

function timeToMinutes(t) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return h * 60 + m;
}
function overlaps(s1, e1, s2, e2) {
  return (
    timeToMinutes(s1) < timeToMinutes(e2) &&
    timeToMinutes(s2) < timeToMinutes(e1)
  );
}
function detectAllConflicts() {
  const found = [];
  const byDate = {};
  state.shifts.forEach((s) => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });
  Object.values(byDate).forEach((dayShifts) => {
    for (let i = 0; i < dayShifts.length; i++)
      for (let j = i + 1; j < dayShifts.length; j++) {
        const a = dayShifts[i],
          b = dayShifts[j];
        if (overlaps(a.start, a.end, b.start, b.end))
          found.push({ ids: [a.id, b.id], a, b });
      }
  });
  return found;
}

function renderConflicts() {
  document.getElementById("conflict-result").style.display = "none";
  const conflicts = detectAllConflicts();
  document.getElementById("stat-conflicts").textContent = conflicts.length;

  const list = document.getElementById("all-conflicts-list");
  list.innerHTML = conflicts.length
    ? conflicts
        .map(
          (c) => `
        <div class="conflict-item">
          <span class="conflict-icon">⚡</span>
          <div class="conflict-desc">
            <strong>${c.a.date}</strong> — накладання:
            <span style="color:var(--accent)">${c.a.employeeName}</span> (${c.a.start}–${c.a.end})
            та <span style="color:var(--accent-2)">${c.b.employeeName}</span> (${c.b.start}–${c.b.end})
          </div>
        </div>`,
        )
        .join("")
    : `<div class="no-conflicts">✅ Конфліктів у розкладі не виявлено</div>`;
}

function populateCheckEmployee() {
  const sel = document.getElementById("check-employee");
  sel.innerHTML = '<option value="">Оберіть...</option>';
  state.users
    .filter((u) => u.role === "employee")
    .forEach((u) => {
      sel.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });
}
function populateAddShiftEmployee() {
  const sel = document.getElementById("add-shift-employee");
  sel.innerHTML = '<option value="">Оберіть...</option>';
  state.users
    .filter((u) => u.role === "employee")
    .forEach((u) => {
      sel.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });
}

function checkConflict() {
  const date = document.getElementById("check-date").value;
  const start = document.getElementById("check-start").value;
  const end = document.getElementById("check-end").value;
  const empId = parseInt(document.getElementById("check-employee").value);
  const result = document.getElementById("conflict-result");

  if (!date || !start || !end || !empId) {
    showToast("Заповніть усі поля", "error");
    return;
  }
  if (timeToMinutes(start) >= timeToMinutes(end)) {
    showToast("Час початку має бути раніше за кінець", "error");
    return;
  }

  const dayShifts = state.shifts.filter((s) => s.date === date);
  const conflicts = dayShifts.filter((s) =>
    overlaps(start, end, s.start, s.end),
  );

  result.style.display = "block";
  if (!conflicts.length) {
    result.className = "conflict-result ok";
    result.innerHTML = `<div class="conflict-result-title">✅ Конфліктів немає</div>
      <div class="conflict-result-body">Зміна ${start}–${end} на ${date} не перетинається з іншими.</div>`;
  } else {
    result.className = "conflict-result error";
    result.innerHTML = `<div class="conflict-result-title">❌ Виявлено конфлікт!</div>
      <div class="conflict-result-body">Перетин із: ${conflicts.map((c) => `${c.employeeName} (${c.start}–${c.end})`).join(", ")}</div>`;
  }
}

function submitRequest() {
  const type = document.querySelector('input[name="req-type"]:checked').value;
  const from = document.getElementById("req-date-from").value;
  const to = document.getElementById("req-date-to").value;
  const reason = document.getElementById("req-reason").value.trim();
  const u = state.currentUser;

  if (!from || !to) {
    showToast("Вкажіть дати", "error");
    return;
  }

  const typeLabels = {
    vacation: "🏖️ Відпустка",
    sick: "🤒 Лікарняний",
    dayoff: "☀️ Вихідний",
  };
  state.requests.push({
    id: state.requests.length + 1,
    userId: u.id,
    userName: u.name,
    type,
    typeLabel: typeLabels[type],
    from,
    to,
    reason,
    status: "pending",
    createdAt: new Date().toLocaleDateString("uk-UA"),
  });

  document.getElementById("req-date-from").value = "";
  document.getElementById("req-date-to").value = "";
  document.getElementById("req-reason").value = "";
  showToast("Заяву подано успішно!", "success");
  renderRequests();
  renderDashboard();
}

function renderRequests() {
  const u = state.currentUser;
  const list = document.getElementById("requests-list");
  const title = document.getElementById("requests-list-title");

  const myRequests =
    u.role === "admin"
      ? state.requests
      : state.requests.filter((r) => r.userId === u.id);
  title.textContent =
    u.role === "admin" ? "📋 Усі заяви (управління)" : "📋 Мої заяви";

  const statusLabels = {
    pending: "На розгляді",
    approved: "Схвалено",
    rejected: "Відхилено",
  };
  const typeIcons = { vacation: "🏖️", sick: "🤒", dayoff: "☀️" };

  list.innerHTML = myRequests.length
    ? myRequests
        .slice()
        .reverse()
        .map((r) => {
          const adminBtns =
            u.role === "admin" && r.status === "pending"
              ? `<div class="req-actions">
              <button class="btn-approve" onclick="updateRequestStatus(${r.id},'approved')">Схвалити</button>
              <button class="btn-reject"  onclick="updateRequestStatus(${r.id},'rejected')">Відхилити</button>
             </div>`
              : "";
          return `<div class="req-item">
          <div class="req-type-icon ${r.type}">${typeIcons[r.type] || "📄"}</div>
          <div class="req-info">
            <div class="req-title">${r.typeLabel || r.type} — ${r.userName}</div>
            <div class="req-meta">${r.from} → ${r.to}${r.reason ? " · " + r.reason : ""} · Подано: ${r.createdAt}</div>
          </div>
          <span class="req-status ${r.status}">${statusLabels[r.status]}</span>
          ${adminBtns}
        </div>`;
        })
        .join("")
    : emptyState("📭", "Заяв не знайдено");
}

function updateRequestStatus(id, status) {
  const req = state.requests.find((r) => r.id === id);
  if (req) req.status = status;
  showToast(
    status === "approved" ? "Заяву схвалено" : "Заяву відхилено",
    status === "approved" ? "success" : "error",
  );
  renderRequests();
  renderDashboard();
}

function renderAddShiftPage() {
  const u = state.currentUser;
  const isAdmin = u.role === "admin";

  document.getElementById("add-shift-subtitle").textContent = isAdmin
    ? "Зміна додається одразу після збереження"
    : "Заявка піде на розгляд менеджеру";
  document.getElementById("add-shift-form-title").textContent = isAdmin
    ? "🗓️ Додати зміну для працівника"
    : "📋 Подати заявку на зміну";
  document.getElementById("add-shift-employee-group").style.display = isAdmin
    ? ""
    : "none";
  document.getElementById("add-shift-conflict-warn").style.display = "none";
  document.getElementById("shift-requests-title").textContent = isAdmin
    ? "⏳ Заявки від працівників"
    : "📋 Мої заявки на зміни";

  renderShiftRequests();
}

function submitAddShift() {
  const u = state.currentUser;
  const isAdmin = u.role === "admin";
  const date = document.getElementById("add-shift-date").value;
  const start = document.getElementById("add-shift-start").value;
  const end = document.getElementById("add-shift-end").value;
  const warn = document.getElementById("add-shift-conflict-warn");

  let targetUserId, targetUserName, shiftType;

  if (isAdmin) {
    const empId = parseInt(document.getElementById("add-shift-employee").value);
    if (!empId) {
      showToast("Оберіть працівника", "error");
      return;
    }
    const emp = state.users.find((u) => u.id === empId);
    targetUserId = emp.id;
    targetUserName = emp.name;
    const shiftTypes = { 1: "anna", 2: "karina", 4: "oleg", 5: "marina" };
    shiftType = shiftTypes[empId] || "anna";
  } else {
    targetUserId = u.id;
    targetUserName = u.name;
    const shiftTypes = { 1: "anna", 2: "karina", 4: "oleg", 5: "marina" };
    shiftType = shiftTypes[u.id] || "anna";
  }

  if (!date || !start || !end) {
    showToast("Заповніть усі поля", "error");
    return;
  }
  if (timeToMinutes(start) >= timeToMinutes(end)) {
    showToast("Час початку має бути раніше за кінець", "error");
    return;
  }

  const dayShifts = state.shifts.filter((s) => s.date === date);
  const conflicts = dayShifts.filter((s) =>
    overlaps(start, end, s.start, s.end),
  );

  if (conflicts.length) {
    warn.style.display = "block";
    warn.innerHTML = `<div class="conflict-result-title">❌ Конфлікт у розкладі!</div>
      <div class="conflict-result-body">Перетин із: ${conflicts.map((c) => `${c.employeeName} (${c.start}–${c.end})`).join(", ")}</div>`;
    return;
  }
  warn.style.display = "none";

  if (isAdmin) {
    state.shifts.push({
      id: state.shifts.length + 1,
      userId: targetUserId,
      employeeName: targetUserName,
      date,
      start,
      end,
      type: shiftType,
    });
    showToast("Зміну додано до розкладу!", "success");
  } else {
    state.shiftRequests.push({
      id: state.shiftRequests.length + 1,
      userId: targetUserId,
      userName: targetUserName,
      shiftType,
      date,
      start,
      end,
      status: "pending",
      createdAt: new Date().toLocaleDateString("uk-UA"),
    });
    showToast("Заявку подано! Чекайте підтвердження.", "success");
  }

  document.getElementById("add-shift-date").value = "";
  document.getElementById("add-shift-start").value = "";
  document.getElementById("add-shift-end").value = "";
  if (isAdmin) document.getElementById("add-shift-employee").value = "";
  renderDashboard();
  renderShiftRequests();
}

function renderShiftRequests() {
  const u = state.currentUser;
  const isAdmin = u.role === "admin";
  const list = document.getElementById("shift-requests-list");
  const items = isAdmin
    ? state.shiftRequests
    : state.shiftRequests.filter((r) => r.userId === u.id);
  const statusLabels = {
    pending: "На розгляді",
    approved: "Схвалено",
    rejected: "Відхилено",
  };

  list.innerHTML = items.length
    ? items
        .slice()
        .reverse()
        .map((r) => {
          const adminBtns =
            isAdmin && r.status === "pending"
              ? `<div class="req-actions">
              <button class="btn-approve" onclick="approveShiftRequest(${r.id})">Схвалити</button>
              <button class="btn-reject"  onclick="rejectShiftRequest(${r.id})">Відхилити</button>
             </div>`
              : "";
          return `<div class="req-item">
          <div class="req-type-icon vacation">🗓️</div>
          <div class="req-info">
            <div class="req-title">Зміна — ${r.userName}</div>
            <div class="req-meta">${r.date} · ${r.start}–${r.end} · Подано: ${r.createdAt}</div>
          </div>
          <span class="req-status ${r.status}">${statusLabels[r.status]}</span>
          ${adminBtns}
        </div>`;
        })
        .join("")
    : emptyState("📭", "Заявок немає");
}

function approveShiftRequest(id) {
  const req = state.shiftRequests.find((r) => r.id === id);
  if (!req) return;
  const conflicts = state.shifts
    .filter((s) => s.date === req.date)
    .filter((s) => overlaps(req.start, req.end, s.start, s.end));
  if (conflicts.length) {
    showToast("Неможливо схвалити — конфлікт!", "error");
    return;
  }
  req.status = "approved";
  state.shifts.push({
    id: state.shifts.length + 1,
    userId: req.userId,
    employeeName: req.userName,
    date: req.date,
    start: req.start,
    end: req.end,
    type: req.shiftType,
  });
  showToast("Заявку схвалено, зміну додано!", "success");
  renderShiftRequests();
  renderDashboard();
}
function rejectShiftRequest(id) {
  const req = state.shiftRequests.find((r) => r.id === id);
  if (req) req.status = "rejected";
  showToast("Заявку відхилено", "error");
  renderShiftRequests();
  renderDashboard();
}

const CHANNEL_INFO = {
  general: { name: "# Загальний", desc: "Загальний чат команди" },
  shifts: { name: "🔄 Обмін змінами", desc: "Домовтесь про обмін змінами" },
  announcements: {
    name: "📢 Оголошення",
    desc: "Важливі оголошення від менеджменту",
  },
};

function switchChannel(ch) {
  state.currentChannel = ch;
  document.querySelectorAll(".chat-channel").forEach((el, i) => {
    const channels = ["general", "shifts", "announcements"];
    el.classList.toggle("active", channels[i] === ch);
  });
  document.getElementById("current-channel-name").textContent =
    CHANNEL_INFO[ch]?.name || ch;
  document.getElementById("current-channel-desc").textContent =
    CHANNEL_INFO[ch]?.desc || "";
  renderTeamChat();
}

function renderTeamChat() {
  const u = state.currentUser;
  const messages = state.chatMessages.filter(
    (m) => m.channel === state.currentChannel,
  );
  const container = document.getElementById("team-chat-messages");

  container.innerHTML = messages.length
    ? messages
        .map((m) => {
          const isOwn = m.senderId === u?.id;
          const time = new Date(m.timestamp).toLocaleTimeString("uk-UA", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const colors = {
            1: "linear-gradient(135deg,#4f7cff,#7c5fff)",
            2: "linear-gradient(135deg,#00d4aa,#00a880)",
            3: "linear-gradient(135deg,#ffa94d,#cc8500)",
            4: "linear-gradient(135deg,#ff4f6b,#cc3a55)",
            5: "linear-gradient(135deg,#7c5fff,#5c3fcc)",
          };
          const gradient =
            colors[m.senderId] || "linear-gradient(135deg,#4f7cff,#7c5fff)";
          return `
          <div class="team-msg ${isOwn ? "own" : ""}">
            <div class="team-msg-avatar" style="background:${gradient}">${m.senderInitials || "?"}</div>
            <div class="team-msg-content">
              <div class="team-msg-name">${m.senderName}</div>
              <div class="team-msg-bubble">${escapeHtml(m.text)}</div>
              <div class="team-msg-time">${time}</div>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">Тут ще немає повідомлень. Напишіть першим!</div></div>`;

  container.scrollTop = container.scrollHeight;

  const online = document.getElementById("online-list");
  online.innerHTML = state.users
    .map(
      (u) => `
    <div class="online-user">
      <span class="online-dot"></span>
      <span class="online-name">${u.name.split(" ")[0]}</span>
    </div>`,
    )
    .join("");
}

function sendTeamMessage() {
  const input = document.getElementById("team-chat-input");
  const text = input.value.trim();
  const u = state.currentUser;
  if (!text || !u) return;

  const msg = {
    id: state.chatMessages.length + 1,
    senderId: u.id,
    senderName: u.name,
    senderInitials: u.initials || u.name[0],
    text,
    timestamp: new Date().toISOString(),
    channel: state.currentChannel,
  };
  state.chatMessages.push(msg);
  input.value = "";

  renderTeamChat();

  const chatPage = document.getElementById("page-team-chat");
  if (!chatPage.classList.contains("active")) {
    state.unreadChat++;
    updateChatBadge();
  }
}

function insertQuickMsg(text) {
  const input = document.getElementById("team-chat-input");
  input.value = text;
  input.focus();
}

function updateChatBadge() {
  const badge = document.getElementById("chat-badge");
  if (state.unreadChat > 0) {
    badge.textContent = state.unreadChat;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}
function resetChatBadge() {
  state.unreadChat = 0;
  updateChatBadge();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function renderAiPageSetup() {
  if (typeof renderAiPage === "function") renderAiPage();
}

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-text">${text}</div></div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadAppData();

  const todayStr = new Date().toISOString().split("T")[0];
  ["check-date", "req-date-from", "add-shift-date"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = todayStr;
  });

  document
    .getElementById("login-password")
    ?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLogin();
    });
});
