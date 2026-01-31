// src/interfaces/main_ui.ts
// Complete, standalone homepage UI for JSXGraph overlay
/**
 * Complete homepage UI overlay system
 * Matches JSXGraph viewport perfectly (zoom/pan/scale)
 * Now includes a "Connecting" screen that appears after realm selection
 * and only disappears when the caller signals connection success via handle.connected()
 */
export interface HomepageCallbacks {
    onRealmSelect?: (realm: string) => void
    onSettings?: () => void
    onStartGame?: () => void
}

export interface UIHandle {
    destroy: () => void
    hide: () => void  // Now switches to "Connecting..." screen and triggers onStartGame
    show: () => void  // Shows the homepage again (useful for reconnect/failure)
    connected: () => void  // Call this when WebSocket is fully open to fade out the overlay
}

/**
 * Initialize complete homepage overlay
 */
export function createHomepageOverlay(
    container: HTMLElement, // .graph-wrapper
    callbacks?: HomepageCallbacks,
): UIHandle {
    // Create overlay structure
    const overlay = document.createElement('div')
    overlay.id = 'ui-overlay'  // Changed to match main file's expected ID
    overlay.className = 'homepage-overlay'
    overlay.innerHTML = `
    <div class="panels-container">
      <div class="panel homepage-panel">
        <div class="ui-panel">
          <div class="ui-title">[ ACIDIUM ]</div>
          <div class="ui-realm-grid">
            <button class="realm-btn fire" data-realm="lobby">
              <div class="realm-icon">▲</div>
              <div class="realm-name">LOBBY</div>
            </button>
            <button class="realm-btn water" data-realm="realm-select">
              <div class="realm-icon">●</div>
              <div class="realm-name">SELECT REALM</div>
            </button>
            <button class="realm-btn earth" data-realm="marketplace">
              <div class="realm-icon">■</div>
              <div class="realm-name">MARKETPLACE</div>
            </button>
          </div>
          <button class="ui-settings-btn" data-action="settings">
            <span>⚙️</span> SETTINGS
          </button>
        </div>
      </div>
      <div class="panel connecting-panel hidden">
        <div class="connecting-content">
          <div class="ui-title">[ ACIDIUM ]</div>
          <div class="ui-subtitle">Connecting to server...</div>
          <div class="connecting-spinner"></div>
        </div>
      </div>
    </div>
  `

    // Inject CSS
    const style = document.createElement('style')
    style.textContent = `
    #ui-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, #0a0a0a 0%, #000000 70%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #ui-overlay.hidden {
      opacity: 0;
      pointer-events: none;
    }
    .panels-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2rem;
      width: 100%;
      height: 100%;
    }
    .panel.hidden {
      display: none;
    }
    .connecting-content {
      text-align: center;
    }
    .connecting-spinner {
      width: 60px;
      height: 60px;
      border: 6px solid #333333;
      border-top: 6px solid #ffffff;
      border-radius: 50%;
      animation: spin 1.2s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .ui-panel { /* existing styles unchanged */ 
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      padding: 3rem 2rem;
      max-width: 90vw;
      max-height: 90vh;
    }
    /* ... all other existing styles remain exactly the same ... */
    .ui-title { font-family: 'Courier New', monospace; font-size: clamp(3rem, 8vw, 7rem); font-weight: 900; letter-spacing: 0.3em; color: #ffffff; text-shadow: 0 0 0.5rem #ffffff20; margin: 0; }
    .ui-subtitle { font-family: 'Arial', sans-serif; font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 400; color: #888888; letter-spacing: 0.2em; text-transform: uppercase; margin: 0; }
    .ui-realm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(1rem, 3vw, 2rem); max-width: 600px; width: 100%; }
    .realm-btn { aspect-ratio: 1; border: 2px solid #444444; background: #111111; color: #ffffff; font-family: 'Courier New', monospace; font-size: clamp(0.8rem, 2vw, 1.1rem); font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; padding: 1rem; border-radius: 8px; pointer-events: auto; }
    .realm-btn:hover { border-color: #666666; background: #222222; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1); }
    .realm-btn.fire:hover { border-color: #e63946; }
    .realm-btn.water:hover { border-color: #457b9d; }
    .realm-btn.earth:hover { border-color: #2a9d8f; }
    .realm-icon { font-size: 2.5em; line-height: 1; margin: 0; }
    .realm-name { letter-spacing: 0.1em; text-transform: uppercase; }
    .ui-settings-btn { position: absolute; bottom: 2rem; right: 2rem; background: #111111; border: 2px solid #444444; color: #ffffff; padding: 0.8rem 1.5rem; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s ease; pointer-events: auto; }
    .ui-settings-btn:hover { border-color: #666666; background: #222222; box-shadow: 0 4px 15px rgba(255, 255, 255, 0.1); }
  `
    document.head.appendChild(style)
    container.appendChild(overlay)

    // Panel references
    const homepagePanel = overlay.querySelector('.homepage-panel') as HTMLElement
    const connectingPanel = overlay.querySelector('.connecting-panel') as HTMLElement

    // Switch to connecting screen
    function switchToConnecting() {
        homepagePanel.classList.add('hidden')
        connectingPanel.classList.remove('hidden')
    }

    // Fully hide and remove overlay (fade out)
    function completeConnection() {
        overlay.classList.add('hidden')
        setTimeout(() => overlay.remove(), 500)
    }

    // Event handlers
    overlay.querySelectorAll('.realm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const realm = (btn as HTMLElement).dataset.realm ?? ''
            callbacks?.onRealmSelect?.(realm)
            switchToConnecting()
            callbacks?.onStartGame?.()
        })
    })

    const settingsBtn = overlay.querySelector('.ui-settings-btn')!
    settingsBtn.addEventListener('click', () => {
        callbacks?.onSettings?.()
    })

    return {
        destroy: () => overlay.remove(),
        hide: () => {
            switchToConnecting()
            callbacks?.onStartGame?.()  // Ensures onStartGame is called if hide() is used directly
        },
        show: () => {
            connectingPanel.classList.add('hidden')
            homepagePanel.classList.remove('hidden')
            overlay.classList.remove('hidden')
        },
        connected: completeConnection  // NEW: Call this when ws.onopen fires
    }
}