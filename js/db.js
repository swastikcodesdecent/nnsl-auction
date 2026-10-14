/**
 * Football Auction Pro - Unified Database & Real-Time Sync Service Layer
 * Supports Cloud Firestore with real-time snapshots and cross-tab BroadcastChannel sync
 * Enforces transaction safety, integer purse arithmetic, and comprehensive audit logs
 */

import { INITIAL_TOURNAMENT_CONFIG, INITIAL_TEAMS, INITIAL_PLAYERS } from './demo-data.js';
import { isFirebaseConfigured, getActiveFirebaseConfig } from './config.js';
import { firebaseService } from './firebase.js';

class AuctionDatabase {
  constructor() {
    this.broadcastChannel = null;
    this.listeners = new Map();
    this.initRealtimeChannel();
    this.ensureInitializedData();
    this.initFirestoreSync();
  }

  initRealtimeChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('football_auction_realtime');
        this.broadcastChannel.onmessage = (event) => {
          const { collection, data } = event.data;
          this.triggerListeners(collection, data);
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported in this environment", e);
    }
  }

  initFirestoreSync() {
    // 1. Synchronize Teams from Cloud Firestore in real time
    firebaseService.subscribeTeams((firestoreTeams) => {
      if (Array.isArray(firestoreTeams)) {
        localStorage.setItem('fa_teams', JSON.stringify(firestoreTeams));
        this.broadcastUpdate('teams', firestoreTeams);
      }
    });

    // 2. Synchronize Players from Cloud Firestore in real time
    firebaseService.subscribePlayers((firestorePlayers) => {
      if (Array.isArray(firestorePlayers)) {
        localStorage.setItem('fa_players', JSON.stringify(firestorePlayers));
        this.broadcastUpdate('players', firestorePlayers);
      }
    });

    // 3. Synchronize Live Auction State from Cloud Firestore in real time
    firebaseService.subscribeAuctionState((firestoreState) => {
      if (firestoreState && typeof firestoreState === 'object') {
        localStorage.setItem('fa_auction_state', JSON.stringify(firestoreState));
        this.broadcastUpdate('auction_state', firestoreState);
      }
    });

    // 4. Synchronize Tournament Configuration from Cloud Firestore
    firebaseService.subscribeTournament((firestoreTourney) => {
      if (firestoreTourney && typeof firestoreTourney === 'object') {
        localStorage.setItem('fa_tournament', JSON.stringify(firestoreTourney));
        this.broadcastUpdate('tournament', firestoreTourney);
      }
    });
  }

  ensureInitializedData() {
    if (!localStorage.getItem('nnsl_v8_clean_firebase_sync')) {
      this.resetDatabase();
    }
  }

  resetDatabase() {
    localStorage.setItem('fa_tournament', JSON.stringify(INITIAL_TOURNAMENT_CONFIG));
    localStorage.setItem('fa_teams', JSON.stringify(INITIAL_TEAMS));
    localStorage.setItem('fa_players', JSON.stringify(INITIAL_PLAYERS));
    
    const initialAuctionState = {
      status: 'IDLE', // IDLE, PLAYER_SELECTED, LIVE, PAUSED, SOLD, UNSOLD, COMPLETED
      currentPlayer: null,
      currentBid: 0,
      highestBiddingTeam: null,
      timerSeconds: INITIAL_TOURNAMENT_CONFIG.timerDuration,
      timerRunning: false,
      bidHistory: [],
      lastUpdated: Date.now()
    };
    localStorage.setItem('fa_auction_state', JSON.stringify(initialAuctionState));
    
    const initialAudit = [
      {
        id: 'log_' + Date.now(),
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_INITIALIZATION',
        description: 'NNSL 2026 auction initialized. 8-player squad limits, ₹120 Crore franchise budgets. Ready for CSV upload.',
        performedBy: 'System'
      }
    ];
    localStorage.setItem('fa_audit_logs', JSON.stringify(initialAudit));
    localStorage.setItem('nnsl_v8_clean_firebase_sync', 'true');

    this.broadcastUpdate('tournament', INITIAL_TOURNAMENT_CONFIG);
    this.broadcastUpdate('teams', INITIAL_TEAMS);
    this.broadcastUpdate('players', INITIAL_PLAYERS);
    this.broadcastUpdate('auction_state', initialAuctionState);
    this.broadcastUpdate('audit_logs', initialAudit);
  }

  // --- Realtime Broadcast Dispatcher ---
  broadcastUpdate(collection, data) {
    this.triggerListeners(collection, data);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ collection, data });
      } catch (e) {
        console.warn("Failed to post broadcast message", e);
      }
    }
  }

  subscribe(collection, callback) {
    if (!this.listeners.has(collection)) {
      this.listeners.set(collection, new Set());
    }
    this.listeners.get(collection).add(callback);

    // Initial trigger with current state
    const currentData = this.getCollection(collection);
    callback(currentData);

    return () => {
      const set = this.listeners.get(collection);
      if (set) set.delete(callback);
    };
  }

  triggerListeners(collection, data) {
    const callbacks = this.listeners.get(collection);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(data); } catch (err) { console.error("Listener error:", err); }
      });
    }
  }

  getCollection(name) {
    try {
      const raw = localStorage.getItem(`fa_${name}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveCollection(name, data) {
    localStorage.setItem(`fa_${name}`, JSON.stringify(data));
    this.broadcastUpdate(name, data);

    // Sync authoritative state changes to Cloud Firestore
    if (name === 'auction_state') {
      firebaseService.saveAuctionState(data);
    } else if (name === 'tournament') {
      firebaseService.saveTournament(data);
    }
  }

  // --- Audit Logging ---
  addAuditLog(action, description, performedBy = 'Auctioneer', extra = {}) {
    const logs = this.getCollection('audit_logs') || [];
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      action,
      description,
      performedBy,
      extra
    };
    logs.unshift(entry);
    if (logs.length > 500) logs.pop(); // Keep last 500 records
    this.saveCollection('audit_logs', logs);
  }

  // --- State Query Getters ---
  getAuctionState() {
    return this.getCollection('auction_state');
  }

  getPlayers() {
    return this.getCollection('players') || [];
  }

  getPlayer(id) {
    return this.getPlayers().find(p => p.id === id);
  }

  getTeams() {
    return this.getCollection('teams') || [];
  }

  getTeam(id) {
    return this.getTeams().find(t => t.id === id);
  }

  getTournament() {
    return this.getCollection('tournament') || INITIAL_TOURNAMENT_CONFIG;
  }

  getAuditLogs() {
    return this.getCollection('audit_logs') || [];
  }

  // --- Atomic Auction Operations & Financial Transactions ---

  // Select a player to put on stage
  selectPlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) throw new Error("Player not found: " + playerId);

    const tournament = this.getTournament();
    const auctionState = {
      status: 'PLAYER_SELECTED',
      currentPlayer: player,
      currentBid: player.basePrice,
      highestBiddingTeam: null,
      timerSeconds: tournament.timerDuration,
      timerRunning: false,
      bidHistory: [],
      lastUpdated: Date.now()
    };

    // Update player status to LIVE in database
    const players = this.getPlayers().map(p => {
      if (p.id === playerId) return { ...p, status: 'LIVE' };
      if (p.status === 'LIVE' && p.id !== playerId) return { ...p, status: 'AVAILABLE' };
      return p;
    });

    this.saveCollection('players', players);
    this.saveCollection('auction_state', auctionState);
    this.addAuditLog('PLAYER_SELECTED', `Selected ${player.name} (${player.id}) for auction at base price ${player.basePrice}`);
    return auctionState;
  }

  // Start countdown & live bidding
  startLiveBidding() {
    const state = this.getAuctionState();
    if (!state.currentPlayer) throw new Error("No player selected");

    state.status = 'LIVE';
    state.timerRunning = true;
    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
    this.addAuditLog('AUCTION_STARTED', `Bidding started for ${state.currentPlayer.name}`);
    return state;
  }

  // Pause bidding
  pauseLiveBidding() {
    const state = this.getAuctionState();
    state.status = 'PAUSED';
    state.timerRunning = false;
    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
    this.addAuditLog('AUCTION_PAUSED', `Bidding paused for ${state.currentPlayer?.name}`);
    return state;
  }

  // Resume bidding
  resumeLiveBidding() {
    const state = this.getAuctionState();
    state.status = 'LIVE';
    state.timerRunning = true;
    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
    this.addAuditLog('AUCTION_RESUMED', `Bidding resumed for ${state.currentPlayer?.name}`);
    return state;
  }

  // Reset Timer to Tournament Duration
  resetTimer() {
    const state = this.getAuctionState();
    const tourney = this.getTournament();
    state.timerSeconds = tourney.timerDuration;
    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
    return state;
  }

  // Update Timer Tick
  tickTimer(newSeconds) {
    const state = this.getAuctionState();
    state.timerSeconds = newSeconds;
    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
  }

  // Place a Bid with full validation
  placeBid(teamId, amount) {
    const state = this.getAuctionState();
    if (!state.currentPlayer) throw new Error("No player on auction");
    if (state.status !== 'LIVE' && state.status !== 'PLAYER_SELECTED') {
      throw new Error("Bidding is not currently live");
    }

    const team = this.getTeam(teamId);
    if (!team) throw new Error("Team not found");

    const tournament = this.getTournament();
    const bidAmount = Math.round(Number(amount));

    // Purse Validation
    if (bidAmount > team.remainingPurse) {
      throw new Error(`Insufficient funds: ${team.name} has remaining purse of ${team.remainingPurse}, cannot bid ${bidAmount}`);
    }

    // Squad size limit check
    if (team.playersCount >= tournament.maxSquadSize) {
      throw new Error(`Squad limit reached: ${team.name} already has ${team.playersCount}/${tournament.maxSquadSize} players`);
    }

    // Bid must be higher than current bid (or equal to base price on first bid)
    if (state.highestBiddingTeam && bidAmount <= state.currentBid) {
      throw new Error(`Bid amount ${bidAmount} must be greater than current bid ${state.currentBid}`);
    }
    if (!state.highestBiddingTeam && bidAmount < state.currentPlayer.basePrice) {
      throw new Error(`Bid must at least meet base price ${state.currentPlayer.basePrice}`);
    }

    const bidRecord = {
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName,
      teamLogo: team.logo,
      amount: bidAmount,
      timestamp: Date.now()
    };

    state.currentBid = bidAmount;
    state.highestBiddingTeam = team;
    state.bidHistory.unshift(bidRecord);
    state.status = 'LIVE';
    state.timerRunning = true;
    state.timerSeconds = tournament.timerDuration; // Reset timer on each bid
    state.lastUpdated = Date.now();

    this.saveCollection('auction_state', state);
    this.addAuditLog('BID_PLACED', `${team.name} placed bid of ${bidAmount} on ${state.currentPlayer.name}`, 'Auctioneer', {
      teamId: team.id,
      playerId: state.currentPlayer.id,
      amount: bidAmount
    });

    return state;
  }

  // Undo Last Bid
  undoLastBid() {
    const state = this.getAuctionState();
    if (!state.bidHistory || state.bidHistory.length === 0) {
      throw new Error("No bids to undo for current player");
    }

    const removedBid = state.bidHistory.shift();

    if (state.bidHistory.length > 0) {
      const prevBid = state.bidHistory[0];
      const prevTeam = this.getTeam(prevBid.teamId);
      state.currentBid = prevBid.amount;
      state.highestBiddingTeam = prevTeam;
    } else {
      // Revert back to base price
      state.currentBid = state.currentPlayer.basePrice;
      state.highestBiddingTeam = null;
    }

    state.lastUpdated = Date.now();
    this.saveCollection('auction_state', state);
    this.addAuditLog('BID_UNDONE', `Undid bid of ${removedBid.amount} by ${removedBid.teamName} on ${state.currentPlayer?.name}`);
    return state;
  }

  // Confirm SOLD - Finalizes sale, deducts purse, transfers player to squad
  confirmSale() {
    const state = this.getAuctionState();
    if (!state.currentPlayer) throw new Error("No player selected");
    if (!state.highestBiddingTeam) throw new Error("Cannot sell: No team has placed a bid");

    const player = this.getPlayer(state.currentPlayer.id);
    const team = this.getTeam(state.highestBiddingTeam.id);
    const finalAmount = Math.round(Number(state.currentBid));

    // Authoritative check
    if (finalAmount > team.remainingPurse) {
      throw new Error(`Financial constraint violation: ${team.name} does not have sufficient purse`);
    }

    const tournament = this.getTournament();
    if (team.playersCount >= tournament.maxSquadSize) {
      throw new Error(`Squad limit reached: ${team.name} already has ${team.playersCount}/${tournament.maxSquadSize} players`);
    }

    // 1. Deduct Purse and update Squad
    const teams = this.getTeams().map(t => {
      if (t.id === team.id) {
        return {
          ...t,
          remainingPurse: t.remainingPurse - finalAmount,
          totalSpent: t.totalSpent + finalAmount,
          playersCount: t.playersCount + 1,
          squad: [...(t.squad || []), {
            id: player.id,
            name: player.name,
            position: player.position,
            photo: player.photo,
            price: finalAmount
          }]
        };
      }
      return t;
    });

    // 2. Update Player status to SOLD
    const players = this.getPlayers().map(p => {
      if (p.id === player.id) {
        return {
          ...p,
          status: 'SOLD',
          finalPrice: finalAmount,
          soldToTeamId: team.id,
          soldToTeamName: team.name
        };
      }
      return p;
    });

    // 3. Update Auction State to SOLD
    state.status = 'SOLD';
    state.timerRunning = false;
    state.lastUpdated = Date.now();

    this.saveCollection('teams', teams);
    this.saveCollection('players', players);
    this.saveCollection('auction_state', state);

    this.addAuditLog('PLAYER_SOLD', `SOLD: ${player.name} transferred to ${team.name} for ${finalAmount}`, 'Auctioneer', {
      playerId: player.id,
      teamId: team.id,
      price: finalAmount
    });

    return { player, team, finalAmount };
  }

  // Mark UNSOLD - Never deducts money
  markUnsold() {
    const state = this.getAuctionState();
    if (!state.currentPlayer) throw new Error("No player selected");

    const player = this.getPlayer(state.currentPlayer.id);

    const players = this.getPlayers().map(p => {
      if (p.id === player.id) {
        return {
          ...p,
          status: 'UNSOLD',
          finalPrice: 0,
          soldToTeamId: null,
          soldToTeamName: null
        };
      }
      return p;
    });

    state.status = 'UNSOLD';
    state.timerRunning = false;
    state.highestBiddingTeam = null;
    state.lastUpdated = Date.now();

    this.saveCollection('players', players);
    this.saveCollection('auction_state', state);

    this.addAuditLog('PLAYER_UNSOLD', `UNSOLD: ${player.name} passed with 0 bids`, 'Auctioneer', {
      playerId: player.id
    });

    return { player };
  }

  // Reopen an unsold player
  reopenUnsold(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) throw new Error("Player not found");

    const players = this.getPlayers().map(p => {
      if (p.id === playerId) {
        return { ...p, status: 'AVAILABLE', finalPrice: 0, soldToTeamId: null, soldToTeamName: null };
      }
      return p;
    });

    this.saveCollection('players', players);
    this.addAuditLog('PLAYER_REOPENED', `Reopened unsold player: ${player.name} is now available`);
    return this.selectPlayer(playerId);
  }

  // Undo a Confirmed Sale (Rollback transaction)
  undoSale(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.status !== 'SOLD') {
      throw new Error("Player is not in SOLD state");
    }

    const teamId = player.soldToTeamId;
    const refundAmount = player.finalPrice;

    // Refund Team
    const teams = this.getTeams().map(t => {
      if (t.id === teamId) {
        return {
          ...t,
          remainingPurse: t.remainingPurse + refundAmount,
          totalSpent: Math.max(0, t.totalSpent - refundAmount),
          playersCount: Math.max(0, t.playersCount - 1),
          squad: (t.squad || []).filter(item => item.id !== playerId)
        };
      }
      return t;
    });

    // Reset Player
    const players = this.getPlayers().map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          status: 'AVAILABLE',
          finalPrice: 0,
          soldToTeamId: null,
          soldToTeamName: null
        };
      }
      return p;
    });

    this.saveCollection('teams', teams);
    this.saveCollection('players', players);

    this.addAuditLog('SALE_REVERSED', `REVERSAL: Sale of ${player.name} reversed. Refunded ${refundAmount} to team ${teamId}`, 'Admin');
  }

  // Save/Update Player
  savePlayer(playerData) {
    const players = this.getPlayers();
    const existingIdx = players.findIndex(p => p.id === playerData.id);
    
    if (existingIdx >= 0) {
      players[existingIdx] = { ...players[existingIdx], ...playerData };
      this.addAuditLog('PLAYER_UPDATED', `Updated player profile: ${playerData.name}`);
    } else {
      // Check duplicate ID
      if (players.some(p => p.id === playerData.id)) {
        throw new Error(`Player ID ${playerData.id} already exists`);
      }
      const newPlayer = {
        ...playerData,
        status: playerData.status || 'AVAILABLE',
        finalPrice: 0,
        soldToTeamId: null
      };
      players.push(newPlayer);
      this.addAuditLog('PLAYER_ADDED', `Added new player: ${playerData.name} (${playerData.id})`);
    }

    const savedPlayer = players.find(p => p.id === playerData.id);
    this.saveCollection('players', players);
    if (savedPlayer) {
      firebaseService.savePlayer(savedPlayer);
    }
  }

  // Bulk Save / Import Players (CSV batch upload to Firebase)
  bulkSavePlayers(playersList) {
    if (!Array.isArray(playersList) || playersList.length === 0) return;

    const currentPlayers = this.getPlayers();
    playersList.forEach(newP => {
      const idx = currentPlayers.findIndex(p => p.id === newP.id);
      if (idx >= 0) {
        currentPlayers[idx] = { ...currentPlayers[idx], ...newP };
      } else {
        currentPlayers.push({
          ...newP,
          status: newP.status || 'AVAILABLE',
          finalPrice: 0,
          soldToTeamId: null
        });
      }
    });

    this.saveCollection('players', currentPlayers);
    firebaseService.bulkSavePlayers(playersList);
    this.addAuditLog('PLAYERS_BULK_IMPORTED', `Bulk imported ${playersList.length} players to roster and Firebase.`);
  }

  // Delete Player
  deletePlayer(playerId) {
    const players = this.getPlayers();
    const p = players.find(x => x.id === playerId);
    if (p && p.status === 'SOLD') {
      throw new Error("Cannot delete a player who has already been SOLD. Undo the sale first.");
    }
    const filtered = players.filter(x => x.id !== playerId);
    this.saveCollection('players', filtered);
    firebaseService.deletePlayer(playerId);
    this.addAuditLog('PLAYER_DELETED', `Deleted player ${playerId}`);
  }

  // Save/Update Team
  saveTeam(teamData) {
    const teams = this.getTeams();
    const idx = teams.findIndex(t => t.id === teamData.id);
    let targetTeam;

    if (idx >= 0) {
      teams[idx] = { ...teams[idx], ...teamData };
      targetTeam = teams[idx];
      this.addAuditLog('TEAM_UPDATED', `Updated team profile: ${teamData.name}`);
    } else {
      targetTeam = {
        ...teamData,
        remainingPurse: teamData.startingPurse,
        totalSpent: 0,
        playersCount: 0,
        squad: []
      };
      teams.push(targetTeam);
      this.addAuditLog('TEAM_ADDED', `Created new team: ${teamData.name}`);
    }

    this.saveCollection('teams', teams);
    firebaseService.saveTeam(targetTeam);
  }

  // Delete Team
  deleteTeam(teamId) {
    const team = this.getTeam(teamId);
    if (team && team.squad && team.squad.length > 0) {
      throw new Error(`Cannot delete team ${team.name}: squad contains purchased players.`);
    }
    const filtered = this.getTeams().filter(t => t.id !== teamId);
    this.saveCollection('teams', filtered);
    firebaseService.deleteTeam(teamId);
    this.addAuditLog('TEAM_DELETED', `Deleted team: ${teamId}`);
  }

  // Update Tournament Settings
  updateTournament(config) {
    const current = this.getTournament();
    const updated = { ...current, ...config };
    this.saveCollection('tournament', updated);
    firebaseService.saveTournament(updated);
    this.addAuditLog('SETTINGS_UPDATED', 'Tournament rules and configuration updated');
  }
}

export const db = new AuctionDatabase();
