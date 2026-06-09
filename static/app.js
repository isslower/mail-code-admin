const state = {
  accounts: [],
  bulkAccounts: [],
  dashboard: null,
  messages: [],
  selectedMessageId: null,
  view: "dashboard",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const icon = (name) => `<svg class="fa-icon" aria-hidden="true"><use href="/icons.svg#fa-${name}"></use></svg>`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 2800);
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function formatTime(value) {
  if (!value) return "未同步";
  const formatted = formatDate(value);
  return formatted.split(" ")[1] || formatted;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function formPayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (form.imap_ssl) data.imap_ssl = form.imap_ssl.checked;
  if (form.smtp_ssl) data.smtp_ssl = form.smtp_ssl.checked;
  return data;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function parseAccountCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV 至少需要表头和一行账号数据");
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const required = [
    "name",
    "email",
    "imap_host",
    "imap_port",
    "imap_ssl",
    "smtp_host",
    "smtp_port",
    "smtp_ssl",
    "username",
    "password",
  ];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`模板缺少字段：${missing.join(", ")}`);
  return rows.slice(1).map((values, index) => {
    const item = { row: index + 2 };
    headers.forEach((header, headerIndex) => {
      item[header] = (values[headerIndex] || "").trim();
    });
    return item;
  });
}

function renderBulkPreview(accounts, summary = "") {
  state.bulkAccounts = accounts;
  $("#bulkImportBtn").disabled = accounts.length === 0;
  $("#bulkImportSummary").textContent = summary || `已读取 ${accounts.length} 行账号，确认无误后可导入`;
  $("#bulkImportSummary").classList.toggle("empty", accounts.length === 0);
  if (!accounts.length) {
    $("#bulkImportPreview").innerHTML = "";
    return;
  }

  $("#bulkImportPreview").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>行号</th>
          <th>名称</th>
          <th>邮箱</th>
          <th>IMAP</th>
          <th>SMTP</th>
        </tr>
      </thead>
      <tbody>
        ${accounts
          .slice(0, 8)
          .map(
            (item) => `
            <tr>
              <td>${item.row}</td>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.email)}</td>
              <td>${escapeHtml(item.imap_host)}:${escapeHtml(item.imap_port)}</td>
              <td>${escapeHtml(item.smtp_host)}:${escapeHtml(item.smtp_port)}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
    ${accounts.length > 8 ? `<p class="message-meta">仅预览前 8 行，其余 ${accounts.length - 8} 行会一起导入。</p>` : ""}
  `;
}

async function boot() {
  try {
    const me = await api("/api/me");
    $("#userName").textContent = me.user;
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    await Promise.all([loadAccounts(), loadDashboard()]);
    await loadMessages();
    setView("dashboard");
  } catch {
    $("#loginView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
  }
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  state.dashboard = data;
  renderDashboard();
  updateMetrics();
}

async function loadAccounts() {
  const data = await api("/api/accounts");
  state.accounts = data.accounts;
  renderAccountOptions();
  renderAccounts();
  updateMetrics();
}

async function loadMessages() {
  const params = new URLSearchParams();
  const accountId = $("#accountFilter").value;
  const q = $("#searchInput").value.trim();
  if (accountId) params.set("account_id", accountId);
  if (q) params.set("q", q);
  if (state.view === "codes") params.set("only_codes", "1");
  const data = await api(`/api/messages?${params.toString()}`);
  state.messages = data.messages;
  renderMessages();
  updateMetrics();
}

function renderDashboard() {
  const dashboard = state.dashboard || { stats: {}, recent_codes: [], logs: [], accounts: [] };
  const stats = dashboard.stats || {};
  $("#dashAccounts").textContent = stats.accounts || 0;
  $("#dashMessages").textContent = stats.messages || 0;
  $("#dashCodes").textContent = stats.codes || 0;
  $("#dashUnprocessed").textContent = stats.unprocessed || 0;

  $("#recentCodes").innerHTML = dashboard.recent_codes.length
    ? dashboard.recent_codes
        .map(
          (item) => `
          <button class="compact-item" data-open-message="${item.id}">
            <span class="code-pill">${escapeHtml(item.code)}</span>
            <strong>${escapeHtml(item.subject || "无主题")}</strong>
            <small>${escapeHtml(item.account_name)} · ${formatDate(item.received_at)}</small>
          </button>
        `
        )
        .join("")
    : `<p class="empty">还没有识别到验证码邮件</p>`;

  $("#accountHealth").innerHTML = dashboard.accounts.length
    ? dashboard.accounts
        .map(
          (account) => `
          <div class="compact-item">
            <span class="status-pill ${account.last_error ? "bad" : "ok"}">${account.last_error ? "异常" : "正常"}</span>
            <strong>${escapeHtml(account.name)}</strong>
            <small>${escapeHtml(account.email)} · 最近同步：${account.last_sync_at ? formatDate(account.last_sync_at) : "未同步"}</small>
            ${account.last_error ? `<small class="error-text">${escapeHtml(account.last_error)}</small>` : ""}
          </div>
        `
        )
        .join("")
    : `<p class="empty">还没有添加邮箱账号</p>`;

  $("#operationLogs").innerHTML = dashboard.logs.length
    ? dashboard.logs
        .map(
          (log) => `
          <div class="log-item">
            <span class="status-pill ${log.level === "error" ? "bad" : log.level === "warning" ? "warn" : "ok"}">${escapeHtml(log.action)}</span>
            <strong>${escapeHtml(log.detail || "")}</strong>
            <small>${formatDate(log.created_at)}</small>
          </div>
        `
        )
        .join("")
    : `<p class="empty">暂无操作日志</p>`;

  $$("[data-open-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      setView("inbox");
      await openMessage(Number(button.dataset.openMessage));
    });
  });
}

