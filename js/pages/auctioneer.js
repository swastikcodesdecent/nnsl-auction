/**
 * Football Auction Pro - Auctioneer Control Console Page Logic
 * Touch-optimized controls, rapid team picker, increments, and safety modals
 */

import { db } from '../db.js';
import { auctionEngine } from '../auction-engine.js';
import { auth } from '../auth.js';
import { sound } from '../sound.js';
import { formatCurrency, showToast, showConfirmDialog, ICONS, refreshLucideIcons } from '../ui.js';

let selectedTeamId = null;
let currentIncrement = 5000000; // Default ₹50 Lakh (50,00,000)
let customBidAmount = null;

// Spin Wheel state variables
let wheelPlayers = [];
let wheelAngle = 0;
let wheelVelocity = 0;
let wheelIsSpinning = false;
let wheelAnimId = null;
let wheelSelectedWinner = null;

export function initAuctioneerPage() {
  if (!auth.enforcePageAccess('auctioneer')) return;

  setupIncrementButtons();
  setupActionButtons();
  setupPlayerSelector();
  setupSpinWheel();

  // Subscribe to Teams
  db.subscribe('teams', (teams) => {
    renderTeamPickerGrid(teams || []);
  });

  // Subscribe to Players
  db.subscribe('players', (players) => {
    populatePlayerDropdown(players || []);
  });

  // Subscribe to Auction State
  db.subscribe('auction_state', (state) => {
    if (!state) return;
    renderConsoleState(state);
  });
}

