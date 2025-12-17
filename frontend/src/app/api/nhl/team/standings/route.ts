import { NextRequest, NextResponse } from "next/server";

// Маппинг teamId -> teamAbbrev для NHL команд
const TEAM_ID_TO_ABBREV: Record<number, string> = {
  1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT", 6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
  12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH", 16: "CHI", 17: "DET", 18: "NSH", 19: "STL", 20: "CGY",
  21: "COL", 22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL", 26: "LAK", 28: "SJS", 29: "CBJ", 30: "MIN",
  52: "WPG", 53: "ARI", 54: "VGK", 55: "SEA", 56: "UTA"
};

// NHL API endpoint для получения статистики команды
// Используем standings API согласно документации: https://github.com/Zmalski/NHL-API-Reference
// Endpoint: https://api-web.nhle.com/v1/standings/now
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

    // NHL API endpoint для текущих standings
    // Согласно документации: Get Standings - https://api-web.nhle.com/v1/standings/now
    const standingsUrl = `https://api-web.nhle.com/v1/standings/now`;

    const response = await fetch(standingsUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 3600 }, // Кешируем на 1 час
    });

    if (!response.ok) {
      console.error(`[NHL API] Failed to fetch standings: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch standings from NHL API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Ищем команду по teamId
    const teamIdNum = parseInt(teamId);
    const teamAbbrev = TEAM_ID_TO_ABBREV[teamIdNum];
    
    if (!teamAbbrev) {
      console.error(`[NHL API] Unknown teamId: ${teamId}`);
      return NextResponse.json(
        { error: `Unknown teamId: ${teamId}` },
        { status: 404 }
      );
    }

    let teamStandings = null;

    // Структура ответа может быть разной, проверяем несколько вариантов
    if (data.standings && Array.isArray(data.standings)) {
      // Ищем команду по teamAbbrev в массиве standings
      teamStandings = data.standings.find((team: any) => {
        // Проверяем различные возможные поля для teamAbbrev
        const abbrev = team.teamAbbrev?.default || 
                      team.teamAbbrev || 
                      team.abbrev ||
                      "";
        
        return abbrev.toUpperCase() === teamAbbrev.toUpperCase();
      });
    } else if (data.teamRecords && Array.isArray(data.teamRecords)) {
      teamStandings = data.teamRecords.find((team: any) => 
        team.team?.id === teamIdNum || 
        team.team?.abbrev?.toUpperCase() === teamAbbrev.toUpperCase()
      );
    } else if (Array.isArray(data)) {
      teamStandings = data.find((team: any) => {
        const abbrev = team.teamAbbrev?.default || 
                      team.teamAbbrev || 
                      team.abbrev ||
                      "";
        return abbrev.toUpperCase() === teamAbbrev.toUpperCase();
      });
    }

    if (!teamStandings) {
      console.error(`[NHL API] Team standings not found for teamId: ${teamId} (${teamAbbrev}), data structure:`, Object.keys(data));
      if (data.standings && Array.isArray(data.standings) && data.standings.length > 0) {
        console.error(`[NHL API] Available teamAbbrevs in standings:`, data.standings.map((t: any) => ({
          teamAbbrev: t.teamAbbrev?.default || t.teamAbbrev || t.abbrev,
          teamCommonName: t.teamCommonName?.default || t.teamCommonName,
        })).slice(0, 5));
      }
      return NextResponse.json(
        { error: "Team standings not found" },
        { status: 404 }
      );
    }

    // Преобразуем данные в нужный формат
    // Проверяем различные возможные структуры данных
    const conference = teamStandings.conferenceName || 
                      teamStandings.conference?.name?.default || 
                      "";
    
    const place = teamStandings.conferenceSequence || 
                 teamStandings.conferenceRank || 
                 teamStandings.place || 
                 teamStandings.rank || 
                 0;
    
    const gamesPlayed = teamStandings.gamesPlayed || 
                       teamStandings.gp || 
                       0;
    
    const wins = teamStandings.wins || 
                teamStandings.w || 
                0;
    
    const losses = teamStandings.losses || 
                  teamStandings.l || 
                  0;
    
    // В NHL API otWins может быть в разных полях
    const otWins = teamStandings.otWins || 
                  teamStandings.ot || 
                  (teamStandings.regulationPlusOtWins || 0) - (teamStandings.regulationWins || 0) ||
                  0;
    
    const shootoutWins = teamStandings.shootoutWins || 
                        teamStandings.so || 
                        0;
    
    const goalsFor = teamStandings.goalFor || 
                    teamStandings.goalsFor ||
                    teamStandings.gf || 
                    0;
    
    const goalsAgainst = teamStandings.goalAgainst || 
                        teamStandings.goalsAgainst ||
                        teamStandings.ga || 
                        0;
    
    const goalDiff = teamStandings.goalDifferential || 
                   teamStandings.diff || 
                   (goalsFor - goalsAgainst);
    
    const points = teamStandings.points || 
                  teamStandings.pts || 
                  0;

    return NextResponse.json({
      teamId: teamIdNum,
      conference,
      place,
      gamesPlayed,
      wins,
      losses,
      otWins,
      shootoutWins,
      goalsFor,
      goalsAgainst,
      goalDiff,
      points,
    });
  } catch (error) {
    console.error("[NHL API] Error fetching team standings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
