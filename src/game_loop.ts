// src/gameLoop.ts
interface GameLoopOptions {
    timestepMs: number;  // 50ms for 20Hz
    maxFrameSkip: number;  // Prevent lag spiral (e.g., skip up to 5 frames)
}

class GameLoop {
    private isRunning = false;
    private rafId: number | null = null;
    private prevTime = 0;
    private accumulator = 0;
    private readonly timestepMs: number;
    private readonly maxFrameSkip: number;

    constructor(options: GameLoopOptions) {
        this.timestepMs = options.timestepMs;
        this.maxFrameSkip = options.maxFrameSkip;
    }

    start(update: (dt: number) => void, render: (alpha: number) => void) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.prevTime = performance.now();
        this.accumulator = 0;

        const loop = (currentTime: number) => {
            if (!this.isRunning) return;

            this.rafId = requestAnimationFrame(loop);
            const frameDeltaMs = currentTime - this.prevTime;
            this.prevTime = currentTime;

            // Clamp delta to prevent huge jumps
            const clampedDelta = Math.min(frameDeltaMs, this.timestepMs * this.maxFrameSkip);
            this.accumulator += clampedDelta;

            // Fixed timestep updates (20Hz)
            let loops = 0;
            while (this.accumulator >= this.timestepMs && loops < this.maxFrameSkip) {
                update(this.timestepMs / 1000);  // dt in seconds
                this.accumulator -= this.timestepMs;
                loops++;
            }

            // Interpolation for smooth render (alpha 0-1)
            const alpha = this.accumulator / this.timestepMs;
            render(alpha);

            // console.log(`Update loops: ${loops}, Alpha: ${alpha.toFixed(2)}`);

        };

        requestAnimationFrame(loop);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
    }
}

// Singleton export
export const gameLoop = new GameLoop({ timestepMs: 50, maxFrameSkip: 5 });  // 20Hz
export type { GameLoopOptions };