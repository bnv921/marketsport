import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения landing page игры
// Согласно документации: https://github.com/Zmalski/NHL-API-Reference
// Endpoint: https://api-web.nhle.com/v1/gamecenter/{gamePk}/landing
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

    // Проверяем формат gamePk (должен быть числом)
    if (!/^\d+$/.test(gamePk)) {
      return NextResponse.json(
        { error: "Invalid gamePk format. Expected numeric value" },
        { status: 400 }
      );
    }

    // NHL API endpoint для landing page игры
    const nhlApiUrl = `https://api-web.nhle.com/v1/gamecenter/${gamePk}/landing`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 30 }, // Кешируем на 30 секунд
    });

    if (!response.ok) {
      console.error(`[NHL API] Failed to fetch game landing for ${gamePk}: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch game data from NHL API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Преобразуем данные NHL API в формат, ожидаемый фронтендом
    return NextResponse.json({
      id: data.id,
      gamePk: data.id,
      startTimeUTC: data.startTimeUTC,
      gameDate: data.gameDate,
      gameState: data.gameState,
      venue: data.venue,
      homeTeam: {
        id: data.homeTeam?.id,
        name: {
          default: data.homeTeam?.commonName?.default || "",
        },
        placeName: {
          default: data.homeTeam?.placeName?.default || "",
        },
        commonName: {
          default: data.homeTeam?.commonName?.default || "",
        },
        abbrev: data.homeTeam?.abbrev || "",
        score: data.homeTeam?.score,
      },
      awayTeam: {
        id: data.awayTeam?.id,
        name: {
          default: data.awayTeam?.commonName?.default || "",
        },
        placeName: {
          default: data.awayTeam?.placeName?.default || "",
        },
        commonName: {
          default: data.awayTeam?.commonName?.default || "",
        },
        abbrev: data.awayTeam?.abbrev || "",
        score: data.awayTeam?.score,
      },
      // Передаем все остальные данные как есть для будущего использования
      summary: data.summary,
      clock: data.clock,
      periodDescriptor: data.periodDescriptor,
    });
  } catch (error) {
    console.error("[NHL API] Error fetching game landing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

