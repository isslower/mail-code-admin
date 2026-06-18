const pages = {
  inbox: {
    title: "收件箱",
    show: "inboxPage",
  },
  codes: {
    title: "验证码",
    show: "inboxPage",
  },
  send: {
    title: "发送邮件",
    show: "sendPage",
  },
  accounts: {
    title: "邮箱账号",
    show: "accountsPage",
  },
};

const mails = [
  {
    subject: "你的登录验证码是 839421",
    code: "839421",
    body: "你正在登录业务后台，本次验证码为 839421。验证码 10 分钟内有效，如非本人操作请忽略。",
    meta: "业务 1 号邮箱 · user01@example.com",
    from: "security@example.com · 2026-05-29 17:18:22",
  },
  {
    subject: "Verify your account",
    code: "204866",
    body: "Use code 204866 to finish your account verification. This code expires in 15 minutes.",
    meta: "注册接码邮箱 · register@example.com",
    from: "no-reply@service.com · 2026-05-29 17:09:03",
  },
  {
    subject: "订单通知：付款成功",
    code: "",
    body: "订单已经完成付款，系统将在稍后发送处理结果。",
    meta: "通知邮箱 · notice@example.com",
    from: "notice@shop.test · 2026-05-29 16:55:40",
  },
  {
    subject: "安全验证代码 672910",
    code: "672910",
    body: "本次敏感操作需要验证，安全代码为 672910。请勿转发给他人。",
    meta: "业务 2 号邮箱 · user02@example.com",
    from: "account@example.net · 2026-05-29 16:41:15",
  },
];

document.querySelectorAll(".nav button").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.page;
    const page = pages[key];
    document.querySelectorAll(".nav button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".page").forEach((item) => item.classList.add("hidden"));
    document.getElementById(page.show).classList.remove("hidden");
    document.getElementById("pageTitle").textContent = page.title;
  });
});

document.querySelectorAll(".mail-card").forEach((button) => {
  button.addEventListener("click", () => {
    const mail = mails[Number(button.dataset.mail)];
    document.querySelectorAll(".mail-card").forEach((item) => item.classList.toggle("active", item === button));
    document.getElementById("mailSubject").textContent = mail.subject;
    document.getElementById("mailCode").textContent = mail.code || "未识别";
    document.getElementById("mailBody").textContent = mail.body;
    document.querySelector(".detail-head .mail-account").textContent = mail.meta;
    document.querySelector(".detail-head p").textContent = mail.from;
  });
});

const initialPage = new URLSearchParams(window.location.search).get("page");
if (initialPage) {
  document.querySelector(`.nav button[data-page="${initialPage}"]`)?.click();
}
