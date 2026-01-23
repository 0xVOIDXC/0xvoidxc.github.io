import * as log from './log.ts'

export let inputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    interact: false,  // Optional: action keys
} as let

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
} as let;
export function tick_increment(){
    gameState.ticks ++;
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