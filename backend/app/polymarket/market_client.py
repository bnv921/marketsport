"""
Polymarket Market Client for searching markets by event slug
Uses Gamma Events API to query Polymarket markets
"""
from typing import Optional, Dict, Any, List
import httpx
import json
from app.core.config import settings


class PolymarketMarketClient:
    """Client for querying Polymarket markets via Gamma Events API"""
    
    def __init__(self):
        # Gamma Events API endpoint
        self.gamma_api_url = "https://gamma-api.polymarket.com"
    
    def search_market_by_slug(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """
        Search for a market by event slug (e.g., 'nhl-cbj-car-2025-12-10')
        Uses Gamma Events API: GET /events/slug/{slug}
        
        Args:
            event_slug: Event slug in format 'nhl-team1-team2-yyyy-mm-dd'
            
        Returns:
            Market data if found, None otherwise
        """
        if not event_slug:
            return None
        
        try:
            return self._search_via_gamma_api(event_slug)
        except Exception as e:
            print(f"[PolymarketMarketClient] Error searching market: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _search_via_gamma_api(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """Search market using Gamma Events API"""
        try:
            url = f"{self.gamma_api_url}/events/slug/{event_slug}"
            
            response = httpx.get(
                url,
                headers={"Accept": "application/json"},
                timeout=10.0,
                follow_redirects=True
            )
            
            if response.status_code != 200:
                print(f"[PolymarketMarketClient] Gamma API request failed: {response.status_code}")
                return None
            
            event = response.json()
            
            if not event or not isinstance(event, dict):
                print(f"[PolymarketMarketClient] Invalid response format from Gamma API")
                return None
            
            # Извлекаем markets из события
            markets = event.get("markets", [])
            if not markets:
                print(f"[PolymarketMarketClient] No markets found in event: {event_slug}")
                return None
            
            # Берем первый маркет (обычно это moneyline)
            # Можно фильтровать по sportsMarketType если нужно
            market = markets[0]
            
            # Ищем moneyline маркет, если есть несколько
            for m in markets:
                if m.get("sportsMarketType") == "moneyline":
                    market = m
                    break
            
            print(f"[PolymarketMarketClient] Found market via Gamma API: {market.get('slug', event_slug)}")
            return self._format_market_data_from_gamma(event, market)
            
        except Exception as e:
            print(f"[PolymarketMarketClient] Gamma API search error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _format_market_data_from_gamma(self, event: Dict[str, Any], market: Dict[str, Any]) -> Dict[str, Any]:
        """Format market data from Gamma Events API response"""
        try:
            # Парсим outcomes и prices
            outcomes_str = market.get("outcomes", "[]")
            prices_str = market.get("outcomePrices", "[]")
            
            try:
                outcomes = json.loads(outcomes_str) if isinstance(outcomes_str, str) else outcomes_str
                prices = json.loads(prices_str) if isinstance(prices_str, str) else prices_str
            except:
                outcomes = []
                prices = []
            
            # Парсим clobTokenIds (может быть строкой JSON-массива или строкой через запятую)
            clob_token_ids = market.get("clobTokenIds", "")
            token_ids = []
            if clob_token_ids:
                if isinstance(clob_token_ids, str):
                    # Пытаемся распарсить как JSON-массив
                    try:
                        token_ids = json.loads(clob_token_ids)
                    except:
                        # Если не JSON, то через запятую
                        token_ids = [tid.strip() for tid in clob_token_ids.split(",") if tid.strip()]
                elif isinstance(clob_token_ids, list):
                    token_ids = clob_token_ids
            
            # Определяем away и home токены/цены
            away_price = None
            home_price = None
            away_token_id = None
            home_token_id = None
            
            if len(outcomes) >= 2 and len(prices) >= 2:
                # Первый outcome обычно away team
                away_price = float(prices[0]) if prices[0] else None
                home_price = float(prices[1]) if prices[1] else None
                
                # Токены из clobTokenIds
                if len(token_ids) >= 2:
                    away_token_id = token_ids[0]
                    home_token_id = token_ids[1]
                elif len(token_ids) == 1:
                    away_token_id = token_ids[0]
            
            # Вычисляем вероятности
            total = (away_price or 0) + (home_price or 0)
            away_probability = (away_price / total) if total > 0 else 0.5
            home_probability = (home_price / total) if total > 0 else 0.5
            
            # Используем данные из event для volume и других полей
            volume = float(event.get("volume", market.get("volume", 0)))
            
            result = {
                "eventSlug": event.get("slug", market.get("slug", "")),
                "awayProbability": away_probability,
                "homeProbability": home_probability,
                "awayPrice": away_price if away_price is not None else away_probability,
                "homePrice": home_price if home_price is not None else home_probability,
                "volume": volume,
                "marketType": market.get("sportsMarketType", "Moneyline").title(),
                "tokenId": away_token_id,  # Первый токен для торговли
                "homeTokenId": home_token_id,
                "conditionId": market.get("conditionId"),
                "awayRecord": None,
                "homeRecord": None,
                "question": market.get("question", event.get("title", "")),
                "active": market.get("active", event.get("active", True)),
                "bestBid": float(market.get("bestBid", 0)) if market.get("bestBid") else None,
                "bestAsk": float(market.get("bestAsk", 0)) if market.get("bestAsk") else None,
                "lastTradePrice": float(market.get("lastTradePrice", 0)) if market.get("lastTradePrice") else None,
            }
            
            print(f"[PolymarketMarketClient] Formatted market data: eventSlug={result['eventSlug']}, tokenId={result['tokenId']}")
            return result
        except Exception as e:
            print(f"[PolymarketMarketClient] Error formatting market data from Gamma API: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _search_via_clob(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """Search market using CLOB API"""
        try:
            # CLOB API endpoint for markets
            url = f"{self.polymarket_api_url}/markets"
            
            response = httpx.get(
                url,
                headers={"Accept": "application/json"},
                timeout=10.0,
                follow_redirects=True
            )
            
            if response.status_code != 200:
                print(f"[PolymarketMarketClient] CLOB API request failed: {response.status_code}")
                return None
            
            data = response.json()
            
            # CLOB API возвращает объект с полем "data", содержащим массив рынков
            if isinstance(data, dict):
                markets = data.get("data", [])
            elif isinstance(data, list):
                markets = data
            else:
                print(f"[PolymarketMarketClient] Invalid response format: {type(data)}")
                return None
            
            if not markets or not isinstance(markets, list):
                print(f"[PolymarketMarketClient] No markets in response")
                return None
            
            # Ищем во всех рынках (не только активных), так как рынок может быть закрыт
            print(f"[PolymarketMarketClient] Searching in {len(markets)} markets")
            
            # Search for market matching the event slug
            # Event slug format: nhl-cbj-car-2025-12-10
            # CLOB API использует поле market_slug
            event_slug_lower = event_slug.lower()
            
            # Извлекаем части slug для поиска
            parts = event_slug_lower.split("-")
            team_abbrevs = []
            if len(parts) >= 3:
                # Извлекаем аббревиатуры команд (пропускаем 'nhl' и дату)
                team_abbrevs = [p for p in parts[1:-3] if len(p) <= 4 and p != "nhl"]
            
            best_match = None
            best_score = 0
            
            for market in markets:
                if not isinstance(market, dict):
                    continue
                    
                market_slug = market.get("market_slug", "").lower()
                question = market.get("question", "").lower()
                
                # Прямое совпадение slug - наивысший приоритет
                if market_slug == event_slug_lower:
                    print(f"[PolymarketMarketClient] Found exact match: {market_slug}")
                    return self._format_market_data_from_clob(market)
                
                # Частичное совпадение slug
                if event_slug_lower in market_slug or market_slug in event_slug_lower:
                    print(f"[PolymarketMarketClient] Found partial slug match: {market_slug}")
                    return self._format_market_data_from_clob(market)
                
                # Поиск по аббревиатурам команд (с приоритетом активным рынкам)
                if team_abbrevs:
                    # Проверяем, что все аббревиатуры есть в slug или question
                    matches = sum(1 for abbrev in team_abbrevs if abbrev in market_slug or abbrev in question)
                    if matches == len(team_abbrevs):
                        score = 2 if market.get("active", False) else 1
                        if score > best_score:
                            best_match = market
                            best_score = score
            
            if best_match:
                print(f"[PolymarketMarketClient] Found match by team abbrevs: {best_match.get('market_slug')}")
                return self._format_market_data_from_clob(best_match)
            
            print(f"[PolymarketMarketClient] No market found for eventSlug: {event_slug}")
            return None
            
        except Exception as e:
            print(f"[PolymarketMarketClient] CLOB API search error: {e}")
            return None
    
    def _format_market_data_from_clob(self, market: Dict[str, Any]) -> Dict[str, Any]:
        """Format market data from CLOB API response"""
        try:
            # CLOB API использует поле tokens, а не outcomes
            tokens = market.get("tokens", [])
            
            if not tokens or len(tokens) < 2:
                print(f"[PolymarketMarketClient] Warning: Market has {len(tokens)} tokens, expected at least 2")
                # Возвращаем данные даже если токенов меньше 2
                return {
                    "eventSlug": market.get("market_slug", market.get("question", "")),
                    "awayProbability": 0.5,
                    "homeProbability": 0.5,
                    "awayPrice": 0.5,
                    "homePrice": 0.5,
                    "volume": float(market.get("volume", market.get("volume24h", 0))),
                    "marketType": market.get("market_type", "Moneyline"),
                    "tokenId": tokens[0].get("token_id") if tokens else None,
                    "homeTokenId": tokens[1].get("token_id") if len(tokens) > 1 else None,
                    "conditionId": market.get("condition_id"),
                    "awayRecord": None,
                    "homeRecord": None,
                    "question": market.get("question", ""),
                    "active": market.get("active", True)
                }
            
            away_price = None
            home_price = None
            away_token_id = None
            home_token_id = None
            
            # Первый токен обычно away team
            away_token = tokens[0]
            away_price = float(away_token.get("price", 0))
            away_token_id = away_token.get("token_id")
            
            # Второй токен обычно home team
            home_token = tokens[1]
            home_price = float(home_token.get("price", 0))
            home_token_id = home_token.get("token_id")
            
            # Вычисляем вероятности
            total = (away_price or 0) + (home_price or 0)
            away_probability = (away_price / total) if total > 0 else 0.5
            home_probability = (home_price / total) if total > 0 else 0.5
            
            result = {
                "eventSlug": market.get("market_slug", market.get("question", "")),
                "awayProbability": away_probability,
                "homeProbability": home_probability,
                "awayPrice": away_price if away_price else away_probability,
                "homePrice": home_price if home_price else home_probability,
                "volume": float(market.get("volume", market.get("volume24h", 0))),
                "marketType": market.get("market_type", "Moneyline"),
                "tokenId": away_token_id,
                "homeTokenId": home_token_id,
                "conditionId": market.get("condition_id"),
                "awayRecord": None,
                "homeRecord": None,
                "question": market.get("question", ""),
                "active": market.get("active", True)
            }
            
            print(f"[PolymarketMarketClient] Formatted market data: eventSlug={result['eventSlug']}, tokenId={result['tokenId']}")
            return result
        except Exception as e:
            print(f"[PolymarketMarketClient] Error formatting market data: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _search_via_graph(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """Search market using The Graph API"""
        try:
            # GraphQL query to search for markets by question/slug
            # Note: The actual schema may vary, this is a template
            query = """
            query SearchMarket($search: String!) {
              markets(
                where: {
                  question_contains_nocase: $search
                  active: true
                }
                first: 5
                orderBy: volume
                orderDirection: desc
              ) {
                id
                question
                slug
                active
                volume
                outcomes {
                  id
                  outcome
                  price
                  volume
                }
                condition {
                  id
                }
              }
            }
            """
            
            variables = {"search": event_slug}
            
            response = httpx.post(
                self.graph_url,
                json={"query": query, "variables": variables},
                headers={"Content-Type": "application/json"},
                timeout=10.0,
                follow_redirects=True  # Следуем редиректам
            )
            
            if response.status_code != 200:
                print(f"[PolymarketMarketClient] GraphQL request failed: {response.status_code}")
                return None
            
            data = response.json()
            
            if "errors" in data:
                print(f"[PolymarketMarketClient] GraphQL errors: {data['errors']}")
                return None
            
            markets = data.get("data", {}).get("markets", [])
            
            if not markets:
                return None
            
            # Find best match - prefer exact slug match
            for market in markets:
                market_slug = market.get("slug", "").lower()
                if event_slug.lower() in market_slug or market_slug in event_slug.lower():
                    return self._format_market_data(market)
            
            # Return first match if no exact match found
            return self._format_market_data(markets[0])
            
        except Exception as e:
            print(f"[PolymarketMarketClient] Graph API search error: {e}")
            return None
    
    def _search_by_teams(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """Alternative search method - extract team names from slug and search"""
        try:
            # Parse event slug: nhl-cbj-car-2025-12-10
            parts = event_slug.split("-")
            if len(parts) < 4:
                return None
            
            # Extract team abbreviations (skip 'nhl' and date parts)
            team_abbrevs = parts[1:-3]  # Get middle parts (team abbreviations)
            
            # Search for markets containing these team names
            search_terms = " ".join(team_abbrevs)
            
            query = """
            query SearchMarketByTeams($search: String!) {
              markets(
                where: {
                  question_contains_nocase: $search
                  active: true
                }
                first: 5
                orderBy: volume
                orderDirection: desc
              ) {
                id
                question
                slug
                active
                volume
                outcomes {
                  id
                  outcome
                  price
                  volume
                }
                condition {
                  id
                }
              }
            }
            """
            
            variables = {"search": search_terms}
            
            response = httpx.post(
                self.graph_url,
                json={"query": query, "variables": variables},
                headers={"Content-Type": "application/json"},
                timeout=10.0,
                follow_redirects=True  # Следуем редиректам
            )
            
            if response.status_code != 200:
                print(f"[PolymarketMarketClient] GraphQL request failed (alternative search): {response.status_code}")
                return None
            
            data = response.json()
            markets = data.get("data", {}).get("markets", [])
            
            if not markets:
                return None
            
            # Find the best match (preferably one with date in question)
            for market in markets:
                question = market.get("question", "").lower()
                if any(abbrev.lower() in question for abbrev in team_abbrevs):
                    return self._format_market_data(market)
            
            # Return first match if no better match found
            return self._format_market_data(markets[0])
            
        except Exception as e:
            print(f"[PolymarketMarketClient] Error in alternative search: {e}")
            return None
    
    def _format_market_data(self, market: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format market data from The Graph API to match frontend expectations
        
        Expected format:
        {
            "eventSlug": string,
            "awayProbability": float (0-1),
            "homeProbability": float (0-1),
            "awayPrice": float (0-1),
            "homePrice": float (0-1),
            "volume": number,
            "marketType": string,
            "tokenId": string (for away team),
            "homeTokenId": string (for home team),
            "awayRecord": string | null,
            "homeRecord": string | null
        }
        """
        outcomes = market.get("outcomes", [])
        
        # Extract prices and probabilities from outcomes
        away_price = None
        home_price = None
        away_token_id = None
        home_token_id = None
        
        for outcome in outcomes:
            outcome_name = outcome.get("outcome", "").lower()
            price = float(outcome.get("price", 0))
            token_id = outcome.get("id")
            
            # Try to identify away/home teams from outcome name
            # This is a heuristic - may need adjustment based on actual data
            if "away" in outcome_name or "visitor" in outcome_name:
                away_price = price
                away_token_id = token_id
            elif "home" in outcome_name or "host" in outcome_name:
                home_price = price
                home_token_id = token_id
            else:
                # If we can't determine, assign to first two outcomes
                if away_price is None:
                    away_price = price
                    away_token_id = token_id
                elif home_price is None:
                    home_price = price
                    home_token_id = token_id
        
        # If we have exactly 2 outcomes, use them
        if len(outcomes) == 2:
            away_price = float(outcomes[0].get("price", 0))
            away_token_id = outcomes[0].get("id")
            home_price = float(outcomes[1].get("price", 0))
            home_token_id = outcomes[1].get("id")
        
        # Calculate probabilities from prices (if prices are probabilities)
        away_probability = away_price if away_price else 0.5
        home_probability = home_price if home_price else 0.5
        
        # Normalize probabilities if they don't sum to 1
        total = away_probability + home_probability
        if total > 0:
            away_probability = away_probability / total
            home_probability = home_probability / total
        
        volume = float(market.get("volume", 0))
        
        return {
            "eventSlug": market.get("slug", ""),
            "awayProbability": away_probability,
            "homeProbability": home_probability,
            "awayPrice": away_price if away_price else away_probability,
            "homePrice": home_price if home_price else home_probability,
            "volume": volume,
            "marketType": "Moneyline",  # Default, can be extracted from question
            "tokenId": away_token_id,  # Primary token ID for trading
            "homeTokenId": home_token_id,
            "conditionId": market.get("condition", {}).get("id"),
            "awayRecord": None,  # Can be fetched from NHL API separately
            "homeRecord": None,  # Can be fetched from NHL API separately
            "question": market.get("question", ""),
            "active": market.get("active", False)
        }

