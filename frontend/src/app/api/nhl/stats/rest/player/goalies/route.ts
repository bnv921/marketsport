import { NextRequest, NextResponse } from "next/server";

// NHL Stats API endpoint для получения статистики вратарей
// Endpoint: https://api.nhle.com/stats/rest/en/goalie/{report}
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

    if (!cayenneExp) {
      return NextResponse.json(
        { error: "cayenneExp parameter is required (e.g., seasonId=20232024)" },
        { status: 400 }
      );
    }

    const queryParams = new URLSearchParams();
    queryParams.append("cayenneExp", cayenneExp);
    if (sort) queryParams.append("sort", sort);
    if (dir) queryParams.append("dir", dir);
    if (start) queryParams.append("start", start);
    if (limit) queryParams.append("limit", limit);

    const nhlApiUrl = `https://api.nhle.com/stats/rest/${lang}/goalie/${report}?${queryParams.toString()}`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch goalie stats: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL Stats API] Error fetching goalie stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

