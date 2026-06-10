let aiApiKey = localStorage.getItem("workify_gemini_key") || "";
let localChatHistory = [];
let geminiChatHistory = [];
let aiResponses = null;
let currentAiMode = "local";

async function loadAiResponses() {
  try {
    const res = await fetch("data/ai-responses.json");
    aiResponses = await res.json();
  } catch (e) {
    console.warn("ai-responses.json не завантажено:", e.message);
    aiResponses = { intents: [], quick_responses: {} };
  }
}

function renderAiPage() {
  const localWrapper = document.getElementById("ai-chat-wrapper-local");
  const geminiWrapper = document.getElementById("ai-chat-wrapper-gemini");
  const setupCard = document.getElementById("ai-setup-card");
  const gemBanner = document.getElementById("ai-gemini-banner");
  const localInfo = document.getElementById("ai-local-info");

  if (currentAiMode === "gemini") {
    localInfo.style.display = "none";
    localWrapper.style.display = "none";

    if (aiApiKey) {
      setupCard.style.display = "none";
      gemBanner.style.display = "flex";
      geminiWrapper.style.display = "flex";
    } else {
      setupCard.style.display = "block";
      gemBanner.style.display = "none";
      geminiWrapper.style.display = "none";
    }
  } else {
    localInfo.style.display = "flex";
    localWrapper.style.display = "flex";
    setupCard.style.display = "none";
    gemBanner.style.display = "none";
    geminiWrapper.style.display = "none";
  }
}

function switchAiMode(mode) {
  currentAiMode = mode;
  document
    .getElementById("btn-local")
    .classList.toggle("active", mode === "local");
  document
    .getElementById("btn-gemini")
    .classList.toggle("active", mode === "gemini");
  renderAiPage();

  const modeLabel =
    mode === "local" ? "🧠 Локальний режим активовано" : "✨ Режим Gemini AI";
  showToast(modeLabel, "success");
}

function saveApiKey() {
  const key = document.getElementById("api-key-input").value.trim();
  if (!key || key.length < 10) {
    showToast("Введіть правильний API ключ", "error");
    return;
  }
  aiApiKey = key;
  localStorage.setItem("workify_gemini_key", key);
  geminiChatHistory = [];
  showToast("API ключ збережено! Gemini AI активовано.", "success");
  renderAiPage();
}

function disconnectApi() {
  aiApiKey = "";
  localStorage.removeItem("workify_gemini_key");
  geminiChatHistory = [];
  renderAiPage();
  showToast("Відключено від Gemini AI", "error");
}

function getActiveChatContainer() {
  if (currentAiMode === "gemini" && aiApiKey) {
    return document.getElementById("gemini-chat-messages");
  }
  return document.getElementById("local-chat-messages");
}

function getActiveInput() {
  if (currentAiMode === "gemini" && aiApiKey) {
    return document.getElementById("gemini-chat-input");
  }
  return document.getElementById("local-chat-input");
}

function getActiveSendBtn() {
  if (currentAiMode === "gemini" && aiApiKey) {
    return document.getElementById("gemini-send-btn");
  }
  return document.getElementById("local-send-btn");
}

async function sendMessage(mode) {
  const input =
    mode === "gemini"
      ? document.getElementById("gemini-chat-input")
      : document.getElementById("local-chat-input");
  const sendBtn =
    mode === "gemini"
      ? document.getElementById("gemini-send-btn")
      : document.getElementById("local-send-btn");
  const container =
    mode === "gemini"
      ? document.getElementById("gemini-chat-messages")
      : document.getElementById("local-chat-messages");

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  appendMessageTo(container, "user", text);
  const thinkingId = appendThinkingTo(container);

  try {
    let reply;
    if (mode === "gemini" && aiApiKey) {
      reply = await runGeminiAgent(text, container);
    } else {
      reply = await runLocalAgent(text);
    }
    removeThinking(thinkingId);
    appendMessageTo(container, "assistant", reply);
  } catch (err) {
    removeThinking(thinkingId);

    if (mode === "gemini") {
      const isQuotaError =
        err.message.includes("429") ||
        err.message.includes("quota") ||
        err.message.includes("limit") ||
        err.message.includes("exhausted") ||
        err.message.includes("RESOURCE_EXHAUSTED");

      if (isQuotaError) {
        appendMessageTo(
          container,
          "assistant",
          "⚠️ Ліміт запитів Gemini API вичерпано. Використовую локальну базу знань...",
        );
        try {
          const fallbackReply = await runLocalAgent(text);
          appendMessageTo(container, "assistant", fallbackReply);
        } catch (e2) {
          appendMessageTo(
            container,
            "assistant",
            "❌ Помилка локального режиму: " + e2.message,
          );
        }
      } else {
        appendMessageTo(
          container,
          "assistant",
          `❌ Помилка Gemini API: ${err.message}\n\nСпробуйте пізніше або використайте локальний режим.`,
        );
      }
    } else {
      appendMessageTo(container, "assistant", `❌ Помилка: ${err.message}`);
    }
  }

  input.disabled = false;
  sendBtn.disabled = false;
  input.focus();
}

