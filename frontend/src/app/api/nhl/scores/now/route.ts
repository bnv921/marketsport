import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения текущих результатов
// Endpoint: https://api-web.nhle.com/v1/score/now
export async function GET(request: NextRequest) {
  try {
    const nhlApiUrl = "https://api-web.nhle.com/v1/score/now";

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch current scores: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL API] Error fetching current scores:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

