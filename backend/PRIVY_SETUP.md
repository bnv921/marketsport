# Настройка Privy интеграции

## Переменные окружения

Добавьте в `.env` файл:

```env
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

## Где взять эти значения

1. **PRIVY_APP_ID**: 
   - Зайдите в Privy Dashboard (https://dashboard.privy.io)
   - Выберите ваше приложение
   - Скопируйте App ID (обычно это строка вида `clxxxxx...`)

2. **PRIVY_APP_SECRET**:
   - В том же Dashboard, в настройках приложения
   - Найдите "App Secret" или "Server Secret"
   - Скопируйте значение

## Важные замечания

### Для Embedded Wallets

Privy управляет ключами для embedded wallets на своей стороне. Это означает:

1. **Backend не имеет прямого доступа к private key** пользователя
2. **Подпись должна происходить либо:**
   - Через Privy's signing API (если доступен)
   - Или через frontend, который использует Privy SDK для подписи

### Текущая реализация

Текущая реализация в `get_user_signer()` пытается:
1. Использовать Privy REST API для получения информации о wallet
2. Создать signer wrapper, который использует Privy для подписи

**Однако**, для полной функциональности может потребоваться:

### Вариант A: Frontend Signing (рекомендуется для embedded wallets)

Frontend подписывает сообщения используя Privy SDK, backend только верифицирует:

```typescript
// Frontend
import { usePrivy } from '@privy-io/react-auth';

const { signMessage } = usePrivy();
const signature = await signMessage(message);
// Отправить signature на backend
```

Backend верифицирует подпись и использует для операций.

### Вариант B: Privy Signing API

Если Privy предоставляет server-side signing API, используйте его для подписи на backend.

### Вариант C: Export Private Key (не рекомендуется)

Если пользователь экспортирует private key из embedded wallet, его можно использовать напрямую. Но это снижает безопасность embedded wallet.

## Проверка работы

После настройки переменных окружения:

1. Проверьте что backend запускается без ошибок
2. Попробуйте вызвать `/api/polymarket/enable-trading`
3. Проверьте логи на наличие ошибок Privy API

## Troubleshooting

### Ошибка: "Privy integration not configured"
- Убедитесь что `PRIVY_APP_SECRET` установлен в `.env`
- Перезапустите backend после изменения `.env`

### Ошибка: "Could not get L1 signer"
- Проверьте что `PRIVY_APP_ID` и `PRIVY_APP_SECRET` правильные
- Проверьте что пользователь имеет connected wallet в Privy
- Проверьте логи для деталей ошибки Privy API

### Ошибка: "Privy API error: 401"
- Проверьте что `PRIVY_APP_SECRET` правильный
- Убедитесь что используете правильный формат авторизации

