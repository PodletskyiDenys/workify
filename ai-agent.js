let aiApiKey = localStorage.getItem("workify_gemini_key") || "";
let chatHistory = [];

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_all_shifts",
        description:
          "Повертає список всіх змін у системі WorkiFy. Включає дату, час, ім'я працівника.",
        parameters: {
          type: "OBJECT",
          properties: {
            employee_name: {
              type: "STRING",
              description:
                "Необов'язково: фільтрувати по імені конкретного працівника",
            },
          },
        },
      },
      {
        name: "detect_conflicts",
        description:
          "Аналізує розклад і повертає всі конфлікти — накладання змін за датою та часом.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "get_workload_stats",
        description:
          "Розраховує статистику навантаження: кількість годин кожного працівника, середня тривалість зміни, кількість змін.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "add_shift",
        description:
          "Додає нову зміну до розкладу. Тільки для менеджера. Перед додаванням перевіряє конфлікти.",
        parameters: {
          type: "OBJECT",
          properties: {
            employee_name: {
              type: "STRING",
              description: "Повне ім'я або частина імені працівника",
            },
            date: {
              type: "STRING",
              description: "Дата у форматі YYYY-MM-DD, наприклад 2026-02-20",
            },
            start: {
              type: "STRING",
              description: "Час початку у форматі HH:MM, наприклад 08:00",
            },
            end: {
              type: "STRING",
              description: "Час закінчення у форматі HH:MM, наприклад 16:00",
            },
          },
          required: ["employee_name", "date", "start", "end"],
        },
      },
      {
        name: "get_pending_requests",
        description:
          'Повертає список усіх заяв та заявок на зміни зі статусом "на розгляді".',
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "approve_shift_request",
        description: "Схвалює заявку на зміну за її ID. Тільки для менеджера.",
        parameters: {
          type: "OBJECT",
          properties: {
            request_id: {
              type: "NUMBER",
              description: "ID заявки на зміну",
            },
          },
          required: ["request_id"],
        },
      },
      {
        name: "reject_shift_request",
        description: "Відхиляє заявку на зміну за її ID. Тільки для менеджера.",
        parameters: {
          type: "OBJECT",
          properties: {
            request_id: {
              type: "NUMBER",
              description: "ID заявки на зміну",
            },
          },
          required: ["request_id"],
        },
      },
      {
        name: "check_shift_conflict",
        description:
          "Перевіряє, чи існують конфлікти для конкретної запропонованої зміни.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Дата у форматі YYYY-MM-DD" },
            start: { type: "STRING", description: "Час початку HH:MM" },
            end: { type: "STRING", description: "Час закінчення HH:MM" },
          },
          required: ["date", "start", "end"],
        },
      },
      {
        name: "generate_request_text",
        description:
          "Генерує професійний та гарно сформульований текст заяви на відпустку, лікарняний або вихідний. Використовуй цей інструмент коли користувач просить написати, скласти або сформулювати заяву.",
        parameters: {
          type: "OBJECT",
          properties: {
            request_type: {
              type: "STRING",
              description:
                "Тип заяви: vacation (відпустка), sick (лікарняний), dayoff (вихідний)",
              enum: ["vacation", "sick", "dayoff"],
            },
            date_from: {
              type: "STRING",
              description: "Дата початку у форматі YYYY-MM-DD",
            },
            date_to: {
              type: "STRING",
              description: "Дата закінчення у форматі YYYY-MM-DD",
            },
            reason: {
              type: "STRING",
              description:
                "Причина (необов'язково, але бажано для кращої генерації тексту)",
            },
            tone: {
              type: "STRING",
              description:
                "Стиль тексту: formal (офіційний), friendly (дружній), brief (стислий)",
              enum: ["formal", "friendly", "brief"],
            },
          },
          required: ["request_type", "date_from", "date_to"],
        },
      },
    ],
  },
];

