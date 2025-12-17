import { NextRequest, NextResponse } from "next/server";

// NHL API endpoint для получения последних матчей команды
// Используем расписание по датам, так как endpoint club-schedule-season недоступен
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get("teamId");
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId parameter is required" },
        { status: 400 }
      );
    }

    // Получаем последние матчи из расписания за последние 30 дней
    const allGames: any[] = [];
    const seenGameIds = new Set<number>(); // Для отслеживания уникальных игр
    const today = new Date();
    const teamIdNum = parseInt(teamId);

    // Проверяем последние 30 дней
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      try {
        const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
        const response = await fetch(scheduleUrl, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
          },
          next: { revalidate: 300 },
        });

        if (response.ok) {
          const data = await response.json();
          // Ищем игры с участием этой команды
          if (data.gameWeek && Array.isArray(data.gameWeek)) {
            for (const week of data.gameWeek) {
              if (week.games && Array.isArray(week.games)) {
                for (const game of week.games) {
                  // Проверяем, участвует ли команда в этой игре и не добавляли ли мы уже эту игру
                  const gameId = game.id || game.gamePk;
                  if (
                    gameId &&
                    !seenGameIds.has(gameId) &&
                    (game.homeTeam?.id === teamIdNum || game.awayTeam?.id === teamIdNum) &&
                    (game.gameState === "OFF" || game.gameState === "FINAL")
                  ) {
                    seenGameIds.add(gameId);
                    allGames.push(game);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        // Пропускаем ошибки для отдельных дат
        continue;
      }

      // Если набрали достаточно игр, останавливаемся
      if (allGames.length >= limit * 2) {
        break;
      }
    }

    // Сортируем по дате (новые сначала) и берем последние limit
    const completedGames = allGames
      .sort((a, b) => {
        const dateA = new Date(a.startTimeUTC || 0).getTime();
        const dateB = new Date(b.startTimeUTC || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);

    // Преобразуем данные
    const games = completedGames.map((game: any) => {
      const isHome = game.homeTeam?.id === parseInt(teamId);
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const teamScore = isHome ? game.homeTeam?.score : game.awayTeam?.score;
      const opponentScore = isHome ? game.awayTeam?.score : game.homeTeam?.score;
      
      // Определяем результат
      const won = teamScore !== undefined && opponentScore !== undefined && teamScore > opponentScore;
      const lost = teamScore !== undefined && opponentScore !== undefined && teamScore < opponentScore;
      
      // Определяем тип окончания
      const finishType = game.gameOutcome?.lastPeriodType || game.periodDescriptor?.periodType || null;
      const isOT = finishType === "OT";
      const isSO = finishType === "SO";

      return {
        gamePk: game.id || game.gamePk,
        date: game.startTimeUTC,
        opponent: {
          id: opponent?.id,
          name: {
            default: opponent?.name?.default || opponent?.commonName?.default || "",
          },
          placeName: {
            default: opponent?.placeName?.default || "",
          },
          commonName: {
            default: opponent?.commonName?.default || "",
          },
          abbrev: opponent?.abbrev || "",
        },
        isHome,
        teamScore,
        opponentScore,
        won,
        lost,
        isOT,
        isSO,
      };
    });

    return NextResponse.json({ games });
  } catch (error) {
    console.error("[NHL API] Error fetching team games:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

