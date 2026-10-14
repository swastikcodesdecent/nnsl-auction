/**
 * Football Auction Pro - Simplified Access Service
 * Confined Sector Mode: Zero-barrier open access for all connected screens & devices
 */

class AuthService {
  constructor() {
    this.currentUser = { name: 'Auction Controller', role: 'admin' };
  }

  getUser() {
    return this.currentUser;
  }

  getRole() {
    return 'admin';
  }

  canControlAuction() {
    return true;
  }

  canManagePlayers() {
    return true;
  }

  canManageTeams() {
    return true;
  }

  canAccessSettings() {
    return true;
  }

  enforcePageAccess() {
    // Confined sector: allow immediate direct access without login screens
    return true;
  }

  onAuthChange(callback) {
    if (typeof callback === 'function') callback(this.currentUser);
    return () => {};
  }
}

export const auth = new AuthService();
