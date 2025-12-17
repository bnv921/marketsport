'use client';

import { useState } from 'react';

// Расширенный тип для всех NHL API endpoints
type ApiEndpoint = 
  // Game Information (api-web.nhle.com)
  | 'game/landing'
  | 'game/boxscore'
  | 'game/play-by-play'
  | 'game/story'
  // Schedule (api-web.nhle.com)
  | 'schedule/date'
  | 'schedule/now'
  | 'schedule/calendar'
  // Scores (api-web.nhle.com)
  | 'scores/now'
  | 'scores/date'
  // Team Information (api-web.nhle.com)
  | 'team/games'
  | 'team/injuries'
  | 'team/standings'
  | 'team/stats'
  | 'team/roster'
  | 'team/prospects'
  | 'team/schedule'
  // Standings (api-web.nhle.com)
  | 'standings/now'
  | 'standings/date'
  | 'standings/season'
  // Stats API (api.nhle.com/stats/rest)
  | 'stats/rest/player/skaters'
  | 'stats/rest/player/goalies'
  | 'stats/rest/team/list'
  | 'stats/rest/team/id'
  | 'stats/rest/team/stats'
  | 'stats/rest/season/list'
  | 'stats/rest/franchise/list'
  | 'stats/rest/shiftcharts';

interface EndpointConfig {
  label: string;
  requiredParams: string[];
  optionalParams?: string[];
  description: string;
  category: string;
}

