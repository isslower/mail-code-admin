const passwordInput = document.getElementById("passwordInput");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const loginForm = document.getElementById("loginPreviewForm");
const loginMessage = document.getElementById("loginMessage");

togglePasswordBtn.addEventListener("click", () => {
  const visible = passwordInput.type === "text";
  passwordInput.type = visible ? "password" : "text";
  togglePasswordBtn.textContent = visible ? "显示" : "隐藏";
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginMessage.textContent = "登录成功，正在进入管理后台...";
  window.setTimeout(() => {
    window.location.href = "/demo.html";
  }, 350);
});
