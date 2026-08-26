# 个人工作台

一个可部署到 Linux 的个人效率系统，覆盖任务、日程、Markdown 笔记、统计复盘、番茄钟、收藏、目标与习惯。Web 和 Android 共用 Node.js API 与 MySQL 数据。

## 快速开始

```bash
cp .env.example .env
# 修改 .env 中全部密码与 TOKEN_SECRET
docker compose up -d --build
```

打开 `http://localhost:8080`。详细说明见 [Linux 部署](docs/部署说明.md)、[Android 构建](docs/Android构建说明.md)、[使用说明](docs/使用说明.md) 和 [数据格式](docs/数据格式说明.md)。

## 开发检查

```bash
npm test
npm run build
npm run android:sync
```
