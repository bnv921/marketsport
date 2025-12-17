import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения расписания по дате
// Формат даты: YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required (format: YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Проверяем формат даты
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Expected YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // NHL API endpoint для расписания
    // Используем официальный NHL API согласно документации: https://github.com/Zmalski/NHL-API-Reference
    // Endpoint: https://api-web.nhle.com/v1/schedule/{date}
    const nhlApiUrl = `https://api-web.nhle.com/v1/schedule/${date}`;

    const response = await fetch(nhlApiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 60 }, // Кешируем на 60 секунд
    });

    if (!response.ok) {
      console.error(`[NHL API] Failed to fetch schedule for ${date}: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch schedule from NHL API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Преобразуем данные NHL API в формат, ожидаемый фронтендом
    // Структура ответа: gameWeek[] -> games[]
    // Фильтруем игры только по запрошенной дате
    const games: any[] = [];
    if (data.gameWeek && Array.isArray(data.gameWeek)) {
      for (const week of data.gameWeek) {
        // Проверяем, что дата недели совпадает с запрошенной датой
        if (week.date === date && week.games && Array.isArray(week.games)) {
          games.push(...week.games);
        }
      }
    }

    return NextResponse.json({
      games: games.map((game: any) => {
        // Определяем, закончился ли матч в овертайме или буллитах
        const rawFinish = (game.gameOutcome?.lastPeriodType ?? game.periodDescriptor?.periodType ?? "").toUpperCase();
        const finishType = rawFinish === "SO" ? "SO" : rawFinish.startsWith("OT") ? "OT" : null;
        
        return {
        id: game.id,
        gamePk: game.id,
        startTimeUTC: game.startTimeUTC,
        gameDate: game.startTimeUTC,
        gameState: game.gameState || "UNKNOWN",
        gameOutcome: game.gameOutcome,
        periodDescriptor: game.periodDescriptor,
        finishType: finishType, // OT, SO или null
        venue: {
          default: game.venue?.default || "",
        },
        homeTeam: {
          id: game.homeTeam?.id,
          name: {
            default: game.homeTeam?.commonName?.default || "",
          },
          placeName: {
            default: game.homeTeam?.placeName?.default || "",
          },
          commonName: {
            default: game.homeTeam?.commonName?.default || "",
          },
          abbrev: game.homeTeam?.abbrev || "",
          score: game.homeTeam?.score,
        },
        awayTeam: {
          id: game.awayTeam?.id,
          name: {
            default: game.awayTeam?.commonName?.default || "",
          },
          placeName: {
            default: game.awayTeam?.placeName?.default || "",
          },
          commonName: {
            default: game.awayTeam?.commonName?.default || "",
          },
          abbrev: game.awayTeam?.abbrev || "",
          score: game.awayTeam?.score,
        },
        };
      }),
    });
  } catch (error) {
    console.error("[NHL API] Error fetching schedule:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

