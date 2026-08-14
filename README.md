# 热点运营系统 · 服务端（hotspot-monitor-server）

基于 NestJS + Prisma + PostgreSQL 的服务端。负责定时采集 twitterapi.io 的热搜榜、把快照存进数据库，并提供查询接口给前端。

- 数据源：twitterapi.io（`GET /twitter/trends?woeid={woeid}`，`X-API-Key` 鉴权）
- 数据库：PostgreSQL（Docker 容器，端口 **5433**）
- 定时任务：每小时整点自动采集一次；服务启动时也会先采集一次

---

## 一、前置条件

| 依赖 | 版本/说明 |
|---|---|
| Node.js | 18 及以上 |
| Docker Desktop | 本地数据库用 |
| twitterapi.io 的 API Key | 单个 key，形如 `new1_xxx` |

> 注意：本机如果已通过 Homebrew 装了 PostgreSQL（默认占用 5432 端口），本项目的 Docker 容器已改为 **5433** 端口，避免冲突。

---

## 二、快速启动

### 1. 启动数据库（Docker）

```bash
docker compose up -d
```

- 启动 `postgres:16-alpine` 容器，容器名 `hotspot-monitor-db`
- 宿主端口 `5433` → 容器内 `5432`
- 自动创建数据库 `hotspot_monitor`（用户/密码均为 `postgres`）

验证数据库就绪：

```bash
docker exec hotspot-monitor-db pg_isready -U postgres
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填写以下三项：

```env
# 服务端口
PORT=3000

# 数据库连接（注意是 5433）
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hotspot_monitor?schema=public"

# twitterapi.io 的 API Key
TWITTERAPI_IO_KEY=你的key
```

### 3. 安装依赖

```bash
npm install
```

### 4. 生成 Prisma 客户端 + 建表

```bash
npm run prisma:generate   # 生成 @prisma/client
npm run db:push           # 把 schema 同步到数据库（首次建表）
```

> 建表后可用 `npm run db:studio` 打开 Prisma Studio 可视化查看数据。

### 5. 启动服务

```bash
# 开发模式（文件改动热重载）
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

启动成功后日志会显示：

```
🚀 热点运营系统服务端已启动: http://localhost:3000/api
地区 Worldwide 已采集 30 条热搜并写入数据库
...
```

服务启动时会**先自动采集一次**五个地区，之后**每小时整点**自动刷新。

---

## 三、API 接口

统一前缀 `/api`。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/monitor/trending?region=Worldwide&limit=30` | 查询某地区最近一次快照的热搜榜（读数据库） |
| `POST` | `/api/monitor/refresh` | 立即触发一次全地区采集 |

`region` 可选值：`Worldwide` / `United States` / `United Kingdom` / `Japan` / `Korea`

响应示例：

```json
{
  "region": "Worldwide",
  "collectedAt": "2026-08-14T02:55:17.215Z",
  "source": "twitter",
  "items": [
    {
      "rank": 1,
      "name": "Botafogo",
      "query": "Botafogo",
      "url": "https://x.com/search?q=Botafogo",
      "heat": "—"
    }
  ]
}
```

---

## 四、环境变量说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 服务端口，默认 `3000` |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `TWITTERAPI_IO_KEY` | 是 | twitterapi.io 的 API Key（缺失时接口返回模拟数据） |

---

## 五、定时采集机制

- **每小时整点**：`@Cron(CronExpression.EVERY_HOUR)`，在 `MonitorService.collectTrendsScheduled` 中触发。
- **启动时**：`onModuleInit` 里先采集一次，避免数据库为空。
- **手动**：`POST /api/monitor/refresh`。
- 每次对 5 个地区**并行**采集各 30 条，写入 `TrendingRecord` 表（同一地区同一批共享同一个 `collectedAt`）。
- **只存真实数据**：当 twitterapi.io 调用失败并回退模拟数据时，跳过写库（保留上一次快照）。

---

## 六、数据表结构

`TrendingRecord`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | String (cuid) | 主键 |
| `region` | String | 地区 |
| `rank` | Int | 排名 |
| `name` | String | 热搜词 |
| `query` | String | 搜索 query |
| `url` | String | 跳转链接 |
| `collectedAt` | DateTime | 快照时间 |

索引：`(region, collectedAt)`，用于快速取「某地区最近一次快照」。

---

## 七、前端启动（hotspot-monitor-master）

前端通过 Vite 代理访问服务端，需**另开一个终端**：

```bash
cd ../hotspot-monitor-master
npm install
npm run dev      # http://localhost:5173
```

前端已配置 `/api` 代理到 `http://localhost:3000`，登录页任意用户名密码即可进入。

---

## 八、常见问题

**Q：`prisma db push` 或服务启动时报数据库连接失败？**
先确认容器在跑：`docker compose ps`，并确认 `.env` 里 `DATABASE_URL` 用的是 **5433** 端口。

**Q：5432 端口冲突？**
本机 Homebrew 装的 PostgreSQL@17 会占用 5432，所以本项目容器用了 5433。若想改回 5432，需同时改 `docker-compose.yml` 的端口映射和 `.env` 的 `DATABASE_URL`。

**Q：接口返回的都是模拟数据（`source: "mock"`）？**
说明 `TWITTERAPI_IO_KEY` 没配置或接口调用失败，看服务日志的 WARN 提示。

**Q：热搜的「热度」显示为 `—`？**
twitterapi.io 的 `get_trends` 接口目前不返回帖子数（文档里的 `meta_description` 实际没有），所以热度暂无数据。
