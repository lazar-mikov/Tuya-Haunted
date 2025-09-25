import React from 'react';
import { Lightbulb, WifiOff, CheckCircle } from 'lucide-react';
import './DeviceList.css';

const DeviceList = ({ devices, selectedDevices, onToggleDevice }) => {
    const onlineDevices = devices.filter(d => d.online).length;
    
    return (
        <div className="device-list-container">
            <div className="device-list-header">
                <h2>Your Devices</h2>
                <span className="device-count">
                    {onlineDevices} online / {devices.length} total
                </span>
            </div>
            
            <div className="device-grid">
                {devices.map(device => (
                    <div 
                        key={device.id}
                        className={`device-card ${!device.online ? 'offline' : ''} ${selectedDevices.includes(device.id) ? 'selected' : ''}`}
                        onClick={() => device.online && onToggleDevice(device.id)}
                    >
                        <div className="device-icon">
                            {device.online ? (
                                <Lightbulb size={32} />
                            ) : (
                                <WifiOff size={32} />
                            )}
                        </div>
                        
                        <div className="device-info">
                            <h3>{device.name}</h3>
                            <p className={`device-status ${device.online ? 'online' : 'offline'}`}>
                                {device.online ? '● Online' : '● Offline'}
                            </p>
                        </div>
                        
                        {selectedDevices.includes(device.id) && (
                            <CheckCircle className="check-icon" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DeviceList;