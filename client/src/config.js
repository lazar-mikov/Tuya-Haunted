export const config = {
    // API is on same domain in production, different port in development
    API_BASE: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001',
    
    DEFAULT_COUNTRY_CODE: '1',
    DEFAULT_SCHEMA: 'smartlife',
    TIMELINE_DURATION: 65,
    
    TIMELINE: [
        { time: 0, effect: 'reset', label: 'Lights Normal' },
        { time: 5, effect: 'flicker', label: 'Quick Flicker' },
        { time: 12, effect: 'dim', label: 'Dim Slowly' },
        { time: 20, effect: 'flash-red', label: 'Red Flash' },
        { time: 25, effect: 'blackout', label: 'Complete Darkness' },
        { time: 32, effect: 'flash-red', label: 'Red Pulse' },
        { time: 38, effect: 'reset', label: 'Lights Return' },
        { time: 45, effect: 'flicker', label: 'Flickering' },
        { time: 52, effect: 'blackout', label: 'Final Blackout' },
        { time: 60, effect: 'reset', label: 'End - Normal' }
    ]
};