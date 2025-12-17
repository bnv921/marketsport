'use client';

import { useEffect, useState } from 'react';

interface OrderBookProps {
  tokenId: string;
}

interface OrderBookData {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

export default function OrderBook({ tokenId }: OrderBookProps) {
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) return;

    const fetchOrderbook = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/orderbook/${tokenId}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch orderbook');
        }
        
        const data = await response.json();
        setOrderbook(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderbook();
    const interval = setInterval(fetchOrderbook, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, [tokenId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="text-lg font-semibold mb-4">Order Book</h3>
        <div className="text-center py-8 text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="text-lg font-semibold mb-4">Order Book</h3>
        <div className="text-center py-8 text-red-500">Error: {error}</div>
      </div>
    );
  }

  const bids = orderbook?.bids || [];
  const asks = orderbook?.asks || [];

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <h3 className="text-lg font-semibold mb-4">Order Book</h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Asks (Sell orders) */}
        <div>
          <div className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
            ASK (Sell)
          </div>
          <div className="space-y-1">
            {asks.slice(0, 10).map((ask, idx) => (
              <div
                key={idx}
                className="flex justify-between text-sm py-1 px-2 bg-red-50 dark:bg-red-900/20 rounded"
              >
                <span className="text-red-600 dark:text-red-400">
                  {parseFloat(ask.price).toFixed(4)}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {parseFloat(ask.size).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bids (Buy orders) */}
        <div>
          <div className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
            BID (Buy)
          </div>
          <div className="space-y-1">
            {bids.slice(0, 10).reverse().map((bid, idx) => (
              <div
                key={idx}
                className="flex justify-between text-sm py-1 px-2 bg-green-50 dark:bg-green-900/20 rounded"
              >
                <span className="text-green-600 dark:text-green-400">
                  {parseFloat(bid.price).toFixed(4)}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {parseFloat(bid.size).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

