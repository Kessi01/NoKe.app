// Options Page Script
const API_BASE_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net/api';
const AUTH_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net';

// DOM Elements
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');
const tokenName = document.getElementById('token-name');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const versionSpan = document.getElementById('version');

// Settings
const autoSuggest = document.getElementById('auto-suggest');
const showNotification = document.getElementById('show-notification');
const autoLock = document.getElementById('auto-lock');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Version anzeigen
    versionSpan.textContent = chrome.runtime.getManifest().version;
    
    // Einstellungen laden
    await loadSettings();
    
    // Status prüfen
    await checkConnectionStatus();
});

// Verbindungsstatus prüfen
async function checkConnectionStatus() {
    try {
        const result = await chrome.storage.local.get(['apiToken']);
        
        if (result.apiToken) {
            // Token validieren
            const response = await fetch(`${API_BASE_URL}/validate-token`, {
                method: 'POST',
                headers: {
                    'x-api-key': result.apiToken,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showConnected(data.username, data.tokenName);
            } else {
                showDisconnected();
            }
        } else {
            showDisconnected();
        }
    } catch (error) {
        console.error('Fehler beim Prüfen des Status:', error);
        showDisconnected();
    }
}

function showConnected(email, token) {
    statusDiv.classList.remove('disconnected');
    statusDiv.classList.add('connected');
    statusDiv.innerHTML = '<span class="status-icon">🟢</span><span>Verbunden</span>';
    
    userInfo.style.display = 'block';
    userEmail.textContent = email || 'Unbekannt';
    tokenName.textContent = token || 'API Token';
    
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-block';
}

function showDisconnected() {
    statusDiv.classList.remove('connected');
    statusDiv.classList.add('disconnected');
    statusDiv.innerHTML = '<span class="status-icon">🔴</span><span>Nicht verbunden</span>';
    
    userInfo.style.display = 'none';
    
    connectBtn.style.display = 'inline-block';
    disconnectBtn.style.display = 'none';
}

// Verbinden
connectBtn.addEventListener('click', async () => {
    // Öffne Popup in neuem Tab
    const authState = crypto.randomUUID();
    await chrome.storage.local.set({ authState });
    
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set('plugin_auth', 'true');
    authUrl.searchParams.set('plugin_name', 'NoKe Browser Extension');
    authUrl.searchParams.set('plugin_state', authState);
    
    window.open(authUrl.toString(), '_blank');
    
    // Info anzeigen
    alert('Bitte erstelle ein Token in der NoKe Web-App und kopiere es anschließend manuell ins Plugin-Popup.');
});

// Trennen
disconnectBtn.addEventListener('click', async () => {
    if (confirm('Möchtest du die Verbindung wirklich trennen?')) {
        await chrome.storage.local.remove(['apiToken']);
        showDisconnected();
    }
});

// Einstellungen laden
async function loadSettings() {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {
        autoSuggest: true,
        showNotification: true,
        autoLock: false
    };
    
    autoSuggest.checked = settings.autoSuggest;
    showNotification.checked = settings.showNotification;
    autoLock.checked = settings.autoLock;
}

// Einstellungen speichern
async function saveSettings() {
    const settings = {
        autoSuggest: autoSuggest.checked,
        showNotification: showNotification.checked,
        autoLock: autoLock.checked
    };
    
    await chrome.storage.local.set({ settings });
}

// Event Listeners für Einstellungen
autoSuggest.addEventListener('change', saveSettings);
showNotification.addEventListener('change', saveSettings);
autoLock.addEventListener('change', saveSettings);
