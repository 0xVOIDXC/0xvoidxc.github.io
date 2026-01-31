// src/net/telemetry.ts
// Independent telemetry WebSocket connection.
// IMPORTANT: This is NOT the same socket as GameClient.
// Fixes included:
// - No method/field name collision (previously caused "this.onError is not a function").
// - Single reconnect timer at a time.
// - Optional batching.
// - Safe shutdown on unload.

import * as log from '../log.ts'

export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error'

export interface TelemetryEvent {
    level: TelemetryLevel
    message: string
    data?: unknown
    ts: number
}

export interface TelemetryOptions {
    enabled: boolean
    host: string // e.g. "localhost:8080"
    endpoint: string // e.g. "/ws/telemetry"
    batchSize: number
    batchIntervalMs: number
    maxRetries: number
    baseRetryDelayMs: number
}

const DEFAULTS: TelemetryOptions = {
    enabled: false,
    host: '',
    endpoint: '/ws/telemetry',
    batchSize: 20,
    batchIntervalMs: 1000,
    maxRetries: 5,
    baseRetryDelayMs: 5000,
}

export class TelemetryClient {
    private ws: WebSocket | null = null
    private opts: TelemetryOptions

    private connected = false
    private retries = 0
    private reconnectTimer: number | null = null
    private flushTimer: number | null = null
    private reconnectEnabled = true

    private queue: TelemetryEvent[] = []

    // Callbacks (separate names to avoid collisions with methods).
    private onConnectCallback: (() => void) | null = null
    private onDisconnectCallback: (() => void) | null = null
    private onErrorCallback: ((ev: Event) => void) | null = null

    constructor(options?: Partial<TelemetryOptions>) {
        this.opts = { ...DEFAULTS, ...(options ?? {}) }
    }

    configure(options: Partial<TelemetryOptions>): void {
        this.opts = { ...this.opts, ...options }
    }

    connect(host: string, endpoint?: string): void {
        if (!this.opts.enabled) return

        this.opts.host = host
        if (endpoint) this.opts.endpoint = endpoint

        const url = new URL(this.opts.endpoint, `ws://${this.opts.host}`).toString()

        // Cancel pending reconnect attempts before starting a fresh connect.
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }

        this.disconnectSocketOnly()

        log.info(`Telemetry → ${url}`)

        try {
            this.ws = new WebSocket(url)
            this.ws.onopen = () => this.handleOpen()
            this.ws.onmessage = (ev) => this.handleMessage(ev)
            this.ws.onerror = (ev) => this.handleError(ev)
            this.ws.onclose = () => this.handleClose()
        } catch (e) {
            log.error('Telemetry init failed', e)
            this.scheduleReconnect()
        }
    }

    isConnected(): boolean {
        return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN
    }

    send(level: TelemetryLevel, message: string, data?: unknown): void {
        if (!this.opts.enabled) return

        this.queue.push({ level, message, data, ts: Date.now() })

        // Start the batch timer when the first item is queued.
        if (this.flushTimer === null) {
            this.flushTimer = window.setTimeout(() => {
                this.flushTimer = null
                this.flush()
            }, this.opts.batchIntervalMs)
        }

        // If we hit batch size, flush immediately.
        if (this.queue.length >= this.opts.batchSize) {
            this.flush()
        }
    }

    flush(): void {
        if (!this.opts.enabled) return
        if (!this.isConnected()) return
        if (this.queue.length === 0) return

        const batch = this.queue.splice(0, this.queue.length)
        const payload = JSON.stringify({ type: 'TELEMETRY_BATCH', events: batch })

        try {
            this.ws!.send(payload)
            log.debug(`Telemetry sent: ${batch.length} events`)
        } catch (e) {
            // Put them back and wait for reconnect.
            this.queue.unshift(...batch)
            log.warn('Telemetry send failed; will retry after reconnect', e)
        }
    }

    disconnect(): void {
        this.reconnectEnabled = false

        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer)
            this.flushTimer = null
        }
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }

        this.disconnectSocketOnly()

        this.connected = false
        log.info('Telemetry shutdown')
    }

    // ---- event registration ----

    onConnect(cb: () => void): void {
        this.onConnectCallback = cb
    }

    onDisconnect(cb: () => void): void {
        this.onDisconnectCallback = cb
    }

    onError(cb: (ev: Event) => void): void {
        this.onErrorCallback = cb
    }

    // ---- internals ----

    private handleOpen(): void {
        this.connected = true
        this.retries = 0

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }

        log.info('Telemetry connected')

        // Flush any queued events immediately after connect.
        this.flush()

        this.onConnectCallback?.()
    }

    private handleClose(): void {
        const wasConnected = this.connected
        this.connected = false

        // Avoid spam: only log “disconnected” if we were previously connected.
        if (wasConnected) log.warn('Telemetry disconnected')

        this.onDisconnectCallback?.()

        if (this.reconnectEnabled) {
            this.scheduleReconnect()
        }
    }

    private handleError(ev: Event): void {
        // Keep this lightweight; browsers do not provide detailed error reasons.
        log.warn('Telemetry WS error')
        this.onErrorCallback?.(ev)
        // Do not schedule reconnect here; close will follow in most cases.
    }

    private scheduleReconnect(): void {
        if (!this.reconnectEnabled) return
        if (!this.opts.enabled) return
        if (this.reconnectTimer !== null) return
        if (this.retries >= this.opts.maxRetries) {
            log.error('Telemetry: max retries exceeded')
            return
        }

        const delay = Math.round(this.opts.baseRetryDelayMs * Math.pow(1.5, this.retries))
        this.retries += 1

        log.warn(`Telemetry reconnect in ${Math.round(delay / 1000)}s (${this.retries}/${this.opts.maxRetries})`)

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            if (this.opts.host) {
                this.connect(this.opts.host, this.opts.endpoint)
            }
        }, delay)
    }

    private disconnectSocketOnly(): void {
        if (!this.ws) return

        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onerror = null
        this.ws.onclose = null

        try {
            this.ws.close(1000, 'Telemetry disconnect')
        } catch {
            // ignore
        } finally {
            this.ws = null
        }
    }
}

// ---- Singleton helpers (keeps your current call sites simple) ----

let telemetryInstance: TelemetryClient | null = null

export function init(host: string, options?: Partial<TelemetryOptions>): TelemetryClient {
    if (telemetryInstance) return telemetryInstance

    telemetryInstance = new TelemetryClient(options)
    telemetryInstance.connect(host)
    window.addEventListener('beforeunload', () => {
        telemetryInstance?.flush()
        telemetryInstance?.disconnect()
    })
    return telemetryInstance
}

export function sendTelemetry(level: TelemetryLevel, message: string, data?: unknown): void {
    telemetryInstance?.send(level, message, data)
}

export function getTelemetry(): TelemetryClient | null {
    return telemetryInstance
}
