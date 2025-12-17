#!/bin/bash
# Скрипт установки проекта на новом сервере

set -e

PROJECT_DIR="/var/www/marketsport"
MIGRATION_ARCHIVE="$1"

if [ -z "$MIGRATION_ARCHIVE" ]; then
    echo "❌ Укажите путь к архиву миграции"
    echo "Использование: $0 /path/to/marketsport_migration.tar.gz"
    exit 1
fi

echo "🚀 Начинаем установку Marketsport на новом сервере..."

# Распаковка архива
echo "📦 Распаковка архива..."
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
tar -xzf "$MIGRATION_ARCHIVE"

# Распаковка проекта
echo "📦 Распаковка проекта..."
sudo mkdir -p "$(dirname "$PROJECT_DIR")"
sudo tar -xzf marketsport_project_*.tar.gz -C "$(dirname "$PROJECT_DIR")"

# Установка системных зависимостей (Ubuntu/Debian)
echo "📦 Установка системных зависимостей..."
if command -v apt &> /dev/null; then
    sudo apt update
    sudo apt install -y python3.10 python3.10-venv python3-pip postgresql postgresql-contrib nginx git curl
    
    # Установка Node.js
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
fi

# Настройка базы данных
echo "🗄️  Настройка базы данных..."
read -p "Введите пароль для пользователя БД: " DB_PASSWORD

sudo -u postgres psql << EOF
CREATE USER marketsport_user WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE marketsport OWNER marketsport_user;
GRANT ALL PRIVILEGES ON DATABASE marketsport TO marketsport_user;
\q
EOF

# Импорт базы данных
echo "📥 Импорт базы данных..."
DB_FILE=$(ls marketsport_db_*.sql | head -1)
psql -U marketsport_user -d marketsport < "$DB_FILE"

# Настройка Backend
echo "⚙️  Настройка Backend..."
cd "$PROJECT_DIR/backend"

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install --upgrade pip
pip install -r requirements.txt

# Создание .env файла
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Не забудьте заполнить .env файл!"
    echo "   nano $PROJECT_DIR/backend/.env"
fi

# Применение миграций
echo "🔄 Применение миграций..."
alembic upgrade head

# Настройка Frontend
echo "⚙️  Настройка Frontend..."
cd "$PROJECT_DIR/frontend"

# Установка зависимостей
npm install

# Создание .env.local файла
if [ ! -f .env.local ]; then
    cp .env.local.example .env.local
    echo "⚠️  Не забудьте заполнить .env.local файл!"
    echo "   nano $PROJECT_DIR/frontend/.env.local"
fi

# Установка прав
echo "🔐 Установка прав..."
sudo chown -R www-data:www-data "$PROJECT_DIR"
sudo chmod -R 755 "$PROJECT_DIR"

echo "✅ Установка завершена!"
echo ""
echo "📝 Следующие шаги:"
echo "1. Заполните переменные окружения:"
echo "   - $PROJECT_DIR/backend/.env"
echo "   - $PROJECT_DIR/frontend/.env.local"
echo ""
echo "2. Настройте systemd сервисы (см. MIGRATION.md)"
echo ""
echo "3. Настройте Nginx (см. MIGRATION.md)"
echo ""
echo "4. Запустите сервисы:"
echo "   sudo systemctl start marketsport-backend"
echo "   sudo systemctl start marketsport-frontend"

