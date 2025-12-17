import { NextRequest, NextResponse } from "next/server";

// NHL Stats API endpoint для получения shift charts
// Endpoint: https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={gameId}
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const gameId = searchParams.get("gameId");
    const lang = searchParams.get("lang") || "en";

    if (!gameId) {
      return NextResponse.json(
        { error: "gameId parameter is required" },
        { status: 400 }
      );
    }

    const nhlApiUrl = `https://api.nhle.com/stats/rest/${lang}/shiftcharts?cayenneExp=gameId=${gameId}`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch shift charts: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL Stats API] Error fetching shift charts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

