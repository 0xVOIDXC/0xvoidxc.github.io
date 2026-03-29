export let inputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    interact: false,  // Optional: action keys
    inventory:false,
    chat: false
}
// Add to global.ts
export interface TelemetryEvent {
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: Record<string, any>;
    timestamp?: number;
    clientTick?: number;
    source?: string;
}

export const telemetry_options = {
    enabled: false,
    clientId: crypto.randomUUID(),
    host: '',
    endpoint: '/ws/telemetry'
};


interface Location {
    x: number,
    y: number
}

export let gameState = {
    ticks: 0,
    location: Location,
    rendering: {
        entities: new Set()
    },
    paused: true,
    speed: 1.3
}

export function tick_increment() {
    gameState.ticks++;
}


// Reset to idle state (call on disconnect/pause)
export function resetInputState(): void {
    Object.keys(inputState).forEach((e,i) => {
        inputState[i] = false;
    })
}