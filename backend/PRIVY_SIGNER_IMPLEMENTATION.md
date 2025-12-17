# Privy Signer Implementation (без экспорта ключей)

## ✅ Реализовано:

1. **PrivySigner класс** - реализует интерфейс Signer из py_clob_client
   - Метод `sign(message_hash)` использует Privy API для подписи
   - Методы `address()` и `get_chain_id()` для совместимости
   - Не требует экспорта private key

2. **Интеграция с user_clob_client.py:**
   - `get_user_signer()` использует PrivySigner для embedded wallets
   - Убраны попытки экспорта ключей
   - Используется только Privy API для подписи

## ⚠️ Важно: Проверить Privy API endpoint для подписи

Текущая реализация использует endpoint:
```
POST /v1/wallets/{wallet_id}/sign
```

**Этот endpoint может отличаться в реальном Privy API!**

### Возможные варианты Privy API endpoints:

1. **Если Privy предоставляет server-side signing:**
   ```
   POST /v1/wallets/{wallet_id}/sign
   Body: { "message": "hash", "messageType": "hash" }
   ```

2. **Если нужно использовать frontend signing:**
   - Frontend использует `usePrivy().signMessage()` 
   - Backend получает подпись через отдельный endpoint
   - Backend верифицирует подпись

3. **Если Privy использует другой формат:**
   - Проверить документацию Privy REST API
   - Возможно нужен другой endpoint или формат запроса

## 🔍 Как проверить правильность endpoint:

1. **Проверить Privy API документацию:**
   - https://docs.privy.io/basics/rest-api
   - Найти endpoint для подписи сообщений

2. **Протестировать enable-trading:**
   ```bash
   curl -X POST https://marketsport.online/api/polymarket/enable-trading \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **Проверить логи:**
   ```bash
   sudo journalctl -u marketsport-backend -f
   ```
   
   Искать ошибки:
   - `Privy sign API error: 404` - endpoint не найден
   - `Privy sign API error: 400` - неправильный формат запроса
   - `Privy sign API error: 401` - проблемы с аутентификацией

## 📝 Если endpoint неверный:

### Вариант 1: Исправить endpoint в privy_signer.py

Найти правильный endpoint в документации Privy и обновить:
```python
sign_response = httpx.post(
    f"{self.privy_api_url}/wallets/{wallet_id}/sign",  # <- исправить здесь
    headers=headers,
    json=sign_payload,
    timeout=10.0
)
```

### Вариант 2: Использовать frontend signing

Если Privy не предоставляет server-side signing API, нужно:

1. Создать endpoint для получения сообщения для подписи:
   ```python
   @router.post("/polymarket/get-signing-message")
   async def get_signing_message(...):
       # Генерировать сообщение для подписи
       # Вернуть его frontend
   ```

2. Frontend подписывает через Privy SDK:
   ```typescript
   const signature = await signMessage(message);
   ```

3. Backend получает подпись и создает L2 creds:
   ```python
   @router.post("/polymarket/enable-trading-with-signature")
   async def enable_trading_with_signature(
       signature: str,
       message: str,
       ...
   ):
       # Верифицировать подпись
       # Создать L2 creds используя подпись
   ```

## 🎯 Текущий статус:

- ✅ PrivySigner реализован без экспорта ключей
- ✅ Использует Privy API для подписи
- ⚠️ Нужно проверить правильность Privy API endpoint
- ⚠️ Возможно нужна адаптация под реальный Privy API

## 📚 Следующие шаги:

1. Протестировать `enable-trading` endpoint
2. Проверить логи на ошибки Privy API
3. Если endpoint неверный - исправить или использовать frontend signing

