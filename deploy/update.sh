#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/personal-workbench}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
STATE_DIR="$APP_DIR/.deploy-state"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOCK_FILE="/run/lock/personal-workbench-update.lock"

cd "$APP_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "已有升级任务正在运行。" >&2
  exit 1
fi

for command_name in docker jq mysqldump gzip curl; do
  command -v "$command_name" >/dev/null || {
    echo "缺少命令：$command_name" >&2
    exit 1
  }
done

mkdir -p "$BACKUP_DIR" "$STATE_DIR"
chmod 700 "$BACKUP_DIR" "$STATE_DIR"

echo "[1/7] 检查 Compose 配置"
docker compose config -q
compose_json="$(docker compose config --format json)"

db_host="$(jq -r '.services.api.environment.MYSQL_HOST' <<<"$compose_json")"
db_port="$(jq -r '.services.api.environment.MYSQL_PORT' <<<"$compose_json")"
db_name="$(jq -r '.services.api.environment.MYSQL_DATABASE' <<<"$compose_json")"
db_user="$(jq -r '.services.api.environment.MYSQL_USER' <<<"$compose_json")"
db_password="$(jq -r '.services.api.environment.MYSQL_PASSWORD' <<<"$compose_json")"
web_port="$(jq -r '.services.web.ports[0].published // "8080"' <<<"$compose_json")"

if [[ "$db_host" == "host.docker.internal" ]]; then
  db_host="127.0.0.1"
fi

for value_name in db_host db_port db_name db_user db_password; do
  if [[ -z "${!value_name}" || "${!value_name}" == "null" ]]; then
    echo "数据库配置不完整：$value_name" >&2
    exit 1
  fi
done

echo "[2/7] 在线备份数据库"
backup_file="$BACKUP_DIR/pwb-$STAMP.sql.gz"
MYSQL_PWD="$db_password" mysqldump \
  --host="$db_host" \
  --port="$db_port" \
  --user="$db_user" \
  --single-transaction \
  --quick \
  --skip-lock-tables \
  --no-tablespaces \
  "$db_name" | gzip -9 >"$backup_file"
gzip -t "$backup_file"
[[ -s "$backup_file" ]] || {
  echo "数据库备份为空，终止升级。" >&2
  exit 1
}

echo "[3/7] 保存当前镜像用于回滚"
api_container="$(docker compose ps -q api)"
web_container="$(docker compose ps -q web)"
[[ -n "$api_container" && -n "$web_container" ]] || {
  echo "API 或 Web 容器未运行，终止升级。" >&2
  exit 1
}

api_image_id="$(docker inspect --format '{{.Image}}' "$api_container")"
web_image_id="$(docker inspect --format '{{.Image}}' "$web_container")"
api_rollback_tag="personal-workbench-api:rollback-$STAMP"
web_rollback_tag="personal-workbench-web:rollback-$STAMP"

snapshot_image() {
  local container_id="$1"
  local image_id="$2"
  local rollback_tag="$3"
  if docker image inspect "$image_id" >/dev/null 2>&1; then
    docker image tag "$image_id" "$rollback_tag"
  else
    echo "原镜像已被清理，从运行容器创建回滚快照：$rollback_tag"
    docker commit --pause=false "$container_id" "$rollback_tag" >/dev/null
  fi
}

snapshot_image "$api_container" "$api_image_id" "$api_rollback_tag"
snapshot_image "$web_container" "$web_image_id" "$web_rollback_tag"

state_file="$STATE_DIR/last-release.env"
{
  printf 'RELEASE_STAMP=%q\n' "$STAMP"
  printf 'API_ROLLBACK_TAG=%q\n' "$api_rollback_tag"
  printf 'WEB_ROLLBACK_TAG=%q\n' "$web_rollback_tag"
  printf 'DATABASE_BACKUP=%q\n' "$backup_file"
  printf 'WEB_PORT=%q\n' "$web_port"
} >"$state_file"
chmod 600 "$state_file"

echo "[4/7] 构建新镜像（当前服务继续运行）"
docker compose build api web

echo "[5/7] 更新 API"
docker compose up -d --no-deps --force-recreate api
api_container="$(docker compose ps -q api)"
api_healthy=false
for _ in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$api_container")"
  if [[ "$health" == "healthy" ]]; then
    api_healthy=true
    break
  fi
  if [[ "$health" == "unhealthy" || "$health" == "exited" ]]; then
    break
  fi
  sleep 2
done

if [[ "$api_healthy" != true ]]; then
  echo "新 API 未通过健康检查，自动恢复旧 API。" >&2
  docker image tag "$api_rollback_tag" personal-workbench-api:latest
  docker compose up -d --no-deps --force-recreate api
  docker compose logs --tail=100 api >&2
  exit 1
fi

echo "[6/7] 更新 Web"
docker compose up -d --no-deps --force-recreate web

echo "[7/7] 验证外部入口"
ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "http://127.0.0.1:$web_port/api/health" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "Web/API 入口检查失败，自动回滚。" >&2
  DEPLOY_LOCK_HELD=1 "$APP_DIR/deploy/rollback.sh"
  exit 1
fi

docker compose ps
echo "升级完成。"
echo "数据库备份：$backup_file"
echo "回滚命令：$APP_DIR/deploy/rollback.sh"
