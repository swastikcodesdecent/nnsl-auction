/**
 * NNSL 2026 - Cloud Firestore Integration Layer
 * Direct, real-time synchronization with Google Cloud Firestore
 * Handles real-time onSnapshot listeners, atomic writes, and batch uploading
 */

import { getActiveFirebaseConfig } from './config.js';

let app = null;
let firestore = null;
let isInitialized = false;

// Dynamic import of Firebase modular CDN to support modern browser ES modules
async function initFirebase() {
  if (isInitialized) return { app, firestore };

  try {
    const config = getActiveFirebaseConfig();
    if (!config || !config.apiKey) {
      console.warn("[Firebase] No Firebase configuration found.");
      return { app: null, firestore: null };
    }

    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    app = initializeApp(config);
    firestore = getFirestore(app);
    isInitialized = true;
    console.log("[Firebase] Successfully connected to Cloud Firestore:", config.projectId);
    return { app, firestore };
  } catch (err) {
    console.warn("[Firebase] Could not initialize Cloud Firestore SDK (running in offline/local sync mode):", err.message);
    return { app: null, firestore: null };
  }
}

export const firebaseService = {
  async getDb() {
    if (!firestore) {
      await initFirebase();
    }
    return firestore;
  },

  /**
   * Subscribe to real-time updates for teams collection
   */
  async subscribeTeams(onUpdate) {
    const db = await this.getDb();
    if (!db) return () => {};

    try {
      const { collection, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const teamsRef = collection(db, "teams");
      return onSnapshot(teamsRef, (snapshot) => {
        const teams = [];
        snapshot.forEach((doc) => {
          teams.push({ id: doc.id, ...doc.data() });
        });
        onUpdate(teams);
      }, (err) => {
        console.warn("[Firebase] Teams onSnapshot warning:", err.message);
      });
    } catch (e) {
      console.warn("[Firebase] subscribeTeams error:", e);
      return () => {};
    }
  },

  /**
   * Subscribe to real-time updates for players collection
   */
  async subscribePlayers(onUpdate) {
    const db = await this.getDb();
    if (!db) return () => {};

    try {
      const { collection, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const playersRef = collection(db, "players");
      return onSnapshot(playersRef, (snapshot) => {
        const players = [];
        snapshot.forEach((doc) => {
          players.push({ id: doc.id, ...doc.data() });
        });
        onUpdate(players);
      }, (err) => {
        console.warn("[Firebase] Players onSnapshot warning:", err.message);
      });
    } catch (e) {
      console.warn("[Firebase] subscribePlayers error:", e);
      return () => {};
    }
  },

  /**
   * Subscribe to real-time updates for live auction state
   */
  async subscribeAuctionState(onUpdate) {
    const db = await this.getDb();
    if (!db) return () => {};

    try {
      const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const stateRef = doc(db, "auctionState", "current");
      return onSnapshot(stateRef, (docSnap) => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data());
        }
      }, (err) => {
        console.warn("[Firebase] AuctionState onSnapshot warning:", err.message);
      });
    } catch (e) {
      console.warn("[Firebase] subscribeAuctionState error:", e);
      return () => {};
    }
  },

  /**
   * Subscribe to tournament configuration
   */
  async subscribeTournament(onUpdate) {
    const db = await this.getDb();
    if (!db) return () => {};

    try {
      const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const tourneyRef = doc(db, "tournament", "current");
      return onSnapshot(tourneyRef, (docSnap) => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data());
        }
      }, (err) => {
        console.warn("[Firebase] Tournament onSnapshot warning:", err.message);
      });
    } catch (e) {
      console.warn("[Firebase] subscribeTournament error:", e);
      return () => {};
    }
  },

  /**
   * Persist a single team to Firestore
   */
  async saveTeam(team) {
    const db = await this.getDb();
    if (!db || !team.id) return;
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await setDoc(doc(db, "teams", team.id), team, { merge: true });
    } catch (e) {
      console.warn("[Firebase] Failed to save team to Firestore:", e);
    }
  },

  /**
   * Delete a team from Firestore
   */
  async deleteTeam(teamId) {
    const db = await this.getDb();
    if (!db || !teamId) return;
    try {
      const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await deleteDoc(doc(db, "teams", teamId));
    } catch (e) {
      console.warn("[Firebase] Failed to delete team from Firestore:", e);
    }
  },

  /**
   * Persist a player to Firestore
   */
  async savePlayer(player) {
    const db = await this.getDb();
    if (!db || !player.id) return;
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await setDoc(doc(db, "players", String(player.id)), player, { merge: true });
    } catch (e) {
      console.warn("[Firebase] Failed to save player to Firestore:", e);
    }
  },

  /**
   * Bulk upload players to Firestore using batch write
   */
  async bulkSavePlayers(players) {
    const db = await this.getDb();
    if (!db || !players || players.length === 0) return;
    try {
      const { doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      // Firestore batch limit is 500 operations
      const batchSize = 400;
      for (let i = 0; i < players.length; i += batchSize) {
        const chunk = players.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(p => {
          const ref = doc(db, "players", String(p.id));
          batch.set(ref, p, { merge: true });
        });
        await batch.commit();
      }
      console.log(`[Firebase] Batch uploaded ${players.length} players to Cloud Firestore.`);
    } catch (e) {
      console.warn("[Firebase] Failed to batch save players to Firestore:", e);
    }
  },

  /**
   * Persist live auction state to Firestore
   */
  async saveAuctionState(state) {
    const db = await this.getDb();
    if (!db || !state) return;
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await setDoc(doc(db, "auctionState", "current"), state);
    } catch (e) {
      console.warn("[Firebase] Failed to save auction state to Firestore:", e);
    }
  },

  /**
   * Persist tournament settings to Firestore
   */
  async saveTournament(tourney) {
    const db = await this.getDb();
    if (!db || !tourney) return;
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await setDoc(doc(db, "tournament", "current"), tourney);
    } catch (e) {
      console.warn("[Firebase] Failed to save tournament to Firestore:", e);
    }
  },

  /**
   * Clear all players from Firestore
   */
  async clearAllPlayers(playerIds) {
    const db = await this.getDb();
    if (!db) return;
    try {
      const { doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      if (playerIds && playerIds.length > 0) {
        const batch = writeBatch(db);
        playerIds.forEach(id => {
          batch.delete(doc(db, "players", String(id)));
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn("[Firebase] Failed to clear players from Firestore:", e);
    }
  }
};
