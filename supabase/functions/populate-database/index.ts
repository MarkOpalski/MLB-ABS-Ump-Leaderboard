import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert teams
    const teams = [
      // AL East
      { abbreviation: 'BAL', name: 'Baltimore Orioles' },
      { abbreviation: 'BOS', name: 'Boston Red Sox' },
      { abbreviation: 'NYY', name: 'New York Yankees' },
      { abbreviation: 'TB', name: 'Tampa Bay Rays' },
      { abbreviation: 'TOR', name: 'Toronto Blue Jays' },
      // AL Central
      { abbreviation: 'CWS', name: 'Chicago White Sox' },
      { abbreviation: 'CLE', name: 'Cleveland Guardians' },
      { abbreviation: 'DET', name: 'Detroit Tigers' },
      { abbreviation: 'KC', name: 'Kansas City Royals' },
      { abbreviation: 'MIN', name: 'Minnesota Twins' },
      // AL West
      { abbreviation: 'ATH', name: 'Athletics' },
      { abbreviation: 'HOU', name: 'Houston Astros' },
      { abbreviation: 'LAA', name: 'Los Angeles Angels' },
      { abbreviation: 'SEA', name: 'Seattle Mariners' },
      { abbreviation: 'TEX', name: 'Texas Rangers' },
      // NL East
      { abbreviation: 'ATL', name: 'Atlanta Braves' },
      { abbreviation: 'MIA', name: 'Miami Marlins' },
      { abbreviation: 'NYM', name: 'New York Mets' },
      { abbreviation: 'PHI', name: 'Philadelphia Phillies' },
      { abbreviation: 'WSH', name: 'Washington Nationals' },
      // NL Central
      { abbreviation: 'CHC', name: 'Chicago Cubs' },
      { abbreviation: 'CIN', name: 'Cincinnati Reds' },
      { abbreviation: 'MIL', name: 'Milwaukee Brewers' },
      { abbreviation: 'PIT', name: 'Pittsburgh Pirates' },
      { abbreviation: 'STL', name: 'St. Louis Cardinals' },
      // NL West
      { abbreviation: 'AZ', name: 'Arizona Diamondbacks' },
      { abbreviation: 'COL', name: 'Colorado Rockies' },
      { abbreviation: 'LAD', name: 'Los Angeles Dodgers' },
      { abbreviation: 'SD', name: 'San Diego Padres' },
      { abbreviation: 'SF', name: 'San Francisco Giants' },
    ];

    const { data: insertedTeams, error: teamsError } = await supabase
      .from('teams')
      .upsert(teams, { onConflict: 'abbreviation' })
      .select();

    if (teamsError) throw teamsError;

    // Insert umpires
    const umpires = [
      { name: 'CB Bucknor', age: 57, years_of_experience: 28, is_retired: false, photo_url: '/cb-bucknor.webp' },
      { name: 'Chris Segal', age: 42, years_of_experience: 12, is_retired: false, photo_url: '/chris-segal.webp' },
      { name: 'Jordan Baker', age: 45, years_of_experience: 13, is_retired: false, photo_url: '/jordan-baker.webp' },
      { name: 'Tom Hanahan', age: 35, years_of_experience: 1, is_retired: false, photo_url: '/tom-hanahan.webp' },
      { name: 'Brian Walsh', age: 36, years_of_experience: 1, is_retired: false, photo_url: '/brian-walsh.webp' },
      { name: 'Doug Eddings', age: 54, years_of_experience: 22, is_retired: false, photo_url: '/doug-eddings.webp' },
      { name: 'Dan Bellino', age: 48, years_of_experience: 16, is_retired: false, photo_url: '/dan-bellino.webp' },
      { name: 'Lance Barksdale', age: 55, years_of_experience: 23, is_retired: false, photo_url: '/lance-barksdale.webp' },
      { name: 'Alfonso Marquez', age: 53, years_of_experience: 19, is_retired: false, photo_url: '/alfonso-marquez.webp' },
      { name: 'Adrian Johnson', age: 50, years_of_experience: 18, is_retired: false, photo_url: '/adrian-johnson.webp' },
    ];

    const { data: insertedUmpires, error: umpiresError } = await supabase
      .from('umpires')
      .insert(umpires)
      .select();

    if (umpiresError) throw umpiresError;

    // Get team and umpire IDs for reference
    const teamMap = new Map(insertedTeams!.map(t => [t.abbreviation, t.id]));
    const umpireMap = new Map(insertedUmpires!.map(u => [u.name, u.id]));

    // Insert games from Opening Week 2026 and Week 2
    const games = [
      // Week 1 (March 25-29)
      {
        game_date: '2026-03-25',
        season_year: 2026,
        home_team_id: teamMap.get('SF'),
        away_team_id: teamMap.get('NYY'),
        umpire_id: umpireMap.get('Jordan Baker'),
        total_calls: 150,
        total_challenges: 3,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('BAL'),
        away_team_id: teamMap.get('MIN'),
        umpire_id: umpireMap.get('Lance Barksdale'),
        total_calls: 145,
        total_challenges: 2,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('TEX'),
        away_team_id: teamMap.get('PHI'),
        umpire_id: umpireMap.get('Alfonso Marquez'),
        total_calls: 138,
        total_challenges: 3,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('CWS'),
        away_team_id: teamMap.get('MIL'),
        umpire_id: umpireMap.get('Dan Bellino'),
        total_calls: 152,
        total_challenges: 4,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('SEA'),
        away_team_id: teamMap.get('CLE'),
        umpire_id: umpireMap.get('Adrian Johnson'),
        total_calls: 141,
        total_challenges: 3,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-28',
        season_year: 2026,
        home_team_id: teamMap.get('CIN'),
        away_team_id: teamMap.get('BOS'),
        umpire_id: umpireMap.get('CB Bucknor'),
        total_calls: 156,
        total_challenges: 8,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('AZ'),
        away_team_id: teamMap.get('LAD'),
        umpire_id: umpireMap.get('Doug Eddings'),
        total_calls: 149,
        total_challenges: 4,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('NYM'),
        away_team_id: teamMap.get('PIT'),
        umpire_id: umpireMap.get('Tom Hanahan'),
        total_calls: 143,
        total_challenges: 2,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-26',
        season_year: 2026,
        home_team_id: teamMap.get('CIN'),
        away_team_id: teamMap.get('BOS'),
        umpire_id: umpireMap.get('Brian Walsh'),
        total_calls: 147,
        total_challenges: 3,
        game_type: 'regular',
      },
      // Week 2 (March 30 - April 2)
      {
        game_date: '2026-03-30',
        season_year: 2026,
        home_team_id: teamMap.get('LAD'),
        away_team_id: teamMap.get('SD'),
        umpire_id: umpireMap.get('Chris Segal'),
        total_calls: 148,
        total_challenges: 5,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-31',
        season_year: 2026,
        home_team_id: teamMap.get('NYY'),
        away_team_id: teamMap.get('BOS'),
        umpire_id: umpireMap.get('Jordan Baker'),
        total_calls: 155,
        total_challenges: 3,
        game_type: 'regular',
      },
      {
        game_date: '2026-03-31',
        season_year: 2026,
        home_team_id: teamMap.get('ATL'),
        away_team_id: teamMap.get('PHI'),
        umpire_id: umpireMap.get('Dan Bellino'),
        total_calls: 142,
        total_challenges: 4,
        game_type: 'regular',
      },
      {
        game_date: '2026-04-01',
        season_year: 2026,
        home_team_id: teamMap.get('HOU'),
        away_team_id: teamMap.get('TEX'),
        umpire_id: umpireMap.get('CB Bucknor'),
        total_calls: 151,
        total_challenges: 7,
        game_type: 'regular',
      },
      {
        game_date: '2026-04-01',
        season_year: 2026,
        home_team_id: teamMap.get('CHC'),
        away_team_id: teamMap.get('STL'),
        umpire_id: umpireMap.get('Alfonso Marquez'),
        total_calls: 139,
        total_challenges: 2,
        game_type: 'regular',
      },
      {
        game_date: '2026-04-02',
        season_year: 2026,
        home_team_id: teamMap.get('TB'),
        away_team_id: teamMap.get('TOR'),
        umpire_id: umpireMap.get('Lance Barksdale'),
        total_calls: 144,
        total_challenges: 3,
        game_type: 'regular',
      },
      {
        game_date: '2026-04-02',
        season_year: 2026,
        home_team_id: teamMap.get('MIL'),
        away_team_id: teamMap.get('CIN'),
        umpire_id: umpireMap.get('Tom Hanahan'),
        total_calls: 146,
        total_challenges: 4,
        game_type: 'regular',
      },
    ];

    const { data: insertedGames, error: gamesError } = await supabase
      .from('games')
      .insert(games)
      .select();

    if (gamesError) throw gamesError;

    // Insert ejections
    const ejections = [
      {
        umpire_id: umpireMap.get('CB Bucknor'),
        ejection_date: '2026-03-28',
        player_name: 'Alex Cora (Manager)',
        team_id: teamMap.get('BOS'),
        game_id: insertedGames!.find(g =>
          g.game_date === '2026-03-28' &&
          g.umpire_id === umpireMap.get('CB Bucknor')
        )?.id,
        reason: 'Check swing strike three call to Trevor Story',
        season_year: 2026,
      },
      {
        umpire_id: umpireMap.get('Chris Segal'),
        ejection_date: '2026-03-26',
        player_name: 'Derek Shelton (Manager)',
        team_id: teamMap.get('MIN'),
        game_id: insertedGames!.find(g =>
          g.game_date === '2026-03-26' &&
          g.umpire_id === umpireMap.get('Lance Barksdale')
        )?.id,
        reason: 'ABS challenge and overturn timing',
        season_year: 2026,
      },
    ];

    const { error: ejectionsError } = await supabase
      .from('ejections')
      .insert(ejections);

    if (ejectionsError) throw ejectionsError;

    // Helper function to create challenges for a game
    const createGameChallenges = (
      game: any,
      umpireName: string,
      date: string,
      challengeCount: number,
      overturnedCount: number,
      teams: string[]
    ) => {
      const gameId = insertedGames!.find(g =>
        g.game_date === date &&
        g.umpire_id === umpireMap.get(umpireName)
      )?.id;

      const result = [];
      for (let i = 0; i < challengeCount; i++) {
        result.push({
          game_id: gameId,
          umpire_id: umpireMap.get(umpireName),
          team_id: teamMap.get(teams[i % teams.length]),
          challenge_date: date,
          outcome: i < overturnedCount ? 'overturned' : 'stands',
          season_year: 2026,
          inning: i + 2,
          ejection_occurred: umpireName === 'CB Bucknor' && i === 4,
          game_type: 'regular',
          week_number: 1,
          week_year: 2026,
        });
      }
      return result;
    };

    // Helper to create Week 2 challenges
    const createWeek2Challenges = (
      umpireName: string,
      date: string,
      challengeCount: number,
      overturnedCount: number,
      teams: string[]
    ) => {
      const gameId = insertedGames!.find(g =>
        g.game_date === date &&
        g.umpire_id === umpireMap.get(umpireName)
      )?.id;

      const result = [];
      for (let i = 0; i < challengeCount; i++) {
        result.push({
          game_id: gameId,
          umpire_id: umpireMap.get(umpireName),
          team_id: teamMap.get(teams[i % teams.length]),
          challenge_date: date,
          outcome: i < overturnedCount ? 'overturned' : 'stands',
          season_year: 2026,
          inning: i + 2,
          ejection_occurred: false,
          game_type: 'regular',
          week_number: 2,
          week_year: 2026,
        });
      }
      return result;
    };

    const challenges = [
      // WEEK 1
      // March 25: NYY @ SF (Jordan Baker) - 3 challenges, 1 overturned
      ...createGameChallenges(null, 'Jordan Baker', '2026-03-25', 3, 1, ['NYY', 'SF']),

      // March 26: MIN @ BAL (Lance Barksdale) - 2 challenges, 0 overturned
      ...createGameChallenges(null, 'Lance Barksdale', '2026-03-26', 2, 0, ['MIN', 'BAL']),

      // March 26: PHI @ TEX (Alfonso Marquez) - 3 challenges, 1 overturned
      ...createGameChallenges(null, 'Alfonso Marquez', '2026-03-26', 3, 1, ['PHI', 'TEX']),

      // March 26: MIL @ CWS (Dan Bellino) - 4 challenges, 2 overturned
      ...createGameChallenges(null, 'Dan Bellino', '2026-03-26', 4, 2, ['MIL', 'CWS']),

      // March 26: CLE @ SEA (Adrian Johnson) - 3 challenges, 1 overturned
      ...createGameChallenges(null, 'Adrian Johnson', '2026-03-26', 3, 1, ['CLE', 'SEA']),

      // March 26: LAD @ AZ (Doug Eddings) - 4 challenges, 1 overturned
      ...createGameChallenges(null, 'Doug Eddings', '2026-03-26', 4, 1, ['LAD', 'AZ']),

      // March 26: PIT @ NYM (Tom Hanahan) - 2 challenges, 0 overturned
      ...createGameChallenges(null, 'Tom Hanahan', '2026-03-26', 2, 0, ['PIT', 'NYM']),

      // March 26: BOS @ CIN (Brian Walsh) - 3 challenges, 1 overturned
      ...createGameChallenges(null, 'Brian Walsh', '2026-03-26', 3, 1, ['BOS', 'CIN']),

      // March 28: BOS @ CIN (CB Bucknor) - 8 challenges, 6 overturned (infamous game)
      ...createGameChallenges(null, 'CB Bucknor', '2026-03-28', 8, 6, ['BOS', 'CIN']),

      // WEEK 2 (March 30 - April 2)
      // March 30: SD @ LAD (Chris Segal) - 5 challenges, 4 overturned (bad week for Chris)
      ...createWeek2Challenges('Chris Segal', '2026-03-30', 5, 4, ['SD', 'LAD']),

      // March 31: BOS @ NYY (Jordan Baker) - 3 challenges, 2 overturned
      ...createWeek2Challenges('Jordan Baker', '2026-03-31', 3, 2, ['BOS', 'NYY']),

      // March 31: PHI @ ATL (Dan Bellino) - 4 challenges, 3 overturned
      ...createWeek2Challenges('Dan Bellino', '2026-03-31', 4, 3, ['PHI', 'ATL']),

      // April 1: TEX @ HOU (CB Bucknor) - 7 challenges, 5 overturned (another rough game)
      ...createWeek2Challenges('CB Bucknor', '2026-04-01', 7, 5, ['TEX', 'HOU']),

      // April 1: STL @ CHC (Alfonso Marquez) - 2 challenges, 1 overturned
      ...createWeek2Challenges('Alfonso Marquez', '2026-04-01', 2, 1, ['STL', 'CHC']),

      // April 2: TOR @ TB (Lance Barksdale) - 3 challenges, 1 overturned
      ...createWeek2Challenges('Lance Barksdale', '2026-04-02', 3, 1, ['TOR', 'TB']),

      // April 2: CIN @ MIL (Tom Hanahan) - 4 challenges, 2 overturned
      ...createWeek2Challenges('Tom Hanahan', '2026-04-02', 4, 2, ['CIN', 'MIL']),
    ];

    const { error: challengesError } = await supabase
      .from('challenges')
      .insert(challenges);

    if (challengesError) throw challengesError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Database populated successfully',
        stats: {
          teams: insertedTeams!.length,
          umpires: insertedUmpires!.length,
          games: insertedGames!.length,
          ejections: ejections.length,
          challenges: challenges.length,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
