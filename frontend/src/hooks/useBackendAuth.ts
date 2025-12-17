'use client';

import { useState, useEffect, useCallback } from 'react';
import { useExternalWallet } from './useExternalWallet';

interface BackendAuthState {
  jwtToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useBackendAuth() {
  const { address, isConnected } = useExternalWallet();
  const [state, setState] = useState<BackendAuthState>({
    jwtToken: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Load JWT token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('jwt_token');
    const storedAddress = localStorage.getItem('connected_address');
    
    if (storedToken && storedAddress === address) {
      setState({
        jwtToken: storedToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } else if (!address) {
      setState({
        jwtToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, [address]);

  const authenticate = useCallback(async (): Promise<void> => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Step 1: Get nonce from backend
      const nonceResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/nonce?address=${address}`,
        { method: 'GET' }
      );

      if (!nonceResponse.ok) {
        throw new Error('Failed to get nonce from backend');
      }

      const { nonce } = await nonceResponse.json();

      // Step 2: Sign message with wallet
      const message = `Sign this message to authenticate with Marketsport.\n\nAddress: ${address}\nNonce: ${nonce}`;
      
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Please install MetaMask or another Web3 wallet.');
      }
      
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      // Step 3: Send signature to backend
      const authResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/authenticate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address,
            signature,
            message,
          }),
        }
      );

      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        throw new Error(errorData.detail || 'Authentication failed');
      }

      const { access_token } = await authResponse.json();

      // Save token
      localStorage.setItem('jwt_token', access_token);
      setState({
        jwtToken: access_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('[useBackendAuth] Authentication error:', error);
      setState({
        jwtToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: error.message || 'Authentication failed',
      });
      throw error;
    }
  }, [address, isConnected]);

  const logout = useCallback(() => {
    localStorage.removeItem('jwt_token');
    setState({
      jwtToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    authenticate,
    logout,
  };
}

