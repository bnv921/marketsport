# Список файлов для миграции

## Документация

- `MIGRATION.md` - Полная инструкция по миграции проекта
- `MIGRATION_CHECKLIST.md` - Пошаговый чеклист миграции
- `QUICK_START.md` - Быстрый старт после миграции
- `README.md` - Основная документация проекта

## Скрипты

- `scripts/export_for_migration.sh` - Экспорт проекта и базы данных со старого сервера
- `scripts/install_on_new_server.sh` - Автоматическая установка на новом сервере

## Шаблоны конфигурации

- `backend/env.template` - Шаблон переменных окружения для backend
- `frontend/env.local.template` - Шаблон переменных окружения для frontend

## Важные файлы проекта

### Backend
- `backend/requirements.txt` - Python зависимости
- `backend/alembic.ini` - Конфигурация миграций
- `backend/run.py` - Скрипт запуска backend
- `backend/app/` - Исходный код приложения

### Frontend
- `frontend/package.json` - Node.js зависимости
- `frontend/next.config.ts` - Конфигурация Next.js
- `frontend/tsconfig.json` - Конфигурация TypeScript
- `frontend/src/` - Исходный код frontend

### База данных
- `backend/migrations/` - Миграции Alembic
- `DATABASE_SETUP.md` - Инструкция по настройке БД

### Docker (опционально)
- `docker-compose.yml` - Конфигурация Docker Compose
- `setup_postgres.sh` - Скрипт настройки PostgreSQL

## Что НЕ нужно копировать

Следующие файлы и директории исключены из архива:
- `backend/venv/` - Виртуальное окружение Python (создается заново)
- `frontend/node_modules/` - Node.js зависимости (устанавливаются заново)
- `node_modules/` - Корневые зависимости (если есть)
- `.next/` - Кеш Next.js
- `__pycache__/` - Кеш Python
- `*.log` - Лог файлы
- `.env` и `.env.local` - Файлы с секретами (копируются отдельно)

## Порядок действий

1. **На старом сервере:**
   ```bash
   cd /var/www/marketsport
   ./scripts/export_for_migration.sh
   ```

2. **Копирование на новый сервер:**
   ```bash
   scp /tmp/marketsport_migration_*.tar.gz user@new-server:/tmp/
   ```

3. **На новом сервере:**
   ```bash
   sudo bash /tmp/install_on_new_server.sh /tmp/marketsport_migration_*.tar.gz
   ```

4. **Настройка переменных окружения:**
   - Скопируйте значения из старых .env файлов
   - Или используйте шаблоны env.template

5. **Следуйте инструкциям в MIGRATION.md**

