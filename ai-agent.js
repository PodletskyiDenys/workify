/**
 * WorkiFy AI Agent — Function Calling з Google Gemini API
 * Використовує Gemini 2.0 Flash з function calling (tool_use) паттерном.
 * ШІ може викликати реальні функції системи: переглядати розклад,
 * перевіряти конфлікти, аналізувати навантаження, схвалювати заявки.
 */

// ── Storage ───────────────────────────────────────────────────────────────────
let aiApiKey = localStorage.getItem("workify_gemini_key") || "";
let chatHistory = []; // multi-turn conversation history

// ── Gemini API Config ─────────────────────────────────────────────────────────
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Tool Definitions (формат Gemini Function Declarations) ────────────────────
const AI_TOOLS = [
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
          required: [],
        },
      },
      {
        name: "detect_conflicts",
        description:
          "Аналізує розклад і повертає всі конфлікти (накладання змін за датою та часом).",
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
          "Додає нову зміну до розкладу. Використовуй тільки якщо поточний користувач — менеджер (admin). Перед додаванням перевір конфлікти.",
        parameters: {
          type: "OBJECT",
          properties: {
            employee_name: {
              type: "STRING",
              description:
                "Повне ім'я працівника (Анна Коваленко або Каріна Мельник)",
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
    ],
  },
];

// ── Tool Implementations (реальні функції системи) ────────────────────────────

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
  const isAdmin = state.currentUser?.role === "admin";
  if (!isAdmin) {
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
  const isAdmin = state.currentUser?.role === "admin";
  if (!isAdmin) return { success: false, error: "Недостатньо прав." };

  const req = state.shiftRequests.find((r) => r.id === request_id);
  if (!req)
    return { success: false, error: `Заявку #${request_id} не знайдено.` };
  if (req.status !== "pending")
    return {
      success: false,
      error: `Заявку вже оброблено (статус: ${req.status}).`,
    };

  const dayShifts = state.shifts.filter((s) => s.date === req.date);
  const conflicts = dayShifts.filter((s) =>
    overlaps(req.start, req.end, s.start, s.end),
  );
  if (conflicts.length) {
    return { success: false, error: "Конфлікт із наявними змінами." };
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
  renderDashboard();
  renderShiftRequests();
  return {
    success: true,
    message: `✅ Заявку #${request_id} від ${req.userName} схвалено!`,
  };
}

function tool_reject_shift_request({ request_id }) {
  const isAdmin = state.currentUser?.role === "admin";
  if (!isAdmin) return { success: false, error: "Недостатньо прав." };

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

// ── Tool Dispatcher ───────────────────────────────────────────────────────────

function executeToolCall(toolName, toolInput) {
  const tools = {
    get_all_shifts: tool_get_all_shifts,
    detect_conflicts: tool_detect_conflicts,
    get_workload_stats: tool_get_workload_stats,
    add_shift: tool_add_shift,
    get_pending_requests: tool_get_pending_requests,
    approve_shift_request: tool_approve_shift_request,
    reject_shift_request: tool_reject_shift_request,
    check_shift_conflict: tool_check_shift_conflict,
  };

  if (tools[toolName]) {
    try {
      return tools[toolName](toolInput);
    } catch (e) {
      return { error: `Помилка виконання: ${e.message}` };
    }
  }
  return { error: `Невідомий інструмент: ${toolName}` };
}

// ── Gemini Agentic Loop ───────────────────────────────────────────────────────

/**
 * Конвертує внутрішню історію чату у формат Gemini.
 * Gemini використовує role: "user" / "model" (не "assistant")
 * та content як масив parts.
 */
function buildGeminiHistory() {
  return chatHistory.map((msg) => {
    // Якщо вже у форматі Gemini (масив parts) — передаємо як є
    if (Array.isArray(msg.parts)) return msg;

    const role = msg.role === "assistant" ? "model" : msg.role;

    if (typeof msg.content === "string") {
      return { role, parts: [{ text: msg.content }] };
    }

    // Gemini tool result format
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map((block) => {
        if (block.type === "tool_result") {
          return {
            functionResponse: {
              name: block.name,
              response: JSON.parse(block.content),
            },
          };
        }
        return { text: JSON.stringify(block) };
      });
      return { role, parts };
    }

    return { role, parts: [{ text: JSON.stringify(msg.content) }] };
  });
}

async function runAgentLoop(userMessage) {
  const u = state.currentUser;
  const systemInstruction = `Ти — ШІ-асистент системи управління змінами WorkiFy.
Поточний користувач: ${u.name} (роль: ${u.role === "admin" ? "Менеджер" : "Працівник"}).
Відповідай українською мовою. Будь конкретним і корисним.
Використовуй доступні інструменти для отримання реальних даних системи перед відповіддю.
Якщо користувач просить показати дані — обов'язково виклич відповідний інструмент.
Якщо роль "employee" — не виконуй дії тільки для менеджерів (add_shift, approve/reject).
Форматуй відповіді зрозуміло. Використовуй емодзі де доречно.`;

  // Додаємо повідомлення користувача до історії
  chatHistory.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // Агентна петля
  while (true) {
    const requestBody = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: buildGeminiHistory(),
      tools: AI_TOOLS,
      tool_config: { function_calling_config: { mode: "AUTO" } },
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.7,
      },
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${aiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.error?.message || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    const data = await response.json();

    // Перевіряємо наявність відповіді
    if (!data.candidates || !data.candidates[0]) {
      throw new Error("Порожня відповідь від Gemini API");
    }

    const candidate = data.candidates[0];
    const content = candidate.content; // { role: 'model', parts: [...] }

    // Перевіряємо чи є function calls у відповіді
    const functionCalls = content.parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      // Додаємо відповідь моделі з function calls до історії
      chatHistory.push(content);

      // Виконуємо всі function calls та збираємо результати
      const functionResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;

        // Показуємо виклик інструменту в UI
        appendToolCallBubble(name, args || {});

        const result = executeToolCall(name, args || {});
        functionResponses.push({
          functionResponse: {
            name,
            response: result,
          },
        });
      }

      // Додаємо результати function calls до історії як повідомлення user (вимога Gemini)
      chatHistory.push({
        role: "user",
        parts: functionResponses,
      });

      // Продовжуємо петлю
      continue;
    }

    // Фінальна текстова відповідь
    const finalText = content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n");

    // Зберігаємо фінальну відповідь в історію
    chatHistory.push(content);

    return finalText || "Відповідь отримано, але текст порожній.";
  }
}

