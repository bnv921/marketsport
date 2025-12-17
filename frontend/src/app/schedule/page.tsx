"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TeamIcon from "@/components/TeamIcon";

interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  detailedState: string;
  venue: string;
  city: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamAbbrev: string;
  homeTeamAbbrev: string;
  awayScore: number | null;
  homeScore: number | null;
  finishType: "OT" | "SO" | null;
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTeamName(team?: any) {
  const place = team?.placeName?.default ?? "";
  const name = team?.commonName?.default ?? "";
  const combined = [place, name].filter(Boolean).join(" ").trim();
  return combined || team?.name?.default || team?.abbrev || "Команда";
}

export default function SchedulePage() {
  const [date, setDate] = useState<string>(formatISODate(new Date()));
  const [games, setGames] = useState<ScheduleGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  function mapGameState(state?: string) {
    switch (state) {
      case "FUT":
        return "Запланирован";
      case "LIVE":
        return "Идёт";
      case "CRIT":
        return "Овертайм";
      case "FINAL":
      case "OFF":
        return "Завершён";
      default:
        return state ?? "Неизвестно";
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/nhl/schedule/date?date=${date}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to load schedule");
        }
        if (cancelled) return;
        const payload = await res.json();
        const mapped: ScheduleGame[] = (payload?.games ?? []).map((game: any) => {
          const rawFinish =
            (game.gameOutcome?.lastPeriodType ?? game.periodDescriptor?.periodType ?? "").toUpperCase();
          const finishType = rawFinish === "SO" ? "SO" : rawFinish.startsWith("OT") ? "OT" : null;
          
          // Извлекаем город из homeTeam.placeName или venue
          const city = game.homeTeam?.placeName?.default ?? 
                       (game.venue?.default?.split(",")?.[0]?.trim()) ?? 
                       "—";
          const venue = game.venue?.default ?? "—";
          
          return {
            gamePk: game.id,
            gameDate: game.startTimeUTC ?? game.gameDate,
            detailedState: mapGameState(game.gameState),
            venue,
            city,
            awayTeam: formatTeamName(game.awayTeam),
            homeTeam: formatTeamName(game.homeTeam),
            awayTeamAbbrev: game.awayTeam?.abbrev ?? "",
            homeTeamAbbrev: game.homeTeam?.abbrev ?? "",
            awayScore: typeof game.awayTeam?.score === "number" ? game.awayTeam.score : null,
            homeScore: typeof game.homeTeam?.score === "number" ? game.homeTeam.score : null,
            finishType,
          };
        });
        setGames(mapped);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load schedule");
          setGames([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const prettyDate = useMemo(() => {
    const selected = new Date(date + "T00:00:00");
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (formatISODate(selected) === formatISODate(today)) return "Сегодня";
    if (formatISODate(selected) === formatISODate(tomorrow)) return "Завтра";
    if (formatISODate(selected) === formatISODate(yesterday)) return "Вчера";
    return selected.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  }, [date]);

  const formatTime = (iso?: string) => {
    if (!iso) return "—";
    const date = new Date(iso);
    // Форматируем время в Eastern Standard Time (EST/EDT)
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black dark:text-zinc-50">Расписание НХЛ</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Матчи на дату: {prettyDate} ({date})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => {
                const d = new Date(date + "T00:00:00");
                d.setDate(d.getDate() - 1);
                setDate(formatISODate(d));
              }}
            >
              Предыдущий день
            </button>
            <button
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => {
                const d = new Date(date + "T00:00:00");
                d.setDate(d.getDate() + 1);
                setDate(formatISODate(d));
              }}
            >
              Следующий день
            </button>
          </div>
        </header>

        {loading && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-600 dark:text-zinc-400">
            Загрузка расписания...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 p-6 text-sm">
            Ошибка: {error}
          </div>
        )}

        {!loading && !error && games.length === 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-600 dark:text-zinc-400">
            Нет матчей в этот день
          </div>
        )}

        {!loading && !error && games.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    Время
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    Матч
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                    Место проведения
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                {games.map((game) => (
                  <tr key={game.gamePk} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <td className="px-4 py-3 text-sm text-black dark:text-zinc-50 whitespace-nowrap">
                      {formatTime(game.gameDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/match/${game.gamePk}`}
                        className="flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50 hover:underline"
                      >
                        <TeamIcon teamCode={game.awayTeamAbbrev} size={24} />
                        <span>{game.awayTeam}</span>
                        <span className="text-zinc-400">@</span>
                        <TeamIcon teamCode={game.homeTeamAbbrev} size={24} />
                        <span>{game.homeTeam}</span>
                      </Link>
                      {game.awayScore !== null && game.homeScore !== null && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                          <span>
                            {game.awayScore} : {game.homeScore}
                          </span>
                          {game.finishType && (
                            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{game.finishType}</span>
                          )}
                        </span>
                      )}
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{game.detailedState}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-base font-semibold text-black dark:text-zinc-50">{game.city}</span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">{game.venue}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
