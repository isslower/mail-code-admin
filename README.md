# mail-code-admin

邮箱接码后台是一个本地网页版邮箱管理工具，用于集中管理多个邮箱账号、同步 IMAP 收件箱邮件、自动提取 4-8 位数字验证码，并支持邮件查看、发送、标记处理、本地删除和服务器删除。

适合个人或内网场景使用。如果要放到公网，请务必配置 HTTPS、强密码、访问限制和更完整的安全策略。

## 功能

- 多邮箱账号管理：支持 IMAP/SMTP 配置、连接测试、启用状态和批量 CSV 导入
- 邮件同步：支持单个邮箱同步、全部邮箱同步和后台定时自动同步
- 验证码识别：从邮件主题、纯文本正文和 HTML 正文中提取 4-8 位数字验证码
- 收件箱聚合：按邮箱、关键词和验证码视图筛选邮件
- 邮件处理：支持标记已处理/未处理、本地删除和 IMAP 服务器删除
- SMTP 发信：使用已配置邮箱发送邮件
- 操作日志：记录登录、同步、发送、删除、连接测试等操作
- 验证码 API：供其他系统读取最新验证码
- Docker 部署：支持 `docker compose` 一键启动和 SQLite 数据持久化

## 本地启动

```powershell
cd D:\自建项目\mail-code-admin
python server.py
```

打开：

```text
http://127.0.0.1:8088
```

Demo 页面：

```text
http://127.0.0.1:8088/demo.html
```

默认登录：

```text
账号：admin
密码：admin123
```

## 环境变量

建议首次正式使用时修改管理员账号和密码：

```powershell
$env:MAIL_ADMIN_USER="你的管理员账号"
$env:MAIL_ADMIN_PASSWORD="你的强密码"
python server.py
```

常用配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP 监听地址 |
| `PORT` | `8088` | HTTP 监听端口 |
| `MAIL_ADMIN_USER` | `admin` | 管理员账号 |
| `MAIL_ADMIN_PASSWORD` | `admin123` | 管理员密码 |
| `MAIL_DB_PATH` | `mail_admin.sqlite3` | SQLite 数据库路径 |
| `MAIL_CODE_API_TOKEN` | 空 | 验证码 API 专用 Token，留空则只能通过网页登录会话访问 |
| `MAIL_AUTO_SYNC_SECONDS` | `0` | 自动同步间隔，`0` 表示关闭 |
| `MAIL_LOGIN_MAX_FAILURES` | `5` | 同一 IP 最大连续登录失败次数 |
| `MAIL_LOGIN_LOCK_SECONDS` | `300` | 登录失败临时锁定秒数 |
| `MAIL_TIMEOUT_SECONDS` | `12` | IMAP/SMTP 连接超时时间 |

开启自动同步示例：

```powershell
$env:MAIL_AUTO_SYNC_SECONDS="300"
python server.py
```

## Docker 部署

复制环境变量示例并修改账号、密码和 Token：

```powershell
Copy-Item .env.example .env
notepad .env
```

启动：

```powershell
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:8088
```

Docker 模式下数据库默认保存到：

```text
D:\自建项目\mail-code-admin\data\mail_admin.sqlite3
```

如果要沿用当前本地数据库，可以先复制到 `data` 目录：

```powershell
New-Item -ItemType Directory -Force .\data
Copy-Item .\mail_admin.sqlite3 .\data\mail_admin.sqlite3
```

停止服务：

```powershell
docker compose down
```

## 邮箱配置

在“邮箱账号”页面添加邮箱，需要填写：

- 邮箱地址
- IMAP 服务器和端口，用于接收邮件
- SMTP 服务器和端口，用于发送邮件
- 登录账号
- 邮箱密码或授权码

常见邮箱通常需要在邮箱设置里开启 IMAP/SMTP，并使用“授权码”而不是网页登录密码。

接入教程见：

```text
docs/provider-guides.md
```

## 批量导入

CSV 模板：

```text
static/templates/account-import-template.csv
```

字段：

```text
name,email,imap_host,imap_port,imap_ssl,smtp_host,smtp_port,smtp_ssl,username,password
```

后台页面“邮箱账号”里可以下载模板、上传 CSV、预览前几行并确认导入。单次最多导入 500 个邮箱账号。

## 验证码 API

接口：

```text
GET /api/codes/latest
```

如果配置了 `MAIL_CODE_API_TOKEN`，可以用 Bearer Token 调用：

```powershell
curl.exe -H "Authorization: Bearer 你的MAIL_CODE_API_TOKEN" "http://127.0.0.1:8088/api/codes/latest?unprocessed=1&mark_processed=1"
```

也支持 `X-Api-Token` 请求头或 `token` 查询参数。

可选参数：

- `account_id`：只查指定邮箱账号 ID
- `email`：只查指定邮箱地址
- `q`：按发件人、主题、正文或验证码关键词筛选
- `unprocessed=1`：只返回未处理验证码
- `mark_processed=1`：返回后自动标记为已处理

返回示例：

```json
{
  "code": {
    "id": 12,
    "account_id": 1,
    "code": "123456",
    "subject": "您的验证码",
    "sender": "service@example.com",
    "received_at": "2026-06-08T10:00:00+00:00",
    "is_processed": 1,
    "account_name": "示例邮箱",
    "account_email": "demo@example.com"
  }
}
```

没有匹配验证码时：

```json
{
  "code": null
}
```

## 主要接口

```text
GET    /api/dashboard
GET    /api/logs
GET    /api/accounts
GET    /api/messages
GET    /api/messages/{id}
GET    /api/codes/latest
POST   /api/login
POST   /api/logout
POST   /api/sync-all
POST   /api/accounts
POST   /api/accounts/test
POST   /api/accounts/bulk
POST   /api/accounts/{id}/test
POST   /api/accounts/{id}/sync
POST   /api/messages/{id}/processed
POST   /api/send
PUT    /api/accounts/{id}
DELETE /api/accounts/{id}
DELETE /api/messages/{id}?mode=local
DELETE /api/messages/{id}?mode=remote
```

## 数据说明

默认数据库：

```text
mail_admin.sqlite3
```

Docker 默认数据库：

```text
data/mail_admin.sqlite3
```

邮箱授权码会保存在本地 SQLite 数据库里。请不要把 `.env`、`data/`、`mail_admin.sqlite3` 或其他数据库文件提交到 GitHub。

## 项目结构

```text
mail-code-admin/
  server.py
  static/
  docs/
  Dockerfile
  docker-compose.yml
  .env.example
```
