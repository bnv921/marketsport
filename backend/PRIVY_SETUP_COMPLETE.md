# Privy Integration - Что нужно доделать

## ✅ Что уже сделано:

1. **Добавлены Privy credentials в `.env`:**
   - `PRIVY_APP_ID` - добавлен
   - `PRIVY_APP_SECRET` - добавлен

2. **Исправлена аутентификация Privy API:**
   - Используется Basic auth (base64(app_id:app_secret)) вместо Bearer token
   - Правильные заголовки для Privy REST API

3. **Реализовано получение wallet информации:**
   - Функция `get_user_signer()` получает информацию о wallet из Privy API
   - Правильная обработка ответов от Privy

4. **Добавлена попытка экспорта embedded wallet:**
   - Новый модуль `privy_wallet_export.py` для экспорта private key
   - Попытка использовать endpoint `/wallets/{wallet_id}/export`

## ⚠️ Что нужно проверить/доделать:

### 1. Проверить доступность Wallet Export API

Privy может не предоставлять endpoint для экспорта embedded wallet private keys на всех планах.

**Проверка:**
```bash
# Попробуйте вызвать enable-trading endpoint
curl -X POST https://marketsport.online/api/polymarket/enable-trading \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Если получаете ошибку о недоступности private key:**

**Вариант A: Использовать Frontend Signing (рекомендуется)**

1. Frontend подписывает сообщения через Privy SDK
2. Backend только верифицирует подписи
3. Для создания L2 API creds, frontend должен подписать специальное сообщение

**Реализация:**
- Создать endpoint `/api/polymarket/enable-trading-with-signature`
- Frontend подписывает сообщение через `usePrivy().signMessage()`
- Backend верифицирует подпись и создает L2 creds

**Вариант B: Использовать Privy Server SDK**

Если у вас есть доступ к Privy Server SDK:

```bash
pip install privy-python-sdk
```

Затем обновить `privy_wallet_export.py` для использования SDK вместо REST API.

**Вариант C: Включить Wallet Export в Privy Dashboard**

1. Зайдите в Privy Dashboard
2. Найдите настройки для вашего приложения
3. Включите опцию "Allow Wallet Export" (если доступна)

### 2. Протестировать enable-trading endpoint

После настройки Privy, протестируйте:

```bash
# 1. Получите JWT token через /api/auth/privy-login
# 2. Вызовите enable-trading
curl -X POST https://marketsport.online/api/polymarket/enable-trading \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Ожидаемый результат:**
```json
{
  "status": "enabled",
  "message": "Trading enabled successfully",
  "trading_enabled": true
}
```

**Если получаете ошибку:**
- Проверьте логи backend: `sudo journalctl -u marketsport-backend -f`
- Убедитесь что `PRIVY_APP_ID` и `PRIVY_APP_SECRET` правильные
- Проверьте что пользователь имеет connected wallet в Privy

### 3. Настроить Frontend для работы с Privy

Убедитесь что frontend правильно настроен:

1. **PrivyProvider настроен** (уже сделано в `layout.tsx`)
2. **Пользователь может подключить wallet** через Privy
3. **Wallet address сохраняется** в backend при логине

### 4. Обработка ошибок

Добавьте обработку следующих случаев:

- **Wallet export недоступен:** Предложить frontend signing
- **Privy API недоступен:** Показать понятное сообщение пользователю
- **Invalid credentials:** Проверить правильность App ID и Secret

## 📝 Следующие шаги:

1. **Протестировать текущую реализацию:**
   ```bash
   # Проверить логи
   sudo journalctl -u marketsport-backend -f
   
   # Попробовать enable-trading
   # Если не работает - проверить ошибки в логах
   ```

2. **Если wallet export не работает:**
   - Реализовать frontend signing подход
   - Или использовать Privy Server SDK
   - Или связаться с Privy support для доступа к export API

3. **После успешного enable-trading:**
   - Протестировать создание ордеров
   - Убедиться что builder headers добавляются
   - Проверить что ордера создаются с правильной атрибуцией

## 🔍 Отладка:

### Проверить Privy API подключение:
```python
# В Python shell или скрипте
import httpx
import base64
from app.core.config import settings

auth_string = f"{settings.PRIVY_APP_ID}:{settings.PRIVY_APP_SECRET}"
auth_b64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')

headers = {
    "Authorization": f"Basic {auth_b64}",
    "privy-app-id": settings.PRIVY_APP_ID,
}

# Попробовать получить пользователя
response = httpx.get(
    f"{settings.PRIVY_API_URL}/users/{user_did}",
    headers=headers
)
print(response.status_code)
print(response.json())
```

### Проверить логи:
```bash
# Backend логи
sudo journalctl -u marketsport-backend -n 100 --no-pager

# Искать Privy-related ошибки
sudo journalctl -u marketsport-backend | grep -i privy
```

## 📚 Полезные ссылки:

- [Privy REST API Documentation](https://docs.privy.io/basics/rest-api/setup)
- [Privy Embedded Wallets](https://docs.privy.io/guides/embedded-wallets)
- [Privy Server SDK (если доступен)](https://docs.privy.io/server-sdk)

