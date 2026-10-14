/**
 * NNSL 2026 - Televised Players Auction Broadcast Arena Screen Logic
 * Sports broadcast arena graphics with full Lucide icons, live bid battle feed,
 * real-time purse progress telemetry, and celebration overlays.
 */

import { db } from '../db.js';
import { sound } from '../sound.js';
import { formatCurrency, refreshLucideIcons } from '../ui.js';

let lastBidAmount = 0;
let lastStateStatus = 'IDLE';
let lastTimerSecond = -1;
let canvasCtx = null;
let confettiParticles = [];
let confettiAnimationId = null;

export function initLivePage() {
  setupHeaderControls();
  initConfettiCanvas();

  // Listen to Tournament info
  db.subscribe('tournament', (tournament) => {
    if (!tournament) return;
    const tourneySubtitle = document.getElementById('tv-tournament-subtitle');
    if (tourneySubtitle) tourneySubtitle.textContent = tournament.name || 'NNSL 2026';
    const leagueName = document.getElementById('broadcast-league-name');
    if (leagueName) leagueName.textContent = tournament.shortName || 'NNSL';
  });

  // Listen to Teams list for the bottom ticker
  db.subscribe('teams', (teams) => {
    renderTeamsTicker(teams || []);
  });

  // Listen to Live Auction State
  db.subscribe('auction_state', (state) => {
    if (!state) return;
    renderBroadcastState(state);
  });

  refreshLucideIcons();
}

function setupHeaderControls() {
  const soundBtn = document.getElementById('btn-sound-toggle');
  if (soundBtn) {
    soundBtn.innerHTML = '<i data-lucide="volume-2"></i>';
    soundBtn.onclick = () => {
      const isEnabled = sound.toggleSound();
      soundBtn.innerHTML = isEnabled ? '<i data-lucide="volume-2"></i>' : '<i data-lucide="volume-x"></i>';
      soundBtn.title = isEnabled ? "Broadcast Sound ON" : "Broadcast Sound OFF";
      refreshLucideIcons();
    };
  }

  const fullscreenBtn = document.getElementById('btn-fullscreen-toggle');
  if (fullscreenBtn) {
    fullscreenBtn.innerHTML = '<i data-lucide="maximize"></i>';
    fullscreenBtn.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          fullscreenBtn.innerHTML = '<i data-lucide="minimize"></i>';
          refreshLucideIcons();
        }).catch(err => console.warn(err));
      } else {
        document.exitFullscreen().then(() => {
          fullscreenBtn.innerHTML = '<i data-lucide="maximize"></i>';
          refreshLucideIcons();
        }).catch(err => console.warn(err));
      }
    };
  }

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenBtn) {
      fullscreenBtn.innerHTML = document.fullscreenElement ? '<i data-lucide="minimize"></i>' : '<i data-lucide="maximize"></i>';
      refreshLucideIcons();
    }
  });
}

