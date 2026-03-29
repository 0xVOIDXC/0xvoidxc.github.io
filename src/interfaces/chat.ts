// chat.ts
// Chat window toggle for Acidium game client
// Fills horizontally, 10% vertical space in graph-wrapper

import {pauseInput, resumeInput} from "../control/keyboard.ts";
import {gameClient} from "../main.ts";

let chatWindow: HTMLElement | null = null;
let chatVisible = false;
let chatInput: HTMLInputElement | null = null;
let chatMessages: string[] = [];

// CSS styles for chat window
const chatStyles = `
.chat-window {
    position: absolute;
    bottom: 20px;
    left: 20px;
    right: 20px;
    height: 10vh;
    min-height: 60px;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    border: 2px solid #444;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: #00ff88;
    z-index: 1000;
    transition: all 0.3s ease;
    pointer-events: auto;
}
.chat-messages {
    flex: 1;
    padding: 12px;
    overflow-y: auto;
    line-height: 1.4;
    max-height: calc(10vh - 50px);
}
.chat-input-container {
    padding: 8px 12px;
    border-top: 1px solid #333;
    display: flex;
    gap: 8px;
}
.chat-input {
    flex: 1;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid #555;
    border-radius: 6px;
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 14px;
}
.chat-input:focus {
    outline: none;
    border-color: #00ff88;
    box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
}
.chat-send {
    padding: 8px 16px;
    background: #00ff88;
    color: #000;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    font-family: 'Courier New', monospace;
}
.chat-send:hover {
    background: #00dd77;
}
.chat-send:disabled {
    background: #444;
    cursor: not-allowed;
}
`;

// Inject CSS once
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    const style = document.createElement('style');
    style.textContent = chatStyles;
    document.head.appendChild(style);
    stylesInjected = true;
}

/**
 * Toggle chat window visibility
 * @param open - true to open, false to close, undefined/null to toggle
 * @returns Current visibility state (true=visible, false=hidden)
 */
export function toggleChat(open?: boolean): boolean {
    const container = document.querySelector('.graph-wrapper') as HTMLElement;
    if (!container) return chatVisible;

    injectStyles();

    // Handle toggle logic
    const shouldOpen = open === undefined ? !chatVisible : !!open;
    const shouldClose = !shouldOpen;

    if (shouldOpen && !chatVisible) {
        // Create chat window
        chatWindow = document.createElement('div');
        chatWindow.className = 'chat-window';
        chatWindow.innerHTML = `
            <div class="chat-messages"></div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" placeholder="Type message... (Enter to send, Esc to close)">
                <button class="chat-send" disabled>Send</button>
            </div>
        `;

        container.appendChild(chatWindow);

        // Get elements
        chatInput = chatWindow!.querySelector('.chat-input')!;
        const sendBtn = chatWindow!.querySelector('.chat-send')!;
        const messagesDiv = chatWindow!.querySelector('.chat-messages')!;

        // Event listeners
        chatInput!.focus();
        chatInput!.addEventListener('input', (e) => {
            sendBtn.disabled = (e.target as HTMLInputElement).value.trim().length === 0;
        });

        chatInput!.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            } else if (e.key === 'Escape') {
                toggleChat(false);
            }
        });

        sendBtn.addEventListener('click', sendChatMessage);
        chatVisible = true;

    } else if (shouldClose && chatVisible) {
        // Close chat
        if (chatWindow) {
            chatWindow.remove();
            chatWindow = null;
        }
        chatInput = null;
        chatVisible = false;
    }

    if(chatVisible) {
        pauseInput();
    } else resumeInput();

    return chatVisible;
}

/**
 * Check if chat is currently visible
 */
export function isChatVisible(): boolean {
    return chatVisible;
}

/**
 * Force open chat window
 */
export function openChat(): boolean {
    return toggleChat(true);
}

/**
 * Force close chat window
 */
export function closeChat(): boolean {
    return toggleChat(false);
}

export function addChatMessage(author: string, message: string): void {
    if (!chatWindow) return;

    const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const msg = document.createElement('div');
    msg.style.marginBottom = '4px';
    // Changed this line to use parseMinecraftColors instead of just escapeHtml
    msg.innerHTML = `<strong>[${timestamp}] ${author}:</strong> ${parseMinecraftColors(message)}`;
    const messagesDiv = chatWindow!.querySelector('.chat-messages')!;

    messagesDiv.appendChild(msg);
    console.debug(`Chat RCV: ${JSON.stringify(message)}`);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Keep only last 50 messages
    const messages = messagesDiv.children;
    while (messages.length > 50) {
        messages[0].remove();
    }
}

export function sendChatMessage(): void {
    if (!chatInput || !chatInput.value.trim()) return;

    let message = chatInput.value.trim();
    addChatMessage('You', message);

    console.log('Chat sent:', message);
    if(message.startsWith('/')){
        message = message.substring(1,message.length);
        gameClient.sendCommand(message);
    }
    else gameClient.sendChat();

    chatInput.value = '';
    chatInput.focus();
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Parses Minecraft formatting codes (§ or &) into HTML spans safely
 * @param text The raw message containing format codes
 * @returns HTML string with colored spans
 */
export function parseMinecraftColors(text: string): string {
    const escaped = escapeHtml(text);

    // Standard Minecraft Color Hex Codes
    const colorMap: Record<string, string> = {
        '0': 'color: #000000;', '1': 'color: #0000AA;', '2': 'color: #00AA00;', '3': 'color: #00AAAA;',
        '4': 'color: #AA0000;', '5': 'color: #AA00AA;', '6': 'color: #FFAA00;', '7': 'color: #AAAAAA;',
        '8': 'color: #555555;', '9': 'color: #5555FF;', 'a': 'color: #55FF55;', 'b': 'color: #55FFFF;',
        'c': 'color: #FF5555;', 'd': 'color: #FF55FF;', 'e': 'color: #FFFF55;', 'f': 'color: #FFFFFF;'
    };

    // Standard Minecraft Formatting Codes
    const formatMap: Record<string, string> = {
        'l': 'font-weight: bold;',
        'm': 'text-decoration: line-through;',
        'n': 'text-decoration: underline;',
        'o': 'font-style: italic;'
    };

    let html = '';
    let spanCount = 0;

    // Matches section sign (§) or ampersand (&) followed by a valid character code
    const regex = /[§&]([0-9a-fk-or])/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(escaped)) !== null) {
        html += escaped.substring(lastIndex, match.index);
        lastIndex = regex.lastIndex;

        const code = match[1].toLowerCase();

        if (colorMap[code]) {
            // New color resets any previous formatting in Minecraft logic
            html += '</span>'.repeat(spanCount);
            spanCount = 1;
            html += `<span style="${colorMap[code]}">`;
        } else if (formatMap[code]) {
            // Stack formatting
            spanCount++;
            html += `<span style="${formatMap[code]}">`;
        } else if (code === 'r') {
            // Reset clears everything
            html += '</span>'.repeat(spanCount);
            spanCount = 0;
        }
    }

    html += escaped.substring(lastIndex);
    html += '</span>'.repeat(spanCount); // Close any remaining spans

    return html;
}

// Cleanup function
export function destroyChat(): void {
    if (chatWindow) {
        chatWindow.remove();
        chatWindow = null;
    }
    chatVisible = false;
    chatInput = null;
}
