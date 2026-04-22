# Media Intel Hub

自媒体信息采集系统（Next.js + PostgreSQL + 自建 Auth），聚焦两条链路：

- 抖音：分享链接文案提取
- 直播源：配置、转写、下载任务控制

转写与提取执行全部由独立 `media-worker` 服务承载。

## Features

- Landing Page（未登录可访问）
- 登录 / 注册（邮箱密码，自建会话）
- 监测看板（仅登录后）
  - 抖音链接提取并入库卡片
  - 直播源添加与卡片管理
  - 启动/停止转写
  - 启动/停止下载

## Required Env

```env
DATABASE_URL=
AUTH_SECRET=
MEDIA_WORKER_BASE_URL=
MEDIA_WORKER_TOKEN=
```

## Local Run

```bash
npm install
cp .env.local.example .env.local
npm run db:init
npm run dev
```

## Railway Deploy

1. 在 Railway 创建 Web Service，连接此仓库。
2. 设置环境变量：`DATABASE_URL`、`AUTH_SECRET`、`MEDIA_WORKER_BASE_URL`、`MEDIA_WORKER_TOKEN`。
   如果你把 worker 拆成 `api/runner` 两服务，`MEDIA_WORKER_BASE_URL` 指向 `api` 服务即可。
3. 将 `railway.json` 提交到仓库，Railway 会按该配置构建和启动。
4. 在 Railway PostgreSQL 上先执行 `npm run db:init`，再发布应用。

## Legacy Data Migration (From Old Supabase DB)

如果你要复用旧 Supabase 的业务数据到新数据库（不会改旧库结构）：

```bash
export LEGACY_DATABASE_URL='postgres://...old-supabase...'
export DATABASE_URL='postgres://...new-railway...'
npm run db:migrate:legacy
```

可选，把所有导入数据映射到一个新账号：

```bash
export MIGRATE_TARGET_USER_ID='00000000-0000-0000-0000-000000000000'
export MIGRATE_TARGET_EMAIL='you@example.com'
npm run db:migrate:legacy
```

然后用固定 id 创建可登录账号：

```bash
DATABASE_URL='postgres://...new-railway...' npm run db:create-user -- --id '00000000-0000-0000-0000-000000000000' --email 'you@example.com' --password 'your-password'
```

## API Overview

- `POST /api/douyin/extract`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/monitor/items`
- `DELETE /api/monitor/items?id=<id>`
- `GET|POST|DELETE /api/wechat-live/sources`
- `GET|POST|DELETE /api/wechat-live/transcriptions`
- `GET|POST|DELETE /api/wechat-live/downloads`

## Notes

- Web 与 media-worker 必须共享同一个 `MEDIA_WORKER_TOKEN`。
- 数据依赖 PostgreSQL 的 `monitor_items`、`monitor_sources` 等业务表。
- `app_users` 作为登录账户表（不依赖 Supabase Auth）。
- 如果你要复用以前 Supabase 的业务数据，请把数据迁移到新的 PostgreSQL 实例；不要直接改旧 Supabase 项目的库结构。
