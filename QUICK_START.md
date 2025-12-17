# Быстрый старт после миграции

## Быстрая установка

### 1. Экспорт со старого сервера
```bash
cd /var/www/marketsport
./scripts/export_for_migration.sh
```

### 2. Копирование на новый сервер
```bash
scp /tmp/marketsport_migration_*.tar.gz user@new-server:/tmp/
```

### 3. Установка на новом сервере
```bash
ssh user@new-server
sudo bash /tmp/install_on_new_server.sh /tmp/marketsport_migration_*.tar.gz
```

### 4. Настройка переменных окружения
```bash
# Backend
nano /var/www/marketsport/backend/.env
# Скопируйте содержимое из backend/env.template и заполните

# Frontend  
nano /var/www/marketsport/frontend/.env.local
# Скопируйте содержимое из frontend/env.local.template и заполните
```

### 5. Запуск сервисов
```bash
sudo systemctl start marketsport-backend
sudo systemctl start marketsport-frontend
sudo systemctl status marketsport-backend
sudo systemctl status marketsport-frontend
```

## Проверка работы

```bash
# Backend
curl http://localhost:8000/health

# Frontend
curl http://localhost:3000

# Логи
sudo journalctl -u marketsport-backend -f
sudo journalctl -u marketsport-frontend -f
```

## Полезные команды

```bash
# Перезапуск сервисов
sudo systemctl restart marketsport-backend
sudo systemctl restart marketsport-frontend

# Остановка сервисов
sudo systemctl stop marketsport-backend
sudo systemctl stop marketsport-frontend

# Просмотр логов
sudo journalctl -u marketsport-backend -n 100
sudo journalctl -u marketsport-frontend -n 100

# Проверка статуса
sudo systemctl status marketsport-backend
sudo systemctl status marketsport-frontend
```

## Решение проблем

### Backend не запускается
1. Проверьте .env файл: `cat /var/www/marketsport/backend/.env`
2. Проверьте логи: `sudo journalctl -u marketsport-backend -n 50`
3. Проверьте подключение к БД: `psql -U marketsport_user -d marketsport`

### Frontend не запускается
1. Проверьте .env.local файл: `cat /var/www/marketsport/frontend/.env.local`
2. Проверьте логи: `sudo journalctl -u marketsport-frontend -n 50`
3. Проверьте зависимости: `cd /var/www/marketsport/frontend && npm install`

### База данных не подключается
1. Проверьте статус PostgreSQL: `sudo systemctl status postgresql`
2. Проверьте подключение: `psql -U marketsport_user -d marketsport`
3. Проверьте DATABASE_URL в .env файле

