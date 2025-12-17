// Маппинг команд NHL к их часовым поясам (для определения местного времени матча)
// Используется для нормализации времени матча по местному времени проведения
export const NHL_TEAM_TIMEZONE_MAP: Record<string, string> = {
  "Edmonton Oilers": "America/Edmonton", // MST/MDT
  "Washington Capitals": "America/New_York", // EST/EDT
  "Calgary Flames": "America/Edmonton", // MST/MDT
  "Buffalo Sabres": "America/New_York", // EST/EDT
  "Carolina Hurricanes": "America/New_York", // EST/EDT
  "Minnesota Wild": "America/Chicago", // CST/CDT
  "Boston Bruins": "America/New_York", // EST/EDT
  "Anaheim Ducks": "America/Los_Angeles", // PST/PDT
  "Montréal Canadiens": "America/Toronto", // EST/EDT
  "Ottawa Senators": "America/Toronto", // EST/EDT
  "Los Angeles Kings": "America/Los_Angeles", // PST/PDT
  "Dallas Stars": "America/Chicago", // CST/CDT
  "Utah Mammoth": "America/Denver", // MST/MDT
  "Florida Panthers": "America/New_York", // EST/EDT
  "Tampa Bay Lightning": "America/New_York", // EST/EDT
  "New Jersey Devils": "America/New_York", // EST/EDT
  "Winnipeg Jets": "America/Winnipeg", // CST/CDT
  "Chicago Blackhawks": "America/Chicago", // CST/CDT
  "St. Louis Blues": "America/Chicago", // CST/CDT
  "Detroit Red Wings": "America/Detroit", // EST/EDT
  "Colorado Avalanche": "America/Denver", // MST/MDT
  "San Jose Sharks": "America/Los_Angeles", // PST/PDT
  "Vegas Golden Knights": "America/Los_Angeles", // PST/PDT
  "Toronto Maple Leafs": "America/Toronto", // EST/EDT
  "Vancouver Canucks": "America/Vancouver", // PST/PDT
  "New York Islanders": "America/New_York", // EST/EDT
  "Columbus Blue Jackets": "America/New_York", // EST/EDT
  "Philadelphia Flyers": "America/New_York", // EST/EDT
  "Seattle Kraken": "America/Los_Angeles", // PST/PDT
  "Nashville Predators": "America/Chicago", // CST/CDT
  "Pittsburgh Penguins": "America/New_York", // EST/EDT
  "New York Rangers": "America/New_York", // EST/EDT
};

// Функция для получения часового пояса команды
export function getTeamTimezone(teamName: string): string | null {
  // Прямое совпадение
  if (NHL_TEAM_TIMEZONE_MAP[teamName]) {
    return NHL_TEAM_TIMEZONE_MAP[teamName];
  }
  
  // Поиск по частичному совпадению
  const lowerTeamName = teamName.toLowerCase().trim();
  for (const [fullName, timezone] of Object.entries(NHL_TEAM_TIMEZONE_MAP)) {
    const lowerFullName = fullName.toLowerCase();
    if (lowerFullName.includes(lowerTeamName) || lowerTeamName.includes(lowerFullName.split(" ").pop() || "")) {
      return timezone;
    }
  }
  
  return null;
}

// Функция для преобразования UTC времени в местное время команды
export function convertToTeamLocalTime(utcTime: string | Date, teamName: string): Date | null {
  const timezone = getTeamTimezone(teamName);
  if (!timezone) {
    return null;
  }
  
  const utcDate = typeof utcTime === "string" ? new Date(utcTime) : utcTime;
  if (isNaN(utcDate.getTime())) {
    return null;
  }
  
  // Используем Intl API для преобразования в местное время
  // Форматируем дату в формате для указанного часового пояса
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(utcDate);
  const year = parseInt(parts.find(p => p.type === "year")?.value || "0");
  const month = parseInt(parts.find(p => p.type === "month")?.value || "0") - 1;
  const day = parseInt(parts.find(p => p.type === "day")?.value || "0");
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const second = parseInt(parts.find(p => p.type === "second")?.value || "0");
  
  // Создаем новую дату в локальном времени системы, но с компонентами из нужного часового пояса
  // Это даст нам правильную дату в местном времени команды
  // Важно: это создаст дату в локальном времени системы, но с компонентами из нужного часового пояса
  return new Date(year, month, day, hour, minute, second);
}

// Функция для получения даты в формате YYYY-MM-DD из местного времени команды
export function getLocalDateString(utcTime: string | Date, teamName: string): string | null {
  const timezone = getTeamTimezone(teamName);
  if (!timezone) {
    return null;
  }
  
  const utcDate = typeof utcTime === "string" ? new Date(utcTime) : utcTime;
  if (isNaN(utcDate.getTime())) {
    return null;
  }
  
  // Используем Intl API для форматирования даты в нужном часовом поясе
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // en-CA формат возвращает YYYY-MM-DD
  return formatter.format(utcDate);
}

// Функция для получения даты в формате YYYY-MM-DD в Eastern Standard Time (EST/EDT)
// Используется для единообразного отображения дат матчей в расписании и полимаркете
export function getESTDateString(utcTime: string | Date): string | null {
  const utcDate = typeof utcTime === "string" ? new Date(utcTime) : utcTime;
  if (isNaN(utcDate.getTime())) {
    return null;
  }
  
  // Используем Intl API для форматирования даты в EST/EDT
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // en-CA формат возвращает YYYY-MM-DD
  return formatter.format(utcDate);
}

