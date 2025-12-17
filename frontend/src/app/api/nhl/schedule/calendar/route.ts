import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения календаря расписания
// Endpoint: https://api-web.nhle.com/v1/schedule-calendar/now или /{date}
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date");

    const nhlApiUrl = date
      ? `https://api-web.nhle.com/v1/schedule-calendar/${date}`
      : "https://api-web.nhle.com/v1/schedule-calendar/now";

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch schedule calendar: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[NHL API] Error fetching schedule calendar:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

