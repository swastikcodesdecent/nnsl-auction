/**
 * Football Auction Pro - Configuration & Initialization Layer
 * Manages Firebase credentials, live environment toggles, and fallback synchronization
 */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCz_mSNNsmfhET9dsJPtVBJk_eeXnCIs-U",
  authDomain: "nnsl-auction.firebaseapp.com",
  projectId: "nnsl-auction",
  storageBucket: "nnsl-auction.firebasestorage.app",
  messagingSenderId: "366913188107",
  appId: "1:366913188107:web:9f3b193b4db0eeda0cf20e"
};

// Check if user has replaced demo config with their real Firebase keys
export function isFirebaseConfigured() {
  const customConfig = localStorage.getItem('fb_custom_config');
  if (customConfig) {
    try {
      const parsed = JSON.parse(customConfig);
      return parsed.apiKey && !parsed.apiKey.includes('DemoKey');
    } catch (e) {
      return false;
    }
  }
  return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes('DemoKey');
}

export function getActiveFirebaseConfig() {
  const custom = localStorage.getItem('fb_custom_config');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {
      console.warn("Invalid stored custom config, using default");
    }
  }
  return FIREBASE_CONFIG;
}

export function saveCustomFirebaseConfig(config) {
  localStorage.setItem('fb_custom_config', JSON.stringify(config));
}

export function resetFirebaseConfig() {
  localStorage.removeItem('fb_custom_config');
}
