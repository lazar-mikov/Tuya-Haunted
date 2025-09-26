import { config } from '../config';

class TuyaService {
  // --- OPTIONAL legacy password login (kept as-is) ---
  async login(username, password, countryCode = '49', schema = 'smartlife') {
    try {
      const response = await fetch(`${config.API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, countryCode, schema })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Login failed');
      }
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // --- NEW: start OAuth redirect flow ---
  startOAuth() {
    // This hits your Express route that redirects to Tuya’s H5 authorize page
    window.location.href = `${config.API_BASE}/auth/start`;
  }

  async discoverDevices() {
    try {
      const response = await fetch(`${config.API_BASE}/api/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Discovery failed');
      }
      return data.devices;
    } catch (error) {
      console.error('Discovery error:', error);
      throw error;
    }
  }

  async triggerEffect(effect) {
    try {
      const response = await fetch(`${config.API_BASE}/api/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ effect })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Effect trigger error:', error);
      throw error;
    }
  }
}

export default new TuyaService();
