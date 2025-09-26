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

    const handleLogin = async (e) => {
      //  e.preventDefault();
        
       // if (!username || !password) {
      //      setError('Please enter your Smart Life credentials');
     //       return;
     //   }

     //   setLoading(true);
     //   setError('');
        
     //   try {
      //      await tuyaService.login(username, password, countryCode, appType);
      //      const devices = await tuyaService.discoverDevices();
      //      onLoginSuccess(devices);
     //   } catch (error) {
     //       setError(error.message || 'Login failed. Please check your credentials.');
     //   } finally {
    //        setLoading(false);
       // }

         window.location.href = '/api/smart-life-auth';

    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>🎃 Connect Your Lights</h1>
                    <p>Login with Smart Life or Tuya Smart</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
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

                    {error && (
                        <div className="error-message">{error}</div>
                    )}

                    <input
                        type="email"
                        className="login-input"
                        placeholder="Email or Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={loading}
                        required
                    />

                    <input
                        type="password"
                        className="login-input"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        required
                    />

                    <input
                        type="text"
                        className="login-input"
                        placeholder="Country Code (1 for USA, 86 for China)"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        disabled={loading}
                    />

                    <button 
                        type="submit" 
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader className="spinner" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <Wifi size={20} />
                                Connect Devices
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;