function tool_get_all_shifts({ employee_name } = {}) {
  let shifts = state.shifts;
  if (employee_name) {
    shifts = shifts.filter((s) =>
      s.employeeName.toLowerCase().includes(employee_name.toLowerCase()),
    );
  }
  if (!shifts.length) return { shifts: [], message: "Змін не знайдено" };
  return {
    shifts: shifts.map((s) => ({
      id: s.id,
      employee: s.employeeName,
      date: s.date,
      start: s.start,
      end: s.end,
      hours: ((timeToMinutes(s.end) - timeToMinutes(s.start)) / 60).toFixed(1),
    })),
    total: shifts.length,
  };
}

function tool_detect_conflicts() {
  const conflicts = detectAllConflicts();
  if (!conflicts.length) {
    return {
      conflicts: [],
      message: "Конфліктів не виявлено. Розклад чистий ✅",
    };
  }
  return {
    conflicts: conflicts.map((c) => ({
      date: c.a.date,
      employee_a: c.a.employeeName,
      time_a: `${c.a.start}–${c.a.end}`,
      employee_b: c.b.employeeName,
      time_b: `${c.b.start}–${c.b.end}`,
    })),
    total: conflicts.length,
  };
}

function tool_get_workload_stats() {
  const stats = {};
  state.shifts.forEach((s) => {
    if (!stats[s.employeeName]) {
      stats[s.employeeName] = { shifts: 0, totalHours: 0 };
    }
    const hours = (timeToMinutes(s.end) - timeToMinutes(s.start)) / 60;
    stats[s.employeeName].shifts++;
    stats[s.employeeName].totalHours += hours;
  });
  return {
    employees: Object.entries(stats).map(([name, data]) => ({
      name,
      shifts: data.shifts,
      total_hours: data.totalHours.toFixed(1),
      avg_shift_hours: (data.totalHours / data.shifts).toFixed(1),
    })),
  };
}

function tool_add_shift({ employee_name, date, start, end }) {
  if (state.currentUser?.role !== "admin") {
    return {
      success: false,
      error: "Недостатньо прав. Лише менеджер може додавати зміни.",
    };
  }
  const emp = state.users.find(
    (u) =>
      u.name.toLowerCase().includes(employee_name.toLowerCase()) &&
      u.role === "employee",
  );
  if (!emp) {
    return {
      success: false,
      error: `Працівника "${employee_name}" не знайдено.`,
    };
  }
  const dayShifts = state.shifts.filter((s) => s.date === date);
  const conflicting = dayShifts.filter((s) =>
    overlaps(start, end, s.start, s.end),
  );
  if (conflicting.length) {
    return {
      success: false,
      error: `Конфлікт із наявними змінами: ${conflicting.map((c) => `${c.employeeName} (${c.start}–${c.end})`).join(", ")}`,
    };
  }
  const shiftType = emp.id === 1 ? "anna" : emp.id === 2 ? "karina" : "anna";
  const newShift = {
    id: state.shifts.length + 1,
    userId: emp.id,
    employeeName: emp.name,
    date,
    start,
    end,
    type: shiftType,
  };
  state.shifts.push(newShift);
  renderDashboard();
  return {
    success: true,
    message: `✅ Зміну для ${emp.name} на ${date} (${start}–${end}) успішно додано!`,
    shift_id: newShift.id,
  };
}

function tool_get_pending_requests() {
  const pendingLeave = state.requests
    .filter((r) => r.status === "pending")
    .map((r) => ({
      id: r.id,
      type: "leave",
      request_type: r.typeLabel,
      employee: r.userName,
      from: r.from,
      to: r.to,
      reason: r.reason || "",
    }));
  const pendingShifts = state.shiftRequests
    .filter((r) => r.status === "pending")
    .map((r) => ({
      id: r.id,
      type: "shift",
      employee: r.userName,
      date: r.date,
      start: r.start,
      end: r.end,
    }));
  const all = [...pendingLeave, ...pendingShifts];
  if (!all.length) return { requests: [], message: "Активних заявок немає." };
  return { requests: all, total: all.length };
}

