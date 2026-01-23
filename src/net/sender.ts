/**
 * Sends a movement intent packet via WebSocket
 *
 * Packet layout (13 bytes):
 * [0]     : flags (bit 0 = accelerating)
 * [1-4]   : int32 clientTick
 * [5-8]   : float32 dirX
 * [9-12]  : float32 dirY
 */
export function sendMovementIntent(
    ws: WebSocket,
    clientTick: number,
    keys: { w: boolean, a: boolean, s: boolean, d: boolean }
) {
    if (ws.readyState !== WebSocket.OPEN) return;

    // 1. Calculate input vector (normalized)
    let dirX = 0;
    let dirY = 0;

    if (keys.a) dirX -= 1;
    if (keys.d) dirX += 1;
    if (keys.w) dirY += 1; // Assuming Y-up. If Y-down, use -= 1
    if (keys.s) dirY -= 1;

    // Normalize if moving diagonally
    // (Optional: server might handle this, but good practice client-side)
    const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
    if (magnitude > 0) {
        dirX /= magnitude;
        dirY /= magnitude;
    }

    // 2. Determine acceleration flag
    // (Accelerating if any movement key is pressed)
    const isAccelerating = magnitude > 0;
    const flags = isAccelerating ? 1 : 0; // Bit 0 set

    // 3. Construct Binary Packet
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);

    // Byte 0: Flags
    view.setUint8(0, flags);

    // Byte 1-4: Client Tick (Int32)
    // Using Big Endian (false) by default, standard for network
    view.setInt32(1, clientTick, false);

    // Byte 5-8: DirX (Float32)
    view.setFloat32(5, dirX, false);

    // Byte 9-12: DirY (Float32)
    view.setFloat32(9, dirY, false);

    // 4. Send
    ws.send(buffer);
}
