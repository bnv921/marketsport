# EIP-712 Enable Trading Implementation

## Реализованный Flow

### Шаг 1: Backend готовит EIP-712 typedData

**Endpoint:** `POST /api/polymarket/enable-trading`

**Что делает:**
1. Получает server time от Polymarket CLOB (`GET /time`)
2. Формирует EIP-712 typedData для ClobAuth:
   ```json
   {
     "types": {
       "ClobAuth": [
         {"name": "address", "type": "address"},
         {"name": "timestamp", "type": "string"},
         {"name": "nonce", "type": "uint256"},
         {"name": "message", "type": "string"}
       ],
       "EIP712Domain": [
         {"name": "name", "type": "string"},
         {"name": "version", "type": "string"},
         {"name": "chainId", "type": "uint256"}
       ]
     },
     "domain": {
       "name": "ClobAuthDomain",
       "version": "1",
       "chainId": "137"
     },
     "primaryType": "ClobAuth",
     "message": {
       "address": "0x...",
       "timestamp": "1765298615",
       "nonce": "0",
       "message": "This message attests that I control the given wallet"
     }
   }
   ```
3. Возвращает typedData на frontend

**Response:**
```json
{
  "status": "ready_to_sign",
  "typedData": { ... },
  "timestamp": "1765298615",
  "nonce": "0",
  "address": "0x..."
}
```

### Шаг 2: Frontend подписывает через Privy

**Что делает:**
1. Получает typedData от backend
2. Использует Privy embedded wallet для подписи:
   ```typescript
   const provider = await wallet.getEthereumProvider();
   const signature = await provider.request({
     method: 'eth_signTypedData_v4',
     params: [wallet.address, typedData],
   });
   ```
3. Отправляет подпись на backend

### Шаг 3: Backend создает L2 API creds

**Endpoint:** `POST /api/polymarket/enable-trading/confirm`

**Request:**
```json
{
  "address": "0x...",
  "timestamp": "1765298615",
  "nonce": "0",
  "signature": "0x..."
}
```

**Что делает:**
1. Проверяет что address совпадает с user.wallet_address
2. Формирует L1 auth headers:
   - `POLY_ADDRESS`: address
   - `POLY_SIGNATURE`: signature
   - `POLY_TIMESTAMP`: timestamp
   - `POLY_NONCE`: nonce
3. Вызывает Polymarket REST API:
   ```
   POST https://clob.polymarket.com/auth/api-keys
   Headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE
   ```
4. Сохраняет L2 API creds (apiKey, secret, passphrase) в базу данных
5. Устанавливает `trading_enabled = True`

## Важные моменты

1. **Server Time обязателен**: timestamp должен быть с сервера CLOB, не произвольный
2. **EIP-712 формат**: точно соответствует документации Polymarket
3. **Non-custodial**: приватный ключ никогда не покидает Privy embedded wallet
4. **Автоматический вызов**: `enableTrading()` автоматически вызывается при создании ордера если trading не включен

## Проверка

После реализации проверьте:
1. `POST /api/polymarket/enable-trading` возвращает typedData
2. Frontend успешно подписывает через Privy
3. `POST /api/polymarket/enable-trading/confirm` создает L2 API creds
4. Ордера создаются успешно после enable-trading

## Возможные проблемы

1. **Polymarket API endpoint может отличаться**: Проверьте документацию если `/auth/api-keys` не работает
2. **Privy signTypedData**: Убедитесь что используется правильный метод для вашей версии Privy SDK
3. **Signature format**: Убедитесь что signature в правильном формате (0x...)

