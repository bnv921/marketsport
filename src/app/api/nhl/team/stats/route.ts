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

// NHL API endpoint для получения статистики команды
// Используем stats/rest API согласно документации
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

    const season = getCurrentSeason();
    const gameTypeId = 2; // Регулярный сезон

    // Получаем статистику команды из stats/rest
    // Пробуем получить все команды сразу, чтобы увидеть все доступные поля
    const allTeamsUrl = `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=${season}%20and%20gameTypeId=${gameTypeId}`;
    
    const allTeamsResponse = await fetch(allTeamsUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
      },
      next: { revalidate: 3600 },
    });

    let teamStats = null;
    if (allTeamsResponse.ok) {
      const allTeamsData = await allTeamsResponse.json();
      let allTeamsStats: any[] = [];
      if (allTeamsData.data && Array.isArray(allTeamsData.data)) {
        allTeamsStats = allTeamsData.data;
      } else if (Array.isArray(allTeamsData)) {
        allTeamsStats = allTeamsData;
      }
      
      if (allTeamsStats.length > 0) {
        teamStats = allTeamsStats.find((t: any) => t.teamId === parseInt(teamId));
        // Логируем ВСЕ ключи первой команды для поиска нужных полей
        if (allTeamsStats.length > 0) {
          console.log(`[NHL API] ALL keys from first team in list:`, Object.keys(allTeamsStats[0]));
        }
      }
    }

    // Если не нашли в общем списке, пробуем запрос с фильтром
    if (!teamStats) {
      const teamStatsUrl = `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=${season}%20and%20gameTypeId=${gameTypeId}%20and%20teamId=${teamId}`;

      const teamResponse = await fetch(teamStatsUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 }, // Кешируем на 1 час
      });

      if (!teamResponse.ok) {
        console.error(`[NHL API] Failed to fetch team stats: ${teamResponse.status} ${teamResponse.statusText}`);
        return NextResponse.json(
          { error: `Failed to fetch team stats from NHL API: ${teamResponse.statusText}` },
          { status: teamResponse.status }
        );
      }

      const teamData = await teamResponse.json();
      
      // Ищем статистику команды в ответе
      if (teamData.data && Array.isArray(teamData.data)) {
        teamStats = teamData.data.find((team: any) => team.teamId === parseInt(teamId));
      } else if (Array.isArray(teamData)) {
        teamStats = teamData.find((team: any) => team.teamId === parseInt(teamId));
      }

      if (!teamStats) {
        console.error(`[NHL API] Team stats not found for teamId: ${teamId}`);
        return NextResponse.json(
          { error: "Team stats not found" },
          { status: 404 }
        );
      }
    }

    // Получаем детальную статистику из web API для получения количества попыток
    // Маппинг teamId -> teamCode
    const TEAM_ID_TO_CODE: Record<number, string> = {
      1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT", 6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
      12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH", 16: "CHI", 17: "DET", 18: "NSH", 19: "STL", 20: "CGY",
      21: "COL", 22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL", 26: "LAK", 28: "SJS", 29: "CBJ", 30: "MIN",
      52: "WPG", 53: "ARI", 54: "VGK", 55: "SEA", 56: "UTA"
    };
    
    const teamCode = TEAM_ID_TO_CODE[parseInt(teamId)];
    let detailedStats: any = null;
    
    if (teamCode) {
      try {
        const clubStatsUrl = `https://api-web.nhle.com/v1/club-stats/${teamCode}/${season}/${gameTypeId}`;
        const clubResponse = await fetch(clubStatsUrl, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
          },
          next: { revalidate: 3600 },
        });
        
        if (clubResponse.ok) {
          detailedStats = await clubResponse.json();
          console.log(`[NHL API] Club stats keys for ${teamCode}:`, Object.keys(detailedStats || {}));
          
          // Проверяем структуру данных - возможно данные в skaters или goalies
          if (detailedStats.skaters && Array.isArray(detailedStats.skaters) && detailedStats.skaters.length > 0) {
            console.log(`[NHL API] First skater keys:`, Object.keys(detailedStats.skaters[0]));
          }
          
          // Ищем все числовые поля в корне объекта
          const numericFields = Object.keys(detailedStats).filter(key => {
            const value = detailedStats[key];
            return typeof value === 'number' && value > 0;
          });
          console.log(`[NHL API] Numeric fields in club stats:`, numericFields);
          
          // Логируем ВСЕ ключи в корне club-stats для поиска общей статистики команды
          console.log(`[NHL API] ALL keys in club stats root for ${teamCode}:`, Object.keys(detailedStats));
          
          // Проверяем, есть ли общая статистика команды в корне (не только skaters/goalies)
          const rootStats = Object.keys(detailedStats).filter(key => {
            return key !== 'season' && key !== 'gameType' && key !== 'skaters' && key !== 'goalies' && 
                   typeof detailedStats[key] === 'object' && detailedStats[key] !== null;
          });
          if (rootStats.length > 0) {
            console.log(`[NHL API] Potential team stats objects in club stats:`, rootStats);
            rootStats.forEach(key => {
              console.log(`[NHL API] Keys in ${key}:`, Object.keys(detailedStats[key]));
            });
          }
        }
      } catch (error) {
        console.warn(`[NHL API] Failed to fetch club stats:`, error);
      }
    }

    // Получаем статистику лучшего вратаря команды
    const goalieStatsUrl = `https://api.nhle.com/stats/rest/en/goalie/summary?sort=savePct&dir=DESC&cayenneExp=seasonId=${season}%20and%20gameTypeId=${gameTypeId}%20and%20teamId=${teamId}&limit=1`;

    let goalieStats = null;
    try {
      const goalieResponse = await fetch(goalieStatsUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });

      if (goalieResponse.ok) {
        const goalieData = await goalieResponse.json();
        if (goalieData.data && Array.isArray(goalieData.data) && goalieData.data.length > 0) {
          goalieStats = goalieData.data[0];
        } else if (Array.isArray(goalieData) && goalieData.length > 0) {
          goalieStats = goalieData[0];
        }
      }
    } catch (error) {
      console.warn(`[NHL API] Failed to fetch goalie stats:`, error);
    }

    // Пробуем получить данные из team summary без фильтра по teamId - получим все команды и найдем нужную
    // Это нужно для поиска полей с количеством попыток, которых может не быть в отфильтрованном ответе
    let allTeamsStats: any[] = [];
    try {
      const allTeamsUrl = `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=${season}%20and%20gameTypeId=${gameTypeId}`;
      const allTeamsResponse = await fetch(allTeamsUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Marketsport/1.0)",
        },
        next: { revalidate: 3600 },
      });
      
      if (allTeamsResponse.ok) {
        const allTeamsData = await allTeamsResponse.json();
        if (allTeamsData.data && Array.isArray(allTeamsData.data)) {
          allTeamsStats = allTeamsData.data;
        } else if (Array.isArray(allTeamsData)) {
          allTeamsStats = allTeamsData;
        }
        
        if (allTeamsStats.length > 0) {
          // Ищем команду в общем списке
          const foundTeam = allTeamsStats.find((t: any) => t.teamId === parseInt(teamId));
          if (foundTeam) {
            console.log(`[NHL API] Found team in all teams list, checking all keys:`, Object.keys(foundTeam));
            // Логируем все ключи, которые могут содержать PP/PK данные
            const relevantKeys = Object.keys(foundTeam).filter(key => 
              key.toLowerCase().includes('goal') || 
              key.toLowerCase().includes('opportunit') ||
              key.toLowerCase().includes('pp') ||
              key.toLowerCase().includes('pk') ||
              key.toLowerCase().includes('power') ||
              key.toLowerCase().includes('penalty') ||
              key.toLowerCase().includes('shorthanded') ||
              key.toLowerCase().includes('manadvantage')
            );
            console.log(`[NHL API] Relevant keys in team stats:`, relevantKeys);
            relevantKeys.forEach(key => {
              console.log(`[NHL API] ${key}:`, foundTeam[key]);
            });
            // Используем найденную команду для поиска полей
            detailedStats = foundTeam;
          }
        }
      }
    } catch (error) {
      console.warn(`[NHL API] Failed to fetch all teams stats:`, error);
    }

    // Вычисляем Power Play % если нужно
    let powerPlayPct = teamStats.powerPlayPct || teamStats.powerPlayPercentage || 0;
    if (powerPlayPct > 0 && powerPlayPct < 1) {
      // Если процент в формате 0.155, преобразуем в 15.5
      powerPlayPct = powerPlayPct * 100;
    }
    // Если процент не задан, вычисляем из goals/opportunities
    if (powerPlayPct === 0 && teamStats.powerPlayGoals && teamStats.powerPlayOpportunities) {
      powerPlayPct = (teamStats.powerPlayGoals / teamStats.powerPlayOpportunities) * 100;
    }

    // Вычисляем Penalty Kill % если нужно
    let penaltyKillPct = teamStats.penaltyKillPct || teamStats.penaltyKillPercentage || 0;
    if (penaltyKillPct > 0 && penaltyKillPct < 1) {
      // Если процент в формате 0.754, преобразуем в 75.4
      penaltyKillPct = penaltyKillPct * 100;
    }
    // Если процент не задан, вычисляем из opportunities/goalsAgainst
    if (penaltyKillPct === 0 && teamStats.penaltyKillOpportunities) {
      const goalsAgainst = teamStats.penaltyKillGoalsAgainst || teamStats.goalsAgainstOnPk || 0;
      penaltyKillPct = ((teamStats.penaltyKillOpportunities - goalsAgainst) / teamStats.penaltyKillOpportunities) * 100;
    }

    // Вычисляем Face-off % если нужно
    let faceoffWinPct = teamStats.faceoffWinPct || teamStats.faceoffPercentage || 0;
    if (faceoffWinPct > 0 && faceoffWinPct < 1) {
      faceoffWinPct = faceoffWinPct * 100;
    }

    // Ищем правильные названия полей для Power Play
    // Сначала проверяем detailedStats из club-stats API
    const powerPlayGoals = detailedStats?.powerPlayGoals || 
                          detailedStats?.powerPlayGoalsFor || 
                          detailedStats?.ppGoals || 
                          teamStats.powerPlayGoals || 
                          teamStats.powerPlayGoalsFor || 
                          teamStats.ppGoals || 
                          teamStats.ppGoalsFor ||
                          teamStats.manAdvantageGoals ||
                          0;
    
    const powerPlayOpportunities = detailedStats?.powerPlayOpportunities || 
                                  detailedStats?.ppOpportunities || 
                                  detailedStats?.manAdvantageOpportunities ||
                                  teamStats.powerPlayOpportunities || 
                                  teamStats.ppOpportunities || 
                                  teamStats.manAdvantageOpportunities ||
                                  teamStats.ppOpps ||
                                  0;

    // Ищем правильные названия полей для Penalty Kill
    const penaltyKillGoalsAgainst = detailedStats?.penaltyKillGoalsAgainst || 
                                    detailedStats?.goalsAgainstOnPk || 
                                    detailedStats?.pkGoalsAgainst ||
                                    teamStats.penaltyKillGoalsAgainst || 
                                    teamStats.goalsAgainstOnPk || 
                                    teamStats.pkGoalsAgainst ||
                                    teamStats.shorthandedGoalsAgainst ||
                                    0;
    
    const penaltyKillOpportunities = detailedStats?.penaltyKillOpportunities || 
                                    detailedStats?.pkOpportunities || 
                                    detailedStats?.shorthandedOpportunities ||
                                    teamStats.penaltyKillOpportunities || 
                                    teamStats.pkOpportunities || 
                                    teamStats.shorthandedOpportunities ||
                                    teamStats.pkOpps ||
                                    0;
    
    console.log(`[NHL API] Power Play: goals=${powerPlayGoals}, opportunities=${powerPlayOpportunities}`);
    console.log(`[NHL API] Penalty Kill: goalsAgainst=${penaltyKillGoalsAgainst}, opportunities=${penaltyKillOpportunities}`);

    // Преобразуем данные в нужный формат
    return NextResponse.json({
      teamId: parseInt(teamId),
      // Power Play
      powerPlayPct,
      powerPlayGoals,
      powerPlayOpportunities,
      // Penalty Kill
      penaltyKillPct,
      penaltyKillGoalsAgainst,
      penaltyKillOpportunities,
      // Face-off
      faceoffWinPct,
      // Goals
      goalsForPerGame: teamStats.goalsForPerGame || teamStats.gfPerGame || 0,
      goalsAgainstPerGame: teamStats.goalsAgainstPerGame || teamStats.gaPerGame || 0,
      // Shots
      shotsForPerGame: teamStats.shotsForPerGame || teamStats.sogPerGame || 0,
      shotsAgainstPerGame: teamStats.shotsAgainstPerGame || teamStats.saPerGame || 0,
      // Goalie (лучший вратарь)
      goalieSavePct: goalieStats?.savePct || goalieStats?.savePercentage || 0,
    });
  } catch (error) {
    console.error("[NHL API] Error fetching team stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

