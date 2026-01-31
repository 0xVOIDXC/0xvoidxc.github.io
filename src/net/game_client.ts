// src/net/game_client.ts
export type GameClientMessage = string | ArrayBuffer | Blob

export enum BinaryPacketType {
    Movement = 1,
    Combat = 2,
}

type OnMessage = (data: GameClientMessage) => void
type OnConnect = () => void
type OnDisconnect = (ev?: CloseEvent) => void
type OnError = (ev: Event) => void

export class GameClient {
    private ws: WebSocket | null = null

    private onConnectCb: OnConnect | null = null
    private onDisconnectCb: OnDisconnect | null = null
    private onMessageCb: OnMessage | null = null
    private onErrorCb: OnError | null = null

    connect(url: string): void {
        this.disconnect()

        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer' // Critical for receiving the byte[] ACK
        this.ws = ws

        ws.onopen = () => this.onConnectCb?.()
        ws.onclose = (ev) => this.onDisconnectCb?.(ev)
        ws.onerror = (ev) => this.onErrorCb?.(ev)
        ws.onmessage = (ev) => this.onMessageCb?.(ev.data as GameClientMessage)
    }

    disconnect(): void {
        if (!this.ws) return
        this.ws.onopen = null
        this.ws.onclose = null
        this.ws.onerror = null
        this.ws.onmessage = null
        try {
            this.ws.close(1000, 'Client disconnect')
        } catch {
        }
        this.ws = null
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN
    }

    // --- Callbacks ---
    onConnect(cb: OnConnect): void {
        this.onConnectCb = cb
    }

    onDisconnect(cb: OnDisconnect): void {
        this.onDisconnectCb = cb
    }

    onError(cb: OnError): void {
        this.onErrorCb = cb
    }

    onMessage(cb: OnMessage): void {
        this.onMessageCb = cb
    }

    // --- Sending Logic ---

    private ensureOpen(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN
    }

    private sendBinary(type: number, payload: Uint8Array): boolean {
        if (!this.ensureOpen()) return false;

        // Protocol: [Type: 1 byte] + [Payload: N bytes]
        const packet = new Uint8Array(1 + payload.byteLength);
        packet[0] = type;
        packet.set(payload, 1);

        this.ws!.send(packet);
        return true;
    }

    private sendJson(type: string, payload: any): boolean {
        if (!this.ensureOpen()) return false;
        this.ws!.send(JSON.stringify({type, payload}));
        return true;
    }

    private static buildMovementPayload(accelerating: boolean, clientTick: number, dirX: number, dirY: number): Uint8Array {
        const buf = new ArrayBuffer(13);
        const view = new DataView(buf);

        // Byte 0: Flags
        // Bit 0 set if accelerating, else 0
        view.setUint8(0, accelerating ? 1 : 0);

        // Bytes 1-4: Client Tick (Int32, Big Endian)
        view.setInt32(1, clientTick, false);

        // Bytes 5-8: Dir X (Float32, Big Endian)
        // Note: Server expects normalized vector if accelerating, or 0.0 if idle
        view.setFloat32(5, dirX, false);

        // Bytes 9-12: Dir Y (Float32, Big Endian)
        view.setFloat32(9, dirY, false);

        return new Uint8Array(buf);
    }

    /**
     * Sends movement packet (Type 1).
     * Automatically calculates 'accelerating' flag based on vector length.
     */
    public sendMovement(clientTick: number, dirX: number, dirY: number): boolean {
        // Calculate magnitude to determine state
        const mag = Math.hypot(dirX, dirY);
        const accelerating = mag > 0.001; // Epsilon check

        // If idle, server expects 0.0, 0.0
        const sendX = accelerating ? dirX : 0.0;
        const sendY = accelerating ? dirY : 0.0;

        const payload = GameClient.buildMovementPayload(accelerating, clientTick, sendX, sendY);

        // Sends [Type:1] + [Payload:13] = 14 bytes total
        return this.sendBinary(BinaryPacketType.Movement, payload);
    }

    // TYPE 2: Combat
    // TargetID (Int) + Action (Int) = 8 bytes
    public sendCombat(targetId: number, action: number): boolean {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        view.setInt32(0, targetId, false);
        view.setInt32(4, action, false);

        return this.sendBinary(BinaryPacketType.Combat, new Uint8Array(buffer));
    }

    // --- JSON Operations ---

    sendAccountLogin(username: string, password: string): boolean {
        return this.sendJson('ACCOUNT', {type: 'LOGIN', username, password});
    }

    sendChatDirect(receiver: string, message: string): boolean {
        return this.sendJson('CHAT_REQUEST', {
            selector: 'DIRECT', receiver, message
        });
    }

    // Add other JSON helpers as needed...
}
