import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения boxscore игры
// Endpoint: https://api-web.nhle.com/v1/gamecenter/{gamePk}/boxscore
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const gamePk = searchParams.get("gamePk");

    if (!gamePk) {
      return NextResponse.json(
        { error: "gamePk parameter is required" },
        { status: 400 }
      );
    }

    const nhlApiUrl = `https://api-web.nhle.com/v1/gamecenter/${gamePk}/boxscore`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch boxscore: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL API] Error fetching boxscore:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

