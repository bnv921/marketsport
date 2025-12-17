'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LoginButton from '@/components/auth/LoginButton';

interface Order {
  id: string;
  token_id: string;
  side: string;
  price: string;
  size: string;
  status: string;
  created_at?: string;
}

export default function PortfolioPage() {
  const { authenticated, jwtToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated || !jwtToken) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/orders/my`,
          {
            headers: {
              'Authorization': `Bearer ${jwtToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }

        const data = await response.json();
        setOrders(data.orders || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [authenticated, jwtToken]);

  const handleCancelOrder = async (orderId: string) => {
    if (!jwtToken) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/polymarket/orders/${orderId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to cancel order');
      }

      // Remove order from list
      setOrders(orders.filter(o => o.id !== orderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-center">
            <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Please login to view your orders
            </p>
            <LoginButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">My Orders</h1>
            <LoginButton />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-zinc-500">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No orders found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold">Token ID</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold">Side</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold">Price</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold">Size</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <td className="py-3 px-4 text-sm">
                        <div className="font-mono text-xs truncate max-w-xs">
                          {order.token_id}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            order.side === 'BUY'
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {order.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">{parseFloat(order.price).toFixed(4)}</td>
                      <td className="py-3 px-4 text-sm">{parseFloat(order.size).toFixed(2)}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className="px-2 py-1 rounded text-xs bg-zinc-100 dark:bg-zinc-800">
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {order.status === 'OPEN' && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

