/**
 * Football Auction Pro - Settings & Tournament Configuration Page Logic
 * Rule tweaking, Firebase credential management, and Demo Seeder
 */

import { db } from '../db.js';
import { auth } from '../auth.js';
import { sound } from '../sound.js';
import { getActiveFirebaseConfig, saveCustomFirebaseConfig, resetFirebaseConfig } from '../config.js';
import { formatCurrency, showToast, showConfirmDialog } from '../ui.js';

export function initSettingsPage() {
  if (!auth.enforcePageAccess('super_admin')) return;

  loadTournamentSettings();
  loadFirebaseSettings();
  setupFormSubmissions();
  setupDataManagementTools();
}

function loadTournamentSettings() {
  const tourney = db.getTournament();
  if (!tourney) return;

  const nameInput = document.getElementById('settings-tournament-name');
  const timerInput = document.getElementById('settings-timer-duration');
  const incrementInput = document.getElementById('settings-bid-increment');
  const minSquadInput = document.getElementById('settings-min-squad');
  const maxSquadInput = document.getElementById('settings-max-squad');
  const startingPurseInput = document.getElementById('settings-starting-purse');

  if (nameInput) nameInput.value = tourney.name || '';
  if (timerInput) timerInput.value = tourney.timerDuration || 30;
  if (incrementInput) incrementInput.value = tourney.defaultBidIncrement || 5000000;
  if (minSquadInput) minSquadInput.value = tourney.minSquadSize || 8;
  if (maxSquadInput) maxSquadInput.value = tourney.maxSquadSize || 8;
  if (startingPurseInput) startingPurseInput.value = tourney.startingPurse || 1200000000;
}

function loadFirebaseSettings() {
  const config = getActiveFirebaseConfig();
  const apiKeyInput = document.getElementById('fb-api-key');
  const authDomainInput = document.getElementById('fb-auth-domain');
  const projectIdInput = document.getElementById('fb-project-id');
  const storageBucketInput = document.getElementById('fb-storage-bucket');

  if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
  if (authDomainInput) authDomainInput.value = config.authDomain || '';
  if (projectIdInput) projectIdInput.value = config.projectId || '';
  if (storageBucketInput) storageBucketInput.value = config.storageBucket || '';
}

function setupFormSubmissions() {
  // Rules form
  const rulesForm = document.getElementById('tournament-rules-form');
  if (rulesForm) {
    rulesForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('settings-tournament-name').value.trim();
      const timerDuration = Number(document.getElementById('settings-timer-duration').value) || 30;
      const defaultBidIncrement = Number(document.getElementById('settings-bid-increment').value) || 5000000;
      const minSquadSize = Number(document.getElementById('settings-min-squad').value) || 8;
      const maxSquadSize = Number(document.getElementById('settings-max-squad').value) || 8;
      const startingPurse = Number(document.getElementById('settings-starting-purse').value) || 1200000000;

      try {
        db.updateTournament({
          name,
          timerDuration,
          defaultBidIncrement,
          minSquadSize,
          maxSquadSize,
          startingPurse
        });
        showToast("Tournament rules successfully updated", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  // Firebase Config Form
  const fbForm = document.getElementById('firebase-config-form');
  if (fbForm) {
    fbForm.onsubmit = (e) => {
      e.preventDefault();
      const apiKey = document.getElementById('fb-api-key').value.trim();
      const authDomain = document.getElementById('fb-auth-domain').value.trim();
      const projectId = document.getElementById('fb-project-id').value.trim();
      const storageBucket = document.getElementById('fb-storage-bucket').value.trim();

      saveCustomFirebaseConfig({ apiKey, authDomain, projectId, storageBucket });
      showToast("Firebase credentials saved. Realtime Cloud Firestore activated.", "success");
    };
  }

  const resetFbBtn = document.getElementById('btn-reset-firebase');
  if (resetFbBtn) {
    resetFbBtn.onclick = () => {
      resetFirebaseConfig();
      loadFirebaseSettings();
      showToast("Firebase config reverted to default simulator mode", "info");
    };
  }
}

function setupDataManagementTools() {
  // Clear All Players (Empty Roster)
  const clearPlayersBtn = document.getElementById('btn-clear-all-players');
  if (clearPlayersBtn) {
    clearPlayersBtn.onclick = () => {
      showConfirmDialog({
        title: "Clear All Players",
        message: "Are you sure you want to remove all players from the database? This will give you a completely clean roster ready for new CSV uploads.",
        confirmText: "Clear All Players",
        confirmStyle: "btn-danger",
        onConfirm: () => {
          db.saveCollection('players', []);
          const cleanState = {
            status: 'IDLE',
            currentPlayer: null,
            currentBid: 0,
            highestBiddingTeam: null,
            timerSeconds: 30,
            timerRunning: false,
            bidHistory: [],
            lastUpdated: Date.now()
          };
          db.saveCollection('auction_state', cleanState);
          db.addAuditLog('PLAYERS_CLEARED', 'All players cleared from roster');
          showToast("Player roster cleared. Ready for CSV upload.", "info");
        }
      });
    };
  }

  // Clean Reset (keep teams/players but reset auction results)
  const resetAuctionBtn = document.getElementById('btn-reset-auction-state');
  if (resetAuctionBtn) {
    resetAuctionBtn.onclick = () => {
      showConfirmDialog({
        title: "Reset Auction Progress",
        message: "Reset all player statuses back to AVAILABLE and restore team purses to their starting budgets? Player and team rosters will not be deleted.",
        confirmText: "Reset Progress",
        confirmStyle: "btn-danger",
        onConfirm: () => {
          const players = db.getPlayers().map(p => ({
            ...p,
            status: 'AVAILABLE',
            finalPrice: 0,
            soldToTeamId: null,
            soldToTeamName: null
          }));

          const teams = db.getTeams().map(t => ({
            ...t,
            remainingPurse: t.startingPurse,
            totalSpent: 0,
            playersCount: 0,
            squad: []
          }));

          const tourney = db.getTournament();
          const cleanState = {
            status: 'IDLE',
            currentPlayer: null,
            currentBid: 0,
            highestBiddingTeam: null,
            timerSeconds: tourney ? tourney.timerDuration : 30,
            timerRunning: false,
            bidHistory: [],
            lastUpdated: Date.now()
          };

          db.saveCollection('players', players);
          db.saveCollection('teams', teams);
          db.saveCollection('auction_state', cleanState);
          db.addAuditLog('TOURNAMENT_RESET', 'Auction progress reset to starting round', 'Admin');

          showToast("Auction progress reset to Round 1", "info");
        }
      });
    };
  }
}