function renderBroadcastState(state) {
  const player = state.currentPlayer;
  const tourney = db.getTournament();

  // Handle Overlay Announcements for SOLD and UNSOLD
  const overlay = document.getElementById('broadcast-overlay');
  if (overlay) {
    if (state.status === 'SOLD' && lastStateStatus !== 'SOLD') {
      triggerSoldCelebration(state);
    } else if (state.status === 'UNSOLD' && lastStateStatus !== 'UNSOLD') {
      triggerUnsoldAnnouncement(state);
    } else if (state.status !== 'SOLD' && state.status !== 'UNSOLD') {
      overlay.classList.remove('active');
      stopConfetti();
    }
  }
  lastStateStatus = state.status;

  // 1. Digital Countdown Timer & Warning Sound
  const timerDigit = document.getElementById('tv-timer-digit');
  const timerPill = document.getElementById('tv-timer-pill');
  const currentSec = Math.max(0, state.timerSeconds || 0);

  if (timerDigit) {
    timerDigit.textContent = currentSec;
    if (currentSec <= 5 && state.status === 'LIVE') {
      timerDigit.classList.add('danger');
      if (timerPill) timerPill.style.borderColor = 'rgba(239, 68, 68, 0.9)';
      // Play tick beep on new countdown second
      if (currentSec !== lastTimerSecond && currentSec > 0) {
        sound.playTimerBeep(currentSec <= 3);
      }
    } else {
      timerDigit.classList.remove('danger');
      if (timerPill) timerPill.style.borderColor = 'rgba(6, 182, 212, 0.65)';
    }
  }
  lastTimerSecond = currentSec;

  if (!player) {
    renderEmptyPodium();
    refreshLucideIcons();
    return;
  }

  // 2. Left Player Spotlight Stage
  const lotEl = document.getElementById('tv-player-lot');
  const ageEl = document.getElementById('tv-player-age');
  const nameEl = document.getElementById('tv-player-name');
  const roleEl = document.getElementById('tv-player-role');
  const subroleEl = document.getElementById('tv-player-subrole');
  const baseEl = document.getElementById('tv-player-base');
  const statusBadge = document.getElementById('tv-stage-status-text');
  const photoContainer = document.getElementById('tv-photo-container');
  const statCategory = document.getElementById('stat-category');
  const statStatus = document.getElementById('stat-status');

  if (lotEl) {
    const num = player.id ? player.id.replace(/\D/g, '') : '';
    lotEl.innerHTML = `<span class="lot-prefix">#</span><span class="lot-num">${num ? parseInt(num, 10) : player.id}</span>`;
  }

  if (ageEl) {
    ageEl.innerHTML = `<i data-lucide="activity"></i> <span>${player.age ? `${player.age} YRS • ${player.nationality || 'ATHLETE'}` : 'PRO ATHLETE'}</span>`;
  }

  if (nameEl) nameEl.textContent = player.name;
  if (roleEl) roleEl.textContent = player.position || 'ALL ROUNDER';
  if (subroleEl) {
    subroleEl.textContent = `${player.club || 'Tournament Star'} • ${player.nationality || 'Professional'}`;
  }
  if (baseEl) baseEl.textContent = formatCurrency(player.basePrice);

  if (statusBadge) {
    if (state.status === 'LIVE') {
      statusBadge.textContent = 'BIDDING IN PROGRESS';
    } else if (state.status === 'PAUSED') {
      statusBadge.textContent = 'AUCTION PAUSED';
    } else {
      statusBadge.textContent = state.status || 'ON PODIUM';
    }
  }

  if (statCategory) statCategory.textContent = player.category || 'MARQUEE';
  if (statStatus) statStatus.textContent = player.status || 'AVAILABLE';

  // Render photo or stylized SVG silhouette
  if (photoContainer) {
    if (player.photo || player.image) {
      photoContainer.innerHTML = `<img src="${player.photo || player.image}" alt="${player.name}" class="tv-player-photo" onerror="this.onerror=null; this.parentElement.innerHTML = getDefaultSilhouetteSvg();" />`;
    } else {
      photoContainer.innerHTML = getDefaultSilhouetteSvg();
    }
  }

  // 3. Right Wing: Bidding Display
  const bidEl = document.getElementById('tv-bid-amount');
  const bidCompactEl = document.getElementById('tv-bid-compact');
  const bidStageLabel = document.getElementById('tv-bid-stage-label');
  const bidNoticeTag = document.getElementById('tv-bid-increment-tag');

  if (bidEl) {
    bidEl.textContent = formatCurrency(state.currentBid);

    if (state.currentBid !== lastBidAmount) {
      bidEl.classList.add('pulse');
      setTimeout(() => bidEl.classList.remove('pulse'), 400);

      if (lastBidAmount > 0 && state.currentBid > lastBidAmount) {
        sound.playBidChime();
        if (bidNoticeTag) {
          const diff = state.currentBid - lastBidAmount;
          bidNoticeTag.textContent = `+ ${formatCurrency(diff, true)} JUMP`;
        }
      }
      lastBidAmount = state.currentBid;
    }
  }

  if (bidCompactEl) {
    if (state.currentBid > 0) {
      bidCompactEl.textContent = `${formatCurrency(state.currentBid, true)} Valuation`;
    } else {
      bidCompactEl.textContent = `Awaiting Opening Bid (${formatCurrency(player.basePrice, true)})`;
    }
  }

  if (bidStageLabel) {
    if (state.status === 'LIVE') {
      if (currentSec <= 5) {
        bidStageLabel.textContent = 'FINAL CALL - HAMMER COMING DOWN';
      } else if (currentSec <= 10) {
        bidStageLabel.textContent = 'GOING TWICE...';
      } else {
        bidStageLabel.textContent = 'CURRENT HIGHEST BID';
      }
    } else {
      bidStageLabel.textContent = state.status;
    }
  }

  // Leading Team Showcase
  const teamCrest = document.getElementById('tv-team-crest');
  const teamCrestLetter = document.getElementById('tv-crest-letter');
  const teamMaxBid = document.getElementById('tv-team-max-bid');
  const teamSquad = document.getElementById('tv-team-squad-count');
  const leadingName = document.getElementById('tv-leading-team-name');
  const teamDot = document.getElementById('tv-team-dot');
  const purseFill = document.getElementById('tv-team-purse-fill');
  const squadDotsContainer = document.getElementById('tv-squad-dots');

  const maxSquad = tourney?.maxSquadSize || 8;

  if (state.highestBiddingTeam) {
    const team = state.highestBiddingTeam;
    const teamColor = team.color || '#8b5cf6';

    if (teamCrest) {
      teamCrest.style.borderColor = teamColor;
      teamCrest.style.boxShadow = `0 0 30px ${teamColor}80`;
    }
    if (teamCrestLetter) teamCrestLetter.textContent = team.name ? team.name.charAt(0).toUpperCase() : 'T';
    if (leadingName) leadingName.textContent = team.name;
    if (teamMaxBid) teamMaxBid.textContent = formatCurrency(team.remainingPurse, true);
    if (teamSquad) teamSquad.textContent = `${team.playersCount || 0} / ${maxSquad} PL`;
    if (teamDot) {
      teamDot.style.background = teamColor;
      teamDot.style.boxShadow = `0 0 10px ${teamColor}`;
    }

    // Purse utilization bar
    if (purseFill) {
      const startingPurse = team.startingPurse || (120 * 10000000);
      const pct = Math.max(0, Math.min(100, Math.round((team.remainingPurse / startingPurse) * 100)));
      purseFill.style.width = `${pct}%`;
    }

    // Visual Squad slot dots (8 slots)
    if (squadDotsContainer) {
      const count = team.playersCount || 0;
      squadDotsContainer.innerHTML = Array.from({ length: maxSquad }).map((_, i) => `
        <span class="squad-slot-dot ${i < count ? 'filled' : ''}" style="${i < count ? `background: ${teamColor}; box-shadow: 0 0 8px ${teamColor};` : ''}"></span>
      `).join('');
    }

  } else {
    if (teamCrest) {
      teamCrest.style.borderColor = '#8b5cf6';
      teamCrest.style.boxShadow = '0 0 25px rgba(139, 92, 246, 0.4)';
    }
    if (teamCrestLetter) teamCrestLetter.textContent = '-';
    if (leadingName) leadingName.textContent = 'NO BID YET';
    if (teamMaxBid) teamMaxBid.textContent = '₹ --';
    if (teamSquad) teamSquad.textContent = `0 / ${maxSquad} PL`;
    if (purseFill) purseFill.style.width = '100%';

    if (squadDotsContainer) {
      squadDotsContainer.innerHTML = Array.from({ length: maxSquad }).map(() => `
        <span class="squad-slot-dot"></span>
      `).join('');
    }
  }

  // 4. Live Bid History Feed
  renderBidHistoryFeed(state.bidHistory || []);

  refreshLucideIcons();
}

