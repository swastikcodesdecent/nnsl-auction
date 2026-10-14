/**
 * Football Auction Pro - Authentication Page Logic
 * Role-Based Sign-In, Preset One-Click Fast Login, and Role Matrix
 */

import { auth, ROLES, DEFAULT_USERS } from '../auth.js';
import { showToast } from '../ui.js';

export function initLoginPage() {
  setupStandardLoginForm();
  setupQuickRoleButtons();
}

function setupStandardLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email) {
      showToast("Please enter an email address", "error");
      return;
    }

    const res = auth.login(email, password);
    if (res.success) {
      showToast(`Welcome back, ${res.user.name}!`, "success");
      redirectToTarget(res.user.role);
    }
  };
}

function setupQuickRoleButtons() {
  const container = document.getElementById('quick-roles-container');
  if (!container) return;

  container.innerHTML = DEFAULT_USERS.map(user => {
    const roleClass = user.role === ROLES.SUPER_ADMIN ? 'admin' :
      user.role === ROLES.AUCTIONEER ? 'auctioneer' :
      user.role === ROLES.TEAM_REP ? 'team' : '';

    return `
      <button type="button" class="btn btn-secondary quick-role-btn" data-email="${user.email}" style="width: 100%; justify-content: space-between; padding: 0.85rem 1rem; border-color: var(--border-medium); margin-bottom: 0.6rem;">
        <div style="display: flex; flex-direction: column; text-align: left;">
          <strong style="color: #fff; font-size: 0.95rem;">${user.name}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${user.email}</span>
        </div>
        <span class="role-pill ${roleClass}">${user.role.replace('_', ' ')}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.quick-role-btn').forEach(btn => {
    btn.onclick = () => {
      const email = btn.dataset.email;
      const res = auth.login(email);
      if (res.success) {
        showToast(`Signed in as ${res.user.name}`, "success");
        setTimeout(() => redirectToTarget(res.user.role), 300);
      }
    };
  });
}

function redirectToTarget(role) {
  if (role === ROLES.SUPER_ADMIN) {
    window.location.href = 'dashboard.html';
  } else if (role === ROLES.AUCTIONEER) {
    window.location.href = 'auctioneer.html';
  } else {
    window.location.href = 'live.html';
  }
}