// ── UI Functions ──────────────────────────────────────────────────────────────

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
  if (!key) {
    showToast("Введіть API ключ", "error");
    return;
  }
  // Gemini ключі зазвичай починаються з 'AIza'
  if (!key.startsWith("AIza") && key.length < 20) {
    showToast("Невірний формат ключа Gemini", "error");
    return;
  }
  aiApiKey = key;
  localStorage.setItem("workify_gemini_key", key);
  chatHistory = [];
  showToast("Gemini API ключ збережено!", "success");
  renderAiPage();
}

function disconnectApi() {
  aiApiKey = "";
  localStorage.removeItem("workify_gemini_key");
  chatHistory = [];
  renderAiPage();
  showToast("Відключено від Gemini AI", "error");
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

  // Додаємо повідомлення користувача
  appendMessage("user", text);

  // Показуємо індикатор "думає..."
  const thinkingId = appendThinking();

  try {
    const reply = await runAgentLoop(text);
    removeThinking(thinkingId);
    appendMessage("assistant", reply);
  } catch (err) {
    removeThinking(thinkingId);
    appendMessage(
      "assistant",
      `❌ Помилка: ${err.message}\n\nПеревірте правильність Gemini API ключа (має починатись з AIza) та підключення до інтернету.`,
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

  // Просте markdown-форматування
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  div.innerHTML = `${avatar}<div class="msg-bubble">${formatted}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendToolCallBubble(toolName, input) {
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
  };

  const div = document.createElement("div");
  div.className = "chat-msg assistant";
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="tool-call">
        <div class="tool-call-label">⚡ Виклик інструменту (Gemini Function Calling)</div>
        ${toolLabels[toolName] || toolName}
        ${Object.keys(input).length ? `<br><span style="color:var(--text-dim);font-size:10px">${JSON.stringify(input)}</span>` : ""}
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
