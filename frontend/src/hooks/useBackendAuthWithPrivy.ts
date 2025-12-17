"use client";

import { useEffect, useState, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

type BackendAuthState = {
  backendJwt: string | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>; // пробросим login из Privy
};

export function useBackendAuthWithPrivy(): BackendAuthState {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const [backendJwt, setBackendJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendAuthed, setBackendAuthed] = useState(false); // Флаг успешной аутентификации
  const isAuthInProgressRef = useRef(false); // Флаг для предотвращения параллельных запросов

  // Load token from localStorage on mount (один раз)
  useEffect(() => {
    const storedToken = localStorage.getItem("jwt_token");
    if (storedToken) {
      setBackendJwt(storedToken);
      setBackendAuthed(true); // Если есть токен, считаем что уже авторизованы
    }
  }, []); // ПУСТОЙ массив - только при монтировании

  // Authenticate with backend ONCE when Privy user is authenticated
  useEffect(() => {
    // Если Privy ещё не готов или не залогинен — выходим
    if (!ready || !authenticated || !user) {
      if (!authenticated) {
        // Сбрасываем флаги при разлогине
        setBackendAuthed(false);
        setBackendJwt(null);
        setError(null);
        isAuthInProgressRef.current = false;
      }
      return;
    }

    // Если уже успешно авторизовали на бэке — больше не дергаем
    if (backendAuthed) return;

    // Если уже есть токен — считаем что авторизованы
    if (backendJwt) {
      setBackendAuthed(true);
      return;
    }

    // Если уже есть запрос в процессе — не запускаем второй
    if (isAuthInProgressRef.current) return;

    // Делаем запрос только один раз
    isAuthInProgressRef.current = true;
    
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("No Privy accessToken");
        }

        console.log("[Backend Auth] Authenticating with backend (one-time)...");

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/privy-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[Backend Auth] Failed", err);
          // Если это rate limit — можно не пытаться сразу снова
          if (res.status === 503 || res.status === 429) {
            console.warn("[Backend Auth] Rate limited, will not retry immediately");
          }
          throw new Error(err.detail || `Backend auth failed: ${res.status}`);
        }

        const data = await res.json();
        setBackendJwt(data.access_token);
        setBackendAuthed(true); // Помечаем как успешно авторизованы
        
        // Store in localStorage for persistence
        if (data.access_token) {
          localStorage.setItem("jwt_token", data.access_token);
        }
        
        console.log("[Backend Auth] Successfully authenticated with backend");
      } catch (e: any) {
        console.error("[Backend Auth] Error", e);
        setError(e.message || "Backend auth error");
        // При ошибке сбрасываем флаг, чтобы можно было повторить позже
        isAuthInProgressRef.current = false;
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, authenticated, user, backendAuthed, backendJwt, getAccessToken]); // Правильные зависимости, но флаги предотвращают циклы

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  return { backendJwt, loading, error, login: handleLogin };
}