function renderConsoleState(state) {
  const player = state.currentPlayer;
  const tourney = db.getTournament();

  // Connection badge
  const syncBadge = document.getElementById('auctioneer-sync-status');
  if (syncBadge) {
    syncBadge.innerHTML = `<span class="sync-dot"></span> Live Sync`;
    syncBadge.className = 'sync-status';
  }

  // 1. Current Player Cell
  const posBadge = document.getElementById('console-pos-badge');
  const idBadge = document.getElementById('console-id-badge');
  const nameEl = document.getElementById('console-player-name');
  const metaEl = document.getElementById('console-player-meta');

  if (player) {
    if (posBadge) posBadge.textContent = player.position || 'MF';
    if (idBadge) idBadge.textContent = player.id;
    if (nameEl) nameEl.textContent = player.name;
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="pos-badge pos-${player.position}">${player.position}</span>
        <span style="font-family: var(--font-mono); color: var(--text-secondary);">${player.id}</span>
        <span style="color: var(--accent-gold);">Base: ${formatCurrency(player.basePrice, true)}</span>
        <span class="badge badge-${player.status.toLowerCase()}">${player.status}</span>
      `;
    }
  } else {
    if (posBadge) posBadge.textContent = "--";
    if (idBadge) idBadge.textContent = "EMPTY";
    if (nameEl) nameEl.textContent = "No Player Selected";
    if (metaEl) metaEl.innerHTML = `<span style="color: var(--text-muted);">Choose a player from the queue below</span>`;
  }

  // 2. Current Bid & Leading Team
  const bidEl = document.getElementById('console-current-bid');
  const leaderRow = document.getElementById('console-leader-row');

  if (bidEl) bidEl.textContent = formatCurrency(state.currentBid);
  if (leaderRow) {
    if (state.highestBiddingTeam) {
      leaderRow.innerHTML = `
        <span>Leading Team:</span>
        <strong class="monitor-leader-name" style="color: var(--accent-gold);">${state.highestBiddingTeam.name}</strong>
      `;
    } else {
      leaderRow.innerHTML = `<span style="color: var(--text-muted);">Awaiting opening bid</span>`;
    }
  }

  // 3. Timer & Play/Pause State
  const timerBox = document.getElementById('console-timer-val');
  const playPauseBtn = document.getElementById('btn-play-pause');

  if (timerBox) {
    timerBox.textContent = Math.max(0, state.timerSeconds || 0);
    if (state.timerSeconds <= 5 && state.status === 'LIVE') {
      timerBox.classList.add('danger');
    } else {
      timerBox.classList.remove('danger');
    }
  }

  if (playPauseBtn) {
    if (state.status === 'LIVE') {
      playPauseBtn.innerHTML = `${ICONS.pause} Pause`;
      playPauseBtn.className = 'btn btn-secondary timer-btn';
    } else {
      playPauseBtn.innerHTML = `${ICONS.play} Start / Resume`;
      playPauseBtn.className = 'btn btn-primary timer-btn';
    }
    playPauseBtn.disabled = !player;
  }

  // 4. Action Button Disablement States
  const btnBid = document.getElementById('btn-register-bid');
  const btnUndo = document.getElementById('btn-undo-bid');
  const btnSold = document.getElementById('btn-confirm-sold');
  const btnUnsold = document.getElementById('btn-mark-unsold');

  const hasPlayer = !!player;
  const hasLeader = !!state.highestBiddingTeam;

  if (btnBid) btnBid.disabled = !hasPlayer || !selectedTeamId;
  if (btnUndo) btnUndo.disabled = !state.bidHistory || state.bidHistory.length === 0;
  if (btnSold) btnSold.disabled = !hasPlayer || !hasLeader;
  if (btnUnsold) btnUnsold.disabled = !hasPlayer || hasLeader; // Cannot mark unsold if bids exist

  // Update proposed next bid label
  updateNextBidProposal(state);
  refreshLucideIcons();
}

function updateNextBidProposal(state) {
  const proposalEl = document.getElementById('proposed-bid-label');
  if (!proposalEl) return;

  const currentBid = state.currentBid || (state.currentPlayer ? state.currentPlayer.basePrice : 0);
  const nextCalculated = state.highestBiddingTeam ? currentBid + currentIncrement : currentBid;

  proposalEl.textContent = `Submit Bid: ${formatCurrency(customBidAmount || nextCalculated)}`;
}

function renderTeamPickerGrid(teams) {
  const container = document.getElementById('team-picker-grid');
  if (!container) return;

  const state = db.getAuctionState();
  const currentBid = state ? state.currentBid : 0;
  const tourney = db.getTournament();
  const maxSquad = tourney ? tourney.maxSquadSize : 8;

  container.innerHTML = teams.map(team => {
    const isSelected = team.id === selectedTeamId;
    const canAfford = team.remainingPurse >= currentBid;
    const squadFull = (team.playersCount || 0) >= maxSquad;
    const disabled = !canAfford || squadFull;

    return `
      <button type="button" 
        class="team-pick-btn ${isSelected ? 'selected' : ''}" 
        data-team-id="${team.id}"
        ${disabled ? 'disabled' : ''}
        title="${squadFull ? 'Squad limit reached' : !canAfford ? 'Insufficient purse' : ''}">
        <img class="team-pick-logo" src="${team.logo}" onerror="this.src='https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=50'"/>
        <div class="team-pick-info">
          <div class="team-pick-name">${team.name}</div>
          <div class="team-pick-purse">${formatCurrency(team.remainingPurse, true)}</div>
        </div>
      </button>
    `;
  }).join('');

  // Attach click handlers
  container.querySelectorAll('.team-pick-btn').forEach(btn => {
    btn.onclick = () => {
      selectedTeamId = btn.dataset.teamId;
      renderTeamPickerGrid(teams);
      const state = db.getAuctionState();
      if (state) renderConsoleState(state);
    };
  });
}

function setupIncrementButtons() {
  const buttons = document.querySelectorAll('.increment-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentIncrement = Number(btn.dataset.value);
      customBidAmount = null;
      const customInput = document.getElementById('custom-bid-input');
      if (customInput) customInput.value = '';
      
      const state = db.getAuctionState();
      if (state) updateNextBidProposal(state);
    };
  });

  const customInput = document.getElementById('custom-bid-input');
  if (customInput) {
    customInput.oninput = (e) => {
      const val = Number(e.target.value);
      if (val > 0) {
        customBidAmount = val;
        buttons.forEach(b => b.classList.remove('active'));
      } else {
        customBidAmount = null;
      }
      const state = db.getAuctionState();
      if (state) updateNextBidProposal(state);
    };
  }
}

function setupActionButtons() {
  // Register Bid Button
  const btnBid = document.getElementById('btn-register-bid');
  if (btnBid) {
    btnBid.onclick = () => {
      if (!selectedTeamId) {
        showToast("Please select a bidding team first", "warning");
        return;
      }

      const state = db.getAuctionState();
      if (!state.currentPlayer) return;

      const currentBid = state.currentBid;
      const proposedAmount = customBidAmount ? customBidAmount : 
        (state.highestBiddingTeam ? currentBid + currentIncrement : currentBid);

      const result = auctionEngine.onBidAction(selectedTeamId, proposedAmount);
      if (result.success) {
        showToast(`Bid registered for ${formatCurrency(proposedAmount)}`, "success");
      } else {
        showToast(result.error, "error");
      }
    };
  }

  // Undo Last Bid
  const btnUndo = document.getElementById('btn-undo-bid');
  if (btnUndo) {
    btnUndo.onclick = () => {
      showConfirmDialog({
        title: "Undo Last Bid",
        message: "Are you sure you want to retract the most recent bid? The auction will revert to the previous leading team.",
        confirmText: "Undo Bid",
        confirmStyle: "btn-danger",
        onConfirm: () => {
          try {
            db.undoLastBid();
            showToast("Last bid successfully rolled back", "info");
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    };
  }

  // Timer Controls
  const playPauseBtn = document.getElementById('btn-play-pause');
  if (playPauseBtn) {
    playPauseBtn.onclick = () => {
      const state = db.getAuctionState();
      if (state.status === 'LIVE') {
        db.pauseLiveBidding();
      } else {
        db.startLiveBidding();
      }
    };
  }

  const resetTimerBtn = document.getElementById('btn-reset-timer');
  if (resetTimerBtn) {
    resetTimerBtn.onclick = () => {
      db.resetTimer();
      showToast("Timer reset to tournament standard", "info");
    };
  }

  // Confirm SOLD Action
  const btnSold = document.getElementById('btn-confirm-sold');
  if (btnSold) {
    btnSold.onclick = () => {
      const state = db.getAuctionState();
      if (!state.currentPlayer || !state.highestBiddingTeam) return;

      showConfirmDialog({
        title: "Confirm Player Sale (SOLD)",
        message: `Finalize transfer of <strong>${state.currentPlayer.name}</strong> to <strong>${state.highestBiddingTeam.name}</strong> for <strong>${formatCurrency(state.currentBid)}</strong>?<br/><br/>This will permanently deduct the amount from the team's purse.`,
        confirmText: "Confirm SOLD",
        confirmStyle: "btn-success",
        onConfirm: () => {
          const res = auctionEngine.onSoldAction();
          if (res.success) {
            showToast(`SOLD! ${res.res.player.name} transferred to ${res.res.team.name}`, "success");
          } else {
            showToast(res.error, "error");
          }
        }
      });
    };
  }

  // Mark UNSOLD Action
  const btnUnsold = document.getElementById('btn-mark-unsold');
  if (btnUnsold) {
    btnUnsold.onclick = () => {
      const state = db.getAuctionState();
      if (!state.currentPlayer) return;

      showConfirmDialog({
        title: "Mark Player UNSOLD",
        message: `Declare <strong>${state.currentPlayer.name}</strong> as UNSOLD? No purse will be deducted. Player will move to the unsold reserve pool.`,
        confirmText: "Mark UNSOLD",
        confirmStyle: "btn-danger",
        onConfirm: () => {
          const res = auctionEngine.onUnsoldAction();
          if (res.success) {
            showToast(`${res.res.player.name} marked as UNSOLD`, "info");
          } else {
            showToast(res.error, "error");
          }
        }
      });
    };
  }
}