function sendQuickMsg(text, mode) {
  const inputId = mode === "gemini" ? "gemini-chat-input" : "local-chat-input";
  document.getElementById(inputId).value = text;
  sendMessage(mode);
}

function sendLocalQuick(text) {
  sendQuickMsg(text, "local");
}
function sendGeminiQuick(text) {
  sendQuickMsg(text, "gemini");
}

async function runLocalAgent(userMessage) {
  const lower = userMessage.toLowerCase();

  if (aiResponses?.quick_responses) {
    for (const [key, responses] of Object.entries(
      aiResponses.quick_responses,
    )) {
      if (lower.includes(key)) return pickRandom(responses);
    }
  }

  let matchedIntent = null;
  if (aiResponses?.intents) {
    for (const intent of aiResponses.intents) {
      if (intent.id === "unknown") continue;
      if (intent.patterns?.some((p) => lower.includes(p.toLowerCase()))) {
        matchedIntent = intent;
        break;
      }
    }
  }

  if (matchedIntent?.action) {
    const baseReply = pickRandom(matchedIntent.responses);
    const actionResult = executeLocalAction(matchedIntent.action, userMessage);
    if (actionResult) return baseReply + "\n\n" + actionResult;
    return baseReply;
  }

  if (matchedIntent) {
    if (matchedIntent.id === "vacation_request") {
      return handleLocalVacationRequest(lower);
    }
    if (matchedIntent.id === "add_shift_request") {
      return handleLocalAddShiftHint();
    }
    return pickRandom(matchedIntent.responses);
  }

  return parseAndRespond(lower);
}

