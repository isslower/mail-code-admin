# 常见邮箱接入教程

本教程用于“邮箱账号”页面和 CSV 批量导入模板。各邮箱平台规则会调整，正式接入前建议再打开对应帮助页确认。

## 批量导入模板字段

```text
name,email,imap_host,imap_port,imap_ssl,smtp_host,smtp_port,smtp_ssl,username,password
```

- `name`：后台显示名称。
- `email`：邮箱地址。
- `imap_host` / `imap_port` / `imap_ssl`：收件 IMAP 配置。
- `smtp_host` / `smtp_port` / `smtp_ssl`：发件 SMTP 配置。
- `username`：登录账号，通常填写完整邮箱地址。
- `password`：授权码、应用专用密码，或平台允许的第三方客户端密码。

模板文件：

```text
D:\自建项目\mail-code-admin\static\templates\account-import-template.csv
```

## Gmail

推荐配置：

```text
IMAP: imap.gmail.com:993 SSL
SMTP: smtp.gmail.com:587 STARTTLS
账号: 完整 Gmail 地址
密码: 应用专用密码；更推荐 OAuth / Sign in with Google
```

接入步骤：

1. Gmail 个人账号一般建议使用 Sign in with Google。
2. 本项目当前是 IMAP/SMTP 密码模式，如需使用 Gmail，通常需要开启两步验证并生成 App Password。
3. 将完整邮箱地址填入 `email` 和 `username`。
4. 将 App Password 填入 `password`。

官方地址：

- https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://support.google.com/mail/answer/7126229
- https://support.google.com/accounts/answer/185833

## Outlook / Hotmail

推荐配置：

```text
IMAP: outlook.office365.com:993 SSL
SMTP: smtp-mail.outlook.com:587 STARTTLS
账号: 完整 Outlook / Hotmail 邮箱地址
密码: Microsoft 账号密码、应用密码，或 OAuth2 / Modern Auth
```

接入步骤：

1. 进入 Outlook.com 设置。
2. 打开 邮件 > 转发和 IMAP。
3. 开启 IMAP 访问。
4. 将完整邮箱地址填入 `email` 和 `username`。
5. 如果普通密码不可用，按 Microsoft 账号安全要求使用应用密码或现代身份验证。

官方地址：

- https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040
- https://outlook.live.com/mail/

## 163 / 126 / yeah.net

163 推荐配置：

```text
IMAP: imap.163.com:993 SSL
SMTP: smtp.163.com:465 SSL
账号: 完整邮箱地址
密码: 客户端授权码
```

常见同类配置：

```text
126: imap.126.com / smtp.126.com
yeah.net: imap.yeah.net / smtp.yeah.net
```

接入步骤：

1. 登录网页版 163 或 126 邮箱。
2. 进入 设置 > POP3/SMTP/IMAP。
3. 开启 IMAP/SMTP 服务。
4. 完成身份验证后生成授权码。
5. 在本项目 `password` 字段填写授权码，不要填写网页登录密码。

官方地址：

- https://email.163.com/
- https://mail.163.com/
- https://help.mail.yeah.net/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac286624f309a1a7089

## QQ 邮箱 / Foxmail

推荐配置：

```text
IMAP: imap.qq.com:993 SSL
SMTP: smtp.qq.com:465 SSL
账号: 完整 QQ 邮箱地址
密码: QQ 邮箱授权码
```

接入步骤：

1. 登录网页版 QQ 邮箱。
2. 进入账号与安全或设置里的服务开关。
3. 开启 IMAP/SMTP 服务。
4. 按页面提示完成身份验证，生成授权码。
5. 在本项目 `password` 字段填写授权码。

官方地址：

- https://mail.qq.com/
- https://service.mail.qq.com/

## 飞书邮箱

推荐配置：

```text
IMAP: imap.feishu.cn:993 SSL
SMTP: smtp.feishu.cn:465 SSL
账号: 完整飞书邮箱地址
密码: 飞书邮箱专用密码
```

接入步骤：

1. 管理员先在飞书管理后台开启第三方邮箱客户端登录。
2. 成员在飞书客户端进入 设置 > 邮箱。
3. 找到 第三方邮箱客户端登录，生成专用密码。
4. 将专用密码和 IMAP/SMTP 参数填入本项目。

官方地址：

- https://www.feishu.cn/hc/zh-CN/articles/902478147400
- https://www.feishu.cn/hc/en-US/articles/360049068017/
- https://www.feishu.cn/hc/zh-CN/articles/360049067809-%E7%AC%AC%E4%B8%89%E6%96%B9%E9%82%AE%E7%AE%B1-imap-smtp-%E5%9C%B0%E5%9D%80%E5%92%8C%E7%AB%AF%E5%8F%A3
