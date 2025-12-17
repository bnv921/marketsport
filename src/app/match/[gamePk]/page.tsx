"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { buildPolymarketEventSlug } from "@/lib/polymarket/nhlTeamAbbrevMap";
import { getPolymarketForMatch } from "@/lib/polymarket/getPolymarketForMatch";
import { manualMarketMap } from "@/lib/polymarket/manualMarketMap";
import TeamIcon from "@/components/TeamIcon";

// Импортируем цвета команд из TeamIcon
const TEAM_COLORS: Record<string, { bg: string; fg: string }> = {
  ANA: { bg: "#FF6600", fg: "#000000" },
  ARI: { bg: "#8c2633", fg: "#ffffff" },
  BOS: { bg: "#111111", fg: "#f5d000" },
  BUF: { bg: "#003087", fg: "#ffffff" },
  CAR: { bg: "#cc0000", fg: "#000000" },
  CBJ: { bg: "#002654", fg: "#ffffff" },
  CGY: { bg: "#c8102e", fg: "#000000" },
  CHI: { bg: "#c8102e", fg: "#000000" },
  COL: { bg: "#8b2635", fg: "#ffffff" },
  DAL: { bg: "#006847", fg: "#ffffff" },
  DET: { bg: "#c8102e", fg: "#ffffff" },
  EDM: { bg: "#00205b", fg: "#FF6600" },
  FLA: { bg: "#c8102e", fg: "#ffffff" },
  LAK: { bg: "#808080", fg: "#000000" },
  MIN: { bg: "#154734", fg: "#cc0000" },
  MTL: { bg: "#a6192e", fg: "#ffffff" },
  NJD: { bg: "#c8102e", fg: "#ffffff" },
  NSH: { bg: "#ffb81c", fg: "#111111" },
  NYI: { bg: "#00205b", fg: "#FF6600" },
  NYR: { bg: "#0033A0", fg: "#cc0000" },
  OTT: { bg: "#c8102e", fg: "#ffffff" },
  PHI: { bg: "#f74902", fg: "#111111" },
  PIT: { bg: "#111111", fg: "#DAA520" },
  SJS: { bg: "#006272", fg: "#000000" },
  SEA: { bg: "#99d9d9", fg: "#000000" },
  STL: { bg: "#002f87", fg: "#ffffff" },
  TBL: { bg: "#00205b", fg: "#ffffff" },
  TOR: { bg: "#00205b", fg: "#ffffff" },
  VAN: { bg: "#00205b", fg: "#ffffff" },
  VGK: { bg: "#3d3d3d", fg: "#FFD700" },
  WPG: { bg: "#00205b", fg: "#ffffff" },
  WSH: { bg: "#c8102e", fg: "#000000" },
  UTA: { bg: "#00A3E0", fg: "#000000" },
};

// Функция для получения цвета команды
function getTeamColor(teamCode: string): string | null {
  const TEAM_COLORS: Record<string, string> = {
    ANA: "#FF6600",
    ARI: "#8c2633",
    BOS: "#111111",
    BUF: "#003087",
    CAR: "#cc0000",
    CBJ: "#002654",
    CGY: "#c8102e",
    CHI: "#cf0a2c",
    COL: "#6f263d",
    DAL: "#006847",
    DET: "#ce1126",
    EDM: "#00205b",
    FLA: "#c8102e", // Используем красный для Florida Panthers
    LAK: "#111111",
    MIN: "#154734",
    MTL: "#a6192e",
    NJD: "#c8102e",
    NSH: "#ffb81c",
    NYI: "#003087",
    NYR: "#2054a6",
    OTT: "#c8102e",
    PHI: "#f74902",
    PIT: "#111111",
    SJS: "#006d75",
    SEA: "#001628",
    STL: "#4169E1",
    TBL: "#002868",
    TOR: "#00205b",
    VAN: "#00205b",
    VGK: "#33312e",
    WPG: "#041e42",
    WSH: "#c8102e",
    UTA: "#00A3E0",
  };
  return TEAM_COLORS[teamCode?.toUpperCase()] || null;
}

function formatTeamName(team?: any) {
  const place = team?.placeName?.default ?? "";
  const name = team?.commonName?.default ?? "";
  const combined = [place, name].filter(Boolean).join(" ").trim();
  return combined || team?.name?.default || team?.abbrev || "Команда";
}

// ВАЖНО: Это восстановленная версия файла. Полная версия была удалена.
// Основная функциональность восстановлена на основе собранного кода.