function executeLocalAction(action, userMessage) {
  switch (action) {
    case "get_all_shifts": {
      if (!state.shifts?.length)
        return "📭 Змін не знайдено. Можливо, дані ще не завантажились — спробуйте через секунду.";
      const result = tool_get_all_shifts();
      if (!result.shifts?.length) return "📭 Змін не знайдено.";
      const byDate = {};
      result.shifts.forEach((s) => {
        if (!byDate[s.date]) byDate[s.date] = [];
        byDate[s.date].push(s);
      });
      const days = [
        "Неділя",
        "Понеділок",
        "Вівторок",
        "Середа",
        "Четвер",
        "П'ятниця",
        "Субота",
      ];
      let out = `**📅 Розклад змін (${result.total} змін):**\n`;
      Object.keys(byDate)
        .sort()
        .forEach((date) => {
          const d = new Date(date);
          const dayName = days[d.getDay()];
          const [y, m, dd] = date.split("-");
          out += `\n**${dayName}, ${dd}.${m}:**\n`;
          byDate[date].forEach((s) => {
            out += `  • ${s.employee} — ${s.start}-${s.end} (${s.hours} год)\n`;
          });
        });
      return out;
    }
    case "detect_conflicts": {
      if (!state.shifts?.length)
        return "📭 Немає змін для перевірки. Завантажте дані спочатку.";
      const result = tool_detect_conflicts();
      if (!result.conflicts?.length)
        return "✅ Конфліктів не виявлено! Розклад чистий — жодних накладань між змінами.";
      return (
        "**⚠️ Виявлено " +
        result.total +
        " конфліктів:**\n\n" +
        result.conflicts
          .map(
            (c, i) =>
              `${i + 1}. **${c.date}** — накладання:\n   🔴 ${c.employee_a} (${c.time_a})\n   🔵 ${c.employee_b} (${c.time_b})`,
          )
          .join("\n\n")
      );
    }
    case "get_workload_stats": {
      if (!state.shifts?.length) return "📭 Немає даних для аналізу.";
      const result = tool_get_workload_stats();
      const sorted = result.employees.sort(
        (a, b) => parseFloat(b.total_hours) - parseFloat(a.total_hours),
      );
      let out = "**📊 Статистика навантаження:**\n\n";
      sorted.forEach((e, i) => {
        const bar = "█".repeat(Math.round(parseFloat(e.total_hours) / 2));
        out += `${i + 1}. **${e.name}**\n   ${e.shifts} змін · ${e.total_hours} год · ~${e.avg_shift_hours} год/зміна\n   ${bar}\n`;
      });
      const totalHours = sorted.reduce(
        (s, e) => s + parseFloat(e.total_hours),
        0,
      );
      out += `\n**Разом:** ${totalHours.toFixed(1)} годин на ${sorted.length} працівників`;
      return out;
    }
    case "get_pending_requests": {
      const result = tool_get_pending_requests();
      if (!result.requests?.length)
        return "📭 Активних заявок немає. Все оброблено!";
      let out = "**📝 Активні заявки (" + result.total + "):**\n\n";
      result.requests.forEach((r, i) => {
        if (r.type === "leave") {
          out += `${i + 1}. ${r.request_type} — **${r.employee}**\n   📅 ${r.from} → ${r.to}${r.reason ? "\n   💬 " + r.reason : ""}\n`;
        } else {
          out += `${i + 1}. 🗓️ Заявка на зміну — **${r.employee}**\n   📅 ${r.date} · ${r.start}-${r.end} (ID: ${r.id})\n`;
        }
      });
      return out;
    }
    case "get_my_shifts": {
      const u = state.currentUser;
      if (!u) return "❌ Потрібно увійти в систему.";
      const myShifts = state.shifts.filter((s) => s.userId === u.id);
      if (!myShifts.length)
        return `📭 У вас (${u.name}) немає запланованих змін на цей тиждень.`;
      const totalH = myShifts.reduce(
        (s, sh) => s + (timeToMinutes(sh.end) - timeToMinutes(sh.start)) / 60,
        0,
      );
      const days = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      let out = `**👤 Ваш графік (${u.name}) — ${myShifts.length} змін, ${totalH.toFixed(0)} год:**\n\n`;
      myShifts
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((s) => {
          const d = new Date(s.date);
          const dayName = days[d.getDay()];
          const hrs = (
            (timeToMinutes(s.end) - timeToMinutes(s.start)) /
            60
          ).toFixed(1);
          out += `• **${dayName} ${s.date.split("-")[2]}.${s.date.split("-")[1]}** — ${s.start}-${s.end} (${hrs} год)${s.note ? " · " + s.note : ""}\n`;
        });
      return out;
    }
    default:
      return "";
  }
}

