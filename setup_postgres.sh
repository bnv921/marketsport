#!/bin/bash

echo "=== Настройка PostgreSQL через Docker ==="
echo ""

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    echo "Сначала установите Docker:"
    echo "  sudo bash install_docker.sh"
    exit 1
fi

# Переход в директорию проекта
cd "$(dirname "$0")"

# Проверка docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Файл docker-compose.yml не найден!"
    exit 1
fi

echo "Остановка существующих контейнеров (если есть)..."
docker-compose down 2>/dev/null || docker compose down 2>/dev/null

echo "Запуск PostgreSQL..."
docker-compose up -d || docker compose up -d

# Ожидание готовности PostgreSQL
echo "Ожидание запуска PostgreSQL..."
sleep 5

# Проверка статуса
if docker-compose ps 2>/dev/null | grep -q "Up" || docker compose ps 2>/dev/null | grep -q "Up"; then
    echo "✅ PostgreSQL запущен!"
    echo ""
    echo "=== Информация о подключении ==="
    echo "Хост: localhost"
    echo "Порт: 5432"
    echo "База данных: marketsport"
    echo "Пользователь: marketsport_user"
    echo "Пароль: marketsport_password"
    echo ""
    echo "Connection String:"
    echo "postgresql://marketsport_user:marketsport_password@localhost:5432/marketsport"
    echo ""
    echo "Обновляю backend/.env..."
    
    # Обновление DATABASE_URL в backend/.env
    if [ -f "backend/.env" ]; then
        # Создаем резервную копию
        cp backend/.env backend/.env.backup
        
        # Обновляем DATABASE_URL
        if grep -q "^DATABASE_URL=" backend/.env; then
            sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://marketsport_user:marketsport_password@localhost:5432/marketsport|' backend/.env
            echo "✅ DATABASE_URL обновлен в backend/.env"
        else
            echo "DATABASE_URL=postgresql://marketsport_user:marketsport_password@localhost:5432/marketsport" >> backend/.env
            echo "✅ DATABASE_URL добавлен в backend/.env"
        fi
    else
        echo "⚠️  Файл backend/.env не найден"
    fi
    
    echo ""
    echo "✅ Настройка завершена!"
    echo ""
    echo "Следующие шаги:"
    echo "1. Проверьте подключение:"
    echo "   docker-compose exec postgres psql -U marketsport_user -d marketsport -c 'SELECT version();'"
    echo ""
    echo "2. Запустите миграции:"
    echo "   cd backend"
    echo "   alembic upgrade head"
    
else
    echo "❌ Не удалось запустить PostgreSQL"
    echo "Проверьте логи:"
    echo "  docker-compose logs"
    exit 1
fi

