// src/interfaces/main_ui.ts
// Complete, standalone homepage UI for JSXGraph overlay

/**
 * Complete homepage UI overlay system
 * Matches JSXGraph viewport perfectly (zoom/pan/scale)
 */

export interface HomepageCallbacks {
    onRealmSelect?: (realm: string) => void
    onSettings?: () => void
    onStartGame?: () => void
}

export interface UIHandle {
    destroy: () => void
    hide: () => void
    show: () => void
}

/**
 * Initialize complete homepage overlay
 */
export function createHomepageOverlay(
    container: HTMLElement,  // .graph-wrapper
    callbacks?: HomepageCallbacks,
): UIHandle {
    // Create overlay structure
    const overlay = document.createElement('div')
    overlay.id = 'homepage-overlay'
    overlay.className = 'homepage-overlay'

    overlay.innerHTML = `
    <div class="ui-panel">
      <div class="ui-title">[ ACIDIUM ]</div>      
      <div class="ui-realm-grid">
        <button class="realm-btn fire">
          <div class="realm-icon">▲</div>
          <div class="realm-name">LOBBY</div>
        </button>
        <button class="realm-btn water">
          <div class="realm-icon">●</div>
          <div class="realm-name">SELECT REALM</div>
        </button>
        <button class="realm-btn earth">
          <div class="realm-icon">■</div>
          <div class="realm-name">MARKETPLACE</div>
        </button>
      </div>

      <button class="ui-settings-btn" data-action="settings">
        <span>⚙️</span> SETTINGS
      </button>
    </div>
  `

    // Inject CSS
    const style = document.createElement('style')
    style.textContent = `
    #homepage-overlay {
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

    #homepage-overlay.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .ui-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      padding: 3rem 2rem;
      max-width: 90vw;
      max-height: 90vh;
    }

    .ui-title {
      font-family: 'Courier New', monospace;
      font-size: clamp(3rem, 8vw, 7rem);
      font-weight: 900;
      letter-spacing: 0.3em;
      color: #ffffff;
      text-shadow: 0 0 0.5rem #ffffff20;
      margin: 0;
    }

    .ui-subtitle {
      font-family: 'Arial', sans-serif;
      font-size: clamp(1rem, 2.5vw, 1.5rem);
      font-weight: 400;
      color: #888888;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin: 0;
    }

    .ui-realm-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: clamp(1rem, 3vw, 2rem);
      max-width: 600px;
      width: 100%;
    }

    .realm-btn {
      aspect-ratio: 1;
      border: 2px solid #444444;
      background: #111111;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      font-size: clamp(0.8rem, 2vw, 1.1rem);
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      padding: 1rem;
      border-radius: 8px;
      pointer-events: auto;
    }

    .realm-btn:hover {
      border-color: #666666;
      background: #222222;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
    }

    .realm-btn.fire:hover { border-color: #e63946; }
    .realm-btn.water:hover { border-color: #457b9d; }
    .realm-btn.earth:hover { border-color: #2a9d8f; }
    .realm-btn.air:hover { border-color: #f4a261; }
    .realm-btn.shadow:hover { border-color: #264653; }
    .realm-btn.light:hover { border-color: #e9c46a; }

    .realm-icon {
      font-size: 2.5em;
      line-height: 1;
      margin: 0;
    }

    .realm-name {
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .ui-settings-btn {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      background: #111111;
      border: 2px solid #444444;
      color: #ffffff;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      pointer-events: auto;
    }

    .ui-settings-btn:hover {
      border-color: #666666;
      background: #222222;
      box-shadow: 0 4px 15px rgba(255, 255, 255, 0.1);
    }
  `
    document.head.appendChild(style)

    container.appendChild(overlay)

    // Event handlers
    overlay.querySelectorAll('.realm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const realm = (btn as HTMLElement).dataset.realm!
            callbacks?.onRealmSelect?.(realm)
            hideOverlay()
        })
    })

    const settingsBtn = overlay.querySelector('.ui-settings-btn')!
    settingsBtn.addEventListener('click', () => {
        callbacks?.onSettings?.()
    })

    function hideOverlay(): void {
        overlay.classList.add('hidden')
        setTimeout(() => overlay.remove(), 500)
        callbacks?.onStartGame?.()
    }

    return {
        destroy: () => overlay.remove(),
        hide: () => overlay.classList.add('hidden'),
        show: () => overlay.classList.remove('hidden'),
    }
}
