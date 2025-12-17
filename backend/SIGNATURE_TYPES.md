# Разделение подписей для Enable Trading и Orders

## Обзор

В системе используются **два разных типа подписей** для разных операций:

1. **Enable Trading Signature** - для аутентификации и создания L2 API credentials
2. **Order Signature** - для подписания торговых ордеров

## 1. Enable Trading Signature

### Назначение
Аутентификация пользователя и создание L2 API credentials в Polymarket.

### Тип подписи
**EIP-712 ClobAuth message**

### Структура typedData
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
    "chainId": 137
  },
  "primaryType": "ClobAuth",
  "message": {
    "address": "0x...",
    "timestamp": "1234567890",
    "nonce": "0",
    "message": "This message attests that I control the given wallet"
  }
}
```

### Где подписывается
- **Фронтенд**: Privy embedded wallet через `eth_signTypedData_v4`
- **Бэкенд**: Получает подпись и использует для создания L2 API credentials

### Endpoints
- `POST /api/polymarket/enable-trading` - получить typedData
- `POST /api/polymarket/enable-trading/confirm` - подтвердить с подписью

## 2. Order Signature

### Назначение
Подписание торгового ордера для размещения на Polymarket.

### Тип подписи
**EIP-712 Order message**

### Структура Order
```json
{
  "salt": 1234567890,
  "maker": "0x...",
  "signer": "0x...",
  "taker": "0x0000000000000000000000000000000000000000",
  "tokenId": "7714760...",
  "makerAmount": "3120000",
  "takerAmount": "6000000",
  "expiration": "0",
  "nonce": "0",
  "feeRateBps": "0",
  "side": "0",
  "signatureType": "0"
}
```

### Где подписывается
- **Бэкенд**: Через `PrivySigner`, который вызывает Privy API для подписи
- **Альтернатива**: Может быть подписано на фронтенде, если нужно

### Endpoint
- `POST /api/polymarket/orders` - создать и разместить ордер

## Различия

| Аспект | Enable Trading | Order |
|--------|---------------|-------|
| **Тип подписи** | EIP-712 ClobAuth | EIP-712 Order |
| **Где подписывается** | Фронтенд (Privy) | Бэкенд (PrivySigner) |
| **Содержимое** | address, timestamp, nonce, message | tokenId, price, size, side, maker, taker |
| **Цель** | Создать L2 API credentials | Разместить торговый ордер |
| **Частота** | Один раз при включении торговли | Каждый раз при создании ордера |

## Текущая реализация

### Enable Trading
1. Фронтенд запрашивает typedData у бэкенда
2. Фронтенд подписывает через Privy `eth_signTypedData_v4`
3. Фронтенд отправляет подпись на `/enable-trading/confirm`
4. Бэкенд использует подпись для создания L2 API credentials через Polymarket API

### Order Creation
1. Фронтенд отправляет параметры ордера на `/orders`
2. Бэкенд создает OrderData через py-clob-client
3. Бэкенд использует PrivySigner для подписи ордера (вызывает Privy API)
4. Бэкенд отправляет подписанный ордер на Polymarket

## Важные замечания

1. **Enable Trading подпись** создается на фронтенде, потому что:
   - Это одноразовая операция
   - Требует явного согласия пользователя
   - Проще для UX

2. **Order подпись** создается на бэкенде через PrivySigner, потому что:
   - Ордера создаются часто
   - Пользователь уже дал согласие при enable-trading
   - Упрощает UX (не нужно подписывать каждый ордер)

3. **Альтернативный подход**: Если PrivySigner не работает для подписи ордеров, можно:
   - Создавать typedData для ордера на бэкенде
   - Отправлять на фронтенд для подписи
   - Получать подпись и использовать для размещения ордера

## Отладка

Если возникают проблемы с подписями:

1. **Enable Trading**: Проверьте логи фронтенда - должна быть успешная подпись через Privy
2. **Order**: Проверьте логи PrivySigner - должен быть успешный вызов Privy API для подписи

