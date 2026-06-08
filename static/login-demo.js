const passwordInput = document.getElementById("passwordInput");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const loginForm = document.getElementById("loginPreviewForm");
const loginMessage = document.getElementById("loginMessage");
const usernameInput = document.getElementById("usernameInput");
const captchaInput = document.getElementById("captchaInput");
const captchaBtn = document.getElementById("captchaBtn");
const scopeSelect = document.getElementById("scopeSelect");
const roleNote = document.getElementById("roleNote");
const roleButtons = Array.from(document.querySelectorAll("[data-role]"));

const roleProfiles = {
  admin: {
    username: "admin",
    password: "admin123",
    scope: "all",
    note: "管理员可查看全部邮箱、员工权限、黑名单、品牌设置和审计记录。",
  },
  staff: {
    username: "staff01",
    password: "staff123",
    scope: "recent",
    note: "员工默认只读取最近 7 天邮件，删除和账号管理由分组权限控制。",
  },
};

let currentCode = captchaBtn.textContent.trim();

function refreshCaptcha() {
  currentCode = String(Math.floor(1000 + Math.random() * 9000));
  captchaBtn.textContent = currentCode;
  captchaInput.value = "";
  captchaInput.focus();
}

function setRole(role) {
  const profile = roleProfiles[role];
  roleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
  });
  usernameInput.value = profile.username;
  passwordInput.value = profile.password;
  scopeSelect.value = profile.scope;
  roleNote.textContent = profile.note;
  loginMessage.classList.remove("error");
  loginMessage.textContent = "";
}

togglePasswordBtn.addEventListener("click", () => {
  const visible = passwordInput.type === "text";
  passwordInput.type = visible ? "password" : "text";
  togglePasswordBtn.textContent = visible ? "显示" : "隐藏";
});

captchaBtn.addEventListener("click", refreshCaptcha);

roleButtons.forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.role));
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const enteredCode = captchaInput.value.trim();
  if (enteredCode !== currentCode) {
    loginMessage.classList.add("error");
    loginMessage.textContent = "校验码不正确，请点击右侧数字刷新后重试。";
    return;
  }

  loginMessage.classList.remove("error");
  loginMessage.textContent = "登录成功，正在进入管理后台...";
  window.setTimeout(() => {
    window.location.href = "/demo.html";
  }, 420);
});

setRole("admin");