function renderEmptyPodium() {
  const lotEl = document.getElementById('tv-player-lot');
  const ageEl = document.getElementById('tv-player-age');
  const nameEl = document.getElementById('tv-player-name');
  const roleEl = document.getElementById('tv-player-role');
  const subroleEl = document.getElementById('tv-player-subrole');
  const baseEl = document.getElementById('tv-player-base');
  const bidEl = document.getElementById('tv-bid-amount');
  const bidCompactEl = document.getElementById('tv-bid-compact');
  const leadingName = document.getElementById('tv-leading-team-name');
  const statusBadge = document.getElementById('tv-stage-status-text');
  const photoContainer = document.getElementById('tv-photo-container');
  const feedList = document.getElementById('tv-bid-history-list');

  if (lotEl) lotEl.innerHTML = '<span class="lot-prefix">#</span><span class="lot-num">-</span>';
  if (ageEl) ageEl.innerHTML = '<i data-lucide="activity"></i> <span>STANDBY</span>';
  if (nameEl) nameEl.textContent = 'WAITING FOR NEXT PLAYER';
  if (roleEl) roleEl.textContent = 'PODIUM VACANT';
  if (subroleEl) subroleEl.textContent = 'Auctioneer to call next lot from console';
  if (baseEl) baseEl.textContent = '₹ 0';
  if (bidEl) bidEl.textContent = '₹ 0';
  if (bidCompactEl) bidCompactEl.textContent = 'Podium Standby';
  if (leadingName) leadingName.textContent = 'AWAITING BIDS';
  if (statusBadge) statusBadge.textContent = 'PODIUM VACANT';
  if (photoContainer) photoContainer.innerHTML = getDefaultSilhouetteSvg();
  if (feedList) feedList.innerHTML = '<div class="feed-item placeholder">Awaiting next lot call...</div>';
}

