export let inputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    interact: false,  // Optional: action keys
}

interface Location {
    x: number,
    y: number
}

export let gameState = {
    ticks: 0,
    location: Location,
    rendering: {
        entities: new Set()
    }
}

export function tick_increment() {
    gameState.ticks++;
}

// Reset to idle state (call on disconnect/pause)
export function resetInputState(): void {
    inputState = {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: false,
        interact: false,
    } as const
}