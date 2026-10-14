/**
 * NNSL 2026 - Clean Tournament Configuration
 * Confined Sector Edition in INR (₹)
 * 120 Crore budget per franchise, strict 8-player squad limits.
 * All demo data completely removed. Everything is created and stored in Firebase.
 */

export const INITIAL_TOURNAMENT_CONFIG = {
  id: 'tournament_nnsl_2026',
  name: 'NNSL 2026',
  leagueTitle: 'NNSL PLAYERS AUCTION',
  currency: 'INR',
  currencySymbol: '₹',
  timerDuration: 30, // seconds
  defaultBidIncrement: 5000000, // ₹ 50 Lakh
  minSquadSize: 8, // Exactly 8 players required
  maxSquadSize: 8, // Exactly 8 players maximum
  startingPurse: 1200000000 // ₹ 120 Crore (₹ 1,20,00,00,000)
};

// Zero demo teams. All teams are created via Clubs HQ and synced to Firebase.
export const INITIAL_TEAMS = [];

// Zero demo players. All players are imported via CSV or added manually and synced to Firebase.
export const INITIAL_PLAYERS = [];
