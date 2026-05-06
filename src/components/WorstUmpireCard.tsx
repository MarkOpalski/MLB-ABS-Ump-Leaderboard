import { TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import type { WeeklyUmpireStats } from '../types';

interface WorstUmpireCardProps {
  stat: WeeklyUmpireStats;
  rank: number;
  weekNumber: number;
  isTopCard?: boolean;
}

export function WorstUmpireCard({ stat, rank, weekNumber, isTopCard = false }: WorstUmpireCardProps) {
  const getTrendIcon = () => {
    if (!stat.trendDirection) return null;
    if (stat.trendDirection === 'up') {
      return <TrendingUp className="text-red-400" size={20} />;
    }
    if (stat.trendDirection === 'down') {
      return <TrendingDown className="text-green-400" size={20} />;
    }
    return null;
  };

  // Condensed layout for ranks 2-10
  if (!isTopCard) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-slate-700 p-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <img
              src={stat.umpire.photo_url || '/umpire-portrait.webp'}
              alt={stat.umpire.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-slate-600"
            />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs">
                #{rank}
              </div>
              <h3 className="font-semibold text-white text-sm">{stat.umpire.name}</h3>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="font-bold text-red-400 text-lg">{stat.overturned}</div>
              <div className="text-slate-400 text-xs">Overturned</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-white text-lg">{stat.overturnedPct.toFixed(0)}%</div>
              <div className="text-slate-400 text-xs">Rate</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full layout for #1 card
  return (
    <div
      className="
        bg-gradient-to-br from-slate-800 to-slate-900
        rounded-2xl border-2 border-red-500 shadow-xl shadow-red-500/20
        overflow-hidden
      "
    >
      <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 flex items-center justify-center gap-2">
        <AlertTriangle size={16} className="text-white" />
        <span className="text-white font-bold text-sm uppercase tracking-wide">Hall of Shame</span>
        <AlertTriangle size={16} className="text-white" />
      </div>

      <div className="p-6">
      <div className="flex flex-col items-center mb-4">
        <img
          src={stat.umpire.photo_url || '/umpire-portrait.webp'}
          alt={stat.umpire.name}
          className="w-20 h-20 rounded-full object-cover border-4 border-red-500 shadow-xl shadow-red-500/20 mb-3"
        />
        <div className="text-center">
          <h3 className="font-bold text-white text-2xl">{stat.umpire.name}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
          <div className="font-bold text-red-400 text-4xl">{stat.overturned}</div>
          <div className="text-slate-300 text-sm mt-1">Overturned</div>
          <div className="text-slate-400 text-xs">This Week</div>
        </div>

        <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
          <div className="font-bold text-white text-4xl">{stat.overturnedPct.toFixed(0)}%</div>
          <div className="text-slate-300 text-sm mt-1">Overturn Rate</div>
          <div className="text-slate-400 text-xs">{stat.total} Challenges</div>
        </div>
      </div>

      {stat.ejectionCount > 0 && (
        <div className="flex items-center gap-1 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20 mb-3">
          <AlertTriangle size={14} className="text-yellow-400" />
          <span className="text-yellow-400 text-sm font-semibold">
            {stat.ejectionCount} Ejection{stat.ejectionCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {stat.trendDirection && stat.previousWeekOverturned !== undefined && (
        <div className="pt-3 border-t border-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">vs. Last Week</span>
            <div className="flex items-center gap-2">
              {getTrendIcon()}
              <span
                className={`font-semibold ${
                  stat.trendDirection === 'up' ? 'text-red-400' : 'text-green-400'
                }`}
              >
                {stat.trendDirection === 'up' ? '+' : ''}
                {stat.previousWeekOverturned - stat.overturned !== 0
                  ? `${stat.overturned - stat.previousWeekOverturned}`
                  : 'No Change'}
              </span>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