function updateMetrics() {
  const dashboardStats = state.dashboard?.stats || {};
  const codeCount = state.messages.filter((message) => message.code).length;
  const latestSync =
    dashboardStats.latest_sync_at ||
    state.accounts
      .map((account) => account.last_sync_at)
      .filter(Boolean)
      .sort()
      .pop();
  $("#metricCodes").textContent = codeCount || dashboardStats.codes || 0;
  $("#metricAccounts").textContent = state.accounts.length || dashboardStats.accounts || 0;
  $("#metricSync").textContent = formatTime(latestSync);
  $("#metricSyncHint").textContent = latestSync ? "最近一次邮箱同步" : "按邮箱手动刷新";
}

function renderAccountOptions() {
  const filter = $("#accountFilter");
  const sendSelect = $("#sendForm select[name='account_id']");
  const options = [
    `<option value="">全部邮箱</option>`,
    ...state.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)} - ${escapeHtml(a.email)}</option>`),
  ].join("");
  const sendOptions = state.accounts
    .map((a) => `<option value="${a.id}">${escapeHtml(a.name)} - ${escapeHtml(a.email)}</option>`)
    .join("");
  const previous = filter.value;
  filter.innerHTML = options;
  filter.value = previous;
  sendSelect.innerHTML = sendOptions || `<option value="">请先添加邮箱账号</option>`;
}

function renderMessages() {
  const list = $("#messageList");
  if (!state.messages.length) {
    list.innerHTML = `<p class="empty padded">暂无邮件</p>`;
    $("#messageDetail").innerHTML = `<p class="empty">选择一封邮件查看详情</p>`;
    return;
  }

  list.innerHTML = state.messages
    .map(
      (m) => `
      <button class="message-item ${m.id === state.selectedMessageId ? "active" : ""}" data-id="${m.id}">
        <span class="message-account">${escapeHtml(m.account_name)} · ${escapeHtml(m.account_email)}</span>
        <span class="message-subject">${escapeHtml(m.subject || "无主题")}</span>
        <span class="message-meta">${escapeHtml(m.sender || "")}</span>
        <span class="status-line">
          ${m.code ? `<span class="code-pill">${escapeHtml(m.code)}</span>` : ""}
          <span class="status-pill ${m.is_processed ? "ok" : "warn"}">${m.is_processed ? "已处理" : "待处理"}</span>
        </span>
        <span class="message-preview">${escapeHtml(m.body_preview || "")}</span>
        <span class="message-meta">${formatDate(m.received_at)}</span>
      </button>
    `
    )
    .join("");
  $$(".message-item").forEach((button) => {
    button.addEventListener("click", () => openMessage(Number(button.dataset.id)));
  });
}

async function openMessage(id) {
  state.selectedMessageId = id;
  renderMessages();
  const data = await api(`/api/messages/${id}`);
  const m = data.message;
  const body = m.body_text || stripHtml(m.body_html || "");
  $("#messageDetail").innerHTML = `
    <div class="detail-head">
      <h3>${escapeHtml(m.subject || "无主题")}</h3>
      <div class="message-meta">发件人：${escapeHtml(m.sender || "")}</div>
      <div class="message-meta">收件邮箱：${escapeHtml(m.account_name)} · ${escapeHtml(m.account_email)}</div>
      <div class="message-meta">时间：${formatDate(m.received_at)}</div>
      <div class="status-line">
        ${m.code ? `<div class="code-pill">验证码 ${escapeHtml(m.code)}</div>` : ""}
        <span class="status-pill ${m.is_processed ? "ok" : "warn"}">${m.is_processed ? "已处理" : "待处理"}</span>
      </div>
    </div>
    <div class="detail-actions">
      ${m.code ? `<button class="primary" id="copyCodeBtn">${icon("copy")}复制验证码</button>` : ""}
      <button class="secondary" id="processedBtn">${icon("check")}${m.is_processed ? "标记未处理" : "标记已处理"}</button>
      <button class="danger" id="deleteLocalBtn">${icon("trash")}本地删除</button>
      <button class="danger" id="deleteRemoteBtn">${icon("trash")}服务器删除</button>
    </div>
    <div class="message-body">${escapeHtml(body || "无正文内容")}</div>
  `;
  $("#copyCodeBtn")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(m.code);
    toast("验证码已复制");
  });
  $("#processedBtn").addEventListener("click", () => markProcessed(id, !m.is_processed));
  $("#deleteLocalBtn").addEventListener("click", () => deleteMessage(id, "local"));
  $("#deleteRemoteBtn").addEventListener("click", () => deleteMessage(id, "remote"));
}

function stripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = value;
  return div.textContent || div.innerText || "";
}

function renderAccounts() {
  const list = $("#accountList");
  if (!state.accounts.length) {
    list.innerHTML = `<p class="empty padded">还没有添加邮箱账号</p>`;
    return;
  }

  list.innerHTML = state.accounts
    .map(
      (a) => `
      <article class="account-card">
        <div class="account-card-head">
          <strong>${escapeHtml(a.name)}</strong>
          <span class="status-pill ${a.last_error ? "bad" : "ok"}">${a.last_error ? "异常" : "正常"}</span>
        </div>
        <span>${escapeHtml(a.email)}</span>
        <span class="message-meta">IMAP ${escapeHtml(a.imap_host)}:${a.imap_port} · SMTP ${escapeHtml(a.smtp_host)}:${a.smtp_port}</span>
        <span class="message-meta">上次同步：${a.last_sync_at ? formatDate(a.last_sync_at) : "未同步"}</span>
        ${a.last_error ? `<span class="error-text">${escapeHtml(a.last_error)}</span>` : ""}
        <div class="account-actions">
          <button class="primary" data-sync="${a.id}">${icon("sync")}同步</button>
          <button class="secondary" data-test-account="${a.id}">${icon("plug")}测试连接</button>
          <button class="danger" data-delete-account="${a.id}">${icon("trash")}删除</button>
        </div>
      </article>
    `
    )
    .join("");
  $$("[data-sync]").forEach((button) => button.addEventListener("click", () => syncAccount(button.dataset.sync)));
  $$("[data-test-account]").forEach((button) =>
    button.addEventListener("click", () => testExistingAccount(button.dataset.testAccount))
  );
  $$("[data-delete-account]").forEach((button) =>
    button.addEventListener("click", () => deleteAccount(button.dataset.deleteAccount))
  );
}

async function syncAccount(accountId) {
  toast("正在同步邮件...");
  const data = await api(`/api/accounts/${accountId}/sync`, { method: "POST", body: "{}" });
  await Promise.all([loadAccounts(), loadMessages(), loadDashboard()]);
  toast(`同步完成，处理 ${data.synced} 封邮件，识别 ${data.codes || 0} 个验证码`);
}

async function syncAll() {
  if (!state.accounts.length) return toast("请先添加邮箱账号");
  toast("正在同步全部邮箱...");
  const data = await api("/api/sync-all", { method: "POST", body: "{}" });
  await Promise.all([loadAccounts(), loadMessages(), loadDashboard()]);
  toast(`全部同步完成，成功 ${data.ok_count} 个，失败 ${data.fail_count} 个`);
}

async function testExistingAccount(accountId) {
  toast("正在测试邮箱连接...");
  const result = await api(`/api/accounts/${accountId}/test`, { method: "POST", body: "{}" });
  const imap = result.imap.ok ? "IMAP 正常" : `IMAP 异常：${result.imap.message}`;
  const smtp = result.smtp.ok ? "SMTP 正常" : `SMTP 异常：${result.smtp.message}`;
  toast(`${imap}，${smtp}`);
  await loadDashboard();
}

async function testAccountForm() {
  const payload = formPayload($("#accountForm"));
  toast("正在测试配置...");
  const result = await api("/api/accounts/test", { method: "POST", body: JSON.stringify(payload) });
  const imap = result.imap.ok ? "IMAP 正常" : `IMAP 异常：${result.imap.message}`;
  const smtp = result.smtp.ok ? "SMTP 正常" : `SMTP 异常：${result.smtp.message}`;
  toast(`${imap}，${smtp}`);
}

async function importBulkAccounts() {
  if (!state.bulkAccounts.length) return toast("请先选择 CSV 文件");
  toast("正在批量导入邮箱账号...");
  const data = await api("/api/accounts/bulk", {
    method: "POST",
    body: JSON.stringify({ accounts: state.bulkAccounts }),
  });
  await Promise.all([loadAccounts(), loadDashboard()]);
  const failedRows = data.results.filter((item) => !item.ok);
  $("#bulkImportSummary").textContent = `导入完成：成功 ${data.created} 个，失败 ${data.failed} 个`;
  $("#bulkImportPreview").innerHTML = data.results.length
    ? `
      <table>
        <thead>
          <tr>
            <th>行号</th>
            <th>邮箱</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          ${data.results
            .slice(0, 20)
            .map(
              (item) => `
              <tr>
                <td>${item.row}</td>
                <td>${escapeHtml(item.email || "")}</td>
                <td>${item.ok ? "成功" : escapeHtml(item.error || "失败")}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
      ${data.results.length > 20 ? `<p class="message-meta">仅显示前 20 条导入结果。</p>` : ""}
    `
    : "";
  toast(`批量导入完成：成功 ${data.created} 个，失败 ${failedRows.length} 个`);
}

async function markProcessed(id, processed) {
  await api(`/api/messages/${id}/processed`, {
    method: "POST",
    body: JSON.stringify({ processed }),
  });
  await Promise.all([loadMessages(), loadDashboard()]);
  await openMessage(id);
  toast(processed ? "已标记处理" : "已标记未处理");
}

async function deleteAccount(accountId) {
  if (!confirm("确定删除这个邮箱账号和本地邮件记录吗？")) return;
  await api(`/api/accounts/${accountId}`, { method: "DELETE" });
  await Promise.all([loadAccounts(), loadMessages(), loadDashboard()]);
  toast("邮箱账号已删除");
}

async function deleteMessage(id, mode) {
  const label = mode === "remote" ? "服务器邮件" : "本地记录";
  if (!confirm(`确定删除${label}吗？`)) return;
  await api(`/api/messages/${id}?mode=${mode}`, { method: "DELETE" });
  state.selectedMessageId = null;
  await Promise.all([loadMessages(), loadDashboard()]);
  $("#messageDetail").innerHTML = `<p class="empty">选择一封邮件查看详情</p>`;
  toast("邮件已删除");
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#dashboardView").classList.toggle("hidden", view !== "dashboard");
  $("#inboxView").classList.toggle("hidden", !["inbox", "codes"].includes(view));
  $("#sendView").classList.toggle("hidden", view !== "send");
  $("#accountsView").classList.toggle("hidden", view !== "accounts");
  $("#guidesView").classList.toggle("hidden", view !== "guides");

  const titleMap = {
    dashboard: "概览",
    inbox: "收件箱",
    codes: "验证码",
    send: "发送邮件",
    accounts: "邮箱账号",
    guides: "接入教程",
  };
  const subMap = {
    dashboard: "查看同步状态、近期验证码和后台操作记录。",
    inbox: "集中查看所有邮箱收到的验证码邮件。",
    codes: "只显示识别到验证码的邮件。",
    send: "使用已配置邮箱发送邮件。",
    accounts: "添加、同步、测试和删除邮箱账号。",
    guides: "查看 Gmail、Outlook、163、QQ、飞书等邮箱接入方式。",
  };

  $("#viewTitle").textContent = titleMap[view];
  $("#viewSubtitle").textContent = subMap[view];
  $(".toolbar").classList.toggle("hidden", !["inbox", "codes"].includes(view));
  if (view === "dashboard") loadDashboard().catch((err) => toast(err.message));
  if (["inbox", "codes"].includes(view)) loadMessages().catch((err) => toast(err.message));
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    $("#userName").textContent = data.user;
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    await Promise.all([loadAccounts(), loadDashboard()]);
    await loadMessages();
    setView("dashboard");
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  location.reload();
});

