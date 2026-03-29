// src/net/game_client.ts
import {gameState} from "../global.ts";

export type GameClientMessage = string | ArrayBuffer | Blob;
export enum BinaryPacketType { Movement = 1, Combat = 2, Command = 3 }
export interface CommandPacketOptions { flags?: number; }

type OnMessage = (data: GameClientMessage) => void;
type OnConnect = () => void;
type OnDisconnect = (ev?: CloseEvent) => void;
type OnError = (ev: Event) => void;

export class GameClient {
    private ws: WebSocket | null = null;
    private onConnectCb: OnConnect | null = null;
    private onDisconnectCb: OnDisconnect | null = null;
    private onMessageCb: OnMessage | null = null;
    private onErrorCb: OnError | null = null;

    connect(url: string): void {
        this.disconnect();
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        this.ws = ws;
        ws.onopen = () => this.onConnectCb?.();
        ws.onclose = (ev) => this.onDisconnectCb?.(ev);
        ws.onerror = (ev) => this.onErrorCb?.(ev);
        ws.onmessage = (ev) => this.onMessageCb?.(ev.data as GameClientMessage);
    }

    disconnect(): void {
        if (!this.ws) return;
        this.ws.close(1000, "Client disconnect");
        this.ws = null;
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN ?? false;
    }

    onConnect(cb: OnConnect): void {
        this.onConnectCb = () => {
            cb();
            this.sendAccountLogin(" ", " ");
        };
    }

    onDisconnect(cb: OnDisconnect): void { this.onDisconnectCb = cb; }
    onError(cb: OnError): void { this.onErrorCb = cb; }
    onMessage(cb: OnMessage): void { this.onMessageCb = cb; }

    private sendJson(type: string, payload: any): boolean {
        if (!this.isConnected()) return false;
        this.ws!.send(JSON.stringify({type, payload}));
        return true;
    }

    /**
     * UNIVERSAL BINARY SENDER
     * Matches server's routeBinaryPacket:
     * Header byte = (flags << 4) | (type)
     */
    private sendBinary(type: BinaryPacketType, flags: number, payload: Uint8Array): boolean {
        if (!this.isConnected()) return false;

        const header = ((flags & 0x0F) << 4) | (type & 0x0F);

        const packet = new Uint8Array(1 + payload.length);
        packet[0] = header;
        packet.set(payload, 1);

        this.ws!.send(packet);
        return true;
    }

    public sendMovement(clientTick: number, dirX: number, dirY: number): boolean {
        const mag = Math.hypot(dirX, dirY);
        const accelerating = mag > 0.001;
        const normX = accelerating ? dirX / mag : 0;
        const normY = accelerating ? dirY / mag : 0;

        const payload = new Uint8Array(13);
        const view = new DataView(payload.buffer);

        // PlayerMovementDecoder expects flags at payload[0]
        view.setUint8(0, accelerating ? 1 : 0);
        view.setInt32(1, clientTick, false);
        view.setFloat32(5, normX, false);
        view.setFloat32(9, normY, false);

        // Header flags = 0x0, Type = 1
        return this.sendBinary(BinaryPacketType.Movement, 0, payload);
    }

    public sendCommand(command: string): boolean {
        const trimmed = command.trim();
        const utf8Bytes = new TextEncoder().encode(trimmed);
        const binaryString = String.fromCharCode(...utf8Bytes);
        const base64String = btoa(binaryString);

        const payload = new Uint8Array(
            base64String.split('').map(c => c.charCodeAt(0))
        );

        // Header flags = 0x1 (Base64), Type = 3
        return this.sendBinary(BinaryPacketType.Command, 1, payload);
    }

    public sendCombat(targetId: number, action: number): boolean {
        const payload = new Uint8Array(8);
        const view = new DataView(payload.buffer);
        view.setInt32(0, targetId, false);
        view.setInt32(4, action, false);

        // Header flags = 0x0, Type = 2
        return this.sendBinary(BinaryPacketType.Combat, 0, payload);
    }

    public sendAccountLogin(username: string, password: string): boolean {
        return this.sendJson("ACCOUNT", {type: "LOGIN", username, password});
    }

    public sendChatDirect(receiver: string, message: string): boolean {
        return this.sendJson("CHAT_REQUEST", {
            selector: "DIRECT", receiver, message
        });
    }

    //todo CHANNEL ROUTING
    sendChat() {

    }
}
