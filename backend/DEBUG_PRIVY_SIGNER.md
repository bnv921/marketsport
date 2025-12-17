# Отладка Privy Signer

## Проблема
Ошибка: "Could not get L1 signer. Please ensure your wallet is connected and Privy integration is properly configured."

## Шаги отладки

### 1. Проверить логи backend
```bash
sudo journalctl -u marketsport-backend -f | grep -E '\[get_user_signer\]|\[get_privy_signer\]|Privy|wallet'
```

### 2. Проверить что у пользователя есть wallet_address
```bash
cd /var/www/marketsport/backend
python3 -c "
from app.core.database import SessionLocal
from app.models.user import User
db = SessionLocal()
user = db.query(User).filter(User.did == 'YOUR_DID').first()
print(f'wallet_address: {user.wallet_address if user else None}')
db.close()
"
```

### 3. Проверить Privy API подключение
```bash
cd /var/www/marketsport/backend
python3 -c "
import httpx
import base64
from app.core.config import settings

auth_string = f'{settings.PRIVY_APP_ID}:{settings.PRIVY_APP_SECRET}'
auth_b64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')

headers = {
    'Authorization': f'Basic {auth_b64}',
    'privy-app-id': settings.PRIVY_APP_ID,
}

response = httpx.get(f'{settings.PRIVY_API_URL}/users/YOUR_DID', headers=headers)
print(f'Status: {response.status_code}')
print(f'Response: {response.text[:500]}')
"
```

### 4. Возможные проблемы

#### Проблема 1: Privy API endpoint неверный
- Проверить документацию Privy API
- Возможно endpoint `/users/{did}` не существует или требует другой формат

#### Проблема 2: Privy API endpoint для подписи неверный
- Текущий код использует `/wallets/{wallet_id}/sign`
- Этот endpoint может не существовать в Privy API
- Нужно проверить правильный endpoint в документации

#### Проблема 3: Wallet не найден в Privy
- Проверить что wallet_address в базе данных совпадает с wallet в Privy
- Возможно нужно использовать другой способ получения wallet

## Решение

Если Privy API не предоставляет server-side signing, нужно использовать **frontend signing**:

1. Frontend подписывает сообщение через Privy SDK
2. Backend получает подпись и создает L2 creds используя подпись
3. Или используем другой подход для получения signer

