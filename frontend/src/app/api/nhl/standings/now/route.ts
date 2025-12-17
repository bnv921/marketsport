import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения текущей таблицы
// Endpoint: https://api-web.nhle.com/v1/standings/now
export async function GET(request: NextRequest) {
  try {
    const nhlApiUrl = "https://api-web.nhle.com/v1/standings/now";

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch standings: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL API] Error fetching standings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