function setupPlayerSelector() {
  const nextBtn = document.getElementById('btn-next-player');
  if (nextBtn) {
    nextBtn.onclick = () => {
      const players = db.getPlayers();
      const nextAvailable = players.find(p => p.status === 'AVAILABLE');
      if (nextAvailable) {
        db.selectPlayer(nextAvailable.id);
        showToast(`Next player loaded: ${nextAvailable.name}`, "info");
      } else {
        showToast("No more available players in standard queue.", "warning");
      }
    };
  }

  const selectDropdown = document.getElementById('select-player-dropdown');
  if (selectDropdown) {
    selectDropdown.onchange = (e) => {
      const id = e.target.value;
      if (id) {
        try {
          db.selectPlayer(id);
          showToast(`Player on stage: ${db.getPlayer(id)?.name}`, "info");
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    };
  }

  const reopenBtn = document.getElementById('btn-reopen-unsold');
  if (reopenBtn) {
    reopenBtn.onclick = () => {
      const selectDropdown = document.getElementById('select-player-dropdown');
      const id = selectDropdown?.value;
      if (!id) {
        showToast("Select an unsold player first", "warning");
        return;
      }
      try {
        db.reopenUnsold(id);
        showToast("Unsold player successfully reopened for bidding", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }
}

function populatePlayerDropdown(players) {
  const dropdown = document.getElementById('select-player-dropdown');
  if (!dropdown) return;

  const currentVal = dropdown.value;
  dropdown.innerHTML = `
    <option value="">-- Choose Player to Call to Stage --</option>
    <optgroup label="Available Players">
      ${players.filter(p => p.status === 'AVAILABLE').map(p => `
        <option value="${p.id}">${p.id} - ${p.name} (${p.position}) - ${formatCurrency(p.basePrice, true)}</option>
      `).join('')}
    </optgroup>
    <optgroup label="Unsold Reserve Pool">
      ${players.filter(p => p.status === 'UNSOLD').map(p => `
        <option value="${p.id}">[UNSOLD] ${p.id} - ${p.name} (${p.position})</option>
      `).join('')}
    </optgroup>
  `;

  if (currentVal) dropdown.value = currentVal;
}

/* ==========================================================================
   NNSL PLAYER SPIN WHEEL LOGIC
   Random player selection wheel with angular momentum, peg clicks & fanfare
   ========================================================================== */
function setupSpinWheel() {
  const openBtn = document.getElementById('btn-open-spin-wheel');
  const modal = document.getElementById('spin-wheel-modal');
  const closeBtn = document.getElementById('btn-close-spin-wheel');
  const spinBtn = document.getElementById('btn-trigger-spin');
  const canvas = document.getElementById('spin-wheel-canvas');
  const winnerBanner = document.getElementById('wheel-winner-banner');
  const winnerName = document.getElementById('wheel-winner-name');
  const winnerDetails = document.getElementById('wheel-winner-details');
  const sendStageBtn = document.getElementById('btn-wheel-send-stage');
  const spinAgainBtn = document.getElementById('btn-wheel-spin-again');
  const poolCountEl = document.getElementById('wheel-pool-count');

  if (!openBtn || !modal || !canvas) return;

  const ctx = canvas.getContext('2d');

  const updateWheelPool = () => {
    const allPlayers = db.getPlayers() || [];
    // Prioritize AVAILABLE players; if none left, include UNSOLD pool
    let pool = allPlayers.filter(p => p.status === 'AVAILABLE');
    if (pool.length === 0) {
      pool = allPlayers.filter(p => p.status === 'UNSOLD');
    }
    wheelPlayers = pool;
    if (poolCountEl) poolCountEl.textContent = wheelPlayers.length;
    drawWheel(ctx, canvas);
  };

  openBtn.onclick = () => {
    modal.style.display = 'flex';
    if (winnerBanner) winnerBanner.style.display = 'none';
    if (spinBtn) spinBtn.disabled = false;
    updateWheelPool();
  };

  const closeModal = () => {
    modal.style.display = 'none';
    if (wheelIsSpinning && wheelAnimId) {
      cancelAnimationFrame(wheelAnimId);
      wheelIsSpinning = false;
    }
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  const triggerSpin = () => {
    if (wheelIsSpinning) return;
    if (wheelPlayers.length === 0) {
      showToast("No players available to spin. Add or reopen players first.", "warning");
      return;
    }

    wheelIsSpinning = true;
    if (spinBtn) spinBtn.disabled = true;
    if (winnerBanner) winnerBanner.style.display = 'none';

    // Randomize initial rotational velocity (0.35 to 0.55 rad/frame)
    wheelVelocity = 0.35 + Math.random() * 0.20;
    let lastSliceIdx = -1;

    const sliceAngle = (2 * Math.PI) / wheelPlayers.length;
    // Top pointer is at 12 o'clock (3*PI/2)
    const pointerAngle = 1.5 * Math.PI;

    const step = () => {
      wheelAngle = (wheelAngle + wheelVelocity) % (2 * Math.PI);
      drawWheel(ctx, canvas);

      // Determine slice directly under top pointer
      let relative = (pointerAngle - wheelAngle) % (2 * Math.PI);
      if (relative < 0) relative += (2 * Math.PI);
      const currentSliceIdx = Math.floor(relative / sliceAngle);

      if (currentSliceIdx !== lastSliceIdx) {
        sound.playWheelTick();
        lastSliceIdx = currentSliceIdx;
      }

      // Smooth decay friction
      wheelVelocity *= 0.984;

      if (wheelVelocity < 0.0012) {
        // Spin finished!
        wheelIsSpinning = false;
        wheelVelocity = 0;
        wheelSelectedWinner = wheelPlayers[currentSliceIdx];

        sound.playWheelWinner();

        if (winnerBanner && wheelSelectedWinner) {
          winnerBanner.style.display = 'block';
          if (winnerName) winnerName.textContent = wheelSelectedWinner.name;
          if (winnerDetails) {
            winnerDetails.innerHTML = `${wheelSelectedWinner.position || 'PLAYER'} • Base Valuation: <strong style="color: #fff;">${formatCurrency(wheelSelectedWinner.basePrice, true)}</strong>`;
          }
        }
        if (spinBtn) spinBtn.disabled = false;
        return;
      }

      wheelAnimId = requestAnimationFrame(step);
    };

    wheelAnimId = requestAnimationFrame(step);
  };

  if (spinBtn) spinBtn.onclick = triggerSpin;
  if (spinAgainBtn) spinAgainBtn.onclick = triggerSpin;

  if (sendStageBtn) {
    sendStageBtn.onclick = () => {
      if (!wheelSelectedWinner) return;
      try {
        db.selectPlayer(wheelSelectedWinner.id);
        showToast(`🎯 ${wheelSelectedWinner.name} called to stage!`, "success");
        closeModal();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }
}

function drawWheel(ctx, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = cx - 14;

  ctx.clearRect(0, 0, width, height);

  if (wheelPlayers.length === 0) {
    // Empty state
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No Available Players', cx, cy);
    return;
  }

  const numSlices = wheelPlayers.length;
  const sliceAngle = (2 * Math.PI) / numSlices;
  const colors = [
    '#0284c7', '#d97706', '#059669', '#7c3aed', '#dc2626',
    '#0891b2', '#db2777', '#4f46e5', '#ea580c', '#0d9488'
  ];

  for (let i = 0; i < numSlices; i++) {
    const start = wheelAngle + i * sliceAngle;
    const end = start + sliceAngle;

    // Wedge
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player name text inside wedge
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    const p = wheelPlayers[i];
    let displayName = p.name || 'Player';
    if (displayName.length > 15) displayName = displayName.substring(0, 14) + '…';

    const fontSize = numSlices > 16 ? 11 : numSlices > 10 ? 12 : 14;
    ctx.font = `bold ${fontSize}px 'Outfit', 'Montserrat', sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(displayName, radius - 24, 0);
    ctx.restore();
  }

  // Outer gold rim
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Perimeter indicator pegs
  for (let i = 0; i < numSlices; i++) {
    const pegAngle = wheelAngle + i * sliceAngle;
    const px = cx + (radius - 2) * Math.cos(pegAngle);
    const py = cy + (radius - 2) * Math.sin(pegAngle);

    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
