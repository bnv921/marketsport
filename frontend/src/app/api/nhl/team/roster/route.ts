import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения состава команды
// Endpoint: https://api-web.nhle.com/v1/club-stats/{teamId}/now или /{season}
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get("teamId");
    const season = searchParams.get("season");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId parameter is required" },
        { status: 400 }
      );
    }

    const nhlApiUrl = season
      ? `https://api-web.nhle.com/v1/roster-season/${teamId}/${season}`
      : `https://api-web.nhle.com/v1/roster-season/${teamId}/now`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch roster: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL API] Error fetching roster:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

