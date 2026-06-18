# 邮箱接码后台

本项目是一个本地运行的邮箱验证码管理后台，用来集中接入多个邮箱账号，同步 IMAP 收件箱邮件，自动识别邮件里的 4-8 位验证码，并提供查看、复制、发送、标记处理、本地删除和服务器删除等常用操作。

适合个人、内网运维、测试注册、业务通知邮箱归集等场景。项目默认以本地 SQLite 保存数据，既可以直接运行，也可以用 Docker Compose 部署。

## 项目亮点

- 多邮箱统一管理：集中维护 IMAP/SMTP 配置，支持启用、停用、测试连接和手动同步。
- 验证码自动提取：从邮件主题和正文中识别常见 4-8 位验证码，减少人工查找。
- 运维控制台界面：包含概览统计、近期验证码、邮箱健康状态、操作日志、收件箱和邮件详情。
- 邮件收发一体：支持从已配置邮箱发送邮件，也支持查看完整邮件正文。
- 批量导入账号：提供 CSV 模板，一次导入多个邮箱账号。
- 操作日志追踪：登录、同步、发送、删除、测试连接等关键动作都会记录。
- 轻量本地部署：Python 标准库 + SQLite，适合快速启动和二次开发。

## 界面预览

启动后访问：

```text
http://127.0.0.1:8088
```

静态演示页：

```text
http://127.0.0.1:8088/demo.html
```

本仓库包含一张 UI 原型图：

```text
static/ui-prototype-dashboard.png
```

## 快速启动

```powershell
cd C:\Users\TOT\Documents\Codex\自建项目\mail-code-admin
python server.py
```

打开浏览器访问：

```text
http://127.0.0.1:8088
```

默认登录账号：

```text
账号：admin
密码：admin123
```

正式使用前建议通过环境变量修改默认管理员账号和密码：

```powershell
$env:MAIL_ADMIN_USER="你的管理员账号"
$env:MAIL_ADMIN_PASSWORD="你的强密码"
python server.py
```

## Docker 部署

仓库保留了 Docker 部署文件，可以直接用 Compose 启动：

```powershell
docker compose up -d --build
```

默认访问地址：

```text
http://127.0.0.1:8088
```

停止服务：

```powershell
docker compose down
```

建议在 `.env` 中配置管理员账号、密码和监听端口，再启动容器。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP 监听地址 |
| `PORT` | `8088` | HTTP 监听端口 |
| `MAIL_ADMIN_USER` | `admin` | 后台管理员账号 |
| `MAIL_ADMIN_PASSWORD` | `admin123` | 后台管理员密码 |
| `MAIL_DB_PATH` | `mail_admin.sqlite3` | SQLite 数据库路径 |

## 功能模块

### 概览仪表盘

- 邮箱账号数量统计
- 本地邮件数量统计
- 已识别验证码数量统计
- 待处理邮件数量统计
- 近期验证码列表
- 邮箱健康状态
- 操作日志

### 收件箱

- 按邮箱筛选邮件
- 搜索发件人、主题、正文和验证码
- 查看邮件详情
- 一键复制验证码
- 标记已处理
- 本地删除邮件
- 服务器删除邮件

### 验证码

- 自动从邮件中提取验证码
- 聚合展示最近验证码
- 支持快速定位原始邮件

### 发送邮件

- 选择已配置的 SMTP 邮箱
- 填写收件人、主题和正文
- 从后台直接发送测试邮件或业务邮件

### 邮箱账号

- 添加 IMAP/SMTP 配置
- 测试邮箱连接
- 同步单个邮箱
- 批量导入邮箱账号
- 下载 CSV 导入模板

### 接入教程

项目内置常见邮箱接入说明，方便配置 QQ 邮箱、网易邮箱、企业邮箱等需要授权码的服务。

```text
docs/provider-guides.md
```

需求整理文档：

```text
docs/requirements.md
```

## 常用接口

```text
GET    /api/dashboard
GET    /api/logs
POST   /api/login
POST   /api/logout
GET    /api/accounts
POST   /api/accounts
POST   /api/accounts/test
POST   /api/accounts/bulk
POST   /api/accounts/{id}/test
POST   /api/accounts/{id}/sync
POST   /api/sync-all
GET    /api/messages
POST   /api/messages/{id}/processed
DELETE /api/messages/{id}
POST   /api/send
```

验证码读取接口适合给其他本地系统集成：

```text
GET /api/codes/latest
```

可以按邮箱、关键词或发件人继续做二次封装，用来服务自动化注册、测试验证、内部通知处理等流程。

## 批量导入 CSV

模板文件：

```text
static/templates/account-import-template.csv
```

字段格式：

```text
name,email,imap_host,imap_port,imap_ssl,smtp_host,smtp_port,smtp_ssl,username,password
```

后台页面的“邮箱账号”模块可以下载模板、上传 CSV、预览前几行并确认导入。单次最多导入 500 个邮箱账号。

## 邮箱配置说明

添加邮箱账号时通常需要：

- 邮箱地址
- IMAP 服务器和端口
- SMTP 服务器和端口
- 登录账号
- 邮箱密码或授权码

多数邮箱服务需要先在网页端邮箱设置中开启 IMAP/SMTP，并使用“授权码”而不是网页登录密码。

## 数据与安全

项目默认使用本地 SQLite 数据库：

```text
mail_admin.sqlite3
```

邮箱授权码会保存在本地数据库中。当前版本适合个人或内网使用。如果要部署到公网，建议继续补充 HTTPS、密码加密存储、用户权限、操作审计、访问频率限制和备份恢复等安全能力。

## 目录结构

```text
.
├── server.py
├── README.md
├── docs/
│   ├── provider-guides.md
│   └── requirements.md
└── static/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── demo.html
    ├── demo.css
    ├── demo.js
    ├── icons.svg
    ├── logo-whale-envelope.svg
    ├── login-ops-visual.png
    ├── ui-prototype-dashboard.png
    └── templates/
        └── account-import-template.csv
```

## 后续规划

- 增加多用户和角色权限
- 加密保存邮箱授权码
- 支持更多验证码规则和发件人白名单
- 增加邮件归档和导出
- 增加 Docker 部署方式
- 增加定时同步任务和失败告警