function renderBidHistoryFeed(history) {
  const container = document.getElementById('tv-bid-history-list');
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = '<div class="feed-item placeholder">No bids placed on this lot yet</div>';
    return;
  }

  const recent = history.slice(0, 4);
  container.innerHTML = recent.map((item, idx) => `
    <div class="feed-item ${idx === 0 ? 'leader' : ''}">
      <span class="feed-team">
        <span class="feed-dot" style="background: ${item.teamColor || '#38bdf8'};"></span>
        <span>${item.teamName || item.teamShortName || 'Club'}</span>
        ${idx === 0 ? '<span style="font-size: 0.65rem; color: #34d399; font-weight: 900; margin-left: 4px;">[LEADER]</span>' : ''}
      </span>
      <span class="feed-val">${formatCurrency(item.amount, true)}</span>
    </div>
  `).join('');
}

function renderTeamsTicker(teams) {
  const ticker = document.getElementById('tv-ribbon-track');
  if (!ticker) return;

  const auctionState = db.getAuctionState();
  const leaderId = auctionState?.highestBiddingTeam?.id;
  const tourney = db.getTournament();
  const maxSquad = tourney?.maxSquadSize || 8;

  if (!teams || teams.length === 0) {
    ticker.innerHTML = '<span style="color: #94a3b8; font-size: 0.9rem;">No participating franchises registered yet</span>';
    return;
  }

  const renderItems = (items) => items.map(team => {
    const isLeader = team.id === leaderId;
    return `
      <div class="tv-ribbon-item ${isLeader ? 'leader' : ''}">
        <span class="ribbon-crest-dot" style="background: ${team.color || '#f59e0b'};"></span>
        <span class="ribbon-team-name">${team.name}</span>
        <span class="ribbon-purse-val">${formatCurrency(team.remainingPurse, true)}</span>
        <span class="ribbon-squad-badge">(${team.playersCount || 0}/${maxSquad} PL)</span>
      </div>
    `;
  }).join('');

  // Duplicate for smooth 360-degree marquee scroll
  ticker.innerHTML = renderItems(teams) + renderItems(teams);
}

