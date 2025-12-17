"""
Polymarket CLOB Client
Based on: https://github.com/Polymarket/py-clob-client
"""
from typing import List, Dict, Optional
import httpx
from app.core.config import settings
from app.polymarket.builder_headers import generate_builder_headers

class PolymarketCLOBClient:
    def __init__(self):
        self.base_url = settings.POLY_CLOB_HOST
        self.chain_id = settings.POLY_CHAIN_ID
        
    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        """Make authenticated request to CLOB API"""
        url = f"{self.base_url}{path}"
        body_str = ""
        if body:
            import json
            body_str = json.dumps(body)
        
        headers = generate_builder_headers(method, path, body_str)
        
        with httpx.Client() as client:
            if method == "GET":
                response = client.get(url, headers=headers)
            elif method == "POST":
                response = client.post(url, headers=headers, json=body)
            elif method == "DELETE":
                response = client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response.raise_for_status()
            return response.json()
    
    def get_simplified_markets(self, condition_id: Optional[str] = None) -> List[Dict]:
        """Get simplified market data"""
        path = "/markets"
        if condition_id:
            path += f"?condition_id={condition_id}"
        return self._request("GET", path)
    
    def get_order_book(self, token_id: str) -> Dict:
        """Get order book for a specific token"""
        path = f"/book?token_id={token_id}"
        return self._request("GET", path)
    
    def create_limit_order(
        self,
        token_id: str,
        price: float,
        size: float,
        side: str  # "BUY" or "SELL"
    ) -> Dict:
        """Create a limit order"""
        path = "/orders"
        body = {
            "token_id": token_id,
            "price": str(price),
            "size": str(size),
            "side": side.upper(),
            "chain_id": self.chain_id
        }
        return self._request("POST", path, body)
    
    def create_market_order(
        self,
        token_id: str,
        amount: float,
        side: str  # "BUY" or "SELL"
    ) -> Dict:
        """Create a market order"""
        # Market orders are typically limit orders with aggressive pricing
        # For simplicity, we'll use a very high/low price
        if side.upper() == "BUY":
            price = 0.99  # Buy at high price
        else:
            price = 0.01  # Sell at low price
        
        return self.create_limit_order(token_id, price, amount, side)
    
    def cancel_order(self, order_id: str) -> Dict:
        """Cancel a specific order"""
        path = f"/orders/{order_id}"
        return self._request("DELETE", path)
    
    def cancel_all(self) -> Dict:
        """Cancel all orders for the user"""
        path = "/orders/cancel-all"
        return self._request("POST", path)
    
    def get_orders(self, user_address: Optional[str] = None) -> List[Dict]:
        """Get user's orders"""
        path = "/orders"
        if user_address:
            path += f"?user={user_address}"
        return self._request("GET", path)
    
    def get_trades(self, token_id: Optional[str] = None) -> List[Dict]:
        """Get recent trades"""
        path = "/trades"
        if token_id:
            path += f"?token_id={token_id}"
        return self._request("GET", path)
    
    def preview_order(
        self,
        token_id: str,
        price: Optional[float],
        size: Optional[float],
        amount: Optional[float],
        side: str,
        order_type: str  # "LIMIT" or "MARKET"
    ) -> Dict:
        """Preview order before placing (estimate fees, etc.)"""
        # This is a simplified preview - actual implementation may vary
        if order_type.upper() == "LIMIT":
            return {
                "token_id": token_id,
                "price": price,
                "size": size,
                "side": side,
                "order_type": "LIMIT",
                "estimated_fee": size * 0.02 if size else 0,  # 2% fee estimate
                "total_cost": (price * size) if price and size else 0
            }
        else:  # MARKET
            return {
                "token_id": token_id,
                "amount": amount,
                "side": side,
                "order_type": "MARKET",
                "estimated_fee": amount * 0.02 if amount else 0,  # 2% fee estimate
                "note": "Market orders execute at current best price"
            }

