import { useEffect, useState } from 'react';
import { supabase, type Umpire, type Challenge, type Ejection, type Game, type WeeklyUmpireStats, type WeeklyWinner } from './lib/supabase';
import { Trophy, TrendingDown, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { WorstUmpireCard } from './components/WorstUmpireCard';
import { DataSourceInfo } from './components/DataSourceInfo';
import { getCurrentMLBWeek, getAvailableWeeks, formatWeekRange } from './utils/weekCalculator';

function App() {
  const [weeklyStats, setWeeklyStats] = useState<WeeklyUmpireStats[]>([]);
  const [hallOfShame, setHallOfShame] = useState<WeeklyWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentMLBWeek());
  const [gameType, setGameType] = useState<'regular' | 'postseason'>('regular');
  const [totalChallengesThisWeek, setTotalChallengesThisWeek] = useState(0);
  const [showAllUmpires, setShowAllUmpires] = useState(false);
  const [allTimeStats, setAllTimeStats] = useState({ totalChallenges: 0, overturnRate: 0 });

  useEffect(() => {
    loadWeeklyData();
  }, [selectedWeek, gameType]);

  useEffect(() => {
    loadHallOfShame();
  }, [gameType]);

  useEffect(() => {
    loadAllTimeStats();
  }, []);

  const loadAllTimeStats = async () => {
    try {
      const { data: challenges } = await supabase
        .from('challenges')
        .select('outcome')
        .eq('season_year', 2026);

      if (challenges) {
        const totalChallenges = challenges.length;
        const overturned = challenges.filter(c => c.outcome === 'overturned').length;
        const overturnRate = totalChallenges > 0 ? (overturned / totalChallenges) * 100 : 0;
        setAllTimeStats({ totalChallenges, overturnRate });
      }
    } catch (error) {
      console.error('Error loading all-time stats:', error);
    }
  };

  const loadHallOfShame = async () => {
    try {
      const currentWeek = getCurrentMLBWeek();
      const winners: WeeklyWinner[] = [];

      const [umpiresResult, challengesResult] = await Promise.all([
        supabase.from('umpires').select('*'),
        supabase
          .from('challenges')
          .select('*')
          .eq('season_year', 2026)
          .eq('game_type', gameType)
          .not('week_number', 'is', null)
      ]);

      if (umpiresResult.data && challengesResult.data) {
        const umpires = umpiresResult.data;
        const challenges = challengesResult.data;

        const weekMap = new Map<string, { umpireId: string; overturned: number; total: number }>();

        challenges.forEach(challenge => {
          if (challenge.week_number && challenge.week_year) {
            const weekKey = `${challenge.week_year}-${challenge.week_number}`;

            if (!weekMap.has(weekKey)) {
              weekMap.set(weekKey, {});
            }

            const weekData = weekMap.get(weekKey)!;
            const umpireKey = challenge.umpire_id;

            if (!weekData[umpireKey]) {
              weekData[umpireKey] = { overturned: 0, total: 0 };
            }

            weekData[umpireKey].total++;
            if (challenge.outcome === 'overturned') {
              weekData[umpireKey].overturned++;
            }
          }
        });

        weekMap.forEach((umpireStats, weekKey) => {
          const [weekYear, weekNumber] = weekKey.split('-').map(Number);

          let maxOverturned = 0;
          let winnerUmpireId = '';
          let winnerTotal = 0;

          Object.entries(umpireStats).forEach(([umpireId, stats]) => {
            if (stats.overturned > maxOverturned) {
              maxOverturned = stats.overturned;
              winnerUmpireId = umpireId;
              winnerTotal = stats.total;
            }
          });

          if (winnerUmpireId && maxOverturned > 0) {
            const umpire = umpires.find(u => u.id === winnerUmpireId);
            if (umpire) {
              winners.push({
                weekNumber,
                weekYear,
                umpireName: umpire.name,
                overturned: maxOverturned,
                total: winnerTotal,
                dateRange: formatWeekRange(weekNumber, weekYear)
              });
            }
          }
        });

        winners.sort((a, b) => {
          if (a.weekYear !== b.weekYear) return b.weekYear - a.weekYear;
          return b.weekNumber - a.weekNumber;
        });

        setHallOfShame(winners);
      }
    } catch (error) {
      console.error('Error loading Hall of Shame:', error);
    }
  };

  const loadWeeklyData = async () => {
    setLoading(true);
    try {
      const [umpiresResult, challengesResult, ejectionsResult, gamesResult, prevWeekChallengesResult] = await Promise.all([
        supabase.from('umpires').select('*').eq('is_retired', false),
        supabase
          .from('challenges')
          .select('*')
          .eq('week_number', selectedWeek.weekNumber)
          .eq('week_year', selectedWeek.weekYear)
          .eq('game_type', gameType),
        supabase
          .from('ejections')
          .select('*')
          .eq('season_year', 2026),
        supabase
          .from('games')
          .select('*')
          .eq('season_year', 2026)
          .eq('game_type', gameType),
        selectedWeek.weekNumber > 1
          ? supabase
              .from('challenges')
              .select('*')
              .eq('week_number', selectedWeek.weekNumber - 1)
              .eq('week_year', selectedWeek.weekYear)
              .eq('game_type', gameType)
          : Promise.resolve({ data: [] })
      ]);

      if (umpiresResult.data && challengesResult.data) {
        const umpires = umpiresResult.data;
        const challenges = challengesResult.data;
        const ejections = ejectionsResult.data || [];
        const games = gamesResult.data || [];
        const prevWeekChallenges = prevWeekChallengesResult.data || [];

        setTotalChallengesThisWeek(challenges.length);
        calculateWeeklyStats(umpires, challenges, prevWeekChallenges, ejections, games);
      }
    } catch (error) {
      console.error('Error loading weekly data:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousWeek = () => {
    const availableWeeks = getAvailableWeeks();
    const currentIndex = availableWeeks.findIndex(
      w => w.weekNumber === selectedWeek.weekNumber && w.weekYear === selectedWeek.weekYear
    );
    if (currentIndex < availableWeeks.length - 1) {
      const prevWeek = availableWeeks[currentIndex + 1];
      setSelectedWeek({ weekNumber: prevWeek.weekNumber, weekYear: prevWeek.weekYear });
    }
  };

  const goToNextWeek = () => {
    const availableWeeks = getAvailableWeeks();
    const currentIndex = availableWeeks.findIndex(
      w => w.weekNumber === selectedWeek.weekNumber && w.weekYear === selectedWeek.weekYear
    );
    if (currentIndex > 0) {
      const nextWeek = availableWeeks[currentIndex - 1];
      setSelectedWeek({ weekNumber: nextWeek.weekNumber, weekYear: nextWeek.weekYear });
    }
  };

  const calculateWeeklyStats = (
    umpires: Umpire[],
    challenges: Challenge[],
    prevWeekChallenges: Challenge[],
    ejections: Ejection[],
    games: Game[]
  ) => {
    const stats = umpires.map(umpire => {
      const umpireChallenges = challenges.filter(c => c.umpire_id === umpire.id);
      const overturned = umpireChallenges.filter(c => c.outcome === 'overturned').length;
      const stands = umpireChallenges.filter(c => c.outcome === 'stands').length;
      const total = umpireChallenges.length;

      const prevUmpireChallenges = prevWeekChallenges.filter(c => c.umpire_id === umpire.id);
      const previousWeekOverturned = prevUmpireChallenges.filter(c => c.outcome === 'overturned').length;

      const umpireGames = games.filter(g => g.umpire_id === umpire.id);
      const gamesWorked = umpireGames.length;

      const umpireEjections = ejections.filter(e => e.umpire_id === umpire.id);
      const ejectionCount = umpireEjections.length;

      let trendDirection: 'up' | 'down' | 'same' | undefined;
      if (selectedWeek.weekNumber > 1) {
        if (overturned > previousWeekOverturned) trendDirection = 'up';
        else if (overturned < previousWeekOverturned) trendDirection = 'down';
        else trendDirection = 'same';
      }

      return {
        umpire,
        overturned,
        stands,
        total,
        overturnedPct: total > 0 ? (overturned / total) * 100 : 0,
        ejectionCount,
        gamesWorked,
        previousWeekOverturned: selectedWeek.weekNumber > 1 ? previousWeekOverturned : undefined,
        trendDirection
      };
    }).filter(stat => stat.total > 0)
      .sort((a, b) => b.overturned - a.overturned);

    setWeeklyStats(stats);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading the worst calls of the week...</div>
      </div>
    );
  }

  const availableWeeks = getAvailableWeeks();
  const top10Stats = weeklyStats.slice(0, 10);
  const remainingStats = weeklyStats.slice(10);
  const currentWeekIndex = availableWeeks.findIndex(
    w => w.weekNumber === selectedWeek.weekNumber && w.weekYear === selectedWeek.weekYear
  );
  const isCurrentWeek = currentWeekIndex === 0;
  const hasNextWeek = currentWeekIndex > 0;
  const hasPrevWeek = currentWeekIndex < availableWeeks.length - 1;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="mb-3 text-center">
          <div className="mb-2 flex justify-center">
            <img
              src="/angel-hernandez-so-confused.webp"
              alt="Angel Hernandez"
              className="w-20 h-20 rounded-full object-cover border-4 border-red-500 shadow-xl shadow-red-500/30"
            />
          </div>

          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="text-red-500" size={24} />
            <h1 className="text-xl font-bold text-white">
              The Angel Hernandez Award
            </h1>
          </div>

          <p className="text-slate-400 text-xs mb-3">
            MLB ABS Challenge System - 2026 Season
          </p>

          <div className="grid grid-cols-2 gap-4 bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{allTimeStats.totalChallenges}</div>
              <div className="text-slate-400 text-xs">Total ABS Challenges</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{allTimeStats.overturnRate.toFixed(1)}%</div>
              <div className="text-slate-400 text-xs">Overall Overturn Rate</div>
            </div>
          </div>
        </div>

        <div className="my-6 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
        </div>

        {weeklyStats.length === 0 ? (
          <div className="mt-8">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 overflow-hidden mb-4">
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 flex items-center justify-center gap-2">
                <Trophy size={16} className="text-white" />
                <span className="text-white font-bold text-sm uppercase tracking-wide">Hall of Shame</span>
              </div>
              <div className="p-6 text-center">
                <TrendingDown className="mx-auto mb-3 text-slate-600" size={48} />
                <p className="text-slate-400">No challenges recorded for this week yet</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {top10Stats.length > 0 && top10Stats[0] && (
              <div className="mb-4 mt-8">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border-2 border-red-500 shadow-xl shadow-red-500/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 flex items-center justify-center gap-2">
                    <Trophy size={16} className="text-white" />
                    <span className="text-white font-bold text-sm uppercase tracking-wide">Hall of Shame</span>
                  </div>

                  <div className="p-5">
                    <div className="flex flex-col items-center mb-4">
                      <img
                        src={top10Stats[0].umpire.photo_url || '/umpire-portrait.webp'}
                        alt={top10Stats[0].umpire.name}
                        className="w-24 h-24 rounded-full object-cover border-4 border-red-500 shadow-xl shadow-red-500/20 mb-3"
                      />
                      <h2 className="text-3xl font-bold text-white mb-1">{top10Stats[0].umpire.name}</h2>
                      <p className="text-slate-400 text-sm">
                        {top10Stats[0].umpire.age} years old • {top10Stats[0].umpire.years_of_experience} years experience
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                        <div className="font-bold text-red-400 text-3xl">{top10Stats[0].overturned}</div>
                        <div className="text-slate-300 text-sm mt-1">Overturned</div>
                        <div className="text-slate-400 text-xs">This Week</div>
                      </div>

                      <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-600">
                        <div className="font-bold text-white text-3xl">{top10Stats[0].overturnedPct.toFixed(0)}%</div>
                        <div className="text-slate-300 text-sm mt-1">Overturn Rate</div>
                        <div className="text-slate-400 text-xs">{top10Stats[0].total} Challenges</div>
                      </div>
                    </div>

                    {top10Stats[0].trendDirection && top10Stats[0].previousWeekOverturned !== undefined && (
                      <div className="mb-4 bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 text-sm font-semibold">Streak vs. Last Week</span>
                          <div className="flex items-center gap-2">
                            {top10Stats[0].trendDirection === 'up' && (
                              <>
                                <TrendingDown className="text-red-400" size={18} />
                                <span className="font-bold text-red-400">
                                  +{top10Stats[0].overturned - top10Stats[0].previousWeekOverturned} worse
                                </span>
                              </>
                            )}
                            {top10Stats[0].trendDirection === 'down' && (
                              <>
                                <TrendingDown className="text-green-400" size={18} />
                                <span className="font-bold text-green-400">
                                  {top10Stats[0].overturned - top10Stats[0].previousWeekOverturned} better
                                </span>
                              </>
                            )}
                            {top10Stats[0].trendDirection === 'same' && (
                              <span className="font-bold text-slate-400">No change</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {top10Stats[0].ejectionCount > 0 && (
                      <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={16} className="text-yellow-400" />
                          <span className="text-yellow-400 text-sm font-semibold">
                            {top10Stats[0].ejectionCount} Ejection{top10Stats[0].ejectionCount !== 1 ? 's' : ''} This Season
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                <TrendingDown size={16} className="text-slate-400" />
                Top 10 This Week
              </h3>
              {top10Stats.length > 1 && (
                <div className="space-y-2">
                  {top10Stats.slice(1).map((stat, index) => (
                    <WorstUmpireCard
                      key={stat.umpire.id}
                      stat={stat}
                      rank={index + 2}
                      weekNumber={selectedWeek.weekNumber}
                      isTopCard={false}
                    />
                  ))}
                </div>
              )}
            </div>

            {remainingStats.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowAllUmpires(!showAllUmpires)}
                  className="w-full bg-slate-900/50 hover:bg-slate-900/70 border border-slate-700 rounded-lg p-3 transition-all flex items-center justify-between"
                >
                  <span className="text-white text-sm font-semibold">
                    {showAllUmpires ? 'Hide' : 'Show'} {remainingStats.length} More Umpire{remainingStats.length !== 1 ? 's' : ''}
                  </span>
                  {showAllUmpires ? (
                    <ChevronUp className="text-slate-400" size={20} />
                  ) : (
                    <ChevronDown className="text-slate-400" size={20} />
                  )}
                </button>

                {showAllUmpires && (
                  <div className="space-y-2 mt-2">
                    {remainingStats.map((stat, index) => (
                      <WorstUmpireCard
                        key={stat.umpire.id}
                        stat={stat}
                        rank={index + 11}
                        weekNumber={selectedWeek.weekNumber}
                        isTopCard={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <Trophy size={16} className="text-red-500" />
                Hall of Shame History
              </h3>
              <p className="text-slate-400 text-xs mb-3">
                Past weekly leaders - Click to view
              </p>

              {hallOfShame.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-3">No data available yet</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {hallOfShame.map((winner) => (
                    <button
                      key={`${winner.weekYear}-${winner.weekNumber}`}
                      onClick={() => setSelectedWeek({ weekNumber: winner.weekNumber, weekYear: winner.weekYear })}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-all hover:bg-slate-800/50 ${
                        selectedWeek.weekNumber === winner.weekNumber && selectedWeek.weekYear === winner.weekYear
                          ? 'bg-red-500/20 border border-red-500/30'
                          : 'bg-slate-800/30 border border-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-white font-semibold text-xs hover:text-red-400 transition-colors">
                            {winner.umpireName}
                          </div>
                          <div className="text-slate-500 text-xs">
                            Week {winner.weekNumber} • {winner.dateRange}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-400 font-bold text-base">{winner.overturned}</div>
                          <div className="text-slate-500 text-xs">overturned</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="mb-4 bg-slate-900/50 rounded-lg p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={goToPreviousWeek}
              disabled={!hasPrevWeek}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                hasPrevWeek
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              }`}
            >
              ← Previous Week
            </button>
            <button
              onClick={goToNextWeek}
              disabled={!hasNextWeek}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                hasNextWeek
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              }`}
            >
              Next Week →
            </button>
          </div>

          <select
            value={`${selectedWeek.weekNumber}-${selectedWeek.weekYear}`}
            onChange={(e) => {
              const [weekNum, weekYr] = e.target.value.split('-');
              setSelectedWeek({ weekNumber: parseInt(weekNum), weekYear: parseInt(weekYr) });
            }}
            className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {availableWeeks.map(week => (
              <option key={`${week.weekNumber}-${week.weekYear}`} value={`${week.weekNumber}-${week.weekYear}`}>
                {week.label} {week.weekNumber === getCurrentMLBWeek().weekNumber && week.weekYear === getCurrentMLBWeek().weekYear ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6">
          <DataSourceInfo />
        </div>

        <div className="text-center mt-6 opacity-30">
          <img
            src="/angel-hernandez-so-confused.webp"
            alt="Watermark"
            className="w-16 h-16 mx-auto opacity-20 grayscale"
          />
        </div>

        <footer className="mt-8 pb-6 text-center">
          <p className="text-slate-500 text-xs">
            © {new Date().getFullYear()} The Angel Hernandez Award. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
