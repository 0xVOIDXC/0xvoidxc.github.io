import * as log from '../log.ts'
import {inputState} from "../global.ts";

/**
 * Global keyboard input handler.
 * Updates inputState singleton automatically.
 *
 * Call initInputHandler() once during startup.
 */
export function setup(): void {
    // Prevent scrolling
    window.addEventListener('keydown', (e) => {
        const key = e.code.toLowerCase()
        log.debug(`key down ${key}`)

        // Movement keys
        switch (key) {
            case 'keyw':
            case 'arrowup':
                inputState.up = true
                e.preventDefault()
                return
            case 'keys':
            case 'arrowdown':
                inputState.down = true
                e.preventDefault()
                return
            case 'keya':
            case 'arrowleft':
                inputState.left = true
                e.preventDefault()
                return
            case 'keyd':
            case 'arrowright':
                inputState.right = true
                e.preventDefault()
                return
        }
    })

    window.addEventListener('keyup', (e) => {
        const key = e.code.toLowerCase()

        switch (key) {
            case 'keyw':
            case 'arrowup':
                inputState.up = false
                break
            case 'keys':
            case 'arrowdown':
                inputState.down = false
                break
            case 'keya':
            case 'arrowleft':
                inputState.left = false
                break
            case 'keyd':
            case 'arrowright':
                inputState.right = false
                break
            case 'space':
                inputState.fire = false
                break
            case 'enter':
            case 'keye':
                inputState.interact = false
                break
        }
    })

    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e) => e.preventDefault())
}

/**
 * Optional: Pause/resume input handling
 */
export function pauseInput(): void {
    window.removeEventListener('keydown', keydownHandler)
    window.removeEventListener('keyup', keyupHandler)
}

export function resumeInput(): void {
    initInputHandler() // Re-attach
}

// Private handlers (for pause/resume)
const keydownHandler = (e: KeyboardEvent) => {
    // Implementation above
}
const keyupHandler = (e: KeyboardEvent) => {
    // Implementation above
}
