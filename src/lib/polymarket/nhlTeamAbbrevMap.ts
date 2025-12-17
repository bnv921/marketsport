// Маппинг названий команд NHL к сокращениям, используемым в Polymarket eventSlug
// Формат: nhl-team1-team2-yyyy-mm-dd
export const NHL_POLYMARKET_ABBREV_MAP: Record<string, string> = {
  "Edmonton Oilers": "edm",
  "Washington Capitals": "wsh",
  "Calgary Flames": "cal",
  "Buffalo Sabres": "buf",
  "Carolina Hurricanes": "car",
  "Minnesota Wild": "min",
  "Boston Bruins": "bos",
  "Anaheim Ducks": "ana",
  "Montréal Canadiens": "mon",
  "Ottawa Senators": "ott",
  "Los Angeles Kings": "lak",
  "Dallas Stars": "dal",
  "Utah Mammoth": "utah",
  "Florida Panthers": "fla",
  "Tampa Bay Lightning": "tb",
  "New Jersey Devils": "nj",
  "Winnipeg Jets": "wpg",
  "Chicago Blackhawks": "chi",
  "St. Louis Blues": "stl",
  "Detroit Red Wings": "det",
  "Colorado Avalanche": "col",
  "San Jose Sharks": "sj",
  "Vegas Golden Knights": "las",
  "Toronto Maple Leafs": "tor",
  "Vancouver Canucks": "van",
  "New York Islanders": "nyi",
  "Columbus Blue Jackets": "cbj",
  "Philadelphia Flyers": "phi",
  "Seattle Kraken": "sea",
  "Nashville Predators": "nsh",
  "Pittsburgh Penguins": "pit",
  "New York Rangers": "nyr",
};

// Альтернативные названия команд (для поиска)
const ALTERNATIVE_NAMES: Record<string, string> = {
  "Montreal Canadiens": "Montréal Canadiens", // Без ударения
  "Montreal": "Montréal Canadiens",
  "Canadiens": "Montréal Canadiens",
  "Vegas": "Vegas Golden Knights",
  "Golden Knights": "Vegas Golden Knights",
  "San Jose": "San Jose Sharks",
  "Sharks": "San Jose Sharks",
  "Los Angeles": "Los Angeles Kings",
  "Kings": "Los Angeles Kings",
  "New York Islanders": "New York Islanders",
  "Islanders": "New York Islanders",
  "New York Rangers": "New York Rangers",
  "Rangers": "New York Rangers",
  "New York": "New York Rangers", // По умолчанию Rangers, если не указано
  "St. Louis": "St. Louis Blues",
  "St Louis": "St. Louis Blues",
  "Blues": "St. Louis Blues",
  "Tampa Bay": "Tampa Bay Lightning",
  "Lightning": "Tampa Bay Lightning",
  "New Jersey": "New Jersey Devils",
  "Devils": "New Jersey Devils",
  "Columbus": "Columbus Blue Jackets",
  "Blue Jackets": "Columbus Blue Jackets",
  "Carolina": "Carolina Hurricanes",
  "Hurricanes": "Carolina Hurricanes",
};

// Функция для получения сокращения команды для Polymarket
export function getPolymarketTeamAbbrev(teamName: string): string | null {
  if (!teamName) return null;
  
  const trimmedName = teamName.trim();
  
  // Прямое совпадение
  if (NHL_POLYMARKET_ABBREV_MAP[trimmedName]) {
    return NHL_POLYMARKET_ABBREV_MAP[trimmedName];
  }
  
  // Проверяем альтернативные названия
  const normalizedName = ALTERNATIVE_NAMES[trimmedName];
  if (normalizedName && NHL_POLYMARKET_ABBREV_MAP[normalizedName]) {
    return NHL_POLYMARKET_ABBREV_MAP[normalizedName];
  }
  
  // Поиск по частичному совпадению (на случай разных форматов названий)
  const lowerTeamName = trimmedName.toLowerCase();
  
  // Сначала проверяем точное совпадение с ключами в нижнем регистре
  for (const [fullName, abbrev] of Object.entries(NHL_POLYMARKET_ABBREV_MAP)) {
    if (fullName.toLowerCase() === lowerTeamName) {
      return abbrev;
    }
  }
  
  // Затем проверяем, содержит ли полное название команды ключевые слова из входящего названия
  // или наоборот
  for (const [fullName, abbrev] of Object.entries(NHL_POLYMARKET_ABBREV_MAP)) {
    const lowerFullName = fullName.toLowerCase();
    const fullNameWords = lowerFullName.split(" ");
    const teamNameWords = lowerTeamName.split(" ");
    
    // Проверяем, совпадают ли ключевые слова (последнее слово обычно уникально)
    const lastWord = fullNameWords[fullNameWords.length - 1];
    if (teamNameWords.includes(lastWord) || lowerTeamName.includes(lastWord)) {
      return abbrev;
    }
    
    // Проверяем, содержит ли полное название входящее название или наоборот
    if (lowerFullName.includes(lowerTeamName) || lowerTeamName.includes(lowerFullName)) {
      return abbrev;
    }
  }
  
  return null;
}

// Функция для формирования eventSlug в формате nhl-team1-team2-yyyy-mm-dd
// gameDate должен быть в UTC (Polymarket использует UTC для даты)
export function buildPolymarketEventSlug(
  homeTeam: string,
  awayTeam: string,
  gameDate: Date | string
): string | null {
  const homeAbbrev = getPolymarketTeamAbbrev(homeTeam);
  const awayAbbrev = getPolymarketTeamAbbrev(awayTeam);
  
  if (!homeAbbrev || !awayAbbrev) {
    return null;
  }
  
  // Форматируем дату в yyyy-mm-dd в UTC (Polymarket использует UTC)
  let dateStr: string;
  if (typeof gameDate === "string") {
    // Если это строка формата yyyy-mm-dd, используем её напрямую
    const dateMatch = gameDate.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      dateStr = dateMatch[1];
    } else {
      // Пытаемся распарсить как ISO строку и извлечь UTC дату
      const date = new Date(gameDate);
      if (isNaN(date.getTime())) {
        return null;
      }
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      dateStr = `${year}-${month}-${day}`;
    }
  } else {
    // Используем UTC дату
    const year = gameDate.getUTCFullYear();
    const month = String(gameDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(gameDate.getUTCDate()).padStart(2, "0");
    dateStr = `${year}-${month}-${day}`;
  }
  
  // Формируем eventSlug: nhl-team1-team2-yyyy-mm-dd
  // Порядок команд: away-home (away идет первым)
  const eventSlug = `nhl-${awayAbbrev}-${homeAbbrev}-${dateStr}`;
  
  // Логирование для отладки
  console.log(`[buildPolymarketEventSlug] homeTeam: "${homeTeam}" -> "${homeAbbrev}", awayTeam: "${awayTeam}" -> "${awayAbbrev}", date: ${dateStr}, eventSlug: ${eventSlug}`);
  
  return eventSlug;
}

