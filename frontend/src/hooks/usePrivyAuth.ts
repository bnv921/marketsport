import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useState, useRef } from 'react';

// 🔒 Модульный флаг для гарантии ОДНОГО запроса на lifetime вкладки
// Живёт вне React, не сбрасывается при перемонтировании компонентов
type BackendAuthState = 'idle' | 'in_progress' | 'done' | 'rate_limited';
let backendAuthState: BackendAuthState = 'idle';

export function usePrivyAuth() {
  const privy = usePrivy();
  const { ready, authenticated, user, login, logout, getAccessToken } = privy || {};
  const { wallets } = useWallets();
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendAuthed, setBackendAuthed] = useState(false); // Флаг успешной аутентификации
  const [walletSaved, setWalletSaved] = useState(false); // Флаг сохранения embedded wallet address
  const [rateLimited, setRateLimited] = useState(false); // Флаг rate limit - не пытаемся сразу снова
  const isAuthInProgressRef = useRef(false); // Флаг для предотвращения параллельных запросов
  
  // Debug: log Privy state
  useEffect(() => {
    if (privy) {
      console.log('[usePrivyAuth] Privy ready:', ready, 'authenticated:', authenticated, 'login available:', typeof login);
    }
  }, [privy, ready, authenticated, login]);

  useEffect(() => {
    const storedToken = localStorage.getItem('jwt_token');
    if (storedToken) {
      setJwtToken(storedToken);
    }
  }, []);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('jwt_token');
      setJwtToken(null);
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const authenticateWithBackend = async () => {
    if (!authenticated || !user) {
      return;
    }

    // 🔒 ГЛАВНАЯ ЗАЩИТА: проверяем модульный флаг ПЕРЕД началом запроса
    if (backendAuthState === 'done') {
      console.log('[usePrivyAuth] Already authed with backend (module flag), skipping');
      // Восстанавливаем токен из localStorage если есть
      const storedToken = localStorage.getItem('jwt_token');
      if (storedToken) {
        setJwtToken(storedToken);
        setBackendAuthed(true);
      }
      return;
    }
    
    if (backendAuthState === 'rate_limited') {
      console.log('[usePrivyAuth] Rate limited earlier (module flag), skipping');
      setRateLimited(true);
      return;
    }
    
    if (backendAuthState === 'in_progress') {
      console.log('[usePrivyAuth] Auth already in progress (module flag), skipping');
      return;
    }

    setLoading(true);
    try {
      // Устанавливаем флаг ДО запроса
      backendAuthState = 'in_progress';
      
      // Get Privy accessToken - this is what backend will validate
      const privyAccessToken = await getAccessToken();
      
      if (!privyAccessToken) {
        console.error('[usePrivyAuth] Could not get Privy accessToken');
        backendAuthState = 'idle'; // Сбрасываем на idle при ошибке
        isAuthInProgressRef.current = false;
        setLoading(false);
        return;
      }

      console.log('[usePrivyAuth] Sending accessToken to backend...');

      // Send Privy accessToken to backend for validation
      // Backend will validate it via Privy API and create backend JWT
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/privy-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: privyAccessToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.detail || `HTTP ${response.status}`;
        console.error('[usePrivyAuth] Backend auth failed:', errorMsg);
        
        // Если это rate limit — устанавливаем модульный флаг
        if (response.status === 503 || response.status === 429) {
          console.warn('[usePrivyAuth] Privy rate limited, will not retry immediately');
          backendAuthState = 'rate_limited';
          setRateLimited(true);
          isAuthInProgressRef.current = false;
          throw new Error('Privy rate limited, try again later');
        }
        
        // При другой ошибке сбрасываем на idle для возможности ретрая
        backendAuthState = 'idle';
        isAuthInProgressRef.current = false;
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const backendJwt = data.access_token;
      
      if (!backendJwt) {
        backendAuthState = 'idle';
        isAuthInProgressRef.current = false;
        throw new Error('Backend did not return access_token');
      }
      
      localStorage.setItem('jwt_token', backendJwt);
      setJwtToken(backendJwt);
      setBackendAuthed(true);
      setRateLimited(false);
      
      // 🔒 Устанавливаем модульный флаг в 'done' для аутентификации
      backendAuthState = 'done';
      console.log('[usePrivyAuth] Successfully authenticated with backend');
      console.log('[usePrivyAuth] JWT token set:', { tokenLength: backendJwt?.length, tokenPreview: backendJwt?.substring(0, 20) + '...' });
      
      // Примечание: сохранение embedded wallet address вынесено в отдельный useEffect
    } catch (error) {
      console.error('[usePrivyAuth] Backend authentication error:', error);
      // При ошибке (кроме rate limit) сбрасываем на idle
      if (backendAuthState !== 'rate_limited') {
        backendAuthState = 'idle';
      }
      isAuthInProgressRef.current = false;
      // Don't clear existing token on error - might be temporary
    } finally {
      setLoading(false);
    }
  };

  // Загружаем токен из localStorage при монтировании (один раз)
  useEffect(() => {
    const storedToken = localStorage.getItem('jwt_token');
    console.log('[usePrivyAuth] Loading token from localStorage:', { hasToken: !!storedToken, tokenLength: storedToken?.length });
    if (storedToken) {
      setJwtToken(storedToken);
      setBackendAuthed(true);
      // Если есть токен, считаем что уже авторизованы - устанавливаем модульный флаг
      if (backendAuthState === 'idle') {
        backendAuthState = 'done';
      }
      console.log('[usePrivyAuth] Token loaded from localStorage, backendAuthed set to true');
    }
  }, []); // ПУСТОЙ массив - только при монтировании

  // Authenticate with backend ONCE when Privy user is authenticated
  useEffect(() => {
    console.log('[usePrivyAuth] Hook effect:', {
      ready,
      authenticated,
      backendAuthState,
      backendAuthed,
      hasToken: !!jwtToken,
    });

    // Если Privy ещё не готов или не залогинен — выходим
    if (!ready || !authenticated || !user) {
      if (!authenticated) {
        // Сбрасываем флаги при разлогине
        setBackendAuthed(false);
        setJwtToken(null);
        setRateLimited(false);
        isAuthInProgressRef.current = false;
        // Сбрасываем модульный флаг при разлогине
        backendAuthState = 'idle';
      }
      return;
    }

    // 🔒 ГЛАВНАЯ ЗАЩИТА: проверяем модульный флаг ПЕРВЫМ
    if (backendAuthState === 'done') {
      console.log('[usePrivyAuth] Already authed with backend (module flag), skipping');
      // Восстанавливаем состояние из localStorage
      const storedToken = localStorage.getItem('jwt_token');
      if (storedToken && !jwtToken) {
        setJwtToken(storedToken);
        setBackendAuthed(true);
      }
      return;
    }
    
    if (backendAuthState === 'rate_limited') {
      console.log('[usePrivyAuth] Rate limited earlier (module flag), skipping');
      setRateLimited(true);
      return;
    }
    
    if (backendAuthState === 'in_progress') {
      console.log('[usePrivyAuth] Auth already in progress (module flag), skipping');
      return;
    }

    // Если уже успешно авторизовали на бэке (React state) — больше не дергаем
    if (backendAuthed) {
      // Синхронизируем модульный флаг
      if (backendAuthState === 'idle') {
        backendAuthState = 'done';
      }
      return;
    }

    // Если уже есть токен — считаем что авторизованы
    if (jwtToken) {
      setBackendAuthed(true);
      backendAuthState = 'done';
      return;
    }

    // Если уже есть запрос в процессе (React ref) — не запускаем второй
    if (isAuthInProgressRef.current) {
      console.log('[usePrivyAuth] Auth already in progress (React ref), skipping...');
      return;
    }

    // Если словили rate limit (React state) — не пытаемся сразу снова
    if (rateLimited) {
      console.log('[usePrivyAuth] Rate limited (React state), skipping retry...');
      return;
    }

    // Делаем запрос только один раз
    isAuthInProgressRef.current = true;
    console.log('[usePrivyAuth] Authenticating with backend (one-time)...');
    authenticateWithBackend();
  }, [ready, authenticated, user, backendAuthed, jwtToken, rateLimited]);

  // ✅ Отдельный useEffect для сохранения embedded wallet address
  // Работает независимо от backendAuthState, retry пока не сохранится
  useEffect(() => {
    if (!ready || !authenticated) return;
    
    const storedToken = localStorage.getItem('jwt_token');
    if (!storedToken) {
      console.log('[usePrivyAuth] No JWT token, cannot save wallet address');
      return;
    }

    // Проверяем наличие embedded wallet
    const embedded = wallets?.find(
      (w) => w.walletClientType === 'privy' || w.walletClientType === 'embedded'
    );

    if (!embedded) {
      console.log('[usePrivyAuth] Embedded wallet not found yet, will retry...');
      return; // Важно: не считаем процесс завершённым, будет retry
    }

    if (walletSaved) {
      console.log('[usePrivyAuth] Wallet already saved, skipping');
      return;
    }

    // Сохраняем embedded wallet address на backend
    (async () => {
      try {
        console.log('[usePrivyAuth] Saving embedded wallet address to backend:', embedded.address);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/set-wallet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${storedToken}`,
          },
          body: JSON.stringify({ wallet_address: embedded.address }),
        });

        if (response.ok) {
          console.log('[usePrivyAuth] ✅ Embedded wallet address saved to backend:', embedded.address);
          setWalletSaved(true);
        } else {
          const errorText = await response.text();
          console.warn('[usePrivyAuth] ⚠️ Failed to save wallet address, will retry:', errorText);
        }
      } catch (error) {
        console.warn('[usePrivyAuth] ⚠️ Error saving wallet address, will retry:', error);
      }
    })();
  }, [ready, authenticated, wallets, walletSaved]);

  return {
    ready: ready ?? false,
    authenticated: authenticated ?? false,
    backendAuthed, // Экспортируем флаг для проверки в компонентах
    user,
    wallets,
    jwtToken,
    loading,
    login: handleLogin,
    logout: handleLogout,
    authenticateWithBackend,
  };
}

