# Marketsport - Polymarket Trading Platform

Монорепозиторий для торговли на Polymarket CLOB через builder-ключи с авторизацией через Privy.

## Структура проекта

```
/
├── backend/          # FastAPI backend
├── frontend/         # Next.js frontend
└── README.md
```

## Требования

- Python 3.10+
- Node.js 18+
- PostgreSQL
- Privy App ID
- Polymarket Builder Keys

## Установка

### Backend

1. Перейдите в директорию backend:
```bash
cd backend
```

2. Создайте виртуальное окружение:
```bash
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

5. Заполните переменные окружения в `.env`:
- `DATABASE_URL` - URL подключения к PostgreSQL
- `JWT_SECRET` - Секретный ключ для JWT токенов
- `POLY_BUILDER_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE`, `POLY_BUILDER_PRIVATE_KEY` - Builder ключи от Polymarket

6. Создайте базу данных:
```bash
createdb marketsport
```

7. Запустите миграции Alembic:
```bash
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

8. Запустите сервер:
```bash
python run.py
# или
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend будет доступен на `http://localhost:8000`

### Frontend

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env.local` на основе `.env.local.example`:
```bash
cp .env.local.example .env.local
```

4. Заполните переменные окружения:
- `NEXT_PUBLIC_API_BASE_URL` - URL backend API (по умолчанию `http://localhost:8000/api`)
- `NEXT_PUBLIC_PRIVY_APP_ID` - App ID из Privy Dashboard

5. Запустите dev сервер:
```bash
npm run dev
```

Frontend будет доступен на `http://localhost:3000`

## Использование

### Авторизация

1. Нажмите "Login with Privy" на любой странице
2. Подключите кошелек через Privy
3. После авторизации вы получите JWT токен, который будет использоваться для всех запросов к API

### Торговля

1. Перейдите на страницу матча (`/match/[gamePk]`)
2. Если для матча есть Polymarket рынок, вы увидите:
   - Order Book (стакан заявок)
   - Trade Form (форма для размещения ордеров)

3. В форме торговли:
   - Выберите сторону (BUY/SELL)
   - Выберите тип ордера (Limit/Market)
   - Заполните параметры (price/size для Limit, amount для Market)
   - Нажмите "Preview" для предпросмотра
   - Нажмите "Place Order" для размещения ордера

### Портфель

Перейдите на `/portfolio` для просмотра ваших открытых ордеров и их отмены.

## API Endpoints

### Auth
- `POST /api/auth/privy-login` - Авторизация через Privy DID
- `GET /api/auth/me` - Получить информацию о текущем пользователе

### Matches
- `POST /api/matches/import` - Импорт матчей
- `GET /api/matches` - Список матчей
- `GET /api/matches/{id}` - Детали матча с Polymarket рынками

### Polymarket
- `GET /api/polymarket/markets` - Список рынков
- `GET /api/polymarket/orderbook/{token_id}` - Стакан заявок
- `POST /api/polymarket/orders/preview` - Предпросмотр ордера
- `POST /api/polymarket/orders` - Разместить ордер
- `GET /api/polymarket/orders/my` - Мои ордера
- `DELETE /api/polymarket/orders/{id}` - Отменить ордер

## Миграции базы данных

Для создания новой миграции:
```bash
cd backend
alembic revision --autogenerate -m "Description"
```

Для применения миграций:
```bash
alembic upgrade head
```

Для отката миграции:
```bash
alembic downgrade -1
```

## Структура базы данных

### Users
- `id` - Primary key
- `did` - Privy DID (уникальный)
- `wallet_address` - Адрес кошелька
- `created_at` - Дата создания

### Matches
- `id` - Primary key
- `external_id` - Внешний ID матча
- `home_team`, `away_team` - Команды
- `start_time` - Время начала
- `league`, `sport` - Лига и вид спорта

### PolymarketMarkets
- `id` - Primary key
- `match_id` - Foreign key к Match
- `token_id` - Token ID на Polymarket
- `market_name` - Название рынка
- `status` - Статус рынка

## Разработка

### Backend

Структура:
```
backend/
├── app/
│   ├── api/          # API endpoints
│   ├── core/         # Конфигурация, БД, security
│   ├── models/       # SQLAlchemy модели
│   ├── polymarket/   # Polymarket интеграция
│   └── main.py       # FastAPI приложение
├── migrations/        # Alembic миграции
└── requirements.txt
```

### Frontend

Структура:
```
frontend/
├── src/
│   ├── app/          # Next.js App Router
│   ├── components/   # React компоненты
│   ├── hooks/        # React hooks
│   └── lib/          # Утилиты
└── package.json
```

## Документация

- [Polymarket Builder Documentation](https://docs.polymarket.com/developers/builders/builder-intro)
- [Privy Documentation](https://docs.privy.io/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)

## Лицензия

MIT