export default function MatchPage() {
  const params = useParams();
  const gamePk = params?.gamePk as string;

  // Загрузка данных матча
  const { data: landingData, error: landingError } = useSWR(
    gamePk ? `/api/nhl/game/landing?gamePk=${gamePk}` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load game");
      return res.json();
    }
  );

  const homeTeamName = formatTeamName(landingData?.homeTeam);
  const awayTeamName = formatTeamName(landingData?.awayTeam);

  // Состояние для выбранной даты (инициализируется на клиенте)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Инициализация даты для блока матчей - используем дату матча
  useEffect(() => {
    if (landingData?.startTimeUTC) {
      try {
        // Получаем дату матча в EST/EDT из UTC времени
        const matchDate = new Date(landingData.startTimeUTC);
        const estDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(matchDate);
        console.log(`[Date Init] Setting date to match date: ${estDate} (from UTC: ${landingData.startTimeUTC})`);
        // Всегда обновляем дату на дату матча, даже если selectedDate уже установлен
        setSelectedDate(estDate);
      } catch (error) {
        console.error("Error formatting match date:", error);
      }
    }
  }, [landingData?.startTimeUTC]);

  // Функция для переключения даты
  const changeDate = (direction: "prev" | "next") => {
    if (!selectedDate) return;
    try {
      // Парсим дату в формате YYYY-MM-DD
      const [year, month, day] = selectedDate.split("-").map(Number);
      // Создаем объект Date в локальном времени (будет правильно работать)
      const date = new Date(year, month - 1, day);
      // Добавляем или вычитаем день
      date.setDate(date.getDate() + (direction === "next" ? 1 : -1));
      // Форматируем обратно в YYYY-MM-DD
      const newDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      console.log(`[Date Change] ${direction}: ${selectedDate} -> ${newDate}`);
      setSelectedDate(newDate);
    } catch (error) {
      console.error("Error changing date:", error);
    }
  };

  // Формирование eventSlug для Polymarket с использованием EST
  const polymarketEventSlug = useMemo(() => {
    // Проверяем ручной маппинг
    const manualSlug = manualMarketMap[gamePk];
    if (manualSlug) {
      return manualSlug;
    }

    if (!homeTeamName || !awayTeamName || !landingData?.startTimeUTC) {
      return null;
    }

    // Polymarket использует UTC для даты в eventSlug
    const utcDate = new Date(landingData.startTimeUTC);
    if (isNaN(utcDate.getTime())) {
      console.warn(`[Polymarket] Failed to parse UTC time: ${landingData.startTimeUTC}`);
      return null;
    }

    // Форматируем дату в UTC формате YYYY-MM-DD
    const year = utcDate.getUTCFullYear();
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(utcDate.getUTCDate()).padStart(2, "0");
    const utcDateStr = `${year}-${month}-${day}`;

    // Логируем входные данные для отладки
    console.log(`[Polymarket] Building eventSlug for gamePk: ${gamePk}`);
    console.log(`[Polymarket] homeTeamName: "${homeTeamName}", awayTeamName: "${awayTeamName}"`);
    console.log(`[Polymarket] startTimeUTC: ${landingData.startTimeUTC}, UTC date: ${utcDateStr}`);

    const eventSlug = buildPolymarketEventSlug(
      homeTeamName,
      awayTeamName,
      utcDateStr
    );

    if (eventSlug) {
      console.log(`[Polymarket] ✅ Built eventSlug: ${eventSlug}`);
      console.log(`[Polymarket] Expected format: nhl-away-home-YYYY-MM-DD`);
    } else {
      console.error(`[Polymarket] ❌ Failed to build eventSlug for: ${homeTeamName} vs ${awayTeamName}`);
      console.error(`[Polymarket] Check team name mapping in NHL_POLYMARKET_ABBREV_MAP`);
    }

    return eventSlug;
  }, [gamePk, homeTeamName, awayTeamName, landingData?.startTimeUTC]);

  // Загрузка последних матчей для команд
  const { data: awayTeamGames } = useSWR(
    landingData?.awayTeam?.id ? [`team-games`, landingData.awayTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/games?teamId=${landingData.awayTeam.id}&limit=5`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  const { data: homeTeamGames } = useSWR(
    landingData?.homeTeam?.id ? [`team-games`, landingData.homeTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/games?teamId=${landingData.homeTeam.id}&limit=5`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  // Загрузка статистики команд
  const { data: awayTeamStandings } = useSWR(
    landingData?.awayTeam?.id ? [`team-standings`, landingData.awayTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/standings?teamId=${landingData.awayTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  const { data: homeTeamStandings } = useSWR(
    landingData?.homeTeam?.id ? [`team-standings`, landingData.homeTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/standings?teamId=${landingData.homeTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  // Загрузка детальной статистики команд
  const { data: awayTeamStats } = useSWR(
    landingData?.awayTeam?.id ? [`team-stats`, landingData.awayTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/stats?teamId=${landingData.awayTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  const { data: homeTeamStats } = useSWR(
    landingData?.homeTeam?.id ? [`team-stats`, landingData.homeTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/stats?teamId=${landingData.homeTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  // Загрузка травмированных игроков
  const { data: awayTeamInjuries } = useSWR(
    landingData?.awayTeam?.id ? [`team-injuries`, landingData.awayTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/injuries?teamId=${landingData.awayTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  const { data: homeTeamInjuries } = useSWR(
    landingData?.homeTeam?.id ? [`team-injuries`, landingData.homeTeam.id] : null,
    async () => {
      const res = await fetch(`/api/nhl/team/injuries?teamId=${landingData.homeTeam.id}`);
      if (!res.ok) return null;
      return res.json();
    }
  );

  // Проверяем, открыт ли матч (только для открытых матчей показываем Polymarket)
  const isMatchOpen = useMemo(() => {
    if (!landingData?.gameState) return false;
    // Матч открыт, если он еще не начался, идет или в овертайме
    return ["FUT", "LIVE", "CRIT"].includes(landingData.gameState);
  }, [landingData?.gameState]);

  // Загрузка рынка Polymarket (только для открытых матчей)
  const { data: polymarketMarket, error: polymarketError, isLoading: polymarketLoading } = useSWR(
    polymarketEventSlug && isMatchOpen ? ["polymarket-market-by-eventSlug", polymarketEventSlug] : null,
    async () => {
      console.log(`[Polymarket] Fetching market by eventSlug: ${polymarketEventSlug}`);
      const market = await getPolymarketForMatch(polymarketEventSlug!);
      return market ? (console.log(`[Polymarket] Market found for eventSlug: ${polymarketEventSlug}`), market) : (console.log(`[Polymarket] Market not found for eventSlug: ${polymarketEventSlug}`), market);
    }
  );

  // Загрузка матчей для выбранной даты (ВАЖНО: до ранних возвратов)
  const { data: todayGames } = useSWR(
    selectedDate ? [`schedule-games`, selectedDate] : null,
    async () => {
      console.log(`[Games Fetch] Fetching games for date: ${selectedDate}`);
      const res = await fetch(`/api/nhl/schedule/date?date=${selectedDate}`);
      if (!res.ok) {
        console.error(`[Games Fetch] Failed to fetch games for ${selectedDate}: ${res.status}`);
        return { games: [] };
      }
      const data = await res.json();
      console.log(`[Games Fetch] Received ${data?.games?.length || 0} games for ${selectedDate}`);
      return data;
    }
  );

  // ВАЖНО: Остальная часть компонента (UI, статистика, и т.д.) была удалена
  // и должна быть восстановлена из бэкапа или пересоздана

  if (landingError) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-red-600 dark:text-red-400">
            Ошибка загрузки матча: {landingError.message}
          </p>
        </div>
      </div>
    );
  }

  if (!landingData) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-zinc-600 dark:text-zinc-400">Загрузка матча...</p>
        </div>
      </div>
    );
  }

  const formatTime = (iso?: string) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);
  };

  const formatShortDate = (iso?: string) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "America/New_York",
      day: "numeric",
      month: "short",
    }).format(date);
  };

  const formatDateForHeader = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    try {
      // Просто форматируем из строки напрямую, без использования Date объекта
      // Это гарантирует правильное отображение без проблем с часовыми поясами
      const [year, month, day] = dateStr.split("-");
      const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const monthName = monthNames[parseInt(month) - 1] || "DEC";
      const dayNum = parseInt(day);
      const formatted = `${monthName} ${dayNum}`;
      console.log(`[Format Date] Input: ${dateStr} -> Output: ${formatted}`);
      return formatted;
    } catch (error) {
      console.error("Error formatting date for header:", error);
      return "";
    }
  };

  const getGameStatus = (game: any) => {
    if (game.gameState === "FINAL" || game.gameState === "OFF") {
      return "FINAL";
    }
    return "SCHEDULED";
  };

  const getGameStatusText = () => {
    if (!landingData.gameState) return "Матч ещё не начался";
    switch (landingData.gameState) {
      case "FUT":
        return "Матч ещё не начался";
      case "LIVE":
        return "Матч идёт";
      case "CRIT":
        return "Овертайм";
      case "OFF":
      case "FINAL":
        return "Матч завершён";
      default:
        return "Матч ещё не начался";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Блок с матчами выбранного дня */}
        {selectedDate && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="flex items-center gap-4">
              {/* Стрелка влево (предыдущий день) */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  changeDate("prev");
                }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative z-10 cursor-pointer"
                aria-label="Предыдущий день"
                type="button"
              >
                <svg className="w-4 h-4 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Дата в центре */}
              <div className="flex-shrink-0">
                <div className="text-sm font-bold text-black dark:text-zinc-50">
                  {formatDateForHeader(selectedDate) || "—"}
                </div>
              </div>
              {/* Горизонтальный список матчей */}
              <div className="flex gap-3 overflow-x-auto flex-1 min-w-0">
                {todayGames?.games && Array.isArray(todayGames.games) && todayGames.games.length > 0 ? (
                  todayGames.games.map((game: any) => {
                  if (!game || !game.gamePk) return null;
                  const currentGamePk = gamePk ? parseInt(String(gamePk), 10) : null;
                  const isCurrentGame = currentGamePk !== null && game.gamePk === currentGamePk;
                  const gameStatus = getGameStatus(game);
                  const gameTime = formatTime(game.startTimeUTC);
                  
                  return (
                    <Link
                      key={game.gamePk}
                      href={`/match/${game.gamePk}`}
                      className={`flex-shrink-0 rounded border p-3 min-w-[140px] transition-colors ${
                        isCurrentGame
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      {/* Команда и счет в одной строке */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TeamIcon teamCode={game.awayTeam?.abbrev || ""} size={20} />
                          <div className="font-bold text-sm text-black dark:text-zinc-50">
                            {game.awayTeam?.abbrev || "—"}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-black dark:text-zinc-50">
                          {game.awayTeam?.score !== undefined ? game.awayTeam.score : "—"}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TeamIcon teamCode={game.homeTeam?.abbrev || ""} size={20} />
                          <div className="font-bold text-sm text-black dark:text-zinc-50">
                            {game.homeTeam?.abbrev || "—"}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-black dark:text-zinc-50">
                          {game.homeTeam?.score !== undefined ? game.homeTeam.score : "—"}
                        </div>
                      </div>
                      {/* Время и статус */}
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 text-center pt-1 border-t border-zinc-200 dark:border-zinc-700">
                        {gameTime} · {gameStatus}
                        {gameStatus === "FINAL" && game.finishType && (
                          <span className="ml-1">{game.finishType}</span>
                        )}
                      </div>
                    </Link>
                  );
                  }).filter(Boolean)
                ) : (
                  <div className="flex items-center justify-center min-w-[140px] text-sm text-zinc-500 dark:text-zinc-400">
                    Нет матчей
                  </div>
                )}
              </div>
              {/* Стрелка вправо (следующий день) */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  changeDate("next");
                }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative z-10 cursor-pointer"
                aria-label="Следующий день"
                type="button"
              >
                <svg className="w-4 h-4 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Заголовок в формате как на скриншоте */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 relative overflow-hidden">
          {/* Треугольный акцент слева (гости) */}
          {landingData.awayTeam?.abbrev && (() => {
            const awayColors = TEAM_COLORS[landingData.awayTeam.abbrev.toUpperCase()];
            return awayColors ? (
              <div
                className="absolute top-0 left-0 w-32 h-32"
                style={{
                  background: `linear-gradient(135deg, ${awayColors.bg} 0%, ${awayColors.bg} 50%, transparent 50%)`,
                }}
              />
            ) : null;
          })()}
          
          {/* Треугольный акцент справа (хозяева) */}
          {landingData.homeTeam?.abbrev && (() => {
            const homeColors = TEAM_COLORS[landingData.homeTeam.abbrev.toUpperCase()];
            return homeColors ? (
              <div
                className="absolute bottom-0 right-0 w-32 h-32"
                style={{
                  background: `linear-gradient(315deg, ${homeColors.bg} 0%, ${homeColors.bg} 50%, transparent 50%)`,
                }}
              />
            ) : null;
          })()}
          
          <div className="flex items-center justify-center relative z-10 gap-8">
            {/* Гости (слева) */}
            <div className="text-right">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Гости
              </div>
              <div className="text-2xl font-bold text-black dark:text-zinc-50">
                {awayTeamName}
              </div>
            </div>

            {/* Центр с разделителем или счетом */}
            <div className="flex flex-col items-center px-6">
              {(landingData.gameState === "OFF" || landingData.gameState === "FINAL") && 
               landingData.awayTeam?.score !== undefined && 
               landingData.homeTeam?.score !== undefined ? (
                <>
                  {/* Счет для завершенного матча */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl font-bold text-black dark:text-zinc-50">
                      {landingData.awayTeam.score}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500 text-xl">:</span>
                    <span className="text-3xl font-bold text-black dark:text-zinc-50">
                      {landingData.homeTeam.score}
                    </span>
                    {/* OT/SO индикатор */}
                    {(() => {
                      const finishType = landingData.periodDescriptor?.periodType || landingData.summary?.scoring?.[landingData.summary.scoring.length - 1]?.periodDescriptor?.periodType;
                      if (finishType === "OT") {
                        return <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-2">OT</span>;
                      }
                      if (finishType === "SO") {
                        return <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-2">SO</span>;
                      }
                      return null;
                    })()}
                  </div>
                  {/* Разбивка по периодам */}
                  {landingData.summary?.scoring && Array.isArray(landingData.summary.scoring) && (
                    <div className="flex items-center gap-3 mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {landingData.summary.scoring.map((period: any, idx: number) => {
                        const awayGoals = period.goals ? period.goals.filter((g: any) => g.teamAbbrev?.default === landingData.awayTeam?.abbrev).length : 0;
                        const homeGoals = period.goals ? period.goals.filter((g: any) => g.teamAbbrev?.default === landingData.homeTeam?.abbrev).length : 0;
                        const periodType = period.periodDescriptor?.periodType || "REG";
                        const periodNum = period.periodDescriptor?.number || idx + 1;
                        const periodLabel = periodType === "REG" ? `${periodNum}` : periodType === "OT" ? "OT" : "SO";
                        return (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="font-medium">{periodLabel}:</span>
                            <span>{awayGoals}-{homeGoals}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                // Разделитель для незавершенного матча
                <div className="flex items-center gap-2 mb-2">
                  <div className="border-t border-dashed border-zinc-300 dark:border-zinc-700 w-8"></div>
                  <span className="text-zinc-400 dark:text-zinc-500 text-xl">:</span>
                  <div className="border-t border-dashed border-zinc-300 dark:border-zinc-700 w-8"></div>
                </div>
              )}
              <div className="text-center">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  {getGameStatusText()}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {formatDate(landingData.startTimeUTC)} в {formatTime(landingData.startTimeUTC)}
                </div>
              </div>
            </div>

            {/* Хозяева (справа) */}
            <div className="text-left">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Хозяева
              </div>
              <div className="text-2xl font-bold text-black dark:text-zinc-50">
                {homeTeamName}
              </div>
            </div>
          </div>
        </div>

        {/* Статистика команд */}
        {(awayTeamStats || homeTeamStats) && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-2">Team Stats</h2>
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">Regular Season</div>
            
            {/* Логотипы команд */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <TeamIcon teamCode={landingData.awayTeam?.abbrev || ""} size={48} />
                <div className="font-semibold text-black dark:text-zinc-50">
                  {awayTeamName}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-semibold text-black dark:text-zinc-50">
                  {homeTeamName}
                </div>
                <TeamIcon teamCode={landingData.homeTeam?.abbrev || ""} size={48} />
              </div>
            </div>

            {/* Статистика */}
            <div className="space-y-4">
              {/* Power Play % */}
              {awayTeamStats?.powerPlayPct !== undefined && homeTeamStats?.powerPlayPct !== undefined && (
                <div className="space-y-2">
                  <div className="text-sm font-bold text-black dark:text-zinc-50">Power Play %</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        {awayTeamStats.powerPlayPct.toFixed(1)}%
                      </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">27th</span>
                      </div>
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min((awayTeamStats.powerPlayPct / 30) * 100, 100)}%` }}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">8th</span>
                      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        {homeTeamStats.powerPlayPct.toFixed(1)}%
                      </span>
                      </div>
                      <div className="h-2 bg-red-500 rounded ml-auto" style={{ width: `${Math.min((homeTeamStats.powerPlayPct / 30) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Penalty Kill % */}
              {awayTeamStats?.penaltyKillPct !== undefined && homeTeamStats?.penaltyKillPct !== undefined && (
                <div className="space-y-2">
                  <div className="text-sm font-bold text-black dark:text-zinc-50">Penalty Kill %</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        {awayTeamStats.penaltyKillPct.toFixed(1)}%
                      </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">26th</span>
                      </div>
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min((awayTeamStats.penaltyKillPct / 100) * 100, 100)}%` }}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">8th</span>
                      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        {homeTeamStats.penaltyKillPct.toFixed(1)}%
                      </span>
                      </div>
                      <div className="h-2 bg-red-500 rounded ml-auto" style={{ width: `${Math.min((homeTeamStats.penaltyKillPct / 100) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Face-off % */}
              {awayTeamStats?.faceoffWinPct !== undefined && homeTeamStats?.faceoffWinPct !== undefined && (
                <div className="space-y-2">
                  <div className="text-sm font-bold text-black dark:text-zinc-50">Face-off %</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {awayTeamStats.faceoffWinPct.toFixed(1)}%
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">13th</span>
                      </div>
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min((awayTeamStats.faceoffWinPct / 60) * 100, 100)}%` }}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">15th</span>
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {homeTeamStats.faceoffWinPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-red-500 rounded ml-auto" style={{ width: `${Math.min((homeTeamStats.faceoffWinPct / 60) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* GF/GP */}
              {awayTeamStats?.goalsForPerGame !== undefined && homeTeamStats?.goalsForPerGame !== undefined && (
                <div className="space-y-2">
                  <div className="text-sm font-bold text-black dark:text-zinc-50">GF/GP</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {awayTeamStats.goalsForPerGame.toFixed(2)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">26th</span>
                      </div>
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min((awayTeamStats.goalsForPerGame / 4) * 100, 100)}%` }}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">11th</span>
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {homeTeamStats.goalsForPerGame.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-red-500 rounded ml-auto" style={{ width: `${Math.min((homeTeamStats.goalsForPerGame / 4) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* GA/GP */}
              {awayTeamStats?.goalsAgainstPerGame !== undefined && homeTeamStats?.goalsAgainstPerGame !== undefined && (
                <div className="space-y-2">
                  <div className="text-sm font-bold text-black dark:text-zinc-50">GA/GP</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {awayTeamStats.goalsAgainstPerGame.toFixed(2)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">22nd</span>
                      </div>
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min((awayTeamStats.goalsAgainstPerGame / 4) * 100, 100)}%` }}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">15th</span>
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                          {homeTeamStats.goalsAgainstPerGame.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-red-500 rounded ml-auto" style={{ width: `${Math.min((homeTeamStats.goalsAgainstPerGame / 4) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Травмированные игроки */}
        {((awayTeamInjuries?.injuredPlayers && awayTeamInjuries.injuredPlayers.length > 0) || 
          (homeTeamInjuries?.injuredPlayers && homeTeamInjuries.injuredPlayers.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Травмированные гости */}
            {awayTeamInjuries?.injuredPlayers && awayTeamInjuries.injuredPlayers.length > 0 && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  {awayTeamName} - Травмированные
                </h2>
                <div className="space-y-3">
                  {awayTeamInjuries.injuredPlayers.map((player: any) => (
                    <div key={player.id} className="border-b border-zinc-200 dark:border-zinc-800 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-black dark:text-zinc-50">
                            {player.fullName}
                          </div>
                          {player.position && (
                            <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                              {player.position}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                            {player.status.code}
                          </div>
                          {player.status.description && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                              {player.status.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Травмированные хозяева */}
            {homeTeamInjuries?.injuredPlayers && homeTeamInjuries.injuredPlayers.length > 0 && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                  {homeTeamName} - Травмированные
                </h2>
                <div className="space-y-3">
                  {homeTeamInjuries.injuredPlayers.map((player: any) => (
                    <div key={player.id} className="border-b border-zinc-200 dark:border-zinc-800 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-black dark:text-zinc-50">
                            {player.fullName}
                          </div>
                          {player.position && (
                            <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                              {player.position}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                            {player.status.code}
                          </div>
                          {player.status.description && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                              {player.status.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Турнирная таблица команд */}
        {(awayTeamStandings || homeTeamStandings) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Статистика гостей */}
            {awayTeamStandings && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-3">
                  {awayTeamName}
                </h2>
                <div className="space-y-2">
                  {/* Названия столбцов */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-zinc-600 dark:text-zinc-400 w-[45px] text-center">Конф.</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[40px] text-center">Место</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">И</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">В</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">П</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[40px] text-center">ОТ/Б</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[45px] text-center">Забито</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[55px] text-center">Пропущено</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[30px] text-center">±</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">О</div>
                  </div>
                  {/* Значения */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="font-semibold text-black dark:text-zinc-50 w-[45px] text-center">
                      {awayTeamStandings.conference || "—"}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[40px] text-center">
                      {awayTeamStandings.place || "—"}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {awayTeamStandings.gamesPlayed || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {awayTeamStandings.wins || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {awayTeamStandings.losses || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[40px] text-center">
                      {(awayTeamStandings.otWins || 0) + (awayTeamStandings.shootoutWins || 0)}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[45px] text-center">
                      {awayTeamStandings.goalsFor || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[55px] text-center">
                      {awayTeamStandings.goalsAgainst || 0}
                    </div>
                    <div className={`font-semibold w-[30px] text-center ${(awayTeamStandings.goalDiff || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {awayTeamStandings.goalDiff >= 0 ? "+" : ""}{awayTeamStandings.goalDiff || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {awayTeamStandings.points || 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Статистика хозяев */}
            {homeTeamStandings && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-3">
                  {homeTeamName}
                </h2>
                <div className="space-y-2">
                  {/* Названия столбцов */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-zinc-600 dark:text-zinc-400 w-[45px] text-center">Конф.</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[40px] text-center">Место</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">И</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">В</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">П</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[40px] text-center">ОТ/Б</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[45px] text-center">Забито</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[55px] text-center">Пропущено</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[30px] text-center">±</div>
                    <div className="text-zinc-600 dark:text-zinc-400 w-[25px] text-center">О</div>
                  </div>
                  {/* Значения */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="font-semibold text-black dark:text-zinc-50 w-[45px] text-center">
                      {homeTeamStandings.conference || "—"}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[40px] text-center">
                      {homeTeamStandings.place || "—"}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {homeTeamStandings.gamesPlayed || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {homeTeamStandings.wins || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {homeTeamStandings.losses || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[40px] text-center">
                      {(homeTeamStandings.otWins || 0) + (homeTeamStandings.shootoutWins || 0)}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[45px] text-center">
                      {homeTeamStandings.goalsFor || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[55px] text-center">
                      {homeTeamStandings.goalsAgainst || 0}
                    </div>
                    <div className={`font-semibold w-[30px] text-center ${(homeTeamStandings.goalDiff || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {homeTeamStandings.goalDiff >= 0 ? "+" : ""}{homeTeamStandings.goalDiff || 0}
                    </div>
                    <div className="font-semibold text-black dark:text-zinc-50 w-[25px] text-center">
                      {homeTeamStandings.points || 0}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Статистика игры (если есть) */}
        {landingData.summary && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
              События игры
            </h2>
            {landingData.summary.scoring && landingData.summary.scoring.length > 0 ? (
              <div className="space-y-4">
                {landingData.summary.scoring.map((period: any, periodIdx: number) => (
                  <div key={periodIdx} className="border-b border-zinc-200 dark:border-zinc-800 pb-4 last:border-0 last:pb-0">
                    <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                      {(() => {
                        const periodLabel = period.periodDescriptor.periodType === "REG" 
                          ? `${period.periodDescriptor.number} период`
                          : period.periodDescriptor.periodType === "OT"
                          ? "Овертайм"
                          : "Буллиты";
                        
                        // Подсчитываем счет периода
                        let awayPeriodScore = 0;
                        let homePeriodScore = 0;
                        if (period.goals) {
                          period.goals.forEach((g: any) => {
                            if (g.teamAbbrev?.default === landingData.awayTeam?.abbrev) {
                              awayPeriodScore++;
                            } else if (g.teamAbbrev?.default === landingData.homeTeam?.abbrev) {
                              homePeriodScore++;
                            }
                          });
                        }
                        
                        return `${periodLabel} (${awayPeriodScore}-${homePeriodScore})`;
                      })()}
                    </div>
                    {period.goals && period.goals.length > 0 ? (
                      <div className="space-y-2">
                        {period.goals.map((goal: any, goalIdx: number) => {
                          // Определяем команду, забившую гол
                          const isAwayGoal = goal.teamAbbrev?.default === landingData.awayTeam?.abbrev;
                          const teamAbbrev = goal.teamAbbrev?.default || "";
                          
                          // Подсчитываем текущий счет после этого гола
                          // Сначала считаем голы из всех предыдущих периодов
                          let awayScore = 0;
                          let homeScore = 0;
                          
                          // Голы из предыдущих периодов
                          for (let pIdx = 0; pIdx < periodIdx; pIdx++) {
                            const prevPeriod = landingData.summary.scoring[pIdx];
                            if (prevPeriod.goals) {
                              prevPeriod.goals.forEach((g: any) => {
                                if (g.teamAbbrev?.default === landingData.awayTeam?.abbrev) {
                                  awayScore++;
                                } else if (g.teamAbbrev?.default === landingData.homeTeam?.abbrev) {
                                  homeScore++;
                                }
                              });
                            }
                          }
                          
                          // Голы из текущего периода до этого гола (включая текущий)
                          for (let i = 0; i <= goalIdx; i++) {
                            const g = period.goals[i];
                            if (g.teamAbbrev?.default === landingData.awayTeam?.abbrev) {
                              awayScore++;
                            } else if (g.teamAbbrev?.default === landingData.homeTeam?.abbrev) {
                              homeScore++;
                            }
                          }
                          
                          // Определяем тип гола (PPG или SHG)
                          // Проверяем различные возможные поля для определения силовой игры
                          // В NHL API поле может называться strength, strengthCode, situationCode или strengthAbbrev
                          const strength = goal.strength || goal.strengthCode || goal.situationCode || goal.strengthAbbrev || "";
                          const strengthStr = String(strength).toUpperCase();
                          
                          // Проверяем на PPG (Power Play Goal)
                          const isPPG = strengthStr === "PPG" || 
                                       strengthStr === "PP" || 
                                       strengthStr.includes("PP") || 
                                       strengthStr === "POWER PLAY" ||
                                       strengthStr === "POWERPLAY";
                          
                          // Проверяем на SHG (Short Handed Goal)
                          const isSHG = strengthStr === "SHG" || 
                                       strengthStr === "SH" || 
                                       strengthStr.includes("SH") || 
                                       strengthStr === "SHORT HANDED" ||
                                       strengthStr === "SHORTHANDED";
                          
                          // Логирование для отладки
                          console.log("Goal data:", {
                            goal: goal,
                            strength: goal.strength,
                            strengthCode: goal.strengthCode,
                            situationCode: goal.situationCode,
                            strengthAbbrev: goal.strengthAbbrev,
                            allFields: Object.keys(goal),
                            strengthStr,
                            isPPG,
                            isSHG,
                          });
                          
                          return (
                            <div key={goalIdx} className="flex items-center gap-4 text-sm">
                              {/* Лого команды */}
                              <TeamIcon teamCode={teamAbbrev} size={28} />
                              
                              {/* Изменение счета */}
                              <span className="font-semibold text-black dark:text-zinc-50 min-w-[50px] ml-2">
                                {awayScore}-{homeScore}
                              </span>
                              
                              {/* Время */}
                              <span className="text-zinc-500 dark:text-zinc-400 min-w-[60px]">
                                {goal.timeInPeriod || "—"}
                              </span>
                              
                              {/* Автор гола */}
                              <span className="font-medium text-black dark:text-zinc-50">
                                {goal.name?.default || "Игрок"}
                              </span>
                              
                              {/* Метка PPG или SHG */}
                              {(isPPG || isSHG) && (
                                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                                  {isPPG ? "PPG" : "SHG"}
                                </span>
                              )}
                              
                              {/* Ассистенты */}
                              {goal.assists && goal.assists.length > 0 && (
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  ({goal.assists.map((a: any) => a.name?.default || "").join(", ")})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        Голов не было
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                События игры пока недоступны
              </div>
            )}
          </div>
        )}

        {/* Последние матчи команд */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-full">
          {/* Последние матчи гостей */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 w-full">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
              Последние 5 матчей: {awayTeamName}
            </h2>
            {awayTeamGames?.games && awayTeamGames.games.length > 0 ? (
              <div>
                {/* Заголовки столбцов */}
                <div className="grid grid-cols-[80px_2fr_80px_70px_40px_40px] items-center gap-4 py-1 px-0 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-t">
                  <span className="text-center">Дата</span>
                  <span className="text-left">Соперник</span>
                  <span className="text-center">Home/Away</span>
                  <span className="text-center">Счет</span>
                  <span className="text-center">OT/SO</span>
                  <span className="text-center">W/L</span>
                </div>
                {awayTeamGames.games.map((game: any) => {
                  const opponentName = formatTeamName(game.opponent);
                  return (
                    <div
                      key={game.gamePk}
                      className={`grid grid-cols-[80px_2fr_80px_70px_40px_40px] items-center gap-4 py-1 px-0 text-sm relative w-full ${
                        game.won
                          ? "bg-green-100 dark:bg-green-900"
                          : game.lost
                          ? "bg-red-100 dark:bg-red-900"
                          : ""
                      }`}
                    >
                      {/* Дата */}
                      <span className="whitespace-nowrap text-center text-black">
                        {formatShortDate(game.date)}
                      </span>
                      {/* Соперник */}
                      <div className="font-bold text-black dark:text-zinc-50 text-left min-w-0">
                        <span className="whitespace-normal break-words">{opponentName}</span>
                      </div>
                      {/* Дома/В гостях */}
                      <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-center">
                        {game.isHome ? "Home" : "Away"}
                      </span>
                      {/* Счет */}
                      <span className="font-semibold text-black dark:text-zinc-50 whitespace-nowrap text-center">
                        {game.teamScore ?? "—"} : {game.opponentScore ?? "—"}
                      </span>
                      {/* OT/SO */}
                      <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-center">
                        {game.isOT ? "OT" : game.isSO ? "SO" : ""}
                      </span>
                      {/* Результат W/L */}
                      <span className="font-bold whitespace-nowrap text-center text-black dark:text-zinc-50">
                        {game.won ? "W" : game.lost ? "L" : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Данные о матчах загружаются...
              </div>
            )}
          </div>

          {/* Последние матчи хозяев */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 w-full">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
              Последние 5 матчей: {homeTeamName}
            </h2>
            {homeTeamGames?.games && homeTeamGames.games.length > 0 ? (
              <div>
                {/* Заголовки столбцов */}
                <div className="grid grid-cols-[80px_2fr_80px_70px_40px_40px] items-center gap-4 py-1 px-0 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-t">
                  <span className="text-center">Дата</span>
                  <span className="text-left">Соперник</span>
                  <span className="text-center">Home/Away</span>
                  <span className="text-center">Счет</span>
                  <span className="text-center">OT/SO</span>
                  <span className="text-center">W/L</span>
                </div>
                {homeTeamGames.games.map((game: any) => {
                  const opponentName = formatTeamName(game.opponent);
                  return (
                    <div
                      key={game.gamePk}
                      className={`grid grid-cols-[80px_2fr_80px_70px_40px_40px] items-center gap-4 py-1 px-0 text-sm relative w-full ${
                        game.won
                          ? "bg-green-100 dark:bg-green-900"
                          : game.lost
                          ? "bg-red-100 dark:bg-red-900"
                          : ""
                      }`}
                    >
                      {/* Дата */}
                      <span className="whitespace-nowrap text-center text-black">
                        {formatShortDate(game.date)}
                      </span>
                      {/* Соперник */}
                      <div className="font-bold text-black dark:text-zinc-50 text-left min-w-0">
                        <span className="whitespace-normal break-words">{opponentName}</span>
                      </div>
                      {/* Дома/В гостях */}
                      <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-center">
                        {game.isHome ? "Home" : "Away"}
                      </span>
                      {/* Счет */}
                      <span className="font-semibold text-black dark:text-zinc-50 whitespace-nowrap text-center">
                        {game.teamScore ?? "—"} : {game.opponentScore ?? "—"}
                      </span>
                      {/* OT/SO */}
                      <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-center">
                        {game.isOT ? "OT" : game.isSO ? "SO" : ""}
                      </span>
                      {/* Результат W/L */}
                      <span className="font-bold whitespace-nowrap text-center text-black dark:text-zinc-50">
                        {game.won ? "W" : game.lost ? "L" : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Данные о матчах загружаются...
              </div>
            )}
          </div>
        </div>

        {/* Polymarket информация (только для открытых матчей) */}
        {polymarketEventSlug && isMatchOpen && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            {/* Заголовок */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Polymarket
              </h2>
              {polymarketLoading && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Загрузка...</span>
              )}
              {polymarketError && (
                <span className="text-xs text-red-500">Ошибка загрузки</span>
              )}
            </div>

            {polymarketMarket ? (
              <>
                {/* Дата и время */}
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                  {formatDate(landingData.startTimeUTC)} в {formatTime(landingData.startTimeUTC)}
                </div>

                {/* Бар-граф с вероятностями */}
                {polymarketMarket.awayProbability !== undefined && polymarketMarket.homeProbability !== undefined && (
                  <div className="mb-4">
                    <div className="flex h-8 rounded overflow-hidden mb-2">
                      <div
                        className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                        style={{ width: `${(polymarketMarket.awayProbability * 100).toFixed(0)}%` }}
                      >
                        {(polymarketMarket.awayProbability * 100).toFixed(0)}%
                      </div>
                      <div
                        className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                        style={{ width: `${(polymarketMarket.homeProbability * 100).toFixed(0)}%` }}
                      >
                        {(polymarketMarket.homeProbability * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>
                        {polymarketMarket.volume ? `$${(polymarketMarket.volume / 1000).toFixed(2)}k Vol.` : "—"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Polymarket</span>
                        {polymarketMarket.marketType && (
                          <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            {polymarketMarket.marketType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Блоки команд */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Гости */}
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <TeamIcon teamCode={landingData.awayTeam?.abbrev || ""} size={40} />
                      <div className="flex-1">
                        <div className="font-semibold text-black dark:text-zinc-50 text-sm">
                          {awayTeamName}
                        </div>
                        {polymarketMarket.awayRecord && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {polymarketMarket.awayRecord}
                          </div>
                        )}
                      </div>
                    </div>
                    {polymarketMarket.awayPrice !== undefined && (
                      <button className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors">
                        {landingData.awayTeam?.abbrev || "AWAY"} {Math.round(polymarketMarket.awayPrice * 100)}¢
                      </button>
                    )}
                  </div>

                  {/* Хозяева */}
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <TeamIcon teamCode={landingData.homeTeam?.abbrev || ""} size={40} />
                      <div className="flex-1">
                        <div className="font-semibold text-black dark:text-zinc-50 text-sm">
                          {homeTeamName}
                        </div>
                        {polymarketMarket.homeRecord && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {polymarketMarket.homeRecord}
                          </div>
                        )}
                      </div>
                    </div>
                    {polymarketMarket.homePrice !== undefined && (
                      <button className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors">
                        {landingData.homeTeam?.abbrev || "HOME"} {Math.round(polymarketMarket.homePrice * 100)}¢
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : !polymarketLoading && !polymarketError ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Рынок не найден для {polymarketEventSlug}
              </div>
            ) : null}
          </div>
        )}
        
        {/* Отладочная информация (только в development) */}
        {process.env.NODE_ENV === "development" && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-xs">
            <div>eventSlug: {polymarketEventSlug || "—"}</div>
            <div>loading: {polymarketLoading ? "true" : "false"}</div>
            <div>error: {polymarketError ? polymarketError.message : "—"}</div>
            <div>market: {polymarketMarket ? "loaded" : "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
