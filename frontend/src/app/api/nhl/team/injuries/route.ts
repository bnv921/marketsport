import { NextRequest, NextResponse } from "next/server";

// Получаем текущий сезон в формате YYYYYYYY
function getCurrentSeason(): string {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  // Если месяц с сентября по декабрь, сезон начинается в этом году
  // Если месяц с января по август, сезон начался в прошлом году
  let seasonStartYear = currentYear;
  if (currentMonth < 9) {
    seasonStartYear = currentYear - 1;
  }
  const seasonEndYear = seasonStartYear + 1;
  return `${seasonStartYear}${seasonEndYear}`;
}

// Маппинг teamId -> teamCode (abbrev)
const TEAM_ID_TO_CODE: Record<number, string> = {
  1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT", 6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
  12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH", 16: "CHI", 17: "DET", 18: "NSH", 19: "STL", 20: "CGY",
  21: "COL", 22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL", 26: "LAK", 28: "SJS", 29: "CBJ", 30: "MIN",
  52: "WPG", 53: "ARI", 54: "VGK", 55: "SEA", 56: "UTA"
};

// NHL API endpoint для получения травмированных игроков
// Используем roster API: https://api-web.nhle.com/v1/roster/{TEAM_CODE}/{SEASON}/regular
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId parameter is required" },
        { status: 400 }
      );
    }

    const teamIdNum = parseInt(teamId);
    const teamCode = TEAM_ID_TO_CODE[teamIdNum];

    if (!teamCode) {
      return NextResponse.json(
        { error: `Unknown teamId: ${teamId}` },
        { status: 400 }
      );
    }

    // Пробуем разные варианты endpoint для получения состава
    const season = getCurrentSeason();
    
    // Вариант 1: /v1/roster/{TEAM_CODE}/now (текущий сезон)
    let rosterUrl = `https://api-web.nhle.com/v1/roster/${teamCode}/now`;
    let response = await fetch(rosterUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 3600 },
    });

    // Если 404, пробуем с сезоном и /regular
    if (!response.ok && response.status === 404) {
      console.log(`[NHL API] Trying roster with season: ${season}`);
      rosterUrl = `https://api-web.nhle.com/v1/roster/${teamCode}/${season}/regular`;
      response = await fetch(rosterUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });
    }

    // Если все еще 404, пробуем без /regular
    if (!response.ok && response.status === 404) {
      console.log(`[NHL API] Trying roster without /regular: ${teamCode}/${season}`);
      rosterUrl = `https://api-web.nhle.com/v1/roster/${teamCode}/${season}`;
      response = await fetch(rosterUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });
    }
    
    // Если все еще 404, пробуем предыдущий сезон (возможно, сезон еще не начался)
    if (!response.ok && response.status === 404) {
      const prevSeason = `${parseInt(season.substring(0, 4)) - 1}${parseInt(season.substring(4)) - 1}`;
      console.log(`[NHL API] Trying roster with previous season: ${prevSeason}`);
      rosterUrl = `https://api-web.nhle.com/v1/roster/${teamCode}/${prevSeason}/regular`;
      response = await fetch(rosterUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });
    }
    
    // Если все еще 404, пробуем endpoint для получения информации о команде
    if (!response.ok && response.status === 404) {
      console.log(`[NHL API] Trying club-schedule endpoint for ${teamCode}`);
      const clubScheduleUrl = `https://api-web.nhle.com/v1/club-schedule/${teamCode}/${season}/2`;
      const clubScheduleResponse = await fetch(clubScheduleUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });
      
      if (clubScheduleResponse.ok) {
        const clubScheduleData = await clubScheduleResponse.json();
        // Проверяем, есть ли информация о травмах в этом endpoint
        console.log(`[NHL API] Club schedule keys:`, Object.keys(clubScheduleData || {}));
        if (clubScheduleData.injuries || clubScheduleData.roster) {
          // Используем данные из club-schedule, если они есть
          response = clubScheduleResponse;
          rosterUrl = clubScheduleUrl;
        }
      }
    }

    if (!response.ok) {
      console.error(`[NHL API] Failed to fetch roster: ${response.status} ${response.statusText}, tried: ${rosterUrl}`);
      // Возвращаем пустой массив вместо ошибки, чтобы блок не ломался
      return NextResponse.json({
        teamId: teamIdNum,
        teamCode,
        injuredPlayers: [],
      });
    }

    const data = await response.json();

    // Фильтруем травмированных игроков
    const injuredPlayers: any[] = [];
    
    // Проверяем различные возможные структуры ответа
    const players = data.forwards || data.defense || data.goalies || data.players || [];
    const allPlayers = Array.isArray(players) 
      ? players 
      : [...(data.forwards || []), ...(data.defense || []), ...(data.goalies || [])];

    for (const player of allPlayers) {
      if (player.status?.code) {
        const statusCode = player.status.code.toUpperCase();
        // Проверяем статусы травм
        if (['INJURED', 'IR', 'IR-LT', 'OUT', 'DAYTODAY', 'DAY-TO-DAY'].includes(statusCode)) {
          injuredPlayers.push({
            id: player.id,
            fullName: player.firstName?.default && player.lastName?.default
              ? `${player.firstName.default} ${player.lastName.default}`
              : player.fullName || player.name?.default || "Unknown",
            position: player.position || player.positionCode || "",
            status: {
              code: player.status.code,
              description: player.status.description || player.status.injury || "",
            },
          });
        }
      }
    }

    return NextResponse.json({
      teamId: teamIdNum,
      teamCode,
      injuredPlayers,
    });
  } catch (error) {
    console.error("[NHL API] Error fetching injuries:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