function tool_approve_shift_request({ request_id }) {
  if (state.currentUser?.role !== "admin")
    return { success: false, error: "Недостатньо прав." };
  const req = state.shiftRequests.find((r) => r.id === request_id);
  if (!req)
    return { success: false, error: `Заявку #${request_id} не знайдено.` };
  if (req.status !== "pending")
    return { success: false, error: "Заявку вже оброблено." };
  const dayShifts = state.shifts.filter((s) => s.date === req.date);
  const conflicts = dayShifts.filter((s) =>
    overlaps(req.start, req.end, s.start, s.end),
  );
  if (conflicts.length)
    return { success: false, error: "Конфлікт із наявними змінами." };
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
  renderDashboard();
  renderShiftRequests();
  return {
    success: true,
    message: `✅ Заявку #${request_id} від ${req.userName} схвалено!`,
  };
}

function tool_reject_shift_request({ request_id }) {
  if (state.currentUser?.role !== "admin")
    return { success: false, error: "Недостатньо прав." };
  const req = state.shiftRequests.find((r) => r.id === request_id);
  if (!req)
    return { success: false, error: `Заявку #${request_id} не знайдено.` };
  req.status = "rejected";
  renderShiftRequests();
  return {
    success: true,
    message: `❌ Заявку #${request_id} від ${req.userName} відхилено.`,
  };
}

function tool_check_shift_conflict({ date, start, end }) {
  const dayShifts = state.shifts.filter((s) => s.date === date);
  const conflicting = dayShifts.filter((s) =>
    overlaps(start, end, s.start, s.end),
  );
  if (!conflicting.length) {
    return {
      has_conflict: false,
      message: `Конфліктів немає. Зміна ${start}–${end} на ${date} вільна ✅`,
    };
  }
  return {
    has_conflict: true,
    conflicting_shifts: conflicting.map((c) => ({
      employee: c.employeeName,
      time: `${c.start}–${c.end}`,
    })),
  };
}

