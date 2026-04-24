# follow-finance — 财经信息日报

每天自动聚合你关注的财经人士在 X/Twitter 上的发言，由 AI 整理成中文摘要，推送到你的邮箱或 Telegram。

**完全免费** — 通过 Nitter RSS 抓取推文（无需 Twitter API），GitHub Actions 每天自动运行。

---

## 工作原理

```
GitHub Actions（每天 UTC 00:00）
  └→ generate-feed.js 通过 Nitter RSS 抓取推文
  └→ 生成 feed-x.json 提交到仓库

Claude Code（触发 /finance 或"发财经日报"）
  └→ prepare-digest.js 拉取 feed-x.json
  └→ AI 生成中文摘要
  └→ deliver.js 推送到邮箱 / Telegram
```

---

## 快速开始

### 1. Fork 或克隆此仓库

```bash
git clone https://github.com/yinwenjing2301-beep/follow-finance.git
cd follow-finance/scripts && npm install
```

### 2. 填写要跟踪的账号

编辑 `config/sources.json`，填入 X 账号 handle 和你的 GitHub raw feed URL：

```json
{
  "feed_url": "https://raw.githubusercontent.com/你的用户名/follow-finance/main/feed-x.json",
  "x_accounts": [
    { "name": "显示名称", "handle": "x_handle" }
  ]
}
```

### 3. 配置发送方式

创建 `~/.follow-finance/config.json`：

```json
{
  "language": "zh",
  "timezone": "Asia/Shanghai",
  "frequency": "daily",
  "deliveryTime": "08:00",
  "delivery": {
    "method": "email",
    "email": "你的邮箱@gmail.com"
  },
  "onboardingComplete": true
}
```

创建 `~/.follow-finance/.env`：

```
# 邮件发送（resend.com 免费注册）
RESEND_API_KEY=

# 或 Telegram
# TELEGRAM_BOT_TOKEN=
```

### 4. 触发第一次 Feed 生成

在 GitHub 仓库页面 → **Actions** → **Generate Feed** → **Run workflow**

等约 1 分钟，`feed-x.json` 会自动提交到仓库，之后每天定时更新。

### 5. 在 Claude Code 中使用

```
发财经日报
```

---

## 自定义摘要风格

编辑 `prompts/` 下的文件，或告诉 Claude 你想调整的风格，它会自动修改：

- `summarize-tweets.md` — 控制每位发言人的摘要方式
- `digest-intro.md` — 控制日报的整体格式和分类逻辑
- `translate.md` — 控制中文翻译风格

用户自定义的 prompt 放在 `~/.follow-finance/prompts/`，不会被仓库更新覆盖。

---

## 文件结构

```
follow-finance/
├── SKILL.md                        # Claude Code skill 主指令
├── config/
│   ├── sources.json                # 跟踪账号列表 + feed URL（需填写）
│   └── config-schema.json          # 配置项说明
├── scripts/
│   ├── generate-feed.js            # 抓取推文 → feed-x.json（GitHub Actions 运行）
│   ├── prepare-digest.js           # 拉取 feed，打包给 AI（本地运行）
│   └── deliver.js                  # 发送摘要到邮件 / Telegram
├── prompts/
│   ├── summarize-tweets.md
│   ├── digest-intro.md
│   └── translate.md
├── .github/workflows/
│   └── generate-feed.yml           # 每日定时任务
└── .env.example                    # 环境变量模板
```

---

## 依赖

- **Claude Code** — 运行 skill 并生成 AI 摘要
- **GitHub** — 免费托管，GitHub Actions 免费运行定时任务
- **Nitter** — 免费 Twitter 镜像，提供 RSS 订阅（无需 API Key）
- **Resend**（可选）— 免费套餐每天 100 封邮件，足够个人使用

---

## License

MIT
