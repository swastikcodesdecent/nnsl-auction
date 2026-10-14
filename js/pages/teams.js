/**
 * Football Auction Pro - Team Management Page Logic
 * Team CRUD, Squad Rosters, Purse Progress Bars, and Financial Tracking
 */

import { db } from '../db.js';
import { auth } from '../auth.js';
import { formatCurrency, showToast, showConfirmDialog, ICONS, refreshLucideIcons } from '../ui.js';

export function initTeamsPage() {
  if (!auth.enforcePageAccess('super_admin')) return;

  setupModalHandlers();

  db.subscribe('teams', (teams) => {
    renderTeamsGrid(teams || []);
    renderTeamsOverview(teams || []);
  });
}

function renderTeamsOverview(teams) {
  const totalPurseEl = document.getElementById('total-league-purse');
  const totalSpentEl = document.getElementById('total-league-spent');
  const avgSquadEl = document.getElementById('avg-squad-size');

  if (!totalPurseEl) return;

  const totalStarting = teams.reduce((acc, t) => acc + (t.startingPurse || 0), 0);
  const totalSpent = teams.reduce((acc, t) => acc + (t.totalSpent || 0), 0);
  const totalPlayers = teams.reduce((acc, t) => acc + (t.playersCount || 0), 0);
  const avg = teams.length ? (totalPlayers / teams.length).toFixed(1) : 0;

  totalPurseEl.textContent = formatCurrency(totalStarting, true);
  if (totalSpentEl) totalSpentEl.textContent = formatCurrency(totalSpent, true);
  if (avgSquadEl) avgSquadEl.textContent = avg;
}

