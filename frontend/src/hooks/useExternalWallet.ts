'use client';

import { useState, useEffect, useCallback } from 'react';

interface ExternalWalletState {
  address: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useExternalWallet() {
  const [state, setState] = useState<ExternalWalletState>({
    address: null,
    isConnected: false,
    isLoading: true,
    error: null,
  });

  // Check if wallet is connected on mount
  useEffect(() => {
    checkConnection();
    
    // Listen for account changes
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', () => {
        // Reload on chain change
        window.location.reload();
      });
      
      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', () => {});
        }
      };
    }
  }, []);

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected wallet
      setState({
        address: null,
        isConnected: false,
        isLoading: false,
        error: null,
      });
      localStorage.removeItem('connected_address');
      localStorage.removeItem('jwt_token');
    } else {
      // Account changed
      const newAddress = accounts[0].toLowerCase();
      setState(prev => ({
        ...prev,
        address: newAddress,
        isConnected: true,
      }));
      localStorage.setItem('connected_address', newAddress);
    }
  };

  const checkConnection = async () => {
    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        setState({
          address: null,
          isConnected: false,
          isLoading: false,
          error: 'No wallet found. Please install MetaMask or another Web3 wallet.',
        });
        return;
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      
      if (accounts.length > 0) {
        const address = accounts[0].toLowerCase();
        setState({
          address,
          isConnected: true,
          isLoading: false,
          error: null,
        });
        localStorage.setItem('connected_address', address);
      } else {
        // Check localStorage for previously connected address
        const storedAddress = localStorage.getItem('connected_address');
        setState({
          address: storedAddress,
          isConnected: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error: any) {
      console.error('[useExternalWallet] Error checking connection:', error);
      setState({
        address: null,
        isConnected: false,
        isLoading: false,
        error: error.message || 'Failed to check wallet connection',
      });
    }
  };

  const connect = useCallback(async (): Promise<string> => {
    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const address = accounts[0].toLowerCase();
      
      setState({
        address,
        isConnected: true,
        isLoading: false,
        error: null,
      });

      localStorage.setItem('connected_address', address);
      
      return address;
    } catch (error: any) {
      console.error('[useExternalWallet] Error connecting:', error);
      const errorMessage = error.message || 'Failed to connect wallet';
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      isConnected: false,
      isLoading: false,
      error: null,
    });
    localStorage.removeItem('connected_address');
    localStorage.removeItem('jwt_token');
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    try {
      if (!state.address || !window.ethereum) {
        throw new Error('Wallet not connected');
      }

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, state.address],
      });

      return signature as string;
    } catch (error: any) {
      console.error('[useExternalWallet] Error signing message:', error);
      throw error;
    }
  }, [state.address]);

  const signTypedData = useCallback(async (typedData: any): Promise<string> => {
    try {
      if (!state.address || !window.ethereum) {
        throw new Error('Wallet not connected');
      }

      // Ensure we're using the correct format for eth_signTypedData_v4
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [state.address, JSON.stringify(typedData)],
      });

      return signature as string;
    } catch (error: any) {
      console.error('[useExternalWallet] Error signing typed data:', error);
      throw error;
    }
  }, [state.address]);

  return {
    ...state,
    connect,
    disconnect,
    signMessage,
    signTypedData,
    checkConnection,
  };
}

