/**
 * Football Auction Pro - Auction State & Realtime Timer Engine
 * Coordinates timer ticks, broadcast triggers, and synchronized sound cues
 */

import { db } from './db.js';
import { sound } from './sound.js';

class AuctionEngine {
  constructor() {
    this.timerInterval = null;
    this.currentTimer = 0;
    this.initEngine();
  }

  initEngine() {
    // Listen to real-time auction state changes
    db.subscribe('auction_state', (state) => {
      if (!state) return;

      this.currentTimer = state.timerSeconds;

      if (state.timerRunning && state.status === 'LIVE') {
        this.startLocalTimer();
      } else {
        this.stopLocalTimer();
      }
    });
  }

  startLocalTimer() {
    if (this.timerInterval) return;

    this.timerInterval = setInterval(() => {
      const state = db.getAuctionState();
      if (!state || !state.timerRunning || state.status !== 'LIVE') {
        this.stopLocalTimer();
        return;
      }

      if (state.timerSeconds > 0) {
        const nextSec = state.timerSeconds - 1;
        
        // Sound cue for last 5 seconds
        if (nextSec <= 5 && nextSec > 0) {
          sound.playTimerBeep(false);
        } else if (nextSec === 0) {
          sound.playTimerBeep(true);
        }

        db.tickTimer(nextSec);
      } else {
        // Timer reached 0: pause countdown
        db.pauseLiveBidding();
      }
    }, 1000);
  }

  stopLocalTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // Audio-wrapped action triggers
  onBidAction(teamId, amount) {
    try {
      const res = db.placeBid(teamId, amount);
      sound.playBidChime();
      return { success: true, res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  onSoldAction() {
    try {
      const res = db.confirmSale();
      sound.playGavel();
      setTimeout(() => sound.playSoldFanfare(), 300);
      return { success: true, res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  onUnsoldAction() {
    try {
      const res = db.markUnsold();
      sound.playGavel();
      setTimeout(() => sound.playUnsoldBuzzer(), 300);
      return { success: true, res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export const auctionEngine = new AuctionEngine();
