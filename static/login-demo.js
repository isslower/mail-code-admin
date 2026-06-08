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
  loginMessage.textContent = "登录预览已通过，真实后台会在此进入管理首页。";
});
