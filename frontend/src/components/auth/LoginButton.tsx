'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function LoginButton() {
  const { 
    isWalletConnected, 
    isAuthenticated, 
    address,
    connectWallet,
    authenticate,
    logout,
    isWalletLoading,
    isAuthLoading,
  } = useAuth();

  const loading = isWalletLoading || isAuthLoading;
  const ready = !loading;

  const handleConnect = async () => {
    console.log('[LoginButton] Connect wallet clicked');
    try {
      await connectWallet();
      // After wallet connection, automatically authenticate
      try {
        await authenticate();
      } catch (authError) {
        console.error('[LoginButton] Authentication error:', authError);
        // Don't throw - wallet is connected even if auth fails
      }
    } catch (error) {
      console.error('[LoginButton] Connect wallet error:', error);
    }
  };

  const handleLogout = async () => {
    console.log('[LoginButton] Logout clicked');
    try {
      logout();
    } catch (error) {
      console.error('[LoginButton] Logout error:', error);
    }
  };

  if (!ready) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-zinc-300 text-zinc-600 rounded-lg cursor-not-allowed"
      >
        Initializing...
      </button>
    );
  }

  if (loading) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-zinc-300 text-zinc-600 rounded-lg cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (isAuthenticated && isWalletConnected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
        </span>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
          type="button"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (isWalletConnected && !isAuthenticated) {
    return (
      <button
        onClick={authenticate}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer"
        type="button"
      >
        Authenticate
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer"
      type="button"
    >
      Connect Wallet
    </button>
  );
}

