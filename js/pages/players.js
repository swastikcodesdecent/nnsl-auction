/**
 * Football Auction Pro - Player Management Page Logic
 * Confined Sector Version: Dedicated CSV template & bulk importer, no photos required
 */

import { db } from '../db.js';
import { formatCurrency, showToast, showConfirmDialog, ICONS, refreshLucideIcons } from '../ui.js';

let currentFilterPosition = 'ALL';
let currentFilterStatus = 'ALL';
let searchQuery = '';

export function initPlayersPage() {
  setupFilterControls();
  setupModalHandlers();
  setupCsvHandlers();

  db.subscribe('players', (players) => {
    renderPlayersTable(players || []);
  });
}

function setupFilterControls() {
  const searchInput = document.getElementById('player-search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderPlayersTable(db.getPlayers());
    };
  }

  const posSelect = document.getElementById('filter-position-select');
  if (posSelect) {
    posSelect.onchange = (e) => {
      currentFilterPosition = e.target.value;
      renderPlayersTable(db.getPlayers());
    };
  }

  const statusSelect = document.getElementById('filter-status-select');
  if (statusSelect) {
    statusSelect.onchange = (e) => {
      currentFilterStatus = e.target.value;
      renderPlayersTable(db.getPlayers());
    };
  }
}

function renderPlayersTable(players) {
  const container = document.getElementById('players-grid-container');
  const countEl = document.getElementById('filtered-players-count');
  if (!container) return;

  const filtered = players.filter(p => {
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery) || 
      p.id.toLowerCase().includes(searchQuery) ||
      (p.club && p.club.toLowerCase().includes(searchQuery)) ||
      (p.nationality && p.nationality.toLowerCase().includes(searchQuery));

    const matchesPos = currentFilterPosition === 'ALL' || p.position === currentFilterPosition;
    const matchesStatus = currentFilterStatus === 'ALL' || p.status === currentFilterStatus;

    return matchesSearch && matchesPos && matchesStatus;
  });

  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${players.length} players`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 2px dashed var(--border-medium);">
        <h3 style="color: #fff; font-size: 1.3rem; margin-bottom: 0.5rem;">No Players Found</h3>
        <p style="font-size: 0.95rem; margin-bottom: 1.5rem;">Upload your player roster via CSV or click Add New Player to get started.</p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <label class="btn btn-primary" style="cursor: pointer;">
            ${ICONS.upload} Upload CSV File
            <input type="file" id="empty-csv-import-file" accept=".csv" style="display: none;" />
          </label>
          <button class="btn btn-secondary" id="empty-btn-download-template">
            ${ICONS.download} Download CSV Template
          </button>
          <button class="btn btn-outline" id="empty-btn-add-player">
            + Add Player Manually
          </button>
        </div>
      </div>
    `;

    const emptyUpload = document.getElementById('empty-csv-import-file');
    if (emptyUpload) {
      emptyUpload.onchange = handleCsvFileChange;
    }
    const emptyTemplate = document.getElementById('empty-btn-download-template');
    if (emptyTemplate) {
      emptyTemplate.onclick = downloadCsvTemplate;
    }
    const emptyAdd = document.getElementById('empty-btn-add-player');
    if (emptyAdd) {
      emptyAdd.onclick = openAddPlayerModal;
    }
    return;
  }

  container.innerHTML = filtered.map(player => {
    return `
      <div class="player-item-card">
        <!-- Abstract Emblem Box (No Photo Needed) -->
        <div class="player-item-photo-box" style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.15) 0%, rgba(10, 14, 25, 0.95) 100%);">
          <div style="position: absolute; top: 12px; left: 12px;">
            <span class="pos-badge pos-${player.position}">${player.position}</span>
          </div>
          <div style="position: absolute; top: 12px; right: 12px;">
            <span class="badge badge-${player.status.toLowerCase()}">${player.status}</span>
          </div>

          <div style="font-family: var(--font-display); font-size: 3rem; font-weight: 800; color: #fff; line-height: 1; text-shadow: 0 0 20px rgba(255,255,255,0.4);">
            ${player.position}
          </div>
          
          <div style="position: absolute; bottom: 10px; font-family: var(--font-mono); font-size: 0.82rem; background: rgba(0,0,0,0.8); padding: 0.2rem 0.65rem; border-radius: 4px; color: var(--accent-cyan); border: 1px solid rgba(6,182,212,0.3);">
            ${player.id}
          </div>
        </div>

        <div class="player-item-body">
          <h3 class="player-item-name">${player.name}</h3>
          <div class="player-item-meta">
            <span>${player.nationality || 'Athlete'} ${player.club ? `• ${player.club}` : ''}</span>
            <span>${player.age ? `Age ${player.age}` : ''}</span>
          </div>
          <div class="player-item-meta" style="margin-top: 0.35rem;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Base Price</span>
            <span class="player-item-price">${formatCurrency(player.basePrice)}</span>
          </div>
          ${player.status === 'SOLD' ? `
            <div style="margin-top: 0.25rem; font-size: 0.8rem; color: var(--accent-emerald); font-weight: 600;">
              Sold to: ${player.soldToTeamName || 'Team'} (${formatCurrency(player.finalPrice)})
            </div>
          ` : ''}
        </div>

        <div class="player-item-footer">
          <button class="btn btn-secondary btn-sm btn-edit-player" data-player-id="${player.id}">
            ${ICONS.edit} Edit
          </button>
          <button class="btn btn-outline btn-sm btn-delete-player" data-player-id="${player.id}" ${player.status === 'SOLD' ? 'disabled title="Cannot delete a sold player"' : ''}>
            ${ICONS.trash} Delete
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach Edit and Delete buttons
  container.querySelectorAll('.btn-edit-player').forEach(btn => {
    btn.onclick = () => openEditPlayerModal(btn.dataset.playerId);
  });

  container.querySelectorAll('.btn-delete-player').forEach(btn => {
    btn.onclick = () => confirmDeletePlayer(btn.dataset.playerId);
  });

  refreshLucideIcons();
}

function setupModalHandlers() {
  const addBtn = document.getElementById('btn-add-player');
  const modal = document.getElementById('player-form-modal');
  const closeBtn = document.getElementById('player-modal-close');
  const cancelBtn = document.getElementById('player-modal-cancel');
  const form = document.getElementById('player-edit-form');

  if (addBtn) addBtn.onclick = openAddPlayerModal;
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
  if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove('active');

  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      savePlayerFromForm();
    };
  }
}

function openAddPlayerModal() {
  const modal = document.getElementById('player-form-modal');
  const title = document.getElementById('player-modal-title');
  const form = document.getElementById('player-edit-form');
  const idInput = document.getElementById('form-player-id');

  if (form) form.reset();
  if (title) title.textContent = "Add New Player";
  if (idInput) {
    idInput.readOnly = false;
    const count = db.getPlayers().length + 1;
    idInput.value = `PL${String(count).padStart(3, '0')}`;
  }

  if (modal) modal.classList.add('active');
}

function openEditPlayerModal(playerId) {
  const player = db.getPlayer(playerId);
  if (!player) return;

  const modal = document.getElementById('player-form-modal');
  const title = document.getElementById('player-modal-title');
  const idInput = document.getElementById('form-player-id');
  const nameInput = document.getElementById('form-player-name');
  const posInput = document.getElementById('form-player-pos');
  const priceInput = document.getElementById('form-player-base-price');
  const clubInput = document.getElementById('form-player-club');
  const natInput = document.getElementById('form-player-nat');
  const ageInput = document.getElementById('form-player-age');

  if (title) title.textContent = `Edit Player: ${player.name}`;
  if (idInput) {
    idInput.value = player.id;
    idInput.readOnly = true;
  }
  if (nameInput) nameInput.value = player.name;
  if (posInput) posInput.value = player.position;
  if (priceInput) priceInput.value = player.basePrice;
  if (clubInput) clubInput.value = player.club || '';
  if (natInput) natInput.value = player.nationality || '';
  if (ageInput) ageInput.value = player.age || 25;

  if (modal) modal.classList.add('active');
}

function savePlayerFromForm() {
  const id = document.getElementById('form-player-id').value.trim();
  const name = document.getElementById('form-player-name').value.trim();
  const position = document.getElementById('form-player-pos').value;
  const basePrice = Math.round(Number(document.getElementById('form-player-base-price').value));
  const club = document.getElementById('form-player-club').value.trim();
  const nationality = document.getElementById('form-player-nat').value.trim();
  const age = Number(document.getElementById('form-player-age').value) || 25;

  if (!id || !name || !basePrice) {
    showToast("Please fill in ID, Name, and Base Price", "error");
    return;
  }

  try {
    db.savePlayer({
      id,
      name,
      position,
      basePrice,
      club,
      nationality,
      age
    });

    document.getElementById('player-form-modal').classList.remove('active');
    showToast(`Player ${name} saved successfully`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function confirmDeletePlayer(playerId) {
  const player = db.getPlayer(playerId);
  if (!player) return;

  showConfirmDialog({
    title: "Delete Player",
    message: `Are you sure you want to remove <strong>${player.name} (${player.id})</strong>?`,
    confirmText: "Delete Player",
    confirmStyle: "btn-danger",
    onConfirm: () => {
      try {
        db.deletePlayer(playerId);
        showToast("Player removed from roster", "info");
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

// CSV Export and Import Utilities
function setupCsvHandlers() {
  const exportBtn = document.getElementById('btn-export-players-csv');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const players = db.getPlayers();
      const headers = ['id', 'name', 'position', 'basePrice', 'nationality', 'club', 'age', 'status', 'finalPrice', 'soldToTeamName'];
      
      const rows = players.map(p => [
        p.id,
        `"${p.name.replace(/"/g, '""')}"`,
        p.position,
        p.basePrice,
        `"${p.nationality || ''}"`,
        `"${(p.club || '').replace(/"/g, '""')}"`,
        p.age || 25,
        p.status,
        p.finalPrice || 0,
        `"${(p.soldToTeamName || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `players_roster_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("CSV export generated", "success");
    };
  }

  const templateBtn = document.getElementById('btn-download-csv-template');
  if (templateBtn) {
    templateBtn.onclick = downloadCsvTemplate;
  }

  const importInput = document.getElementById('csv-import-file');
  if (importInput) {
    importInput.onchange = handleCsvFileChange;
  }
}