// Fullscreen Celebration Overlays for SOLD & UNSOLD
function triggerSoldCelebration(state) {
  const overlay = document.getElementById('broadcast-overlay');
  const box = document.getElementById('broadcast-overlay-box');
  if (!overlay || !box) return;

  sound.playSoldFanfare();

  box.className = 'celebration-box sold-theme';
  box.innerHTML = `
    <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(34, 197, 94, 0.2); border: 1px solid #4ade80; color: #4ade80; padding: 0.35rem 1.5rem; border-radius: 50px; font-weight: 800; letter-spacing: 0.15em; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 1rem;">
      <i data-lucide="award"></i> OFFICIAL TRANSFER CONFIRMED
    </div>
    <div style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 5.5rem; font-weight: 900; color: #22c55e; line-height: 1; text-shadow: 0 0 50px rgba(34, 197, 94, 0.65); margin-bottom: 0.5rem;">
      SOLD!
    </div>
    <h2 style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 3.5rem; font-weight: 900; color: #ffffff; text-transform: uppercase; margin: 0.5rem 0;">
      ${state.currentPlayer.name}
    </h2>
    <div style="font-size: 1.35rem; color: #cbd5e1; font-weight: 700; margin-bottom: 1.75rem;">
      ${state.currentPlayer.position} • ${state.currentPlayer.club || 'Tournament Star'}
    </div>

    <div style="background: rgba(0, 0, 0, 0.55); border: 2px solid rgba(34, 197, 94, 0.5); border-radius: 20px; padding: 1.75rem; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 1.5rem;">
      <div>
        <div style="font-size: 0.85rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.12em;">ACQUIRING FRANCHISE</div>
        <div style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 2.5rem; font-weight: 900; color: #4ade80;">${state.highestBiddingTeam.name}</div>
      </div>
      <div>
        <div style="font-size: 0.85rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.12em;">FINAL DEAL VALUE</div>
        <div style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 3.2rem; font-weight: 900; color: #facc15; text-shadow: 0 0 25px rgba(250, 204, 21, 0.5);">${formatCurrency(state.currentBid)}</div>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  startConfetti();
  refreshLucideIcons();

  setTimeout(() => {
    overlay.classList.remove('active');
    stopConfetti();
  }, 7000);
}

function triggerUnsoldAnnouncement(state) {
  const overlay = document.getElementById('broadcast-overlay');
  const box = document.getElementById('broadcast-overlay-box');
  if (!overlay || !box) return;

  sound.playUnsoldBuzzer();

  box.className = 'celebration-box unsold-theme';
  box.innerHTML = `
    <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #f87171; color: #f87171; padding: 0.35rem 1.5rem; border-radius: 50px; font-weight: 800; letter-spacing: 0.15em; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 1rem;">
      <i data-lucide="alert-circle"></i> BIDDING CONCLUDED
    </div>
    <div style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 5.5rem; font-weight: 900; color: #ef4444; line-height: 1; text-shadow: 0 0 50px rgba(239, 68, 68, 0.65); margin-bottom: 0.5rem;">
      UNSOLD
    </div>
    <h2 style="font-family: 'Outfit', 'Montserrat', sans-serif; font-size: 3.5rem; font-weight: 900; color: #ffffff; text-transform: uppercase; margin: 0.5rem 0;">
      ${state.currentPlayer.name}
    </h2>
    <div style="font-size: 1.3rem; color: #94a3b8; margin: 1rem 0;">
      Base Valuation: <strong style="color: #fff;">${formatCurrency(state.currentPlayer.basePrice)}</strong>
    </div>
    <div style="background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 14px; padding: 1.25rem; color: #fca5a5; font-weight: 700; font-size: 1.1rem;">
      Player moved to Unsold Reserve Pool. Eligible for re-entry in later rounds.
    </div>
  `;

  overlay.classList.add('active');
  refreshLucideIcons();

  setTimeout(() => {
    overlay.classList.remove('active');
  }, 5000);
}

function getDefaultSilhouetteSvg() {
  return `
    <svg class="tv-silhouette-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="52" r="28" fill="#fed7aa" />
      <path d="M90 74 H110 V92 H90 Z" fill="#fed7aa" />
      <path d="M72 48 C72 30, 85 22, 100 22 C115 22, 128 30, 128 48 C128 52, 126 58, 124 60 C120 46, 110 38, 100 38 C90 38, 80 46, 76 60 Z" fill="#0f172a" />
      <path d="M42 195 C42 125, 62 105, 86 92 L92 110 L108 110 L114 92 C138 105, 158 125, 158 195 Z" fill="#1e3a8a" />
      <path d="M86 92 L100 118 L114 92 L108 88 L100 102 L92 88 Z" fill="#f59e0b" />
      <path d="M70 100 C62 115, 52 145, 42 195 L58 195 C66 155, 75 130, 80 115 Z" fill="#0284c7" />
      <path d="M130 100 C138 115, 148 145, 158 195 L142 195 C134 155, 125 130, 120 115 Z" fill="#0284c7" />
      <circle cx="126" cy="138" r="8" fill="#ffffff" stroke="#f59e0b" stroke-width="2" />
      <text x="74" y="142" font-family="'Outfit', sans-serif" font-size="9" font-weight="900" fill="#f59e0b">NNSL</text>
    </svg>
  `;
}

// Confetti Engine
function initConfettiCanvas() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvasCtx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas || !canvasCtx) return;

  confettiParticles = [];
  const colors = ['#f59e0b', '#10b981', '#06b6d4', '#ffffff', '#22c55e', '#a3e635'];

  for (let i = 0; i < 140; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 5 + 3,
      d: Math.random() * 120 + 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.floor(Math.random() * 10) - 10,
      tiltAngleIncremental: (Math.random() * 0.07) + 0.05,
      tiltAngle: 0
    });
  }

  function loop() {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.tilt = Math.sin(p.tiltAngle - (p.r / 3)) * 15;

      canvasCtx.beginPath();
      canvasCtx.lineWidth = p.r;
      canvasCtx.strokeStyle = p.color;
      canvasCtx.moveTo(p.x + p.tilt + (p.r / 2), p.y);
      canvasCtx.lineTo(p.x + p.tilt, p.y + p.tilt + (p.r / 2));
      canvasCtx.stroke();
    });

    confettiAnimationId = requestAnimationFrame(loop);
  }

  loop();
}

function stopConfetti() {
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
  }
  const canvas = document.getElementById('confetti-canvas');
  if (canvas && canvasCtx) {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