$$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#accountFilter").addEventListener("change", () => loadMessages().catch((err) => toast(err.message)));
$("#searchInput").addEventListener("input", () => {
  clearTimeout($("#searchInput").timer);
  $("#searchInput").timer = setTimeout(() => loadMessages().catch((err) => toast(err.message)), 250);
});

$("#syncBtn").addEventListener("click", async () => {
  const accountId = $("#accountFilter").value;
  if (accountId) return syncAccount(accountId);
  return syncAll();
});

$("#syncAllBtn").addEventListener("click", () => syncAll().catch((err) => toast(err.message)));
$("#refreshDashboardBtn").addEventListener("click", () =>
  loadDashboard()
    .then(() => toast("概览已刷新"))
    .catch((err) => toast(err.message))
);
$("#testAccountFormBtn").addEventListener("click", () => testAccountForm().catch((err) => toast(err.message)));
$("#openGuidesBtn").addEventListener("click", () => setView("guides"));
$("#bulkImportFile").addEventListener("change", async (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const accounts = parseAccountCsv(text);
    renderBulkPreview(accounts);
  } catch (err) {
    renderBulkPreview([], err.message);
    toast(err.message);
  }
});
$("#bulkImportBtn").addEventListener("click", () => importBulkAccounts().catch((err) => toast(err.message)));
$("#clearImportBtn").addEventListener("click", () => {
  $("#bulkImportFile").value = "";
  renderBulkPreview([], "等待选择 CSV 文件");
});

$("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formPayload(event.currentTarget);
  await api("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
  event.currentTarget.reset();
  event.currentTarget.imap_port.value = 993;
  event.currentTarget.smtp_port.value = 465;
  event.currentTarget.imap_ssl.checked = true;
  event.currentTarget.smtp_ssl.checked = true;
  await Promise.all([loadAccounts(), loadDashboard()]);
  toast("邮箱账号已保存");
});

$("#sendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/send", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
  event.currentTarget.reset();
  await loadDashboard();
  toast("邮件已发送");
});

boot();