function parseAndRespond(lower) {
  if (lower.includes("анна") || lower.includes("anna")) {
    const shifts = state.shifts.filter((s) => s.userId === 1);
    return (
      `👤 **Анна Коваленко** має ${shifts.length} змін:\n` +
      shifts.map((s) => `• ${s.date} · ${s.start}-${s.end}`).join("\n")
    );
  }
  if (lower.includes("каріна") || lower.includes("karina")) {
    const shifts = state.shifts.filter((s) => s.userId === 2);
    return (
      `👤 **Каріна Мельник** має ${shifts.length} змін:\n` +
      shifts.map((s) => `• ${s.date} · ${s.start}-${s.end}`).join("\n")
    );
  }
  if (lower.includes("олег") || lower.includes("oleg")) {
    const shifts = state.shifts.filter((s) => s.userId === 4);
    return (
      `👤 **Олег Петренко** має ${shifts.length} змін:\n` +
      shifts.map((s) => `• ${s.date} · ${s.start}-${s.end}`).join("\n")
    );
  }
  if (lower.includes("марина") || lower.includes("marina")) {
    const shifts = state.shifts.filter((s) => s.userId === 5);
    return (
      `👤 **Марина Савченко** має ${shifts.length} змін:\n` +
      shifts.map((s) => `• ${s.date} · ${s.start}-${s.end}`).join("\n")
    );
  }
  if (lower.match(/\d{4}-\d{2}-\d{2}/)) {
    const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const dayShifts = state.shifts.filter((s) => s.date === dateStr);
      if (dayShifts.length) {
        return (
          `📅 **Зміни на ${dateStr}:**\n` +
          dayShifts
            .map((s) => `• ${s.employeeName} · ${s.start}-${s.end}`)
            .join("\n")
        );
      } else {
        return `📅 На ${dateStr} змін немає.`;
      }
    }
  }
  if (
    lower.includes("год") ||
    lower.includes("час") ||
    lower.includes("скільк")
  ) {
    return executeLocalAction("get_workload_stats", lower);
  }
  if (
    lower.includes("усі") ||
    lower.includes("всі") ||
    lower.includes("список")
  ) {
    return executeLocalAction("get_all_shifts", lower);
  }
  if (
    lower.includes("заяв") ||
    lower.includes("відпустк") ||
    lower.includes("лікарн") ||
    lower.includes("вихідн")
  ) {
    return handleLocalVacationRequest(lower);
  }
  if (lower.includes("дружн") || lower.includes("friendly")) {
    const result = tool_generate_request_text({
      request_type: "vacation",
      date_from: "2026-07-01",
      date_to: "2026-07-14",
      reason: "",
      tone: "friendly",
    });
    return `✍️ Заява (дружній стиль):\n\n${result.generated_text}`;
  }
  if (
    lower.includes("коротк") ||
    lower.includes("brief") ||
    lower.includes("стисл")
  ) {
    const result = tool_generate_request_text({
      request_type: "vacation",
      date_from: "2026-07-01",
      date_to: "2026-07-14",
      reason: "",
      tone: "brief",
    });
    return `✍️ Заява (стислий стиль):\n\n${result.generated_text}`;
  }
  const unknownIntent = aiResponses?.intents?.find((i) => i.id === "unknown");
  if (unknownIntent?.responses?.length)
    return pickRandom(unknownIntent.responses);
  return "Не зрозумів запит. Спробуйте: 'покажи зміни', 'перевір конфлікти', 'аналіз навантаження', 'активні заявки'.";
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function handleLocalVacationRequest(lower) {
  const u = state.currentUser;
  const userName = u?.name || "Працівник";
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 7);
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 14);

  const fDate = (d) => d.toLocaleDateString("uk-UA");
  const fISO = (d) => d.toISOString().split("T")[0];

  let requestType = "vacation";
  let typeLabel = "🏖️ Відпустка";
  if (
    lower.includes("лікарн") ||
    lower.includes("хвор") ||
    lower.includes("sick")
  ) {
    requestType = "sick";
    typeLabel = "🤒 Лікарняний";
  } else if (
    lower.includes("вихід") ||
    lower.includes("dayoff") ||
    lower.includes("day off")
  ) {
    requestType = "dayoff";
    typeLabel = "☀️ Вихідний";
  }

  const dateMatch = lower.match(
    /(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/g,
  );
  let fromDate = tomorrow;
  let toDate = weekLater;
  if (dateMatch && dateMatch.length >= 1) {
    const parts1 = dateMatch[0].split(/[.\-/]/);
    fromDate = new Date(2026, parseInt(parts1[1]) - 1, parseInt(parts1[0]));
    if (dateMatch.length >= 2) {
      const parts2 = dateMatch[1].split(/[.\-/]/);
      toDate = new Date(2026, parseInt(parts2[1]) - 1, parseInt(parts2[0]));
    } else {
      toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 7);
    }
  }

  const result = tool_generate_request_text({
    request_type: requestType,
    date_from: fISO(fromDate),
    date_to: fISO(toDate),
    reason: "",
    tone: "formal",
  });

  return `✍️ Генерую текст заяви (${typeLabel}):\n\n${result.generated_text}\n\n---\n📋 **Стилі:** Офіційний стиль. Для іншого стилю напишіть: "заява дружня" або "заява коротка".\n📅 **Дати:** ${fDate(fromDate)} - ${fDate(toDate)}. Для інших дат вкажіть їх у запиті.`;
}

