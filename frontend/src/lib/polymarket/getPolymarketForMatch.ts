// Функция для получения рынка Polymarket по eventSlug
export async function getPolymarketForMatch(eventSlug: string): Promise<any | null> {
  if (!eventSlug) {
    return null;
  }

  try {
    const res = await fetch(`/api/polymarket/market?eventSlug=${encodeURIComponent(eventSlug)}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[getPolymarketForMatch] Failed to fetch market for ${eventSlug}: ${res.status}`);
      return null;
    }

    const data = await res.json().catch(() => null);
    return data || null;
  } catch (error) {
    console.error(`[getPolymarketForMatch] Error fetching market for ${eventSlug}:`, error);
    return null;
  }
}

