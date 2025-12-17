# Инструкция по миграции проекта Marketsport

## Подготовка к миграции

### 1. Экспорт данных с текущего сервера

#### Экспорт базы данных PostgreSQL
```bash
# На старом сервере
pg_dump -U marketsport_user -h localhost marketsport > marketsport_backup.sql

# Или если используется Docker
docker exec marketsport_db pg_dump -U marketsport_user marketsport > marketsport_backup.sql
```

#### Создание архива проекта (без node_modules и venv)
```bash
# На старом сервере
cd /var/www
tar -czf marketsport_migration.tar.gz \
  --exclude='marketsport/backend/venv' \
  --exclude='marketsport/frontend/node_modules' \
  --exclude='marketsport/node_modules' \
  --exclude='marketsport/.next' \
  --exclude='marketsport/backend/__pycache__' \
  --exclude='marketsport/frontend/.next' \
  --exclude='marketsport/*.log' \
  marketsport/
```

### 2. Требования на новом сервере

#### Системные требования
- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- Python 3.10+
- Node.js 18+ (рекомендуется 20+)
- PostgreSQL 13+
- Nginx (для production)
- Git

#### Установка системных зависимостей

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip postgresql postgresql-contrib nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**CentOS/RHEL:**
```bash
sudo yum install -y python3.10 python3-pip postgresql postgresql-server nginx git curl
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### 3. Установка на новом сервере

#### Шаг 1: Распаковка проекта
```bash
cd /var/www
tar -xzf marketsport_migration.tar.gz
cd marketsport
```

#### Шаг 2: Настройка базы данных
```bash
# Создание пользователя и базы данных
sudo -u postgres psql << EOF
CREATE USER marketsport_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE marketsport OWNER marketsport_user;
GRANT ALL PRIVILEGES ON DATABASE marketsport TO marketsport_user;
\q
EOF

# Импорт данных
psql -U marketsport_user -d marketsport < marketsport_backup.sql
```

#### Шаг 3: Настройка Backend
```bash
cd /var/www/marketsport/backend

# Создание виртуального окружения
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install --upgrade pip
pip install -r requirements.txt

# Создание .env файла (см. backend/.env.example)
cp .env.example .env
nano .env  # Заполните переменные окружения

# Применение миграций (если нужно)
alembic upgrade head
```

#### Шаг 4: Настройка Frontend
```bash
cd /var/www/marketsport/frontend

# Установка зависимостей
npm install

# Создание .env.local файла
cp .env.local.example .env.local
nano .env.local  # Заполните переменные окружения

# Production build (опционально)
npm run build
```

#### Шаг 5: Настройка systemd сервисов

**Backend сервис** (`/etc/systemd/system/marketsport-backend.service`):
```ini
[Unit]
Description=Marketsport Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/marketsport/backend
Environment="PATH=/var/www/marketsport/backend/venv/bin"
ExecStart=/var/www/marketsport/backend/venv/bin/python run.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Frontend сервис** (`/etc/systemd/system/marketsport-frontend.service`):
```ini
[Unit]
Description=Marketsport Frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/marketsport/frontend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Активация сервисов:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable marketsport-backend
sudo systemctl enable marketsport-frontend
sudo systemctl start marketsport-backend
sudo systemctl start marketsport-frontend
```

#### Шаг 6: Настройка Nginx

Создайте файл `/etc/nginx/sites-available/marketsport`:
```nginx
server {
    listen 80;
    server_name marketsport.online www.marketsport.online;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:8000/health;
    }
}
```

**Активация конфигурации:**
```bash
sudo ln -s /etc/nginx/sites-available/marketsport /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Переменные окружения

#### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://marketsport_user:your_password@localhost:5432/marketsport

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MIN=1440

# Polymarket
POLY_CLOB_HOST=https://clob.polymarket.com
POLY_CHAIN_ID=137
POLY_RELAYER_URL=https://relayer-v2.polymarket.dev/
POLY_BUILDER_KEY=your_builder_key
POLY_BUILDER_SECRET=your_builder_secret
POLY_BUILDER_PASSPHRASE=your_passphrase
POLY_BUILDER_PRIVATE_KEY=your_private_key

# Optional: The Graph API
THEGRAPH_API_KEY=your_graph_api_key
```

#### Frontend (.env.local)
```env
# Backend API
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```

### 5. Проверка после миграции

```bash
# Проверка backend
curl http://localhost:8000/health

# Проверка frontend
curl http://localhost:3000

# Проверка логов
sudo journalctl -u marketsport-backend -f
sudo journalctl -u marketsport-frontend -f

# Проверка базы данных
psql -U marketsport_user -d marketsport -c "SELECT COUNT(*) FROM users;"
```

### 6. Откат (если что-то пошло не так)

```bash
# Остановка сервисов
sudo systemctl stop marketsport-backend
sudo systemctl stop marketsport-frontend

# Восстановление базы данных из бэкапа
psql -U marketsport_user -d marketsport < marketsport_backup.sql
```

## Чеклист миграции

- [ ] Экспортирована база данных
- [ ] Создан архив проекта
- [ ] Установлены системные зависимости на новом сервере
- [ ] Распакован проект
- [ ] Настроена база данных PostgreSQL
- [ ] Импортированы данные
- [ ] Настроен Backend (.env файл)
- [ ] Установлены Python зависимости
- [ ] Применены миграции Alembic
- [ ] Настроен Frontend (.env.local файл)
- [ ] Установлены Node.js зависимости
- [ ] Настроены systemd сервисы
- [ ] Настроен Nginx
- [ ] Проверена работа всех сервисов
- [ ] Обновлены DNS записи (если нужно)
- [ ] Настроен SSL сертификат (Let's Encrypt)

## Важные замечания

1. **Безопасность**: Обязательно измените все пароли и секретные ключи на новом сервере
2. **DNS**: Обновите DNS записи после миграции
3. **SSL**: Настройте SSL сертификат через Let's Encrypt
4. **Бэкапы**: Регулярно создавайте бэкапы базы данных
5. **Мониторинг**: Настройте мониторинг сервисов

## Поддержка

При возникновении проблем проверьте:
- Логи systemd: `sudo journalctl -u marketsport-backend -n 50`
- Логи Nginx: `sudo tail -f /var/log/nginx/error.log`
- Логи приложения: `/tmp/backend.log`

