export interface Umpire {
  id: string;
  name: string;
  age: number;
  years_of_experience: number;
  photo_url?: string;
  is_retired: boolean;
  retirement_date?: string;
  data_source?: string;
  last_synced_at?: string;
  pitches_called?: number;
  external_source_id?: string;
  baseball_reference_url?: string;
  season_challenges_total?: number;
  season_challenges_overturned?: number;
  season_overturn_rate?: number;
  season_rank?: number;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  created_at: string;
}

export interface Challenge {
  id: string;
  umpire_id: string;
  team_id: string;
  challenge_date: string;
  outcome: 'overturned' | 'stands';
  season_year: number;
  game_id?: string;
  inning?: number;
  ejection_occurred: boolean;
  game_type: 'regular' | 'postseason';
  week_number?: number;
  week_year?: number;
  data_source?: string;
  last_synced_at?: string;
  created_at: string;
}

export interface Game {
  id: string;
  game_date: string;
  home_team_id: string;
  away_team_id: string;
  umpire_id: string;
  total_calls: number;
  total_challenges: number;
  game_type: 'regular' | 'postseason';
  season_year: number;
  created_at: string;
}

export interface Ejection {
  id: string;
  umpire_id: string;
  team_id: string;
  game_id?: string;
  player_name: string;
  ejection_date: string;
  reason?: string;
  season_year: number;
  created_at: string;
}

export interface WeeklyUmpireStats {
  umpire: Umpire;
  overturned: number;
  stands: number;
  total: number;
  overturnedPct: number;
  ejectionCount: number;
  gamesWorked: number;
  previousWeekOverturned?: number;
  trendDirection?: 'up' | 'down' | 'same';
  trendPercentChange?: number;
}

export interface WeeklyWinner {
  weekNumber: number;
  weekYear: number;
  umpireName: string;
  overturned: number;
  total: number;
  dateRange: string;
}

export interface SyncLog {
  id: string;
  data_source_id: string;
  sync_started_at: string;
  sync_completed_at?: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  records_added: number;
  records_updated: number;
  records_skipped: number;
  error_message?: string;
  metadata?: any;
  created_at: string;
}