export default function TestAPINHL() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>('game/landing');
  const [params, setParams] = useState<Record<string, string>>({
    gamePk: '',
    date: '',
    teamId: '',
    season: '',
    limit: '10',
    gameId: '',
    report: '',
    cayenneExp: '',
    sort: '',
    dir: '',
    start: '',
    lang: 'en',
  });
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>('');

  const endpointConfig: Record<ApiEndpoint, EndpointConfig> = {
    // Game Information
    'game/landing': {
      label: 'Game Landing',
      requiredParams: ['gamePk'],
      description: 'Get game landing page data by gamePk',
      category: 'Game Information',
    },
    'game/boxscore': {
      label: 'Game Boxscore',
      requiredParams: ['gamePk'],
      description: 'Get boxscore for a game',
      category: 'Game Information',
    },
    'game/play-by-play': {
      label: 'Game Play-by-Play',
      requiredParams: ['gamePk'],
      description: 'Get play-by-play data for a game',
      category: 'Game Information',
    },
    'game/story': {
      label: 'Game Story',
      requiredParams: ['gamePk'],
      description: 'Get game story/article',
      category: 'Game Information',
    },
    // Schedule
    'schedule/date': {
      label: 'Schedule by Date',
      requiredParams: ['date'],
      description: 'Get schedule for a specific date (YYYY-MM-DD)',
      category: 'Schedule',
    },
    'schedule/now': {
      label: 'Current Schedule',
      requiredParams: [],
      description: 'Get current schedule',
      category: 'Schedule',
    },
    'schedule/calendar': {
      label: 'Schedule Calendar',
      requiredParams: [],
      optionalParams: ['date'],
      description: 'Get schedule calendar (optionally for a specific date)',
      category: 'Schedule',
    },
    // Scores
    'scores/now': {
      label: 'Current Scores',
      requiredParams: [],
      description: 'Get current scores',
      category: 'Scores',
    },
    'scores/date': {
      label: 'Scores by Date',
      requiredParams: ['date'],
      description: 'Get scores for a specific date (YYYY-MM-DD)',
      category: 'Scores',
    },
    // Team Information
    'team/games': {
      label: 'Team Games',
      requiredParams: ['teamId'],
      optionalParams: ['limit'],
      description: 'Get recent games for a team',
      category: 'Team Information',
    },
    'team/injuries': {
      label: 'Team Injuries',
      requiredParams: ['teamId'],
      description: 'Get injury report for a team',
      category: 'Team Information',
    },
    'team/standings': {
      label: 'Team Standings',
      requiredParams: ['teamId'],
      description: 'Get standings for a team',
      category: 'Team Information',
    },
    'team/stats': {
      label: 'Team Stats',
      requiredParams: ['teamId'],
      description: 'Get statistics for a team',
      category: 'Team Information',
    },
    'team/roster': {
      label: 'Team Roster',
      requiredParams: ['teamId'],
      optionalParams: ['season'],
      description: 'Get team roster (optionally for a specific season)',
      category: 'Team Information',
    },
    'team/prospects': {
      label: 'Team Prospects',
      requiredParams: ['teamId'],
      description: 'Get team prospects',
      category: 'Team Information',
    },
    'team/schedule': {
      label: 'Team Schedule',
      requiredParams: ['teamId'],
      optionalParams: ['season'],
      description: 'Get team schedule (optionally for a specific season)',
      category: 'Team Information',
    },
    // Standings
    'standings/now': {
      label: 'Current Standings',
      requiredParams: [],
      description: 'Get current standings',
      category: 'Standings',
    },
    'standings/date': {
      label: 'Standings by Date',
      requiredParams: ['date'],
      description: 'Get standings for a specific date (YYYY-MM-DD)',
      category: 'Standings',
    },
    'standings/season': {
      label: 'Standings by Season',
      requiredParams: ['season'],
      description: 'Get standings for a season (format: YYYYMMYYYY, e.g., 20232024)',
      category: 'Standings',
    },
    // Stats API
    'stats/rest/player/skaters': {
      label: 'Skater Stats',
      requiredParams: ['cayenneExp'],
      optionalParams: ['report', 'sort', 'dir', 'start', 'limit', 'lang'],
      description: 'Get skater statistics (cayenneExp required, e.g., seasonId=20232024)',
      category: 'Stats API',
    },
    'stats/rest/player/goalies': {
      label: 'Goalie Stats',
      requiredParams: ['cayenneExp'],
      optionalParams: ['report', 'sort', 'dir', 'start', 'limit', 'lang'],
      description: 'Get goalie statistics (cayenneExp required, e.g., seasonId=20232024)',
      category: 'Stats API',
    },
    'stats/rest/team/list': {
      label: 'Team List',
      requiredParams: [],
      optionalParams: ['lang'],
      description: 'Get list of all teams',
      category: 'Stats API',
    },
    'stats/rest/team/id': {
      label: 'Team by ID',
      requiredParams: ['teamId'],
      optionalParams: ['lang'],
      description: 'Get team information by ID',
      category: 'Stats API',
    },
    'stats/rest/team/stats': {
      label: 'Team Stats (Stats API)',
      requiredParams: [],
      optionalParams: ['report', 'cayenneExp', 'sort', 'dir', 'start', 'limit', 'lang'],
      description: 'Get team statistics from Stats API',
      category: 'Stats API',
    },
    'stats/rest/season/list': {
      label: 'Season List',
      requiredParams: [],
      optionalParams: ['lang'],
      description: 'Get list of seasons',
      category: 'Stats API',
    },
    'stats/rest/franchise/list': {
      label: 'Franchise List',
      requiredParams: [],
      optionalParams: ['lang'],
      description: 'Get list of franchises',
      category: 'Stats API',
    },
    'stats/rest/shiftcharts': {
      label: 'Shift Charts',
      requiredParams: ['gameId'],
      optionalParams: ['lang'],
      description: 'Get shift charts for a game',
      category: 'Stats API',
    },
  };

  const handleParamChange = (key: string, value: string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const buildUrl = (endpoint: ApiEndpoint, params: Record<string, string>): string => {
    const config = endpointConfig[endpoint];
    const queryParams = new URLSearchParams();
    
    // Add required params
    config.requiredParams.forEach(param => {
      if (params[param]) {
        queryParams.append(param, params[param]);
      }
    });
    
    // Add optional params
    if (config.optionalParams) {
      config.optionalParams.forEach(param => {
        if (params[param]) {
          queryParams.append(param, params[param]);
        }
      });
    }
    
    return `/api/nhl/${endpoint}?${queryParams.toString()}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    setRawResponse('');

    try {
      const config = endpointConfig[selectedEndpoint];
      
      // Validate required params
      for (const param of config.requiredParams) {
        if (!params[param] || params[param].trim() === '') {
          setError(`Parameter "${param}" is required`);
          setLoading(false);
          return;
        }
      }

      const url = buildUrl(selectedEndpoint, params);
      console.log(`[Test API] Fetching: ${url}`);

      const res = await fetch(url, {
        cache: 'no-store',
      });

      const responseText = await res.text();
      setRawResponse(responseText);

      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        try {
          const errorData = JSON.parse(responseText);
          setResponse(errorData);
        } catch {
          setResponse({ error: responseText });
        }
        setLoading(false);
        return;
      }

      try {
        const data = JSON.parse(responseText);
        setResponse(data);
      } catch (e) {
        setError('Failed to parse JSON response');
        setResponse({ raw: responseText });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResponse(null);
    setError(null);
    setRawResponse('');
  };

  const handleEndpointChange = (endpoint: ApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    // Reset params
    setParams({
      gamePk: '',
      date: '',
      teamId: '',
      season: '',
      limit: '10',
      gameId: '',
      report: '',
      cayenneExp: '',
      sort: '',
      dir: '',
      start: '',
      lang: 'en',
    });
  };

  // Group endpoints by category
  const endpointsByCategory = Object.entries(endpointConfig).reduce((acc, [key, config]) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push([key as ApiEndpoint, config]);
    return acc;
  }, {} as Record<string, [ApiEndpoint, EndpointConfig][]>);

  const renderParamInput = (paramName: string, label: string, type: string = 'text', placeholder?: string) => {
    const config = endpointConfig[selectedEndpoint];
    const isRequired = config.requiredParams.includes(paramName);
    const isOptional = config.optionalParams?.includes(paramName);
    
    if (!isRequired && !isOptional) return null;

    return (
      <div key={paramName}>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">
          {label} {isRequired && <span className="text-red-500">*</span>}
        </label>
        {type === 'date' ? (
          <input
            type="date"
            value={params[paramName] || ''}
            onChange={(e) => handleParamChange(paramName, e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
        ) : (
          <input
            type={type}
            value={params[paramName] || ''}
            onChange={(e) => handleParamChange(paramName, e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          NHL API Tester
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Тестирование всех NHL API endpoints из <a href="https://github.com/Zmalski/NHL-API-Reference" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">NHL API Reference</a>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Форма запроса */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Запрос
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Выбор endpoint */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Endpoint
                </label>
                <select
                  value={selectedEndpoint}
                  onChange={(e) => handleEndpointChange(e.target.value as ApiEndpoint)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                >
                  {Object.entries(endpointsByCategory).map(([category, endpoints]) => (
                    <optgroup key={category} label={category}>
                      {endpoints.map(([key, config]) => (
                        <option key={key} value={key}>
                          {config.label} - {config.description}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {endpointConfig[selectedEndpoint].description}
                </p>
              </div>

              {/* Параметры */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Параметры
                </label>

                {/* Dynamic parameter inputs */}
                {renderParamInput('gamePk', 'gamePk', 'text', 'e.g., 2025020437')}
                {renderParamInput('date', 'date', 'date')}
                {renderParamInput('teamId', 'teamId', 'text', 'e.g., 1, 2, 3...')}
                {renderParamInput('season', 'season', 'text', 'e.g., 20232024')}
                {renderParamInput('limit', 'limit', 'number', '10')}
                {renderParamInput('gameId', 'gameId', 'text', 'e.g., 2021020001')}
                {renderParamInput('report', 'report', 'text', 'e.g., summary')}
                {renderParamInput('cayenneExp', 'cayenneExp', 'text', 'e.g., seasonId=20232024')}
                {renderParamInput('sort', 'sort', 'text', 'e.g., points')}
                {renderParamInput('dir', 'dir', 'text', 'ASC or DESC')}
                {renderParamInput('start', 'start', 'number', '0')}
                {renderParamInput('lang', 'lang', 'text', 'en, fr, etc.')}
              </div>

              {/* Кнопки */}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Загрузка...' : 'Отправить запрос'}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg font-medium transition-colors"
                >
                  Очистить
                </button>
              </div>
            </form>

            {/* URL запроса */}
            {params && (
              <div className="mt-4 p-3 bg-zinc-100 dark:bg-zinc-700 rounded-lg">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">URL:</p>
                <code className="text-xs text-zinc-900 dark:text-zinc-100 break-all">
                  {buildUrl(selectedEndpoint, params)}
                </code>
              </div>
            )}
          </div>

          {/* Результат */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Ответ
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">Ошибка:</p>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Загрузка...</p>
              </div>
            )}

            {response && (
              <div className="space-y-4">
                {/* JSON Viewer */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      JSON Response
                    </label>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(response, null, 2));
                      }}
                      className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded text-zinc-900 dark:text-zinc-100"
                    >
                      Копировать
                    </button>
                  </div>
                  <pre className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg overflow-auto max-h-96 text-xs text-zinc-900 dark:text-zinc-100">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>

                {/* Raw Response */}
                {rawResponse && (
                  <div>
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">
                      Raw Response
                    </label>
                    <pre className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg overflow-auto max-h-64 text-xs text-zinc-900 dark:text-zinc-100">
                      {rawResponse.substring(0, 1000)}
                      {rawResponse.length > 1000 && '... (truncated)'}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!response && !loading && !error && (
              <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                <p>Отправьте запрос, чтобы увидеть результат</p>
              </div>
            )}
          </div>
        </div>

        {/* Категории endpoints */}
        <div className="mt-8 bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Доступные Endpoints по категориям
          </h2>
          <div className="space-y-4">
            {Object.entries(endpointsByCategory).map(([category, endpoints]) => (
              <div key={category} className="border-b border-zinc-200 dark:border-zinc-700 pb-4 last:border-b-0">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {endpoints.map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => handleEndpointChange(key)}
                      className="text-left p-2 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded text-sm text-zinc-900 dark:text-zinc-100 transition-colors"
                    >
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{config.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
