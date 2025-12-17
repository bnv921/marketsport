# Интеграция с Privy для получения L1 Signer

## Текущий статус

Функция `get_user_signer()` в `/app/polymarket/user_clob_client.py` является заглушкой и требует реализации.

## Варианты реализации

### Вариант 1: Privy Server SDK (рекомендуется)

Если у вас есть Privy Server SDK:

```python
from privy import PrivyClient

def get_user_signer(user: User) -> Optional[object]:
    from py_clob_client.signer import Signer
    from app.core.config import settings
    
    try:
        privy_client = PrivyClient(api_key=settings.PRIVY_API_KEY)
        
        # Получаем embedded wallet для пользователя
        wallet = privy_client.get_embedded_wallet(user.did)
        
        # Получаем private key (если доступен)
        private_key = wallet.get_private_key()
        
        # Создаем Signer
        return Signer(private_key)
    except Exception as e:
        print(f"Error getting signer from Privy: {e}")
        return None
```

### Вариант 2: Frontend передает signer

Если frontend может получить signer через Privy SDK:

1. Frontend получает signer через `usePrivy()` hook
2. Frontend подписывает сообщение для верификации
3. Backend верифицирует подпись и использует wallet_address для создания signer

```python
def get_user_signer(user: User) -> Optional[object]:
    # Если у вас есть способ получить private key из wallet_address
    # (например, через Turnkey или другой сервис)
    from py_clob_client.signer import Signer
    
    # TODO: Получить private key для user.wallet_address
    # Это может быть через:
    # - Turnkey API
    # - Другой key management service
    # - Encrypted storage (не рекомендуется для production)
    
    return None
```

### Вариант 3: Использование Turnkey (если Privy использует Turnkey)

Если Privy использует Turnkey для embedded wallets:

```python
from turnkey_sdk import TurnkeyClient

def get_user_signer(user: User) -> Optional[object]:
    from py_clob_client.signer import Signer
    from app.core.config import settings
    
    try:
        turnkey_client = TurnkeyClient(
            api_key=settings.TURNKEY_API_KEY,
            api_secret=settings.TURNKEY_API_SECRET
        )
        
        # Получаем private key для wallet
        private_key = turnkey_client.get_private_key(
            wallet_id=user.wallet_address
        )
        
        return Signer(private_key)
    except Exception as e:
        print(f"Error getting signer from Turnkey: {e}")
        return None
```

## Требования

1. **API ключи**: Добавьте в `.env`:
   - `PRIVY_API_KEY` (если используете Privy Server SDK)
   - `TURNKEY_API_KEY` и `TURNKEY_API_SECRET` (если используете Turnkey)

2. **Безопасность**: 
   - Никогда не храните private keys в plaintext
   - Используйте encrypted storage или key management service
   - Private keys должны быть доступны только во время выполнения операции

3. **Signature Type**: 
   - Для EOA wallets: `POLY_GNOSIS_SAFE` или стандартный EIP-712
   - Для proxy/safe wallets: соответствующий signature type

## Проверка

После реализации проверьте:

1. `get_user_signer()` возвращает валидный Signer объект
2. `enable_trading` endpoint успешно создает L2 API creds
3. `create_order` endpoint успешно создает ордера