function handleLocalAddShiftHint() {
  const u = state.currentUser;
  if (u?.role === "admin") {
    return "➕ Щоб додати зміну, перейдіть на сторінку **«Додати зміну»** у боковому меню, або вкажіть деталі:\n\n• Ім'я працівника\n• Дата (наприклад: 2026-06-20)\n• Час початку та кінця (наприклад: 08:00-16:00)\n\nАбо використайте **Gemini AI режим** для додавання через текстову команду.";
  }
  return "📋 Щоб подати заявку на зміну, перейдіть на сторінку **«Додати зміну»** у боковому меню. Ваша заявка піде на розгляд менеджеру.";
}

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_all_shifts",
        description: "Повертає список всіх змін у системі WorkiFy.",
        parameters: {
          type: "OBJECT",
          properties: {
            employee_name: {
              type: "STRING",
              description: "Необов'язково: фільтр по імені",
            },
          },
        },
      },
      {
        name: "detect_conflicts",
        description:
          "Аналізує розклад і повертає всі конфлікти — накладання змін.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_workload_stats",
        description:
          "Розраховує статистику навантаження: кількість годин кожного працівника.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "add_shift",
        description: "Додає нову зміну до розкладу (тільки для менеджера).",
        parameters: {
          type: "OBJECT",
          properties: {
            employee_name: {
              type: "STRING",
              description: "Ім'я або частина імені працівника",
            },
            date: { type: "STRING", description: "Дата у форматі YYYY-MM-DD" },
            start: { type: "STRING", description: "Час початку HH:MM" },
            end: { type: "STRING", description: "Час закінчення HH:MM" },
          },
          required: ["employee_name", "date", "start", "end"],
        },
      },
      {
        name: "get_pending_requests",
        description: "Повертає всі заяви та заявки зі статусом 'на розгляді'.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "approve_shift_request",
        description: "Схвалює заявку на зміну за ID (тільки менеджер).",
        parameters: {
          type: "OBJECT",
          properties: {
            request_id: { type: "NUMBER", description: "ID заявки" },
          },
          required: ["request_id"],
        },
      },
      {
        name: "reject_shift_request",
        description: "Відхиляє заявку на зміну за ID (тільки менеджер).",
        parameters: {
          type: "OBJECT",
          properties: {
            request_id: { type: "NUMBER", description: "ID заявки" },
          },
          required: ["request_id"],
        },
      },
      {
        name: "check_shift_conflict",
        description: "Перевіряє конфлікти для конкретного часового слоту.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Дата YYYY-MM-DD" },
            start: { type: "STRING", description: "Час початку HH:MM" },
            end: { type: "STRING", description: "Час закінчення HH:MM" },
          },
          required: ["date", "start", "end"],
        },
      },
      {
        name: "generate_request_text",
        description: "Генерує текст заяви на відпустку/лікарняний/вихідний.",
        parameters: {
          type: "OBJECT",
          properties: {
            request_type: {
              type: "STRING",
              enum: ["vacation", "sick", "dayoff"],
            },
            date_from: {
              type: "STRING",
              description: "Дата початку YYYY-MM-DD",
            },
            date_to: {
              type: "STRING",
              description: "Дата закінчення YYYY-MM-DD",
            },
            reason: { type: "STRING", description: "Причина (необов'язково)" },
            tone: { type: "STRING", enum: ["formal", "friendly", "brief"] },
          },
          required: ["request_type", "date_from", "date_to"],
        },
      },
    ],
  },
];

