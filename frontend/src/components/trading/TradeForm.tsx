'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PreviewModal from './PreviewModal';

interface TradeFormProps {
  tokenId: string;
}

export default function TradeForm({ tokenId }: TradeFormProps) {
  const { 
    address, 
    isWalletConnected, 
    isAuthenticated,
    jwtToken,
    connectWallet,
    authenticate 
  } = useAuth();
  
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [checkingTrading, setCheckingTrading] = useState(false);
  const [balance, setBalance] = useState<any>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [funderAddress, setFunderAddress] = useState('');
  const [loadingFunderAddress, setLoadingFunderAddress] = useState(false);
  const [currentFunderAddress, setCurrentFunderAddress] = useState<string | null>(null);

  // Check if trading is enabled on mount
  useEffect(() => {
    if (isAuthenticated && jwtToken) {
      checkTradingStatus();
    }
  }, [isAuthenticated, jwtToken]);

  const checkTradingStatus = async () => {
    if (!jwtToken) return;
    
    try {
      setCheckingTrading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/enable-trading`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTradingEnabled(data.status === 'already_enabled' || data.trading_enabled === true);
      }
    } catch (error) {
      console.error('[TradeForm] Error checking trading status:', error);
    } finally {
      setCheckingTrading(false);
    }
  };

  const enableTrading = async (): Promise<boolean> => {
    console.log('[Enable Trading] Starting enable-trading...');
    
    if (!address || !isWalletConnected) {
      setError('Wallet not connected. Please connect your external EOA wallet.');
      return false;
    }

    if (!jwtToken) {
      setError('Not authenticated. Please authenticate first.');
      return false;
    }

    // ✅ CRITICAL: Require funder_address to be set before enabling trading
    if (!currentFunderAddress) {
      setError('Please set your Polymarket funder address first. This is your Polymarket internal wallet address (found in polymarket.com/settings as "Wallet Address / Profile Address").');
      return false;
    }

    try {
      setLoading(true);
      setError(null);

      // Step 1: Get typedData from backend
      console.log('[Enable Trading] Step 1: Requesting typedData from backend...');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/enable-trading`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Enable Trading] Failed to get typedData:', errorData);
        throw new Error(errorData.detail || 'Failed to get signing data');
      }

      const data = await response.json();
      console.log('[Enable Trading] Backend response status:', data.status);
      
      // Check if already enabled
      if (data.status === 'already_enabled') {
        console.log('[Enable Trading] ✅ Trading already enabled');
        setTradingEnabled(true);
        return true;
      }

      if (!data.typedData) {
        console.error('[Enable Trading] Backend did not return typedData');
        throw new Error('Backend did not return typedData');
      }

      // ✅ CRITICAL: typedData.message.address is signing_address (EOA)
      // We sign with EOA wallet, and typedData.address is also EOA
      // API keys will be created for signing_address (EOA)
      // Later, funder_address will be used for L2 requests (balance, orders)
      const typedDataAddress = data.typedData.message?.address?.toLowerCase();
      const eoaAddress = address.toLowerCase();
      
      if (typedDataAddress !== eoaAddress) {
        console.error('[Enable Trading] ❌ Address mismatch!');
        console.error('  typedData.address:', typedDataAddress);
        console.error('  connected.address:', eoaAddress);
        throw new Error(`Address mismatch: backend expects ${typedDataAddress}, but connected wallet is ${eoaAddress}`);
      }
      
      console.log('[Enable Trading] ✅ Address verification passed');
      console.log('[Enable Trading] ℹ️  typedData.address (signing_address/EOA):', typedDataAddress);
      console.log('[Enable Trading] ℹ️  Note: API keys will be created for signing_address (EOA)');
      console.log('[Enable Trading] ℹ️  Note: Funder_address will be used later for L2 requests');

      // Step 2: Sign typedData using external wallet
      console.log('[Enable Trading] Step 2: Signing typedData with external wallet...');
      
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Please install MetaMask or another Web3 wallet.');
      }

      // Use eth_signTypedData_v4 - MUST pass JSON string
      // ✅ CRITICAL: typedData.message.address is signing_address (EOA), and we sign with EOA wallet
      // Both signature and typedData.address are from the same EOA address
      console.log('[Enable Trading] Signing with EOA wallet:', address);
      console.log('[Enable Trading] typedData.message.address (signing_address/EOA):', data.typedData.message.address);
      
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(data.typedData)], // Sign with EOA address
      });

      console.log('[Enable Trading] ✅ Signature received:', signature?.substring(0, 20) + '...');

      // Step 3: Confirm with backend
      // ✅ CRITICAL: Send signing_address (EOA) from typedData.message.address to confirm
      // Backend expects request.address to match signing_address (EOA)
      console.log('[Enable Trading] Step 3: Sending signature to backend...');
      console.log('[Enable Trading] Sending signing_address (EOA) from typedData:', data.typedData.message.address);
      
      const confirmResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/enable-trading/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            address: data.typedData.message.address, // ✅ signing_address (EOA) from typedData
            signature: signature, // Signature from EOA wallet
            timestamp: data.timestamp,
            nonce: data.nonce || '0',
          }),
        }
      );

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        console.error('[Enable Trading] Confirm failed:', errorData);
        
        // Special handling for 400 "Could not create api key"
        if (confirmResponse.status === 400 && errorData.detail?.includes('Could not create api key')) {
          throw new Error(
            'Could not create API key. This wallet is not initialized on Polymarket. ' +
            'Please create an account/wallet on Polymarket.com first, or connect an external EOA wallet ' +
            'that has been used on Polymarket before. The wallet needs a Polymarket proxy wallet/profile to be created.'
          );
        }
        
        throw new Error(errorData.detail || 'Failed to enable trading');
      }

      const confirmData = await confirmResponse.json();
      console.log('[Enable Trading] ✅ Trading enabled successfully:', confirmData);
      
      setTradingEnabled(true);
      setSuccess('Trading enabled successfully!');
      return true;

    } catch (error: any) {
      console.error('[Enable Trading] Error:', error);
      setError(error.message || 'Failed to enable trading');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!address || !isWalletConnected) {
      setError('Wallet not connected');
      return;
    }

    if (!jwtToken) {
      setError('Not authenticated');
      return;
    }

    if (!tradingEnabled) {
      setError('Trading not enabled. Please enable trading first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Validate inputs
      if (orderType === 'LIMIT' && !price) {
        setError('Price is required for limit orders');
        return;
      }

      if (!size && !amount) {
        setError('Size or amount is required');
        return;
      }

      // Step 1: Prepare order
      const prepareResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/orders/prepare`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            token_id: tokenId,
            side: side.toLowerCase(),
            order_type: orderType.toLowerCase(),
            price: price ? parseFloat(price) : undefined,
            size: size ? parseFloat(size) : undefined,
            amount: amount ? parseFloat(amount) : undefined,
          }),
        }
      );

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.detail || 'Failed to prepare order');
      }

      const prepareData = await prepareResponse.json();

      // Step 2: Sign order typedData
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found');
      }

      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(prepareData.typedData)],
      });

      // Step 3: Confirm order
      const confirmResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/orders/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            order: prepareData.order,
            signature: signature,
          }),
        }
      );

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.detail || 'Failed to place order');
      }

      const confirmData = await confirmResponse.json();
      setSuccess(`Order placed successfully! Order ID: ${confirmData.order_id || 'N/A'}`);
      
      // Reset form
      setPrice('');
      setSize('');
      setAmount('');

    } catch (error: any) {
      console.error('[Place Order] Error:', error);
      setError(error.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const handleGetBalance = async () => {
    if (!jwtToken) {
      setError('Not authenticated. Please authenticate first.');
      return;
    }

    if (!tradingEnabled) {
      setError('Trading not enabled. Please enable trading first.');
      return;
    }

    try {
      setLoadingBalance(true);
      setError(null);
      setBalance(null);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/balance`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get balance');
      }

      const data = await response.json();
      setBalance(data.balance);
      setSuccess('Balance retrieved successfully!');
      console.log('[Get Balance] Balance data:', data.balance);

    } catch (error: any) {
      console.error('[Get Balance] Error:', error);
      setError(error.message || 'Failed to get balance');
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleSetFunderAddress = async () => {
    if (!jwtToken) {
      setError('Not authenticated. Please authenticate first.');
      return;
    }

    if (!funderAddress.trim()) {
      setError('Please enter a funder address');
      return;
    }

    // Basic Ethereum address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(funderAddress.trim())) {
      setError('Invalid Ethereum address format. Must be 0x followed by 40 hex characters.');
      return;
    }

    try {
      setLoadingFunderAddress(true);
      setError(null);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/set-funder-address`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
          },
          body: JSON.stringify({
            funder_address: funderAddress.trim(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to set funder address');
      }

      const data = await response.json();
      setCurrentFunderAddress(data.funder_address);
      setFunderAddress(''); // Clear input
      setSuccess(`Funder address set successfully: ${data.funder_address}`);
      console.log('[Set Funder Address] Success:', data);

    } catch (error: any) {
      console.error('[Set Funder Address] Error:', error);
      setError(error.message || 'Failed to set funder address');
    } finally {
      setLoadingFunderAddress(false);
    }
  };

  // Show connect wallet prompt if not connected
  if (!isWalletConnected) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <h3 className="text-lg font-semibold mb-4">Connect Wallet</h3>
        <p className="text-gray-600 mb-4">
          Please connect your external EOA wallet (MetaMask, Rabby, WalletConnect) to trade.
        </p>
        <button
          onClick={connectWallet}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  // Show authenticate prompt if wallet connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <h3 className="text-lg font-semibold mb-4">Authenticate</h3>
        <p className="text-gray-600 mb-4">
          Please sign a message to authenticate with the backend.
        </p>
        <button
          onClick={authenticate}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Authenticate
        </button>
      </div>
    );
  }

  // Show enable trading prompt if not enabled
  if (!tradingEnabled && !checkingTrading) {
    return (
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Enable Trading</h3>
        <p className="text-gray-600 mb-4">
          To place orders, you need to enable trading. This will create API keys for your Polymarket funder address.
        </p>
        
        {/* Funder Address Section - REQUIRED before enable-trading */}
        <div className="mb-4 border rounded-lg p-3 bg-gray-50">
          <label className="block text-sm font-medium mb-2">
            Polymarket Funder Address (Proxy Wallet) - REQUIRED
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Found in polymarket.com/settings as &quot;Wallet Address / Profile Address&quot;.
            This is the address that holds your funds on Polymarket (may differ from your connected EOA).
          </p>
          
          {currentFunderAddress && (
            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <span className="font-semibold">Current: </span>
              <span className="font-mono">{currentFunderAddress}</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              type="text"
              value={funderAddress}
              onChange={(e) => setFunderAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 px-3 py-2 border rounded text-sm font-mono"
            />
            <button
              onClick={handleSetFunderAddress}
              disabled={loadingFunderAddress || !funderAddress.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingFunderAddress ? 'Setting...' : 'Set'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}
        
        <button
          onClick={enableTrading}
          disabled={loading || !currentFunderAddress}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Enabling...' : 'Enable Trading'}
        </button>
        
        {!currentFunderAddress && (
          <p className="mt-2 text-sm text-gray-500">
            Please set your funder address above before enabling trading.
          </p>
        )}
      </div>
    );
  }

  // Main trading form
  return (
    <div className="border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Place Order</h3>
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Connected: {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
          </p>
          <button
            onClick={handleGetBalance}
            disabled={loadingBalance}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loadingBalance ? 'Loading...' : 'Показать баланс'}
          </button>
        </div>

        {/* Funder Address Section */}
        <div className="border rounded-lg p-3 bg-gray-50">
          <label className="block text-sm font-medium mb-2">
            Polymarket Funder Address (Proxy Wallet)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Found in polymarket.com/settings as &quot;Wallet Address / Profile Address&quot;.
            This is the address that holds your funds on Polymarket (may differ from your connected EOA).
          </p>
          
          {currentFunderAddress && (
            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <span className="font-semibold">Current: </span>
              <span className="font-mono">{currentFunderAddress}</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              type="text"
              value={funderAddress}
              onChange={(e) => setFunderAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 px-3 py-2 border rounded text-sm font-mono"
            />
            <button
              onClick={handleSetFunderAddress}
              disabled={loadingFunderAddress || !funderAddress.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingFunderAddress ? 'Setting...' : 'Set'}
            </button>
          </div>
        </div>
      </div>

      {balance && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <h4 className="font-semibold text-blue-900 mb-2">Баланс Polymarket:</h4>
          <pre className="text-xs text-blue-800 overflow-auto max-h-64">
            {JSON.stringify(balance, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      <div className="space-y-4">
        {/* Side Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Side</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSide('BUY')}
              className={`flex-1 px-4 py-2 rounded ${
                side === 'BUY'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => setSide('SELL')}
              className={`flex-1 px-4 py-2 rounded ${
                side === 'SELL'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Order Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as 'LIMIT' | 'MARKET')}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="LIMIT">Limit</option>
            <option value="MARKET">Market</option>
          </select>
        </div>

        {/* Price (for LIMIT orders) */}
        {orderType === 'LIMIT' && (
          <div>
            <label className="block text-sm font-medium mb-2">Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        )}

        {/* Size */}
        <div>
          <label className="block text-sm font-medium mb-2">Size</label>
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Amount (alternative to size) */}
        <div>
          <label className="block text-sm font-medium mb-2">Amount (alternative to size)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={loading || checkingTrading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Placing Order...' : 'Place Order'}
        </button>

        {/* Enable Trading Button (if needed) */}
        {!tradingEnabled && checkingTrading && (
          <div className="text-sm text-gray-600 text-center">
            Checking trading status...
          </div>
        )}
      </div>

      {showPreview && previewData && (
        <PreviewModal
          previewData={previewData}
          onClose={() => setShowPreview(false)}
          onConfirm={handlePlaceOrder}
        />
      )}
    </div>
  );
}