function renderTeamsGrid(teams) {
  const container = document.getElementById('teams-grid-container');
  if (!container) return;

  const tourney = db.getTournament();
  const maxSquad = tourney ? tourney.maxSquadSize : 8;

  if (teams.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg);">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No participating teams configured.</p>
        <button class="btn btn-primary btn-sm" id="btn-add-team-empty">Create First Team</button>
      </div>
    `;
    const btn = document.getElementById('btn-add-team-empty');
    if (btn) btn.onclick = openAddTeamModal;
    return;
  }

  container.innerHTML = teams.map(team => {
    const pursePercent = team.startingPurse > 0 
      ? Math.max(0, Math.min(100, Math.round((team.remainingPurse / team.startingPurse) * 100))) 
      : 0;

    const squadList = team.squad || [];

    return `
      <div class="team-manage-card">
        <div class="team-manage-header">
          <div class="team-color-strip" style="background-color: ${team.color || '#3b82f6'};"></div>
          <img class="team-manage-logo" src="${team.logo}" alt="${team.name}" onerror="this.src='https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100'"/>
          <div class="team-manage-title" style="flex: 1; min-width: 0;">
            <h3>${team.name}</h3>
            <div class="team-manage-rep">Rep: ${team.representative || 'None Assigned'}</div>
          </div>
          <button class="btn btn-outline btn-sm btn-edit-team" data-team-id="${team.id}" title="Edit Team">
            ${ICONS.edit}
          </button>
          <button class="btn btn-outline btn-sm btn-delete-team" data-team-id="${team.id}" title="Delete Team" ${squadList.length > 0 ? 'disabled' : ''}>
            ${ICONS.trash}
          </button>
        </div>

        <div class="team-manage-body">
          <div class="progress-wrap">
            <div class="progress-labels">
              <span>Purse Remaining (${pursePercent}%)</span>
              <strong style="color: var(--accent-emerald); font-family: var(--font-mono);">${formatCurrency(team.remainingPurse)}</strong>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${pursePercent}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              <span>Total Spent: ${formatCurrency(team.totalSpent)}</span>
              <span>Budget: ${formatCurrency(team.startingPurse, true)}</span>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
              <span>Squad Roster (${squadList.length}/${maxSquad})</span>
              <span>${squadList.length >= maxSquad ? '<span style="color: var(--accent-crimson);">FULL</span>' : ''}</span>
            </div>
            
            <div class="team-squad-chips">
              ${squadList.length > 0 ? squadList.map(item => `
                <div class="squad-player-chip">
                  <span class="pos-badge pos-${item.position}" style="font-size: 0.65rem; padding: 0.1rem 0.35rem;">${item.position}</span>
                  <strong>${item.name}</strong>
                  <span style="color: var(--accent-gold); font-family: var(--font-mono); font-size: 0.7rem;">${formatCurrency(item.price, true)}</span>
                </div>
              `).join('') : `
                <div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.25rem;">No players signed yet.</div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-edit-team').forEach(btn => {
    btn.onclick = () => openEditTeamModal(btn.dataset.teamId);
  });

  container.querySelectorAll('.btn-delete-team').forEach(btn => {
    btn.onclick = () => confirmDeleteTeam(btn.dataset.teamId);
  });

  refreshLucideIcons();
}

function setupModalHandlers() {
  const addBtn = document.getElementById('btn-add-team');
  const modal = document.getElementById('team-form-modal');
  const closeBtn = document.getElementById('team-modal-close');
  const cancelBtn = document.getElementById('team-modal-cancel');
  const form = document.getElementById('team-edit-form');

  if (addBtn) addBtn.onclick = openAddTeamModal;
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
  if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove('active');

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      saveTeamFromForm();
    };
  }

  // Logo Preview
  const logoInput = document.getElementById('form-team-logo');
  const previewImg = document.getElementById('form-team-logo-preview');
  if (logoInput && previewImg) {
    logoInput.oninput = (e) => {
      previewImg.src = e.target.value || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100';
    };
  }
}

function openAddTeamModal() {
  const modal = document.getElementById('team-form-modal');
  const title = document.getElementById('team-modal-title');
  const form = document.getElementById('team-edit-form');
  const idInput = document.getElementById('form-team-id');
  const purseInput = document.getElementById('form-team-purse');
  const tourney = db.getTournament();

  if (form) form.reset();
  if (title) title.textContent = "Register New Team";
  if (idInput) {
    idInput.readOnly = false;
    idInput.value = 'team_' + Math.random().toString(36).substring(2, 7);
  }
  if (purseInput) {
    purseInput.value = tourney ? tourney.startingPurse : 1200000000;
  }

  if (modal) modal.classList.add('active');
}

function openEditTeamModal(teamId) {
  const team = db.getTeam(teamId);
  if (!team) return;

  const modal = document.getElementById('team-form-modal');
  const title = document.getElementById('team-modal-title');
  const idInput = document.getElementById('form-team-id');
  const nameInput = document.getElementById('form-team-name');
  const shortInput = document.getElementById('form-team-short');
  const repInput = document.getElementById('form-team-rep');
  const purseInput = document.getElementById('form-team-purse');
  const colorInput = document.getElementById('form-team-color');
  const logoInput = document.getElementById('form-team-logo');
  const previewImg = document.getElementById('form-team-logo-preview');

  if (title) title.textContent = `Edit Team: ${team.name}`;
  if (idInput) {
    idInput.value = team.id;
    idInput.readOnly = true;
  }
  if (nameInput) nameInput.value = team.name;
  if (shortInput) shortInput.value = team.shortName || '';
  if (repInput) repInput.value = team.representative || '';
  if (purseInput) purseInput.value = team.startingPurse;
  if (colorInput) colorInput.value = team.color || '#3b82f6';
  if (logoInput) logoInput.value = team.logo || '';
  if (previewImg) previewImg.src = team.logo;

  if (modal) modal.classList.add('active');
}

function saveTeamFromForm() {
  const id = document.getElementById('form-team-id').value.trim();
  const name = document.getElementById('form-team-name').value.trim();
  const shortName = document.getElementById('form-team-short').value.trim() || name.substring(0, 3).toUpperCase();
  const representative = document.getElementById('form-team-rep').value.trim();
  const startingPurse = Math.round(Number(document.getElementById('form-team-purse').value));
  const color = document.getElementById('form-team-color').value;
  const logo = document.getElementById('form-team-logo').value.trim() || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100';

  if (!id || !name || !startingPurse) {
    showToast("Please provide Team ID, Name, and Starting Purse", "error");
    return;
  }

  try {
    const existing = db.getTeam(id);
    if (existing) {
      // Preserve current spending and remaining purse difference
      const diff = startingPurse - existing.startingPurse;
      db.saveTeam({
        id,
        name,
        shortName,
        representative,
        startingPurse,
        remainingPurse: Math.max(0, existing.remainingPurse + diff),
        color,
        logo
      });
    } else {
      db.saveTeam({
        id,
        name,
        shortName,
        representative,
        startingPurse,
        color,
        logo
      });
    }

    document.getElementById('team-form-modal').classList.remove('active');
    showToast(`Team ${name} saved successfully`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function confirmDeleteTeam(teamId) {
  const team = db.getTeam(teamId);
  if (!team) return;

  showConfirmDialog({
    title: "Delete Team",
    message: `Are you sure you want to delete <strong>${team.name}</strong>?`,
    confirmText: "Delete Team",
    confirmStyle: "btn-danger",
    onConfirm: () => {
      try {
        db.deleteTeam(teamId);
        showToast("Team removed from tournament", "info");
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}
