import { NextRequest, NextResponse } from "next/server";

// API route для получения данных рынка Polymarket по eventSlug
// Проксирует запрос к backend API
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventSlug = searchParams.get("eventSlug");

    if (!eventSlug) {
      return NextResponse.json(
        { error: "eventSlug parameter is required" },
        { status: 400 }
      );
    }

    // Получаем URL backend API из переменных окружения или используем дефолтный
    // NEXT_PUBLIC_API_BASE_URL уже включает /api, поэтому используем его напрямую
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";
    const apiUrl = `${backendUrl}/polymarket/market?eventSlug=${encodeURIComponent(eventSlug)}`;

    console.log(`[Polymarket API] Fetching market from backend: ${apiUrl}`);

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Не кешируем, так как данные могут меняться
        cache: "no-store",
      });

      if (!response.ok) {
        console.error(`[Polymarket API] Backend returned ${response.status}: ${response.statusText}`);
        // Если рынок не найден (404), возвращаем null
        if (response.status === 404) {
          return NextResponse.json(null);
        }
        throw new Error(`Backend API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Если backend вернул null, значит рынок не найден
      if (!data) {
        console.log(`[Polymarket API] Market not found for eventSlug: ${eventSlug}`);
        return NextResponse.json(null);
      }

      console.log(`[Polymarket API] Market found for eventSlug: ${eventSlug}`);
      return NextResponse.json(data);
    } catch (fetchError) {
      console.error(`[Polymarket API] Error fetching from backend:`, fetchError);
      // Если не удалось подключиться к backend, возвращаем null
      return NextResponse.json(null);
    }
  } catch (error) {
    console.error("[Polymarket API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

