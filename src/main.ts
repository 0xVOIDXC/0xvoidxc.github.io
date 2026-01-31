import './style.css'
import JXG from 'jsxgraph'
import {createHomepageOverlay} from "./interfaces/main_ui.ts";
import * as keyboard_control from './control/keyboard.ts';
import {gameLoop} from "./game_loop.ts";
import * as Telemetry from './net/telemetry.ts'
import {gameState, inputState, resetInputState, telemetry_options} from "./global.ts";
import * as log from './log.ts'
import {sendTelemetry} from "./net/telemetry.ts";
import {GameClient} from './net/game_client.ts';

/**
 * MAIN CLIENT ENTRY POINT
 * Handles: JSXGraph board, WebSocket networking, game loop, UI state
 */

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="graph-container">
    <div class="graph-wrapper">
      <div id="jxgbox"></div>
    </div>
  </div>
`

// === CONSTANTS ===
export const debug = true as const;
const connection_data = {
    ip: "",
    endpoint: "/ws/game"
}

// === GLOBAL STATE ===
let board: JXG.Board | null = null;
let currentBoundingBox: [number, number, number, number] = [-8, 8, 8, -8];
let camera_center: JXG.Point | null = null;
const MAX_ASPECT_RATIO = 16 / 9;
let baseSize = 8;
let uiHandle: any;

// === PERFORMANCE MONITORING ===
let fpsOverlay: HTMLElement | null = null;
let frameCount = 0;
let tickCount = 0;
let lastFpsTime = performance.now();
let avgFps = 0;
let tickHz = 0;
let jsxUpdates = 0;

// === NETWORKING STATE ===
export let gameClient: GameClient | null = null;
let retryTimeout: number | null = null;
let isConnected = false;
let retryCount = 0;
let connectionFailed = false;
let pendingInputs: { dirX: number; dirY: number; fire: boolean; interact: boolean }[] = [];
let nextClientTick: number = 0;

let menu_mode:boolean = true;

// === DEBUG OVERLAY ===
if (debug) {
    fpsOverlay = document.createElement('div');
    fpsOverlay.id = 'fps-overlay';
    fpsOverlay.style.cssText = `
        position: absolute; top: 10px; left: 10px; z-index: 9999;
        font-family: 'Courier New', monospace; font-size: 14px; color: #00ff00;
        background: rgba(0,0,0,0.7); padding: 8px; border-radius: 4px;
        pointer-events: none; backdrop-filter: blur(4px); min-width: 140px;
        text-shadow: 1px 1px 2px #000;
    `;
    document.querySelector('#app')!.appendChild(fpsOverlay);
}

// ============================================================================
// SVG & RENDERING HELPERS
// ============================================================================

const displaySVGCentered = (
    svgUrl: string, cx: number, cy: number, w: number, h: number,
    options: Partial<JXG.ImageAttributes> = {},
): JXG.Image => board!.create('image', [svgUrl, [cx - w / 2, cy - h / 2], [w, h]], options);

const displaySVGAtBoardCoords = (
    svgUrl: string, boardX: number, boardY: number, width: number, height: number,
    options: Partial<JXG.ImageAttributes> = {},
): JXG.Image => board!.create('image', [svgUrl, [boardX, boardY], [width, height]], options);

// ============================================================================
// GEOMETRY & BOARD HELPERS
// ============================================================================

function boardToScreenCoords(boardX: number, boardY: number): { x: number; y: number } {
    const boardCoords = new JXG.Coords(JXG.COORDS_BY_USER, [boardX, boardY], board!);
    return {x: boardCoords.scrCoords[1], y: boardCoords.scrCoords[2]};
}

function screenToBoardCoords(screenX: number, screenY: number): { x: number; y: number } {
    const coords = new JXG.Coords(JXG.COORDS_BY_SCREEN, [screenX, screenY], board!);
    return {x: coords.usrCoords[1], y: coords.usrCoords[2]};
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function createPoint(coords: [number, number], options: Partial<JXG.PointAttributes> = {}): JXG.Point {
    const defaults: Partial<JXG.PointAttributes> = {visible: true, withLabel: true, size: 4, strokeColor: '#000000'};
    return board!.create('point', coords, {...defaults, ...options});
}

function createLine(p1: [number, number] | JXG.Point, p2: [number, number] | JXG.Point, options: Partial<JXG.LineAttributes> = {}): JXG.Line {
    const defaults: Partial<JXG.LineAttributes> = {
        strokeColor: '#000000',
        strokeWidth: 1,
        straightFirst: false,
        straightLast: false
    };
    return board!.create('line', [p1, p2], {...defaults, ...options});
}

function createCircle(center: [number, number] | JXG.Point, radius: number | [JXG.Point, JXG.Point], options: Partial<JXG.CircleAttributes> = {}): JXG.Circle {
    const defaults: Partial<JXG.CircleAttributes> = {strokeColor: '#000000', strokeWidth: 1, fillOpacity: 0};
    return board!.create('circle', [center, radius], {...defaults, ...options});
}

function hidePoint(point: JXG.Point): void {
    point.setAttribute({visible: false, withLabel: false});
    board!.update();
}

function showPoint(point: JXG.Point, withLabel = true): void {
    point.setAttribute({visible: true, withLabel});
    board!.update();
}

function togglePoint(point: JXG.Point): void {
    const visible = point.visProp.visible as boolean;
    point.setAttribute({visible: !visible, withLabel: !visible});
    board!.update();
}

function movePoint(point: JXG.Point, x: number, y: number): void {
    point.setPosition(JXG.COORDS_BY_USER, [x, y]);
    board!.update();
}

function getPointCoords(point: JXG.Point): { x: number; y: number } {
    return {x: point.X(), y: point.Y()};
}

function deleteElement(element: JXG.GeometryElement): void {
    board!.removeObject(element);
    board!.update();
}

function clearBoard(): void {
    const objectsToKeep = ['jxgbox', camera_center!.id];
    Object.keys(board!.objects).forEach(id => {
        const obj = board!.objects[id];
        if (!objectsToKeep.includes(id) && obj.type !== 'axis') {
            board!.removeObject(obj);
        }
    });
    board!.update();
}

function updateElements(elements: JXG.GeometryElement[], attributes: Partial<JXG.Attributes>): void {
    elements.forEach(el => el.setAttribute(attributes));
    board!.update();
}

function getAllPoints(): JXG.Point[] {
    return Object.values(board!.objects).filter(
        (obj): obj is JXG.Point => obj.type === 'point' && obj.id !== camera_center!.id
    );
}

function isPointInCircle(point: JXG.Point, cx: number, cy: number, radius: number): boolean {
    return distance(point.X(), point.Y(), cx, cy) <= radius;
}

function getPointsInCircle(cx: number, cy: number, radius: number): JXG.Point[] {
    return getAllPoints().filter(p => isPointInCircle(p, cx, cy, radius));
}

// ============================================================================
// BOARD INITIALIZATION & CAMERA
// ============================================================================

function calculateAspectRatioBoundingBox(): [number, number, number, number] {
    const container = document.getElementById('jxgbox') as HTMLDivElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const aspectRatio = width / height;
    const constrainedAspectRatio = Math.min(aspectRatio, MAX_ASPECT_RATIO);

    if (constrainedAspectRatio > 1) {
        const xRange = baseSize * constrainedAspectRatio;
        return [-xRange, baseSize, xRange, -baseSize];
    } else {
        const yRange = baseSize / constrainedAspectRatio;
        return [-baseSize, yRange, baseSize, -yRange];
    }
}

function initBoard(): void {
    currentBoundingBox = calculateAspectRatioBoundingBox();
    board = JXG.JSXGraph.initBoard('jxgbox', {
        // Viewport
        boundingbox: currentBoundingBox,
        axis: debug,
        showNavigation: debug,
        showCopyright: false,
        grid: false,

        // Interaction
        drag: {mode: JXG.DragMode0},

        // PERFORMANCE - Critical for 60fps
        reducedUpdate: true,
        needsFullUpdate: false,
        hasPointThreshold: 15,
        highlight: false,
        renderer: 'canvas',
        canvasHeight: 800,
        canvasWidth: 1200,
        maxFramerate: 30,

        precision: {epsilon: 0.001, touchMaxDistance: 50}
    });

    // Disable expensive features
    (board as any).generatePolynomialBezier = false;

    // Camera point (hidden, controls viewport)
    camera_center = board!.create('point', [0, 0], {
        visible: debug, highlight: false, withLabel: false
    });
    camera_center.on('drag', () => debug && update_camera());
}

function setViewCenter(centerX: number, centerY: number, zoomFactor = 1): void {
    if (!board) return;
    const currentWidth = currentBoundingBox[2] - currentBoundingBox[0];
    const currentHeight = currentBoundingBox[1] - currentBoundingBox[3];
    const newWidth = currentWidth / zoomFactor;
    const newHeight = currentHeight / zoomFactor;
    const newLeft = centerX - newWidth / 2;
    const newRight = centerX + newWidth / 2;
    const newTop = centerY + newHeight / 2;
    const newBottom = centerY - newHeight / 2;
    changeBoundingBox([newLeft, newTop, newRight, newBottom]);
}

function changeBoundingBox(newBoundingBox: [number, number, number, number]): void {
    if (!board || newBoundingBox.length !== 4) return;
    currentBoundingBox = newBoundingBox;
    board.setBoundingBox(currentBoundingBox, false);
    board.update();
}

function resize(): void {
    if (!board) return;
    const newBoundingBox = calculateAspectRatioBoundingBox();
    changeBoundingBox(newBoundingBox);
}

function update_camera(): void {
    if (!camera_center) return;
    const x = camera_center.X();
    const y = camera_center.Y();
    setViewCenter(x, y);
}

// ============================================================================
// UI OVERLAY SYNCHRONIZATION
// ============================================================================

let overlay: HTMLElement | null = null;

function syncOverlayToBoard(): void {
    if (!overlay) return;

    const container = overlay.parentElement as HTMLElement | null;
    if (!container) return;

    // Fill the graph wrapper, no scaling with board
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.transform = 'none';   // kill any previous transform
    overlay.style.transformOrigin = 'top left';

    // Keep FPS fixed in screen coords
    if (fpsOverlay) {
        fpsOverlay.style.transform = 'translate(0,0) scale(1)';
    }
}


// ============================================================================
// GAME UPDATE LOGIC
// ============================================================================

/**
 * Reset all client-side game state
 * Called on: game start, disconnect, errors
 */
export function resetAllStates(): void {
    resetInputState();
    gameState.ticks = 0;
    gameState.location = {x: 0, y: 0};
    gameState.rendering.entities.clear();
    gameState.paused = false;
    pendingInputs = [];
    nextClientTick = 0;
    log.info('Game state reset');
}

function updateEntityRendering(): void {
    // Server-synced entity rendering goes here
}

interface ReadonlyInputState extends Readonly<inputState> {
}

/**
 * 20Hz game tick - sends input to server
 */
export function updateTick(): void {
    if (gameState.paused || !gameClient?.isConnected()) return;

    // 1. Calculate Input
    const moveX = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
    const moveY = (inputState.up ? 1 : 0) - (inputState.down ? 1 : 0);
    const length = Math.hypot(moveX, moveY);

    // Normalize (avoid divide by zero)
    const dirX = length > 0 ? moveX / length : 0;
    const dirY = length > 0 ? moveY / length : 0;

    const fire = inputState.fire;
    const interact = inputState.interact;

    // 2. Queue Input for Prediction
    if (pendingInputs.length < 30) {
        pendingInputs.push({dirX, dirY, fire, interact});
    }

    // 3. Send to Server
    const speed = 20.0;
    const targetX = gameState.location.x + dirX * speed;
    const targetY = gameState.location.y + dirY * speed;

    // Calculate integer direction enum (simple 4-way example)
    // 0=None, 1=N, 2=E, 3=S, 4=W
    let direction = 0;
    if (moveY > 0) direction = 1;
    else if (moveX > 0) direction = 2;
    else if (moveY < 0) direction = 3;
    else if (moveX < 0) direction = 4;

    // Send Movement (Type 1)
    // This now sends 20 bytes: [Int Direction][Double X][Double Y]
    gameClient.sendMovement(direction, targetX, targetY);

    // Send Combat (Type 2)
    if (fire) {
        gameClient.sendCombat(0, 1); // Target 0, Action 1
    }

    nextClientTick++;
}


export function sanitizeInput(): ReadonlyInputState {
    return {...inputState} as ReadonlyInputState;
}

export function validateState(): boolean {
    const errors: string[] = [];
    if (Math.abs(gameState.location.x) > 1000 || Math.abs(gameState.location.y) > 1000) {
        errors.push('Position OOB');
        gameState.location = {x: 0, y: 0};
    }
    if (gameState.ticks < 0) {
        errors.push('Negative ticks');
        gameState.ticks = 0;
    }
    if (errors.length) {
        log.warn('State corrected:', errors);
        return false;
    }
    return true;
}

export function emergencyReset(): void {
    log.error('EMERGENCY RESET');
    resetAllStates();
    gameLoop.stop();
}

let prevLocation = {x: 0, y: 0};

/**
 * 60fps render interpolation
 */
function render(alpha: number): void {
    if (!board) return;

    // Interpolate position
    const renderX = prevLocation.x + (gameState.location.x - prevLocation.x) * alpha;
    const renderY = prevLocation.y + (gameState.location.y - prevLocation.y) * alpha;

    // Update camera
    if (camera_center) {
        camera_center.setPosition(JXG.COORDS_BY_USER, [renderX, renderY]);
        setViewCenter(renderX, renderY);
    }

    // FPS overlay
    if (debug && fpsOverlay) {
        frameCount++;
        jsxUpdates++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            avgFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
            tickHz = Math.round(tickCount * 1000 / (now - lastFpsTime));
            frameCount = tickCount = 0;
            lastFpsTime = now;
        }
        fpsOverlay.innerHTML = `
            FPS: ${avgFps}<br>
            Tick: ${tickHz}Hz<br>
            Ticks: ${gameState.ticks}<br>
            Pos: ${renderX.toFixed(1)}, ${renderY.toFixed(1)}<br>
            Pending: ${pendingInputs.length}<br>
            Connected: ${isConnected ? 'Yes' : 'No'}
        `;
    }

    board.update();
}

function tick_increment(): void {
    gameState.ticks++;
}

// ============================================================================
// CONNECTION FAILURE UI
// ============================================================================

function removeFailureButton(): void {
    const btn = document.getElementById('back-to-menu-btn');
    btn?.remove();
}

function hideConnectingUI(): void {
    const overlay = document.getElementById('ui-overlay') as HTMLElement;
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

function setMenuMode(b: boolean) {
    menu_mode = b;

    const jxgbox = document.getElementById('jxgbox') as HTMLElement;
    if (!jxgbox) return;

    const canvas = jxgbox.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    if (b) {
        // MENU MODE: Push board canvas BEHIND everything (negative z-index)
        canvas.style.zIndex = '-1';
        canvas.style.position = 'absolute'; // Ensure it can have negative z-index

        // Also hide JSXGraph navigation if it exists
        const nav = jxgbox.querySelector('.JXG_navigation') as HTMLElement | null;
        if (nav) nav.style.display = 'none';

        // Optional: Add backdrop blur to board
        canvas.style.filter = 'blur(2px)';
        canvas.style.opacity = '0.3';

    } else {
        // GAME MODE: Restore board to foreground
        canvas.style.zIndex = '1';
        canvas.style.filter = 'none';
        canvas.style.opacity = '1';

        const nav = jxgbox.querySelector('.JXG_navigation') as HTMLElement | null;
        if (nav) nav.style.display = debug ? 'block' : 'none';
    }

    // Force re-render
    board?.update();
    resize();
}

/**
 * Show permanent failure screen with RETURN TO MENU
 */
function showConnectionFailure(message: string) {
    // 1. Pause game and stop loop
    gameState.paused = true;
    gameLoop.stop();

    const container = document.querySelector('.graph-wrapper') as HTMLElement;
    if (!container) return;

    // 2. Remove ANY existing overlay (clean slate)
    const oldOverlay = document.getElementById('ui-overlay');
    if (oldOverlay) oldOverlay.remove();

    // 3. Create SCREEN-SPACE overlay (No transformations, High Z-Index)
    const failOverlay = document.createElement('div');
    failOverlay.id = 'ui-overlay';
    failOverlay.className = 'homepage-overlay'; // Keep class for styling

    // FORCE overrides to ensure it sits on top and catches events
    failOverlay.style.position = 'absolute';
    failOverlay.style.top = '0';
    failOverlay.style.left = '0';
    failOverlay.style.width = '100%';
    failOverlay.style.height = '100%';
    failOverlay.style.zIndex = '10000'; // Higher than JSXGraph (usually 100-200)
    failOverlay.style.pointerEvents = 'auto';
    failOverlay.style.transform = 'none'; // Critical: Stop board synchronization scaling

    failOverlay.innerHTML = `
        <div class="panels-container" style="pointer-events: auto;">
            <div class="panel connecting-panel" style="pointer-events: auto;">
                <div class="connecting-content" style="pointer-events: auto;">
                    <div class="ui-title">[ ACIDIUM ]</div>
                    <div class="ui-subtitle" style="color: #ff6666;">${message}</div>
                </div>
            </div>
        </div>
    `;

    container.appendChild(failOverlay);

    // 4. Update global reference so syncOverlayToBoard knows to skip it
    overlay = failOverlay;

    // 5. Create and attach the button
    const content = failOverlay.querySelector('.connecting-content');
    if (!content) return;

    const backBtn = document.createElement('button');
    backBtn.textContent = 'RETURN TO MENU';
    backBtn.style.cssText = `
        margin-top: 3rem;
        padding: 1.2rem 3rem;
        width: min(80vw, 600px);
        font-family: 'Courier New', monospace;
        font-size: clamp(1.2rem, 4vw, 1.8rem);
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        background: #111;
        border: 2px solid #444;
        color: #fff;
        border-radius: 8px;
        cursor: pointer;
        pointer-events: auto;
        transition: all 0.2s;
    `;

    backBtn.addEventListener('mouseenter', () => {
        backBtn.style.borderColor = '#666';
        backBtn.style.background = '#222';
    });
    backBtn.addEventListener('mouseleave', () => {
        backBtn.style.borderColor = '#444';
        backBtn.style.background = '#111';
    });

    backBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop event bubbling
        log.info('→ Main Menu');

        // A. Cleanup Network & Game
        if (retryTimeout !== null) clearTimeout(retryTimeout);
        gameClient?.disconnect();
        gameClient = null;
        gameLoop.stop();
        resetAllStates();

        // B. Remove Failure Screen
        failOverlay.remove();
        overlay = null; // Clear global ref

        // C. CRITICAL: RE-ENABLE MENU MODE (Hides Grid/Axes)
        // This makes the board "invisible" so the menu stands out
        setMenuMode(true);

        // D. Recreate Homepage UI
        // createHomepageOverlay usually returns the DOM element or handle
        uiHandle = createHomepageOverlay(container, main_ui_callbacks);

        // E. Update global overlay reference to the NEW menu
        // This allows syncOverlayToBoard to resume working for the main menu
        const newMenu = document.getElementById('ui-overlay');
        if (newMenu) {
            overlay = newMenu;
            // Force an immediate sync so it's centered/sized correctly
            syncOverlayToBoard();
        }

        // F. Reset Flags
        connectionFailed = false;
        retryCount = 0;
        isConnected = false;

        sendTelemetry('info', 'Returned to main menu');
    });

    content.appendChild(backBtn);
}


// ============================================================================
// MAIN CONNECTION SEQUENCE
// ============================================================================

const main_ui_callbacks = {
    onRealmSelect: function () {
    },
    onSettings: function () {
    },

    /**
     * Entry point for game start → orchestrates full connection lifecycle
     */
    onStartGame: function () {
        // Reset everything
        resetAllStates();
        frameCount = tickCount = 0;
        lastFpsTime = performance.now();
        prevLocation = {...gameState.location};

        // Cleanup old connections
        retryTimeout && clearTimeout(retryTimeout);
        gameClient?.disconnect();
        gameClient = null;

        // Reset connection state
        retryCount = connectionFailed = isConnected = false;
        pendingInputs = [];

        log.info('🚀 Starting game connection...');
        startConnectionSequence();
    }
};

function startConnectionSequence(): void {
    const maxRetries = 3;

    function getSubtitle(): HTMLElement | null {
        return document.querySelector('.connecting-panel .ui-subtitle') as HTMLElement;
    }

    function getSpinner(): HTMLElement | null {
        return document.querySelector('.connecting-panel .connecting-spinner') as HTMLElement;
    }

    function attemptConnect(attemptNum: number): void {
        if (connectionFailed) return;  // Race condition protection

        log.info(`Connection attempt ${attemptNum}/${maxRetries}`);

        // UI feedback
        const subtitle = getSubtitle();
        const spinner = getSpinner();
        if (subtitle) {
            subtitle.textContent = attemptNum === 1 ? 'Connecting...' : `Retry ${attemptNum}/${maxRetries}`;
            subtitle.style.color = '#00ff88';
        }
        if (spinner) spinner.style.display = 'block';

        removeFailureButton();

        // === CREATE GAME CLIENT ===
        gameClient = new GameClient();
        const wsUrl = debug ? 'ws://localhost:8080/ws/game' : new URL(connection_data.endpoint, connection_data.ip).toString();
        gameClient.connect(wsUrl);

        // === ON CONNECT SUCCESS ===
        gameClient.onConnect(() => {
            if (connectionFailed) return;  // Late callback protection

            isConnected = true;
            retryTimeout = null;
            log.info('✅ Connected to game server');
            sendTelemetry('info', 'Game server connected');

            // Hide connecting UI
            hideConnectingUI();

            // === START RENDERING LOOP ===
            gameLoop.start(
                () => {  // 20Hz tick
                    prevLocation.x = gameState.location.x;
                    prevLocation.y = gameState.location.y;
                    updateTick();
                },
                (alpha: number) => render(alpha)  // 60Hz render
            );

            // === POST-CONNECT DISCONNECT HANDLER ===
            const safeDisconnect = () => {
                if (!connectionFailed) {
                    connectionFailed = true;
                    isConnected = false;
                    gameState.paused = true;
                    log.warn('❌ Lost connection to server');
                    sendTelemetry('warn', 'Server disconnected');
                    showConnectionFailure('Connection Lost');
                }
            };
            gameClient!.onDisconnect(safeDisconnect);
            gameClient!.onError(safeDisconnect);
        });

        // === SERVER MESSAGES ===
        gameClient.onMessage((message) => {
            if (message instanceof ArrayBuffer && message.byteLength === 1) {
                // Server ACK (1 byte)
                const ack = new Uint8Array(message)[0];
                if (ack === 1 && pendingInputs.length > 0) {
                    const input = pendingInputs.shift()!;
                    const speed = 20.0;
                    gameState.location.x += input.dirX * speed;
                    gameState.location.y += input.dirY * speed;
                    if (input.fire) log.debug(`🔫 Fire @ (${gameState.location.x.toFixed(1)}, ${gameState.location.y.toFixed(1)})`);
                    tick_increment();
                    tickCount++;
                    updateEntityRendering();
                }
            } else if (typeof message === 'string') {
                try {
                    handleJsonResponse(JSON.parse(message));
                } catch {
                }
            }
        });

        // === CONNECTION TIMEOUT ===
        retryTimeout = setTimeout(() => {
            if (isConnected || connectionFailed) return;

            log.warn(`⏰ Connection timeout (attempt ${attemptNum})`);
            retryCount++;

            if (retryCount < maxRetries) {
                const delay = 2000 + (retryCount * 1000);
                retryTimeout = setTimeout(() => attemptConnect(attemptNum + 1), delay);
            } else {
                connectionFailed = true;
                showConnectionFailure('Unable to connect');
                sendTelemetry('error', 'Connection failed - max retries');
                gameClient = null;
            }
        }, 8000);
    }

    attemptConnect(1);  // First attempt
}

function handleJsonResponse(msg: any): void {
    switch (msg.type) {
        case 'ACCOUNT_REPLY':
        case 'CHAT_FORWARD':
        case 'CRAFTING_REPLY':
        case 'ANNOUNCEMENT_REPLY':
            log.info(`${msg.type}:`, msg.payload);
            break;
        case 'EXCEPTION_SERVER':
            log.error('Server:', msg.payload);
            break;
        default:
            log.debug('JSON:', msg.type);
    }
}

// ============================================================================
// INITIALIZATION & EVENT HANDLERS
// ============================================================================

window.addEventListener('load', () => {
    // Initialize JSXGraph board
    initBoard();

    // Overlay sync
    board!.on('boundingbox', syncOverlayToBoard);
    board!.on('update', syncOverlayToBoard);

    overlay = document.getElementById('ui-overlay');
    overlay && syncOverlayToBoard();

    // Create homepage UI
    const wrapper = document.querySelector('.graph-wrapper') as HTMLElement;
    if (wrapper) {
        uiHandle = createHomepageOverlay(wrapper, main_ui_callbacks);
    } else {
        console.error('❌ Graph wrapper not found');
    }

    // Debug settings
    if (debug) telemetry_options.enabled = true;

    log.info('🎮 Client ready');

    // Input handling
    keyboard_control.setup();

    // Debug pause toggle
    if (debug) {
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'p') {
                gameState.paused = !gameState.paused;
                log.info(gameState.paused ? '⏸️ Paused' : '▶️ Playing');
            }
        });
    }

    // Telemetry (independent WS)
    Telemetry.init(connection_data.ip || 'localhost:8080');
});

window.addEventListener('resize', () => {
    board && (resize(), update_camera());
});
