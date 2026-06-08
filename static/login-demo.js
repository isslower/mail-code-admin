const passwordInput = document.getElementById("passwordInput");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const loginForm = document.getElementById("loginPreviewForm");
const loginMessage = document.getElementById("loginMessage");
const usernameInput = document.getElementById("usernameInput");
const captchaInput = document.getElementById("captchaInput");
const captchaBtn = document.getElementById("captchaBtn");
const scopeSelect = document.getElementById("scopeSelect");
const roleButtons = Array.from(document.querySelectorAll("[data-role]"));

const roleProfiles = {
  admin: {
    username: "admin",
    password: "admin123",
    scope: "all",
    title: "管理员模式：可查看全部演示模块。",
  },
  staff: {
    username: "staff01",
    password: "staff123",
    scope: "recent",
    title: "员工模式：默认限制为最近 7 天邮件。",
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
  loginMessage.classList.remove("error");
  loginMessage.textContent = profile.title;
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
