import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Zap, Moon, Sun, AlertTriangle } from 'lucide-react';
import tuyaService from '../api/tuyaService';
import { config } from '../config';
import './EffectController.css';

const EffectController = ({ selectedDevices }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [logs, setLogs] = useState([]);
    const intervalRef = useRef(null);
    const lastTriggeredRef = useRef(-1);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-9), { timestamp, message, type }]);
    };

    const executeTimeline = () => {
        intervalRef.current = setInterval(() => {
            setCurrentTime(prev => {
                const newTime = prev + 0.1;
                
                const currentEvent = config.TIMELINE.find(
                    e => e.time <= newTime && e.time > lastTriggeredRef.current
                );
                
                if (currentEvent) {
                    lastTriggeredRef.current = currentEvent.time;
                    tuyaService.triggerEffect(currentEvent.effect)
                        .then(result => {
                            if (result.success) {
                                addLog(`[${currentEvent.time}s] ${currentEvent.label}`, 'success');
                            }
                        })
                        .catch(error => {
                            addLog(`Error: ${error.message}`, 'error');
                        });
                }
                
                if (newTime >= config.TIMELINE_DURATION) {
                    stopExperience();
                    return 0;
                }
                
                return newTime;
            });
        }, 100);
    };

    const startExperience = () => {
        if (selectedDevices.length === 0) {
            addLog('No devices selected!', 'error');
            return;
        }
        
        setIsPlaying(true);
        setCurrentTime(0);
        lastTriggeredRef.current = -1;
        addLog('Starting haunted experience...', 'info');
        executeTimeline();
    };

    const stopExperience = () => {
        setIsPlaying(false);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        tuyaService.triggerEffect('reset');
        addLog('Experience stopped', 'info');
    };

    const testEffect = async (effect, label) => {
        addLog(`Testing: ${label}`, 'info');
        try {
            const result = await tuyaService.triggerEffect(effect);
            if (result.success) {
                addLog(`${label} triggered`, 'success');
            }
        } catch (error) {
            addLog(`Error: ${error.message}`, 'error');
        }
    };

    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getNextEvent = () => {
        return config.TIMELINE.find(event => event.time > currentTime);
    };

    const nextEvent = getNextEvent();

    return (
        <div className="controller-container">
            <div className="timeline-section">
                <div className="time-display">
                    <h1>{formatTime(currentTime)}</h1>
                    {nextEvent && (
                        <p className="next-event">
                            Next: {nextEvent.label} at {nextEvent.time}s
                        </p>
                    )}
                </div>
                
                <div className="progress-container">
                    <div className="progress-bar">
                        <div 
                            className="progress-fill"
                            style={{ width: `${(currentTime / config.TIMELINE_DURATION) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="control-buttons">
                    {!isPlaying ? (
                        <button
                            className="control-button play"
                            onClick={startExperience}
                            disabled={selectedDevices.length === 0}
                        >
                            <Play size={24} />
                            Start Experience
                        </button>
                    ) : (
                        <button
                            className="control-button stop"
                            onClick={stopExperience}
                        >
                            <Square size={24} />
                            Stop
                        </button>
                    )}
                </div>
            </div>

            <div className="test-section">
                <h3>Test Effects</h3>
                <div className="test-grid">
                    <button
                        className="test-button blackout"
                        onClick={() => testEffect('blackout', 'Blackout')}
                    >
                        <Moon size={20} />
                        Blackout
                    </button>
                    <button
                        className="test-button red"
                        onClick={() => testEffect('flash-red', 'Red Flash')}
                    >
                        <AlertTriangle size={20} />
                        Red Flash
                    </button>
                    <button
                        className="test-button flicker"
                        onClick={() => testEffect('flicker', 'Flicker')}
                    >
                        <Zap size={20} />
                        Flicker
                    </button>
                    <button
                        className="test-button reset"
                        onClick={() => testEffect('reset', 'Reset')}
                    >
                        <Sun size={20} />
                        Reset
                    </button>
                </div>
            </div>

            <div className="logs-section">
                <h3>Activity Log</h3>
                <div className="logs-container">
                    {logs.map((log, idx) => (
                        <div key={idx} className={`log-entry ${log.type}`}>
                            <span className="log-time">{log.timestamp}</span>
                            <span className="log-message">{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default EffectController;