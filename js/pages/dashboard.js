/**
 * Football Auction Pro - Admin Dashboard Logic
 * High-level Tournament Analytics, Real-time Status, Financial KPIs, and Audit Records
 */

import { db } from '../db.js';
import { auth } from '../auth.js';
import { formatCurrency, showToast, showConfirmDialog, ICONS, refreshLucideIcons } from '../ui.js';

export function initDashboardPage() {
  if (!auth.enforcePageAccess('super_admin')) return;

  setupAuditExport();

  // Subscribe to all core collections for live reactive dashboard
  db.subscribe('players', () => updateDashboardMetrics());
  db.subscribe('teams', () => updateDashboardMetrics());
  db.subscribe('auction_state', (state) => renderLiveMonitorWidget(state));
  db.subscribe('audit_logs', (logs) => renderAuditTrail(logs || []));
}

function updateDashboardMetrics() {
  const players = db.getPlayers();
  const teams = db.getTeams();

  const totalPlayers = players.length;
  const soldPlayers = players.filter(p => p.status === 'SOLD');
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD');
  const availablePlayers = players.filter(p => p.status === 'AVAILABLE');

  const totalSpent = soldPlayers.reduce((acc, p) => acc + (p.finalPrice || 0), 0);
  const avgPrice = soldPlayers.length ? Math.round(totalSpent / soldPlayers.length) : 0;

  // Set KPI Cards
  const totalEl = document.getElementById('kpi-total-players');
  const soldEl = document.getElementById('kpi-sold-players');
  const unsoldEl = document.getElementById('kpi-unsold-players');
  const availEl = document.getElementById('kpi-available-players');
  const spentEl = document.getElementById('kpi-total-spent');
  const avgEl = document.getElementById('kpi-avg-price');

  if (totalEl) totalEl.textContent = totalPlayers;
  if (soldEl) soldEl.textContent = soldPlayers.length;
  if (unsoldEl) unsoldEl.textContent = unsoldPlayers.length;
  if (availEl) availEl.textContent = availablePlayers.length;
  if (spentEl) spentEl.textContent = formatCurrency(totalSpent, true);
  if (avgEl) avgEl.textContent = formatCurrency(avgPrice, true);

  renderTeamsLeaderboardTable(teams);
  renderRecentSoldTable(soldPlayers);
  refreshLucideIcons();
}

function renderLiveMonitorWidget(state) {
  const container = document.getElementById('dashboard-live-card');
  if (!container) return;

  if (!state || !state.currentPlayer) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <p style="font-size: 1rem; margin-bottom: 0.75rem;">No player currently on auction stage.</p>
        <a href="auctioneer.html" class="btn btn-primary btn-sm">${ICONS.play} Open Auctioneer Console</a>
      </div>
    `;
    refreshLucideIcons();
    return;
  }

  const p = state.currentPlayer;
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 1.25rem;">
        <div style="width: 60px; height: 70px; border-radius: var(--radius-md); background: radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.25) 0%, rgba(10, 14, 25, 0.95) 100%); border: 1px solid var(--border-medium); display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span style="font-family: var(--font-display); font-size: 1.8rem; font-weight: 800; color: #fff; line-height: 1;">${p.position || 'MF'}</span>
          <span style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--accent-cyan); margin-top: 2px;">${p.id}</span>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="pos-badge pos-${p.position}">${p.position}</span>
            <span class="badge badge-${state.status.toLowerCase()}">${state.status}</span>
          </div>
          <h3 style="font-family: var(--font-display); font-size: 1.4rem; text-transform: uppercase; margin: 0.2rem 0;">${p.name}</h3>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${p.nationality || 'Athlete'} ${p.club ? `• ${p.club}` : ''}</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 2rem;">
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Current Bid</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 700; color: var(--text-gold); line-height: 1;">${formatCurrency(state.currentBid)}</div>
          <div style="font-size: 0.82rem; color: #fff; margin-top: 0.2rem;">
            ${state.highestBiddingTeam ? `Leader: <strong>${state.highestBiddingTeam.name}</strong>` : 'No bids registered'}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <a href="live.html" target="_blank" class="btn btn-outline btn-sm">${ICONS.fullscreen} View Live Screen</a>
          <a href="auctioneer.html" class="btn btn-primary btn-sm">${ICONS.gavel} Control Room</a>
        </div>
      </div>
    </div>
  `;
  refreshLucideIcons();
}