function downloadCsvTemplate() {
  const headers = ['id', 'name', 'position', 'basePrice', 'nationality', 'club', 'age'];
  const sampleRows = [
    ['1', 'MS Dhoni', 'WICKET KEEPER', '20000000', 'India', 'Right Hand Batsman', '42'],
    ['2', 'Player Two', 'BATSMAN', '15000000', 'Domestic', 'Right Hand Batsman', '26'],
    ['3', 'Player Three', 'ALL ROUNDER', '10000000', 'Domestic', 'All Rounder', '24'],
    ['4', 'Player Four', 'BOWLER', '8000000', 'Domestic', 'Right Arm Fast', '28']
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'players_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("CSV template downloaded. Fill it and upload!", "info");
}

function handleCsvFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const text = event.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) throw new Error("CSV file must contain a header and at least one player row");

      const playersToImport = [];

      for (let i = 1; i < lines.length; i++) {
        // Robust CSV splitting
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.length < 2) continue;

        const pId = values[0];
        const pName = values[1];
        const pPos = (values[2] || 'MF').toUpperCase();
        const pBase = Math.round(Number(values[3])) || 10000000;
        const pNat = values[4] || '';
        const pClub = values[5] || '';
        const pAge = Number(values[6]) || 25;

        if (pId && pName) {
          playersToImport.push({
            id: pId,
            name: pName,
            position: pPos,
            basePrice: pBase,
            nationality: pNat,
            club: pClub,
            age: pAge,
            status: 'AVAILABLE',
            finalPrice: 0,
            soldToTeamId: null
          });
        }
      }

      if (playersToImport.length > 0) {
        db.bulkSavePlayers(playersToImport);
        showToast(`Successfully imported ${playersToImport.length} players via CSV to Firebase!`, "success");
      } else {
        showToast("No valid player rows found in CSV", "warning");
      }
      e.target.value = '';
    } catch (err) {
      showToast("Failed to parse CSV: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}
