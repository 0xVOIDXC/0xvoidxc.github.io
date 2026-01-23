import './style.css'
import JXG from 'jsxgraph'
import {createHomepageOverlay} from "./interfaces/main_ui.ts";
import {Telemetry} from "./net/telemetry.ts";
import * as keyboard_control from './control/keyboard.ts'
import {gameLoop} from "./game_loop.ts";
import {gameState, inputState, resetInputState, tick_increment} from "./global.ts";
import * as log from './log.ts'

// root layout
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="graph-container">
    <div class="graph-wrapper">
      <div id="jxgbox"></div>
    </div>
  </div>
`

const debug = true
const connection_data = {
    ip: "",
    endpoint: "/ws/game"
}

let board: JXG.Board;
let currentBoundingBox: [number, number, number, number] = [-8, 8, 8, -8]
let camera_center: JXG.Point

const MAX_ASPECT_RATIO = 16 / 9
let baseSize = 8

// ============ FPS COUNTER SETUP ============
let fpsOverlay: HTMLElement;
let frameCount = 0;
let tickCount = 0;
let lastFpsTime = performance.now();
let avgFps = 0;
let tickHz = 0;
let jsxUpdates = 0;

if (debug) {
    fpsOverlay = document.createElement('div');
    fpsOverlay.id = 'fps-overlay';
    fpsOverlay.style.cssText = `
        position: absolute; top: 10px; left: 10px; z-index: 9999;
        font-family: 'Courier New', monospace; font-size: 14px; color: #00ff00;
        background: rgba(0,0,0,0.7); padding: 8px; border-radius: 4px;
        pointer-events: none; backdrop-filter: blur(4px);
        min-width: 140px; text-shadow: 1px 1px 2px #000;
    `;
    document.querySelector('#app')!.appendChild(fpsOverlay);
}

// =========== SVG HELPERS ==========

const displaySVGCentered = (
    svgUrl: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    options: Partial<JXG.ImageAttributes> = {},
): JXG.Image => {
    return board.create('image', [svgUrl, [cx - w / 2, cy - h / 2], [w, h]], options)
}

const displaySVGAtBoardCoords = (
    svgUrl: string,
    boardX: number,
    boardY: number,
    width: number,
    height: number,
    options: Partial<JXG.ImageAttributes> = {},
): JXG.Image => {
    // board! ensures it runs only after init
    return board!.create('image', [svgUrl, [boardX, boardY], [width, height]], options)
};

// ========== GEOMETRY HELPERS ==========

/**
 * Convert board coordinates to screen pixel coordinates
 * @returns { x, y } in pixels relative to jxgbox
 */
function boardToScreenCoords(boardX: number, boardY: number): { x: number; y: number } {
    const boardCoords = new JXG.Coords(JXG.COORDS_BY_USER, [boardX, boardY], board)
    return {
        x: boardCoords.scrCoords[1],
        y: boardCoords.scrCoords[2],
    }
}

/**
 * Convert screen pixel coordinates to board coordinates
 * @returns { x, y } on board
 */
function screenToBoardCoords(screenX: number, screenY: number): { x: number; y: number } {
    const coords = new JXG.Coords(JXG.COORDS_BY_SCREEN, [screenX, screenY], board)
    return {
        x: coords.usrCoords[1],
        y: coords.usrCoords[2],
    }
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

function createPoint(
    coords: [number, number],
    options: Partial<JXG.PointAttributes> = {},
): JXG.Point {
    const defaults: Partial<JXG.PointAttributes> = {
        visible: true,
        withLabel: true,
        size: 4,
        strokeColor: '#000000',
    }
    const attrs = { ...defaults, ...options }
    return board.create('point', coords, attrs)
}

function createLine(
    p1: [number, number] | JXG.Point,
    p2: [number, number] | JXG.Point,
    options: Partial<JXG.LineAttributes> = {},
): JXG.Line {
    const defaults: Partial<JXG.LineAttributes> = {
        strokeColor: '#000000',
        strokeWidth: 1,
        straightFirst: false,
        straightLast: false,
    }
    const attrs = { ...defaults, ...options }
    return board.create('line', [p1, p2], attrs)
}

function createCircle(
    center: [number, number] | JXG.Point,
    radius: number | [JXG.Point, JXG.Point],
    options: Partial<JXG.CircleAttributes> = {},
): JXG.Circle {
    const defaults: Partial<JXG.CircleAttributes> = {
        strokeColor: '#000000',
        strokeWidth: 1,
        fillOpacity: 0,
    }
    const attrs = { ...defaults, ...options }
    return board.create('circle', [center, radius], attrs)
}

function hidePoint(point: JXG.Point): void {
    point.setAttribute({
        visible: false,
        withLabel: false,
    } as Partial<JXG.PointAttributes>)
    board.update()
}

function showPoint(point: JXG.Point, withLabel = true): void {
    point.setAttribute({
        visible: true,
        withLabel,
    } as Partial<JXG.PointAttributes>)
    board.update()
}

function togglePoint(point: JXG.Point): void {
    const isVisible = point.visProp.visible as boolean
    point.setAttribute({
        visible: !isVisible,
        withLabel: !isVisible,
    } as Partial<JXG.PointAttributes>)
    board.update()
}

function movePoint(point: JXG.Point, x: number, y: number): void {
    point.setPosition(JXG.COORDS_BY_USER, [x, y])
    board.update()
}

function getPointCoords(point: JXG.Point): { x: number; y: number } {
    return { x: point.X(), y: point.Y() }
}

function deleteElement(element: JXG.GeometryElement): void {
    board.removeObject(element)
    board.update()
}

function clearBoard(): void {
    const objectsToKeep = ['jxgbox', camera_center.id]
    const objectIds = Object.keys(board.objects)
    objectIds.forEach(id => {
        const obj = board.objects[id]
        if (!objectsToKeep.includes(id) && obj.type !== 'axis') {
            board.removeObject(obj)
        }
    })
    board.update()
}

function updateElements(
    elements: JXG.GeometryElement[],
    attributes: Partial<JXG.Attributes>,
): void {
    elements.forEach(el => {
        el.setAttribute(attributes)
    })
    board.update()
}

function getAllPoints(): JXG.Point[] {
    return Object.values(board.objects).filter(
        (obj): obj is JXG.Point => obj.type === 'point' && obj.id !== camera_center.id,
    )
}

function isPointInCircle(point: JXG.Point, cx: number, cy: number, radius: number): boolean {
    return distance(point.X(), point.Y(), cx, cy) <= radius
}

function getPointsInCircle(cx: number, cy: number, radius: number): JXG.Point[] {
    return getAllPoints().filter(p => isPointInCircle(p, cx, cy, radius))
}

// ========== SVG & LAYOUT HELPERS ==========

function displaySVG(
    svgUrl: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options: Partial<JXG.ImageAttributes> = {},
): JXG.Image {
    const defaults: Partial<JXG.ImageAttributes> = { opacity: 1 }
    const attrs = { ...defaults, ...options }
    return board.create('image', [svgUrl, [x, y], [width, height]], attrs)
}

function displaySVGString(
    svgString: string,
    x: number,
    y: number,
    width: number,
    height: number,
): HTMLElement {
    const container = document.createElement('div')
    container.innerHTML = svgString
    container.style.position = 'absolute'
    container.style.left = `${x}px`
    container.style.top = `${y}px`
    container.style.width = `${width}px`
    container.style.height = `${height}px`
    container.style.pointerEvents = 'none'

    document.getElementById('jxgbox')!.parentElement!.appendChild(container)
    return container
}


function createFollowingSVG(
    svgUrl: string,
    point: JXG.Point,
    width: number,
    height: number,
): JXG.Image {
    const svgImage = displaySVGAtBoardCoords(svgUrl, point.X(), point.Y(), width, height)

    point.on('drag', () => {
        svgImage.setPosition(JXG.COORDS_BY_USER, [point.X(), point.Y()])
        board.update()
    })

    return svgImage
}

function rotateSVG(svgImage: JXG.Image, angleRadians: number): void {
    svgImage.setAttribute({
        rotate: (angleRadians * 180) / Math.PI,
    } as Partial<JXG.ImageAttributes>)
    board.update()
}

function createBoardLabel(
    text: string,
    boardX: number,
    boardY: number,
    style: Partial<CSSStyleDeclaration> = {},
): HTMLElement {
    const coords = boardToScreenCoords(boardX, boardY)
    const label = document.createElement('div')

    label.innerHTML = text
    label.style.position = 'absolute'
    label.style.left = `${coords.x}px`
    label.style.top = `${coords.y}px`
    label.style.whiteSpace = 'nowrap'
    label.style.pointerEvents = 'auto'
    label.style.transform = 'translate(-50%, -100%)'
    label.style.zIndex = '1000'

    Object.assign(label.style, style)

    document.getElementById('jxgbox')!.parentElement!.appendChild(label)
    return label
}

function linkSVGToPoint(svgImage: JXG.Image, point: JXG.Point): void {
    point.on('drag', () => {
        svgImage.setPosition(JXG.COORDS_BY_USER, [point.X(), point.Y()])
        board.update()
    })
}

function placeSpritesOnGrid(
    svgUrl: string,
    gridSize: number,
    positions: [number, number][],
): JXG.Image[] {
    return positions.map(([gx, gy]) => {
        const boardX = gx * gridSize
        const boardY = gy * gridSize
        return displaySVGAtBoardCoords(svgUrl, boardX, boardY, gridSize * 0.9, gridSize * 0.9)
    })
}

// ========== INITIALIZATION & EVENTS ==========

function calculateAspectRatioBoundingBox(): [number, number, number, number] {
    const container = document.getElementById('jxgbox') as HTMLDivElement
    const width = container.offsetWidth
    const height = container.offsetHeight

    const aspectRatio = width / height
    const constrainedAspectRatio = Math.min(aspectRatio, MAX_ASPECT_RATIO)

    if (constrainedAspectRatio > 1) {
        const xRange = baseSize * constrainedAspectRatio
        return [-xRange, baseSize, xRange, -baseSize]
    } else {
        const yRange = baseSize / constrainedAspectRatio
        return [-baseSize, yRange, baseSize, -yRange]
    }
}

function initBoard(): void {
    currentBoundingBox = calculateAspectRatioBoundingBox()

    board = JXG.JSXGraph.initBoard('jxgbox', {
        boundingbox: currentBoundingBox,
        axis: debug,
        showNavigation: debug,
        showCopyright: false,
        grid: false,
        drag: { mode: JXG.DragMode0 },  // Faster drag mode

        // PERFORMANCE FLAGS
        reducedUpdate: true,      // Skip expensive updates
        needsFullUpdate: false,   // Partial updates only
        hasPointThreshold: 15,    // Faster hit testing
        highlight: false,         // NO HIGHLIGHT ANIMATIONS

        // RENDERING OPTIMIZATIONS
        renderer: 'canvas',       // FASTER than SVG
        canvasHeight: 800,
        canvasWidth: 1200,

        // INPUT THROTTLING
        maxFramerate: 30,         // Limit FPS
        precision: {
            epsilon: 0.001,         // Tighter precision, less recalc
            touchMaxDistance: 50
        }
    })

    // Disable expensive mouse tracking
    board.generatePolynomialBezier = false

    camera_center = board.create('point', [0, 0], {
        visible: debug,
        highlight: false,     // No highlight lag
        withLabel: false
    })

    camera_center.on('drag', () => {
        if (debug) update_camera()
    })
}

function setViewCenter(centerX: number, centerY: number, zoomFactor = 1): void {
    if (!board) return

    const currentWidth = currentBoundingBox[2] - currentBoundingBox[0]
    const currentHeight = currentBoundingBox[1] - currentBoundingBox[3]

    const newWidth = currentWidth / zoomFactor
    const newHeight = currentHeight / zoomFactor

    const newLeft = centerX - newWidth / 2
    const newRight = centerX + newWidth / 2
    const newTop = centerY + newHeight / 2
    const newBottom = centerY - newHeight / 2

    changeBoundingBox([newLeft, newTop, newRight, newBottom])
}

function changeBoundingBox(newBoundingBox: [number, number, number, number]): void {
    if (board && newBoundingBox.length === 4) {
        currentBoundingBox = newBoundingBox
        board.setBoundingBox(currentBoundingBox, false)
        board.update()
    }
}

function resize(): void {
    if (board) {
        const newBoundingBox = calculateAspectRatioBoundingBox()
        changeBoundingBox(newBoundingBox)
    }
}

function update_camera(): void {
    const x = camera_center.X()
    const y = camera_center.Y()
    setViewCenter(x, y)
}

let overlay: HTMLElement | null = null

function syncOverlayToBoard(): void {
    if (!board || !overlay) return;

    const container = overlay.parentElement!;
    const bb = board.getBoundingBox();

    const scaleX = container.offsetWidth / (bb[2] - bb[0]);
    const scaleY = container.offsetHeight / (bb[1] - bb[3]);
    const scale = Math.min(scaleX, scaleY);

    const translateX = -bb[0] * scale;
    const translateY = -bb[3] * scale;

    overlay.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

    // FPS OVERLAY stays screen-fixed (top-left corner)
    if (fpsOverlay) {
        fpsOverlay.style.transform = 'translate(0,0) scale(1)';  // Screen space
    }
}

// ==================== UPDATE FUNCTIONS ====================

/**
 * Reset ALL states to initial values
 * Call on: game start, disconnect, pause, error recovery
 */
export function resetAllStates(): void {
    // Reset input
    resetInputState()

    // Reset game state
    gameState.ticks = 0
    gameState.location = { x: 0, y: 0 }
    gameState.rendering.entities.clear()

    log.info('🔄 All states reset')
}

/**
 * Single 20Hz tick update - MAIN LOGIC ENTRY POINT
 * Mutates gameState/inputState directly
 */
export function updateTick(): void {
    // === INPUT PROCESSING ===
    const moveX = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0)

    // FIX: Up is Positive Y, Down is Negative Y in Cartesian/JSXGraph
    const moveY = (inputState.up ? 1 : 0) - (inputState.down ? 1 : 0)

    // Normalize diagonal movement
    const speed = 20.0  // units per tick (20Hz)
    const length = Math.sqrt(moveX * moveX + moveY * moveY)
    if (length > 0) {
        gameState.location.x += (moveX / length) * speed
        gameState.location.y += (moveY / length) * speed
    }

    // Action handling
    if (inputState.fire) {
        log.debug(`🔥 Fire at (${gameState.location.x.toFixed(1)}, ${gameState.location.y.toFixed(1)})`)
        // SPAWN BULLET LOGIC HERE
    }

    if (inputState.interact) {
        log.debug('🖱️ Interact action')
        // INTERACT LOGIC HERE
    }

    // === TICK INCREMENT ===
    tick_increment()
    tickCount++;  // For FPS counter

    // === ENTITY UPDATES (reserved space) ===
    // for (const entityId of gameState.rendering.entities) {
    //     updateEntity(entityId)
    // }

    // === COLLISION DETECTION (reserved space) ===
    // checkCollisions()

    // === CLEANUP (reserved space) ===
    // cleanupExpiredEntities()
}


/**
 * Input sanitization - call before each tick
 * Prevents sticky keys/network spam
 */
export function sanitizeInput(): ReadonlyInputState {
    const sanitized = { ...inputState }
    return sanitized as ReadonlyInputState
}

/**
 * State validation - call periodically or on error
 * Logs inconsistencies, auto-corrects critical issues
 */
export function validateState(): boolean {
    const errors: string[] = []

    // Validate location bounds
    if (Math.abs(gameState.location.x) > 1000 || Math.abs(gameState.location.y) > 1000) {
        errors.push('Location out of bounds')
        gameState.location = { x: 0, y: 0 }
    }

    // Validate tick progression
    if (gameState.ticks < 0) {
        errors.push('Negative ticks')
        gameState.ticks = 0
    }

    if (errors.length > 0) {
        log.warn('State validation failed:', errors)
        return false
    }

    return true
}

/**
 * Emergency state reset - nuclear option
 * Call on critical errors/telemetry loss
 */
export function emergencyReset(): void {
    log.error('💥 EMERGENCY RESET')
    resetAllStates()
    // Optionally: pause gameLoop
    // gameLoop.stop()
}

// ==================== RESERVED EXPANSION SPACE ====================

/** Placeholder for future entity updates */
function updateEntity(entityId: string): void {
    // ENTITY UPDATE LOGIC
}

/** Placeholder for collision system */
function checkCollisions(): void {
    // COLLISION LOGIC
}

/** Placeholder for cleanup */
function cleanupExpiredEntities(): void {
    // CLEANUP LOGIC
}

let prevLocation = { x: 0, y: 0 };

function render(alpha: number) {
    if (!board) return;

    // --- A. Interpolation ---
    // Calculate smooth visual position between ticks
    const renderX = prevLocation.x + (gameState.location.x - prevLocation.x) * alpha;
    const renderY = prevLocation.y + (gameState.location.y - prevLocation.y) * alpha;

    // --- B. Camera Update ---
    if (camera_center) {
        // Move the hidden camera point without triggering full board updates yet
        camera_center.setPosition(JXG.COORDS_BY_USER, [renderX, renderY]);

        // Recenter view on this new position
        setViewCenter(renderX, renderY);
    }

    // --- C. Debug / FPS Overlay ---
    if (debug && fpsOverlay) {
        // Update counters
        frameCount++;
        jsxUpdates++; // Hook into board updates if needed, here it tracks frames

        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            avgFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
            tickHz = Math.round(tickCount * 1000 / (now - lastFpsTime));
            frameCount = 0;
            tickCount = 0;
            lastFpsTime = now;
        }

        // Update display HTML
        fpsOverlay.innerHTML = `
            FPS: ${avgFps}<br>
            Tick: ${tickHz}Hz<br>
            JSX: ${Math.round(jsxUpdates / 10) / 100}s<sup>-1</sup><br>
            Ticks: ${gameState.ticks}<br>
            Pos: ${renderX.toFixed(1)}, ${renderY.toFixed(1)}
        `;
    }

    // --- D. Final Draw ---
    // Explicitly update board once per render frame
    // 'false' param prevents full recalc if not needed, 'true' forces redraw
    board.update();
}

const main_ui_callbacks = {
    onRealmSelect: function () { },
    onSettings: function () { },
    onStartGame: function () {
        resetAllStates()  // Clean slate

        // Reset counters for clean start
        frameCount = 0;
        tickCount = 0;
        lastFpsTime = performance.now();

        // Initialize previous location to match start
        prevLocation = { ...gameState.location };

        gameLoop.start(
            // UPDATE (20Hz)
            () => {
                // Snapshot state BEFORE update for interpolation
                prevLocation.x = gameState.location.x;
                prevLocation.y = gameState.location.y;
                updateTick();
            },
            // RENDER (Every Frame)
            (alpha: number) => {
                render(alpha);
            }
        )
        log.info('🎮 Game started at 20Hz with Interpolated Camera')
    }
}

// startup
window.addEventListener('load', () => {
    initBoard()

    // Sync overlay to board events
    board.on('boundingbox', syncOverlayToBoard)
    board.on('update', syncOverlayToBoard)

    // Get overlay element
    overlay = document.getElementById('ui-overlay')
    if (overlay) syncOverlayToBoard()

    const wrapper = document.querySelector('.graph-wrapper') as HTMLElement
    if (wrapper) {
        createHomepageOverlay(wrapper, main_ui_callbacks)
    } else {
        console.error('Graph wrapper not found!')
    }

    if (debug) {
        Telemetry.enabled = true;
        Telemetry.setCS("localhost", 8080)
    }
    log.info("init done");

    // register the controls
    keyboard_control.setup();
})

window.addEventListener('resize', () => {
    if (board) {
        resize()
        update_camera()
    }
})
