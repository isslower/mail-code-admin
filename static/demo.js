const pages = {
  inbox: {
    title: "收件箱",
    desc: "聚合多个邮箱的验证码、通知和业务邮件。",
    show: "inboxPage",
  },
  codes: {
    title: "验证码",
    desc: "只看已识别验证码的邮件，便于快速复制和处理。",
    show: "inboxPage",
  },
  send: {
    title: "发送邮件",
    desc: "按员工权限选择发件邮箱，并通过 SMTP 发送邮件。",
    show: "sendPage",
  },
  accounts: {
    title: "邮箱账号",
    desc: "维护 IMAP/SMTP 配置、授权码、同步状态和批量导入。",
    show: "accountsPage",
  },
  guides: {
    title: "接入教程",
    desc: "查看 Gmail、Google Workspace、Outlook、163、QQ 等邮箱接入参数。",
    show: "guidesPage",
  },
  permissions: {
    title: "员工权限",
    desc: "按员工划分可读邮箱、时间范围、发送权限和删除权限。",
    show: "permissionsPage",
  },
  blacklist: {
    title: "黑名单",
    desc: "按发件人、域名、主题或正文关键词拉黑风险邮件。",
    show: "blacklistPage",
  },
  branding: {
    title: "品牌设置",
    desc: "自定义后台标题、Slogan、Logo、网站标志和主题色。",
    show: "brandingPage",
  },
};

const mails = [
  {
    subject: "你的登录验证码是 839421",
    code: "839421",
    body: "你正在登录业务后台，本次验证码为 839421。验证码 10 分钟内有效，如非本人操作请忽略。",
    meta: "业务1号邮箱 · user01@example.com",
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
    meta: "业务2号邮箱 · user02@example.com",
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
    document.querySelector(".top p:not(.eyebrow)").textContent = page.desc;
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

const brandInputs = {
  title: document.getElementById("brandTitleInput"),
  slogan: document.getElementById("brandSloganInput"),
  subtitle: document.getElementById("brandSubtitleInput"),
  logo: document.getElementById("brandLogoInput"),
  icon: document.getElementById("brandIconInput"),
  color: document.getElementById("brandColorInput"),
};

function applyBrandPreview() {
  const title = brandInputs.title.value.trim() || "邮箱接码后台";
  const slogan = brandInputs.slogan.value.trim() || "统一管理验证码邮件";
  const subtitle = brandInputs.subtitle.value.trim() || "Mail Code Admin";
  const logo = brandInputs.logo.value.trim() || "/logo-whale-envelope.svg";
  const color = brandInputs.color.value || "#1f6feb";

  document.querySelectorAll(".brand strong").forEach((item) => (item.textContent = title));
  document.querySelector(".brand small").textContent = subtitle;
  document.querySelectorAll(".logo-mark").forEach((item) => {
    item.src = logo;
    item.alt = title;
  });
  document.getElementById("previewLogo").src = logo;
  document.getElementById("previewTitle").textContent = title;
  document.getElementById("previewSubtitle").textContent = subtitle;
  document.getElementById("previewSlogan").textContent = slogan;
  document.documentElement.style.setProperty("--primary", color);
  document.title = `${title} Demo`;
}

Object.values(brandInputs).forEach((input) => input?.addEventListener("input", applyBrandPreview));
document.getElementById("saveBrandBtn")?.addEventListener("click", applyBrandPreview);
document.getElementById("resetBrandBtn")?.addEventListener("click", () => {
  brandInputs.title.value = "邮箱接码后台";
  brandInputs.slogan.value = "统一管理验证码邮件";
  brandInputs.subtitle.value = "Mail Code Admin";
  brandInputs.logo.value = "/logo-whale-envelope.svg";
  brandInputs.icon.value = "/logo-whale-envelope.svg";
  brandInputs.color.value = "#1f6feb";
  applyBrandPreview();
});
