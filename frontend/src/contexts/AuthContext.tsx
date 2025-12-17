'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useExternalWallet } from '@/hooks/useExternalWallet';
import { useBackendAuth } from '@/hooks/useBackendAuth';

interface AuthContextType {
  // Wallet state
  address: string | null;
  isWalletConnected: boolean;
  isWalletLoading: boolean;
  walletError: string | null;
  
  // Backend auth state
  jwtToken: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  
  // Combined state (for backward compatibility)
  ready: boolean;
  authenticated: boolean;
  backendAuthed: boolean;
  
  // Actions
  connectWallet: () => Promise<string>;
  disconnectWallet: () => void;
  authenticate: () => Promise<void>;
  logout: () => void;
  
  // Legacy (deprecated, will be removed)
  user: any;
  wallets: any[];
  loading: boolean;
  login: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider manages external EOA wallet connection and backend authentication
 * Uses SIWE (Sign-In With Ethereum) flow with address-based authentication
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const wallet = useExternalWallet();
  const backendAuth = useBackendAuth();

  // Combined ready state: wallet must be connected and backend authenticated
  const ready = !wallet.isLoading && !backendAuth.isLoading;
  const authenticated = wallet.isConnected && backendAuth.isAuthenticated;
  const backendAuthed = backendAuth.isAuthenticated;

  const handleConnectWallet = async () => {
    const address = await wallet.connect();
    // After connecting wallet, authenticate with backend
    try {
      await backendAuth.authenticate();
    } catch (error) {
      console.error('[AuthProvider] Failed to authenticate after wallet connect:', error);
      // Don't throw - wallet is connected even if auth fails
    }
    return address;
  };

  const handleLogout = () => {
    backendAuth.logout();
    wallet.disconnect();
  };

  const handleLogin = async () => {
    await handleConnectWallet();
  };

  const value: AuthContextType = {
    // Wallet state
    address: wallet.address,
    isWalletConnected: wallet.isConnected,
    isWalletLoading: wallet.isLoading,
    walletError: wallet.error,
    
    // Backend auth state
    jwtToken: backendAuth.jwtToken,
    isAuthenticated: backendAuth.isAuthenticated,
    isAuthLoading: backendAuth.isLoading,
    authError: backendAuth.error,
    
    // Combined state
    ready,
    authenticated,
    backendAuthed,
    
    // Actions
    connectWallet: handleConnectWallet,
    disconnectWallet: wallet.disconnect,
    authenticate: backendAuth.authenticate,
    logout: handleLogout,
    
    // Legacy (for backward compatibility during migration)
    user: wallet.address ? { address: wallet.address } : null,
    wallets: wallet.address ? [{ address: wallet.address, type: 'external' }] : [],
    loading: wallet.isLoading || backendAuth.isLoading,
    login: handleLogin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

