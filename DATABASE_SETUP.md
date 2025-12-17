# Инструкция по настройке PostgreSQL

PostgreSQL не установлен на сервере. У вас есть несколько вариантов:

## Вариант 1: Установка PostgreSQL локально (рекомендуется для разработки)

### Шаг 1: Установка PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**CentOS/RHEL:**
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Шаг 2: Создание пользователя и базы данных

```bash
# Переключиться на пользователя postgres
sudo -u postgres psql

# В psql создать пользователя и базу данных
CREATE USER marketsport_user WITH PASSWORD 'ваш_надежный_пароль';
CREATE DATABASE marketsport OWNER marketsport_user;
GRANT ALL PRIVILEGES ON DATABASE marketsport TO marketsport_user;
\q
```

### Шаг 3: Обновить DATABASE_URL в backend/.env

```bash
DATABASE_URL=postgresql://marketsport_user:ваш_надежный_пароль@localhost:5432/marketsport
```

---

## Вариант 2: Использование Docker (проще для разработки)

### Шаг 1: Создать docker-compose.yml

Создайте файл `docker-compose.yml` в корне проекта:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: marketsport_db
    environment:
      POSTGRES_USER: marketsport_user
      POSTGRES_PASSWORD: marketsport_password
      POSTGRES_DB: marketsport
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Шаг 2: Запустить PostgreSQL

```bash
docker-compose up -d
```

### Шаг 3: Обновить DATABASE_URL в backend/.env

```bash
DATABASE_URL=postgresql://marketsport_user:marketsport_password@localhost:5432/marketsport
```

---

## Вариант 3: Использование удаленной БД (для продакшена)

Если у вас есть удаленный PostgreSQL сервер:

```bash
DATABASE_URL=postgresql://пользователь:пароль@хост:порт/база_данных
```

Пример:
```bash
DATABASE_URL=postgresql://marketsport_user:mypassword@db.example.com:5432/marketsport
```

---

## Вариант 4: Использование облачных сервисов

### Heroku Postgres:
```bash
heroku addons:create heroku-postgresql:hobby-dev
heroku config:get DATABASE_URL
```

### AWS RDS:
Создайте инстанс RDS и используйте полученный endpoint.

### DigitalOcean Managed Database:
Создайте базу данных и используйте connection string.

---

## После настройки БД

1. **Обновите backend/.env** с правильным DATABASE_URL
2. **Запустите миграции:**
```bash
cd backend
alembic upgrade head
```

3. **Проверьте подключение:**
```bash
cd backend
python3 -c "from app.core.database import engine; engine.connect(); print('✅ Подключение успешно!')"
```

---

## Быстрый старт (Docker)

Если хотите быстро начать с Docker:

```bash
# 1. Создать docker-compose.yml (код выше)
# 2. Запустить
docker-compose up -d

# 3. Обновить .env
echo "DATABASE_URL=postgresql://marketsport_user:marketsport_password@localhost:5432/marketsport" >> backend/.env

# 4. Запустить миграции
cd backend
alembic upgrade head
```

