import React, { useState } from 'react';
import { Settings, Wifi, Loader } from 'lucide-react';
import tuyaService from '../api/tuyaService';
import { config } from '../config';
import './LoginScreen.css';

const LoginScreen = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState(config.DEFAULT_COUNTRY_CODE);
  const [appType, setAppType] = useState(config.DEFAULT_SCHEMA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Start Tuya OAuth (H5) – this will redirect away from the page
      tuyaService.startOAuth();
      // no finally here because we’re navigating away
    } catch (err) {
      setLoading(false);
      setError('Could not start login. Please try again.');
      console.error(err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🎃 Connect Your Lights</h1>
          <p>Sign in with your Smart Life or Tuya Smart account</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {/* App schema toggle (optional) */}
          <div className="app-selector">
            <button
              type="button"
              className={`app-button ${appType === 'smartlife' ? 'active' : ''}`}
              onClick={() => setAppType('smartlife')}
            >
              Smart Life
            </button>
            <button
              type="button"
              className={`app-button ${appType === 'tuyaSmart' ? 'active' : ''}`}
              onClick={() => setAppType('tuyaSmart')}
            >
              Tuya Smart
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* These inputs are disabled so they won't block submit.
              They’re kept to avoid unused state warnings and for a future “legacy login” mode. */}
          <input
            type="email"
            className="login-input"
            placeholder="Email (not needed for OAuth)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled
          />

          <input
            type="password"
            className="login-input"
            placeholder="Password (not needed for OAuth)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled
          />

          <input
            type="text"
            className="login-input"
            placeholder="Country Code (not needed for OAuth)"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            disabled
          />

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? (
              <>
                <Loader className="spinner" />
                Redirecting to Smart Life…
              </>
            ) : (
              <>
                <Wifi size={20} />
                Connect Devices
              </>
            )}
          </button>

          {/* Optional tiny note */}
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            You’ll be redirected to Tuya’s login page to authorize access, then sent back here.
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