async function runGeminiAgent(userMessage, chatContainer) {
  const u = state.currentUser;
  const systemInstruction = `Ти — ШІ-асистент системи управління змінами WorkiFy.
Поточний користувач: ${u.name} (роль: ${u.role === "admin" ? "Менеджер" : "Працівник"}).

ПРАВИЛА:
1. Відповідай ТІЛЬКИ українською мовою
2. Використовуй інструменти для отримання реальних даних
3. Якщо роль "employee" — не виконуй дії тільки для менеджерів
4. Форматуй відповіді з емодзі де доречно
5. Коли просять написати заяву — використовуй generate_request_text
6. Виводь текст заяви у форматованому блоці для легкого копіювання`;

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiApiKey}`;
  const contents = [
    ...geminiChatHistory,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let maxIter = 10,
    iter = 0;

  while (iter < maxIter) {
    iter++;
    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: GEMINI_TOOLS,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length > 0) {
      contents.push({ role: "model", parts });
      const responseParts = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        appendToolCallBubbleTo(chatContainer, name, args);
        const result = executeToolCall(name, args);
        responseParts.push({
          functionResponse: { name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    const finalText = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n");
    geminiChatHistory.push({ role: "user", parts: [{ text: userMessage }] });
    geminiChatHistory.push({ role: "model", parts: [{ text: finalText }] });
    if (geminiChatHistory.length > 40)
      geminiChatHistory = geminiChatHistory.slice(-40);
    return finalText || "...";
  }
  return "Досягнуто ліміт ітерацій. Спробуйте переформулювати запит.";
}

function tool_get_all_shifts({ employee_name } = {}) {
  let shifts = state.shifts;
  if (employee_name)
    shifts = shifts.filter((s) =>
      s.employeeName.toLowerCase().includes(employee_name.toLowerCase()),
    );
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
  if (!conflicts.length)
    return {
      conflicts: [],
      message: "Конфліктів не виявлено. Розклад чистий ✅",
    };
  return {
    conflicts: conflicts.map((c) => ({
      date: c.a.date,
      employee_a: c.a.employeeName,
      time_a: `${c.a.start}-${c.a.end}`,
      employee_b: c.b.employeeName,
      time_b: `${c.b.start}-${c.b.end}`,
    })),
    total: conflicts.length,
  };
}

function tool_get_workload_stats() {
  const stats = {};
  state.shifts.forEach((s) => {
    if (!stats[s.employeeName])
      stats[s.employeeName] = { shifts: 0, totalHours: 0 };
    stats[s.employeeName].shifts++;
    stats[s.employeeName].totalHours +=
      (timeToMinutes(s.end) - timeToMinutes(s.start)) / 60;
  });
  return {
    employees: Object.entries(stats).map(([name, d]) => ({
      name,
      shifts: d.shifts,
      total_hours: d.totalHours.toFixed(1),
      avg_shift_hours: (d.totalHours / d.shifts).toFixed(1),
    })),
  };
}

function tool_add_shift({ employee_name, date, start, end }) {
  if (state.currentUser?.role !== "admin")
    return {
      success: false,
      error: "Недостатньо прав. Лише менеджер може додавати зміни.",
    };
  const emp = state.users.find(
    (u) =>
      u.name.toLowerCase().includes(employee_name.toLowerCase()) &&
      u.role === "employee",
  );
  if (!emp)
    return {
      success: false,
      error: `Працівника "${employee_name}" не знайдено.`,
    };
  const conflicts = state.shifts
    .filter((s) => s.date === date)
    .filter((s) => overlaps(start, end, s.start, s.end));
  if (conflicts.length)
    return {
      success: false,
      error: `Конфлікт із: ${conflicts.map((c) => `${c.employeeName} (${c.start}-${c.end})`).join(", ")}`,
    };
  const shiftTypes = { 1: "anna", 2: "karina", 4: "oleg", 5: "marina" };
  const newShift = {
    id: state.shifts.length + 1,
    userId: emp.id,
    employeeName: emp.name,
    date,
    start,
    end,
    type: shiftTypes[emp.id] || "anna",
  };
  state.shifts.push(newShift);
  renderDashboard();
  return {
    success: true,
    message: `✅ Зміну для ${emp.name} на ${date} (${start}-${end}) успішно додано!`,
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
  const conflicts = state.shifts
    .filter((s) => s.date === req.date)
    .filter((s) => overlaps(req.start, req.end, s.start, s.end));
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
  if (typeof renderShiftRequests === "function") renderShiftRequests();
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
  if (typeof renderShiftRequests === "function") renderShiftRequests();
  return {
    success: true,
    message: `❌ Заявку #${request_id} від ${req.userName} відхилено.`,
  };
}

