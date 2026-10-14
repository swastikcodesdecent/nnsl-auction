/**
 * Football Auction Pro - Results & Analytics Page Logic
 * Abstract styling, top transfers, club rosters, and printable reports (no photos required)
 */

import { db } from '../db.js';
import { formatCurrency, refreshLucideIcons } from '../ui.js';

let selectedTeamFilter = 'ALL';

export function initResultsPage() {
  setupPrintButton();
  setupFilterHandlers();

  db.subscribe('players', () => renderResults());
  db.subscribe('teams', () => renderResults());
}

function setupPrintButton() {
  const printBtn = document.getElementById('btn-print-results');
  if (printBtn) {
    printBtn.onclick = () => window.print();
  }
}

function setupFilterHandlers() {
  const teamFilter = document.getElementById('results-team-filter');
  if (teamFilter) {
    teamFilter.onchange = (e) => {
      selectedTeamFilter = e.target.value;
      renderResults();
    };
  }
}

function renderResults() {
  const players = db.getPlayers();
  const teams = db.getTeams();

  populateTeamFilterDropdown(teams);
  renderTopTransfers(players);
  renderTeamRosters(teams, players);
  renderUnsoldPool(players);
  refreshLucideIcons();
}

function populateTeamFilterDropdown(teams) {
  const dropdown = document.getElementById('results-team-filter');
  if (!dropdown) return;

  const currentVal = dropdown.value;
  dropdown.innerHTML = `
    <option value="ALL">All Teams</option>
    ${teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
  `;
  if (currentVal) dropdown.value = currentVal;
}

function renderTopTransfers(players) {
  const container = document.getElementById('top-transfers-container');
  if (!container) return;

  const sold = players.filter(p => p.status === 'SOLD')
    .sort((a, b) => (b.finalPrice || 0) - (a.finalPrice || 0))
    .slice(0, 4);

  if (sold.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; color: var(--text-muted); text-align: center; padding: 2.5rem; background: var(--bg-secondary); border-radius: var(--radius-md);">No players have been sold yet. Top transfers will appear here as deals close.</div>`;
    return;
  }

  container.innerHTML = sold.map((p, index) => `
    <div class="transfer-spotlight-card">
      <div class="transfer-rank-badge">#${index + 1}</div>
      <div style="width: 50px; height: 60px; border-radius: var(--radius-sm); background: radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.25) 0%, rgba(10, 14, 25, 0.95) 100%); border: 1px solid var(--border-medium); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; color: #fff;">
        ${p.position || 'MF'}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span class="pos-badge pos-${p.position}">${p.position}</span>
          <span style="font-weight: 700; color: #fff; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin: 0.15rem 0;">To: <strong style="color: #fff;">${p.soldToTeamName}</strong></div>
        <div style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-gold); font-size: 1.25rem;">${formatCurrency(p.finalPrice)}</div>
      </div>
    </div>
  `).join('');
}

function renderTeamRosters(teams, players) {
  const container = document.getElementById('results-rosters-container');
  if (!container) return;

  const filteredTeams = selectedTeamFilter === 'ALL' 
    ? teams 
    : teams.filter(t => t.id === selectedTeamFilter);

  if (filteredTeams.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 3rem;">No teams found.</div>`;
    return;
  }

  container.innerHTML = filteredTeams.map(team => {
    const teamPlayers = players.filter(p => p.soldToTeamId === team.id);
    const tourney = db.getTournament();
    const maxSquad = tourney ? tourney.maxSquadSize : 18;

    return `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header" style="flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 style="font-family: var(--font-display); font-size: 1.35rem; text-transform: uppercase; color: #fff;">${team.name}</h3>
            <div style="font-size: 0.82rem; color: var(--text-secondary);">Squad: ${teamPlayers.length}/${maxSquad} players</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Remaining Purse</div>
            <div style="font-family: var(--font-mono); font-size: 1.35rem; font-weight: 700; color: var(--accent-emerald);">${formatCurrency(team.remainingPurse)}</div>
            <div style="font-size: 0.78rem; color: var(--text-secondary);">Spent: ${formatCurrency(team.totalSpent)}</div>
          </div>
        </div>

        <div>
          ${teamPlayers.length > 0 ? `
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>ID</th>
                    <th>Transfer Fee</th>
                  </tr>
                </thead>
                <tbody>
                  ${teamPlayers.map(p => `
                    <tr>
                      <td style="font-weight: 700; color: #fff;">${p.name}</td>
                      <td><span class="pos-badge pos-${p.position}">${p.position}</span></td>
                      <td style="font-family: var(--font-mono); color: var(--text-muted);">${p.id}</td>
                      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-gold);">${formatCurrency(p.finalPrice)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.88rem;">
              No players currently signed to this team.
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderUnsoldPool(players) {
  const container = document.getElementById('unsold-pool-container');
  if (!container) return;

  const unsold = players.filter(p => p.status === 'UNSOLD');

  if (unsold.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.88rem;">No unsold players in reserve.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Player Name</th>
            <th>Pos</th>
            <th>ID</th>
            <th>Base Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${unsold.map(p => `
            <tr>
              <td style="font-weight: 700; color: #fff;">${p.name}</td>
              <td><span class="pos-badge pos-${p.position}">${p.position}</span></td>
              <td style="font-family: var(--font-mono); color: var(--text-muted);">${p.id}</td>
              <td style="font-family: var(--font-mono); color: var(--accent-gold);">${formatCurrency(p.basePrice)}</td>
              <td><span class="badge badge-unsold">UNSOLD</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
