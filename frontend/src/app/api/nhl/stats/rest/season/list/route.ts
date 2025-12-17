import { NextRequest, NextResponse } from "next/server";

// NHL Stats API endpoint для получения списка сезонов
// Endpoint: https://api.nhle.com/stats/rest/en/season
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lang = searchParams.get("lang") || "en";

    const nhlApiUrl = `https://api.nhle.com/stats/rest/${lang}/season`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch seasons: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL Stats API] Error fetching seasons:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