function tool_check_shift_conflict({ date, start, end }) {
  const conflicting = state.shifts
    .filter((s) => s.date === date)
    .filter((s) => overlaps(start, end, s.start, s.end));
  if (!conflicting.length)
    return { has_conflict: false, message: `Конфліктів немає ✅` };
  return {
    has_conflict: true,
    conflicting_shifts: conflicting.map((c) => ({
      employee: c.employeeName,
      time: `${c.start}-${c.end}`,
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
  const fDate = (d) => {
    const [y, m, dd] = d.split("-");
    return `${dd}.${m}.${y}`;
  };
  const from = fDate(date_from),
    to = fDate(date_to);
  const reasonText = reason ? ` у зв'язку з ${reason}` : "";
  const templates = {
    vacation: {
      formal: `Директору\nвід ${userName}\n\nЗАЯВА\n\nПрошу надати мені щорічну оплачувану відпустку з ${from} по ${to} включно${reasonText}.\n\nЗ повагою,\n${userName}\n${new Date().toLocaleDateString("uk-UA")}`,
      friendly: `Доброго дня!\n\nХотів(ла) б попросити відпустку з ${from} по ${to}${reason ? `. Причина: ${reason}` : ""}.  Всі справи буду завершено перед від'їздом.\n\nДякую за розуміння!\n${userName}`,
      brief: `Прошу відпустку: ${from} — ${to}${reason ? "\nПричина: " + reason : ""}\n\n${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
    },
    sick: {
      formal: `Директору\nвід ${userName}\n\nЗАЯВА\n\nПрошу надати мені лікарняний з ${from} по ${to}${reason ? " у зв'язку з " + reason : " за станом здоров'я"}. Медичну довідку надам найближчим часом.\n\nЗ повагою,\n${userName}\n${new Date().toLocaleDateString("uk-UA")}`,
      friendly: `Доброго дня!\n\nНа жаль, потрібен лікарняний з ${from} по ${to}${reason ? " (" + reason + ")" : ""}. Довідку принесу як тільки отримаю.\n\nДякую!\n${userName}`,
      brief: `Лікарняний: ${from} — ${to}${reason ? "\n" + reason : ""}\nДовідка буде надана.\n\n${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
    },
    dayoff: {
      formal: `Директору\nвід ${userName}\n\nЗАЯВА\n\nПрошу надати мені день відпочинку за власний рахунок ${from === to ? from : `з ${from} по ${to}`}${reasonText || " через сімейні обставини"}.\n\nЗ повагою,\n${userName}\n${new Date().toLocaleDateString("uk-UA")}`,
      friendly: `Доброго дня!\n\nЧи можна взяти вихідний ${from === to ? from : `з ${from} по ${to}`}${reason ? "? " + reason : " через особисті справи"}. Буду вдячний(на) за розуміння.\n\nДякую!\n${userName}`,
      brief: `Вихідний за власний рахунок: ${from}${from !== to ? " — " + to : ""}${reason ? "\n" + reason : ""}\n\n${userName}, ${new Date().toLocaleDateString("uk-UA")}`,
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
    message: "✍️ Текст заяви згенеровано!",
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
  try {
    return (
      tools[toolName]?.(toolArgs || {}) || {
        error: `Невідомий інструмент: ${toolName}`,
      }
    );
  } catch (e) {
    return { error: `Помилка: ${e.message}` };
  }
}

function appendMessageTo(container, role, text) {
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
    text.includes("ЗАЯВА") ||
    text.includes("Шановний") ||
    text.includes("Прошу надати")
  ) {
    formatted = `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;margin:8px 0;font-size:13px;line-height:1.9;white-space:pre-wrap;font-family:var(--font-mono)">${text}</div>`;
  }
  div.innerHTML = `${avatar}<div class="msg-bubble">${formatted}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendToolCallBubbleTo(container, toolName, args) {
  const toolLabels = {
    get_all_shifts: "📅 get_all_shifts — отримання змін",
    detect_conflicts: "⚠️ detect_conflicts — перевірка конфліктів",
    get_workload_stats: "📊 get_workload_stats — аналіз навантаження",
    add_shift: "➕ add_shift — додавання зміни",
    get_pending_requests: "📝 get_pending_requests — заявки",
    approve_shift_request: "✅ approve_shift_request — схвалення",
    reject_shift_request: "❌ reject_shift_request — відхилення",
    check_shift_conflict: "🔍 check_shift_conflict — перевірка конфлікту",
    generate_request_text: "✍️ generate_request_text — генерація заяви",
  };
  const div = document.createElement("div");
  div.className = "chat-msg assistant";
  div.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-bubble"><div class="tool-call"><div class="tool-call-label">⚡ Виклик інструменту</div>${toolLabels[toolName] || toolName}${args && Object.keys(args).length ? `<br><span style="color:var(--text-dim);font-size:10px">${JSON.stringify(args)}</span>` : ""}</div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendThinkingTo(container) {
  const id = "thinking-" + Date.now();
  const div = document.createElement("div");
  div.id = id;
  div.className = "chat-msg assistant";
  div.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-bubble thinking">Думаю...<div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeThinking(id) {
  document.getElementById(id)?.remove();
}

function appendMessage(role, text) {
  appendMessageTo(getActiveChatContainer(), role, text);
}
function appendToolCallBubble(name, args) {
  appendToolCallBubbleTo(getActiveChatContainer(), name, args);
}
function appendThinking() {
  return appendThinkingTo(getActiveChatContainer());
}

document.addEventListener("DOMContentLoaded", () => {
  loadAiResponses();
});
