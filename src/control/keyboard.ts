import * as log from '../log.ts'
import { inputState } from "../global.ts";

/**
 * Global keyboard input handler.
 * Updates inputState singleton automatically.
 *
 * Call setup() once during startup.
 */
export function setup(): void {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', handleContextMenu);

    log.info('Keyboard control initialized');
}

/**
 * Detach listeners (e.g. when chat is open or game paused)
 */
export function pauseInput(): void {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
}

/**
 * Re-attach listeners
 */
export function resumeInput(): void {
    // Remove first to prevent duplicates
    pauseInput();
    setup();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
}

function handleKeyDown(e: KeyboardEvent): void {
    const key = e.code.toLowerCase();

    // Only prevent default for game keys to allow F5/F12/Ctrl+R
    let handled = true;

    switch (key) {
        case 'keyw':
        case 'arrowup':
            inputState.up = true;
            break;
        case 'keys':
        case 'arrowdown':
            inputState.down = true;
            break;
        case 'keya':
        case 'arrowleft':
            inputState.left = true;
            break;
        case 'keyd':
        case 'arrowright':
            inputState.right = true;
            break;
        case 'space':
            inputState.fire = true;
            break;
        case 'enter':
        case 'keye':
            inputState.interact = true;
            break;
        default:
            handled = false;
    }

    if (handled) {
        e.preventDefault();
        // log.debug(`Key Down: ${key}`);
    }
}

function handleKeyUp(e: KeyboardEvent): void {
    const key = e.code.toLowerCase();

    switch (key) {
        case 'keyw':
        case 'arrowup':
            inputState.up = false;
            break;
        case 'keys':
        case 'arrowdown':
            inputState.down = false;
            break;
        case 'keya':
        case 'arrowleft':
            inputState.left = false;
            break;
        case 'keyd':
        case 'arrowright':
            inputState.right = false;
            break;
        case 'space':
            inputState.fire = false;
            break;
        case 'enter':
        case 'keye':
            inputState.interact = false;
            break;
        case 'keyt':
            inputState.chat = true;
            break;
    }
}
