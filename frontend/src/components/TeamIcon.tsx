// Компонент для отображения иконки команды NHL
interface TeamIconProps {
  teamCode: string;
  size?: number;
  className?: string;
}

// Цвета команд NHL
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
  NSH: { bg: "#FFB81C", fg: "#111111" },
  NYI: { bg: "#00205b", fg: "#FF6600" },
  NYR: { bg: "#0033A0", fg: "#cc0000" },
  OTT: { bg: "#c8102e", fg: "#ffffff" },
  PHI: { bg: "#F74902", fg: "#111111" },
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

function getTeamColor(teamCode: string): { bg: string; fg: string } | null {
  const code = teamCode?.toUpperCase();
  return TEAM_COLORS[code] || null;
}

export default function TeamIcon({ teamCode, size = 32, className = "" }: TeamIconProps) {
  const colors = getTeamColor(teamCode);

  if (!colors) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full font-bold text-xs uppercase shadow-sm ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: "#6b7280",
          color: "#ffffff",
          fontSize: `${Math.max(10, 0.4 * size)}px`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        {teamCode?.toUpperCase().slice(0, 3) || "?"}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-bold text-xs uppercase shadow-sm ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: colors.bg,
        color: colors.fg,
        fontSize: `${Math.max(10, 0.4 * size)}px`,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      title={teamCode}
    >
      {teamCode?.toUpperCase().slice(0, 3) || "?"}
    </div>
  );
}