function renderTeamsLeaderboardTable(teams) {
  const tbody = document.getElementById('dashboard-teams-tbody');
  if (!tbody) return;

  const tourney = db.getTournament();
  const maxSquad = tourney ? tourney.maxSquadSize : 18;

  // Sort by spent descending
  const sorted = [...teams].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

  tbody.innerHTML = sorted.map((team, idx) => {
    const percentSpent = team.startingPurse > 0 
      ? Math.round((team.totalSpent / team.startingPurse) * 100)
      : 0;

    return `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td>
          <div style="font-weight: 700; color: #fff;">${team.name}</div>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald);">${formatCurrency(team.remainingPurse)}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-gold);">${formatCurrency(team.totalSpent)}</td>
        <td>${team.playersCount || 0} / ${maxSquad}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="progress-bar-bg" style="width: 80px; height: 6px;">
              <div class="progress-bar-fill" style="width: ${percentSpent}%;"></div>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${percentSpent}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecentSoldTable(soldPlayers) {
  const tbody = document.getElementById('dashboard-sold-tbody');
  if (!tbody) return;

  if (soldPlayers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No players have been sold yet.</td></tr>`;
    return;
  }

  // Last 5 sold players
  const recent = [...soldPlayers].reverse().slice(0, 5);

  tbody.innerHTML = recent.map(p => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div>
            <div style="font-weight: 700; color: #fff;">${p.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.id}</div>
          </div>
        </div>
      </td>
      <td><span class="pos-badge pos-${p.position}">${p.position}</span></td>
      <td style="font-weight: 600; color: #fff;">${p.soldToTeamName}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-gold);">${formatCurrency(p.finalPrice)}</td>
      <td>
        <button class="btn btn-outline btn-sm btn-undo-sale" data-player-id="${p.id}" title="Revert Sale">
          ${ICONS.undo} Revert
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-undo-sale').forEach(btn => {
    btn.onclick = () => {
      const pId = btn.dataset.playerId;
      const player = db.getPlayer(pId);
      if (!player) return;

      showConfirmDialog({
        title: "Revert Player Sale",
        message: `Rollback the sale of <strong>${player.name}</strong> to <strong>${player.soldToTeamName}</strong>?<br/><br/>This will refund <strong>${formatCurrency(player.finalPrice)}</strong> to the team and restore player status to AVAILABLE.`,
        confirmText: "Revert Sale",
        confirmStyle: "btn-danger",
        onConfirm: () => {
          try {
            db.undoSale(pId);
            showToast(`Sale of ${player.name} successfully reverted`, "success");
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    };
  });
}

function renderAuditTrail(logs) {
  const tbody = document.getElementById('dashboard-audit-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Audit log empty.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 8).map(log => {
    const d = new Date(log.timestamp);
    const timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">${timeFormatted}</td>
        <td><span class="audit-entry-action" style="color: var(--accent-cyan);">${log.action}</span></td>
        <td style="font-size: 0.85rem; color: var(--text-primary);">${log.description}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${log.performedBy}</td>
      </tr>
    `;
  }).join('');
}

function setupAuditExport() {
  const exportBtn = document.getElementById('btn-export-audit-csv');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const logs = db.getAuditLogs();
      const headers = ['id', 'timestamp', 'action', 'description', 'performedBy'];
      const rows = logs.map(l => [
        l.id,
        `"${l.timestamp}"`,
        l.action,
        `"${l.description.replace(/"/g, '""')}"`,
        l.performedBy
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `auction_audit_trail_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("Audit trail CSV downloaded", "success");
    };
  }
}
