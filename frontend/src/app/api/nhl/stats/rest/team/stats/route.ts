import { NextRequest, NextResponse } from "next/server";

// NHL Stats API endpoint для получения статистики команды
// Endpoint: https://api.nhle.com/stats/rest/en/team/{report}
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const report = searchParams.get("report") || "summary";
    const lang = searchParams.get("lang") || "en";
    const cayenneExp = searchParams.get("cayenneExp");
    const sort = searchParams.get("sort");
    const dir = searchParams.get("dir");
    const start = searchParams.get("start");
    const limit = searchParams.get("limit");

    const queryParams = new URLSearchParams();
    if (cayenneExp) queryParams.append("cayenneExp", cayenneExp);
    if (sort) queryParams.append("sort", sort);
    if (dir) queryParams.append("dir", dir);
    if (start) queryParams.append("start", start);
    if (limit) queryParams.append("limit", limit);

    const nhlApiUrl = `https://api.nhle.com/stats/rest/${lang}/team/${report}?${queryParams.toString()}`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch team stats: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL Stats API] Error fetching team stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