function tool_generate_request_text({
  request_type,
  date_from,
  date_to,
  reason = "",
  tone = "formal",
}) {
  const u = state.currentUser;
  const userName = u?.name || "Працівник";

  const formatDate = (dateStr) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  };

  const from = formatDate(date_from);
  const to = formatDate(date_to);

  const templates = {
    vacation: {
      formal: `Шановний керівництво!

Прошу надати мені щорічну оплачувану відпустку з ${from} по ${to}${reason ? ` у зв'язку з ${reason}` : ""}.

З повагою,
${userName}
${new Date().toLocaleDateString("uk-UA")}`,

      friendly: `Доброго дня!

Хотів(ла) б попросити відпустку з ${from} по ${to}${reason ? `. Причина: ${reason}` : ""}. Всі справи буде завершено перед від'їздом.

Дякую за розуміння!
${userName}`,

      brief: `Прошу відпустку: ${from} — ${to}${reason ? `\nПричина: ${reason}` : ""}

${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
    },

    sick: {
      formal: `Шановний керівництво!

Звертаюся до Вас із проханням надати мені лікарняний з ${from} по ${to}${reason ? ` у зв'язку з ${reason}` : " за станом здоров'я"}. Медичну довідку надам найближчим часом.

З повагою,
${userName}
${new Date().toLocaleDateString("uk-UA")}`,

      friendly: `Доброго дня!

На жаль, потрібен лікарняний з ${from} по ${to}${reason ? ` (${reason})` : ""}. Довідку принесу як тільки отримаю.

Дякую!
${userName}`,

      brief: `Лікарняний: ${from} — ${to}${reason ? `\n${reason}` : ""}
Довідка буде надана.

${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
    },

    dayoff: {
      formal: `Шановний керівництво!

Прошу надати мені день відпочинку за власний рахунок з ${from} по ${to}${reason ? ` у зв'язку з ${reason}` : " через сімейні обставини"}.

З повагою,
${userName}
${new Date().toLocaleDateString("uk-UA")}`,

      friendly: `Доброго дня!

Чи можна взяти вихідний з ${from} по ${to}${reason ? `? ${reason}` : " через особисті справи"}. Буду вдячний(на) за розуміння.

Дякую!
${userName}`,

      brief: `Вихідний за власний рахунок: ${from} — ${to}${reason ? `\n${reason}` : ""}

${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
    },
  };

  const typeLabels = {
    vacation: "🏖️ Відпустка",
    sick: "🤒 Лікарняний",
    dayoff: "☀️ Вихідний",
  };

  const text =
    templates[request_type]?.[tone] || templates[request_type].formal;

  return {
    success: true,
    request_type_label: typeLabels[request_type],
    generated_text: text,
    dates: { from: date_from, to: date_to },
    tone_used: tone,
    message:
      "✍️ Текст заяви згенеровано! Ви можете скопіювати його або відредагувати за потреби.",
  };
}

function executeToolCall(toolName, toolArgs) {
  const tools = {
    get_all_shifts: tool_get_all_shifts,
    detect_conflicts: tool_detect_conflicts,
    get_workload_stats: tool_get_workload_stats,
    add_shift: tool_add_shift,
    get_pending_requests: tool_get_pending_requests,
    approve_shift_request: tool_approve_shift_request,
    reject_shift_request: tool_reject_shift_request,
    check_shift_conflict: tool_check_shift_conflict,
    generate_request_text: tool_generate_request_text,
  };
  if (tools[toolName]) {
    try {
      return tools[toolName](toolArgs || {});
    } catch (e) {
      return { error: `Помилка виконання: ${e.message}` };
    }
  }
  return { error: `Невідомий інструмент: ${toolName}` };
}

async function runAgentLoop(userMessage) {
  const u = state.currentUser;
  const systemInstruction = `Ти — ШІ-асистент системи управління змінами WorkiFy.
Поточний користувач: ${u.name} (роль: ${u.role === "admin" ? "Менеджер" : "Працівник"}).

ВАЖЛИВІ ПРАВИЛА:
1. Відповідай ТІЛЬКИ українською мовою
2. Будь конкретним і корисним
3. Використовуй доступні інструменти для отримання реальних даних перед відповіддю
4. Якщо роль "employee" — не виконуй дії тільки для менеджерів (add_shift, approve/reject)
5. Форматуй відповіді зрозуміло з емодзі де доречно
6. Коли користувач просить написати/скласти/сформулювати заяву — ОБОВ'ЯЗКОВО використовуй інструмент generate_request_text
7. Після генерації тексту заяви — виводь його у форматованому блоці, щоб користувач міг легко скопіювати`;

  const GEMINI_MODEL = "gemini-2.0-flash";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${aiApiKey}`;
  const contents = [
    ...chatHistory,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: contents,
      tools: GEMINI_TOOLS,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error("Порожня відповідь від Gemini");

    const parts = candidate.content?.parts || [];

    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      contents.push({ role: "model", parts });

      const responseParts = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        appendToolCallBubble(name, args);
        const result = executeToolCall(name, args);
        responseParts.push({
          functionResponse: {
            name,
            response: { result },
          },
        });
      }

      contents.push({ role: "user", parts: responseParts });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const finalText = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n");

    chatHistory.push({ role: "user", parts: [{ text: userMessage }] });
    chatHistory.push({ role: "model", parts: [{ text: finalText }] });

    if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);

    return finalText || "...";
  }

  return "Досягнуто ліміт ітерацій. Спробуйте переформулювати запит.";
}

function renderAiPage() {
  const setupCard = document.getElementById("ai-setup-card");
  const chatWrap = document.getElementById("ai-chat-wrapper");
  if (aiApiKey) {
    setupCard.style.display = "none";
    chatWrap.style.display = "flex";
  } else {
    setupCard.style.display = "block";
    chatWrap.style.display = "none";
  }
}

function saveApiKey() {
  const key = document.getElementById("api-key-input").value.trim();
  if (!key || key.length < 10) {
    showToast("Введіть правильний API ключ", "error");
    return;
  }
  aiApiKey = key;
  localStorage.setItem("workify_gemini_key", key);
  chatHistory = [];
  showToast("API ключ збережено!", "success");
  renderAiPage();
}

function disconnectApi() {
  aiApiKey = "";
  localStorage.removeItem("workify_gemini_key");
  chatHistory = [];
  renderAiPage();
  showToast("Відключено від AI", "error");
}

function sendQuickMsg(text) {
  document.getElementById("chat-input").value = text;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const text = input.value.trim();
  if (!text) return;
  if (!aiApiKey) {
    showToast("Спочатку підключіть API ключ", "error");
    return;
  }

  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  appendMessage("user", text);
  const thinkingId = appendThinking();

  try {
    const reply = await runAgentLoop(text);
    removeThinking(thinkingId);
    appendMessage("assistant", reply);
  } catch (err) {
    removeThinking(thinkingId);
    appendMessage(
      "assistant",
      `❌ Помилка: ${err.message}\n\nПеревірте правильність API ключа та підключення до інтернету.`,
    );
  }

  input.disabled = false;
  sendBtn.disabled = false;
  input.focus();
}

function appendMessage(role, text) {
  const container = document.getElementById("chat-messages");
  const u = state.currentUser;
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;

  const avatar =
    role === "user"
      ? `<div class="msg-avatar">${u?.initials || "Я"}</div>`
      : `<div class="msg-avatar">🤖</div>`;

  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  if (
    formatted.includes("Шановний") ||
    formatted.includes("Прошу") ||
    formatted.includes("З повагою")
  ) {
    formatted = formatted.replace(
      /(Шановний[\s\S]*?(?:\d{2}\.\d{2}\.\d{4}|Дякую!))/g,
      '<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;margin:10px 0;font-size:13px;line-height:1.8;white-space:pre-wrap;font-family:var(--font-mono)">$1</div>',
    );
  }

  div.innerHTML = `${avatar}<div class="msg-bubble">${formatted}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendToolCallBubble(toolName, args) {
  const container = document.getElementById("chat-messages");
  const toolLabels = {
    get_all_shifts: "📅 get_all_shifts — отримання змін",
    detect_conflicts: "⚠️ detect_conflicts — перевірка конфліктів",
    get_workload_stats: "📊 get_workload_stats — аналіз навантаження",
    add_shift: "➕ add_shift — додавання зміни",
    get_pending_requests: "📝 get_pending_requests — перегляд заявок",
    approve_shift_request: "✅ approve_shift_request — схвалення заявки",
    reject_shift_request: "❌ reject_shift_request — відхилення заявки",
    check_shift_conflict: "🔍 check_shift_conflict — перевірка конфлікту",
    generate_request_text: "✍️ generate_request_text — генерація тексту заяви",
  };
  const div = document.createElement("div");
  div.className = "chat-msg assistant";
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="tool-call">
        <div class="tool-call-label">⚡ Виклик інструменту</div>
        ${toolLabels[toolName] || toolName}
        ${args && Object.keys(args).length ? `<br><span style="color:var(--text-dim);font-size:10px">${JSON.stringify(args)}</span>` : ""}
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendThinking() {
  const container = document.getElementById("chat-messages");
  const id = "thinking-" + Date.now();
  const div = document.createElement("div");
  div.id = id;
  div.className = "chat-msg assistant";
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble thinking">
      Думаю...
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
