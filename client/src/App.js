import React, { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import DeviceList from './components/DeviceList';
import EffectController from './components/EffectController';
import './App.css';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [devices, setDevices] = useState([]);
    const [selectedDevices, setSelectedDevices] = useState([]);

    const handleLoginSuccess = (discoveredDevices) => {
        setDevices(discoveredDevices);
        const onlineDevices = discoveredDevices
            .filter(d => d.online)
            .map(d => d.id);
        setSelectedDevices(onlineDevices);
        setIsLoggedIn(true);
    };

    const toggleDevice = (deviceId) => {
        if (selectedDevices.includes(deviceId)) {
            setSelectedDevices(selectedDevices.filter(id => id !== deviceId));
        } else {
            setSelectedDevices([...selectedDevices, deviceId]);
        }
    };

    if (!isLoggedIn) {
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div className="app">
            <header className="app-header">
                <h1>🎃 Haunted Lights Controller</h1>
                <p>Selected: {selectedDevices.length} devices</p>
            </header>
            
            <main className="app-main">
                <DeviceList 
                    devices={devices}
                    selectedDevices={selectedDevices}
                    onToggleDevice={toggleDevice}
                />
                <EffectController selectedDevices={selectedDevices} />
            </main>
        </div>
    );
}

export default App;