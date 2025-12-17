#!/bin/bash
# Скрипт для экспорта проекта перед миграцией

set -e

PROJECT_DIR="/var/www/marketsport"
BACKUP_DIR="/tmp/marketsport_migration"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Начинаем экспорт проекта Marketsport для миграции..."

# Создание директории для бэкапа
mkdir -p "$BACKUP_DIR"

# Экспорт базы данных
echo "📦 Экспорт базы данных..."
if docker ps | grep -q marketsport_db; then
    # Если используется Docker
    docker exec marketsport_db pg_dump -U marketsport_user marketsport > "$BACKUP_DIR/marketsport_db_$TIMESTAMP.sql"
else
    # Если PostgreSQL установлен напрямую
    pg_dump -U marketsport_user -h localhost marketsport > "$BACKUP_DIR/marketsport_db_$TIMESTAMP.sql"
fi

# Создание архива проекта (без node_modules, venv, кешей)
echo "📦 Создание архива проекта..."
cd "$(dirname "$PROJECT_DIR")"
tar -czf "$BACKUP_DIR/marketsport_project_$TIMESTAMP.tar.gz" \
  --exclude='marketsport/backend/venv' \
  --exclude='marketsport/frontend/node_modules' \
  --exclude='marketsport/node_modules' \
  --exclude='marketsport/.next' \
  --exclude='marketsport/frontend/.next' \
  --exclude='marketsport/backend/__pycache__' \
  --exclude='marketsport/frontend/__pycache__' \
  --exclude='marketsport/**/__pycache__' \
  --exclude='marketsport/*.log' \
  --exclude='marketsport/tmp' \
  --exclude='marketsport/.git' \
  marketsport/

# Создание файла с информацией о версиях
echo "📝 Создание файла с информацией о версиях..."
cat > "$BACKUP_DIR/versions.txt" << EOF
Migration Date: $(date)
Python Version: $(python3 --version)
Node Version: $(node --version)
NPM Version: $(npm --version)
PostgreSQL Version: $(psql --version 2>/dev/null || echo "N/A")
EOF

# Создание итогового архива
echo "📦 Создание итогового архива..."
cd "$BACKUP_DIR"
tar -czf "/tmp/marketsport_migration_$TIMESTAMP.tar.gz" .

echo "✅ Экспорт завершен!"
echo "📁 Файлы сохранены в: $BACKUP_DIR"
echo "📦 Итоговый архив: /tmp/marketsport_migration_$TIMESTAMP.tar.gz"
echo ""
echo "Для передачи на новый сервер используйте:"
echo "  scp /tmp/marketsport_migration_$TIMESTAMP.tar.gz user@new-server:/tmp/"

