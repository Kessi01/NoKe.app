// NoKe Background Service Worker
// Handles plugin lifecycle, messaging, and background tasks

const API_BASE_URL = 'https://blue-glacier-05eee0b03.3.azurestaticapps.net/api';

let authCheckInterval = null;

// Installation Event
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('NoKe Browser-Plugin installiert', details.reason);
    
    if (details.reason === 'install') {
        // First installation - register plugin
        console.log('Willkommen bei NoKe! Plugin wird registriert...');
        await registerPlugin();
    } else if (details.reason === 'update') {
        // Update
        console.log('NoKe wurde aktualisiert auf Version', chrome.runtime.getManifest().version);
    }
});

/**
 * Register plugin with the NoKe server
 * Creates unique plugin ID and secret
 */
async function registerPlugin() {
    try {
        const result = await chrome.storage.local.get(['pluginId', 'pluginSecret']);
        
        // Already registered
        if (result.pluginId && result.pluginSecret) {
            console.log('Plugin bereits registriert:', result.pluginId);
            return;
        }

        // Register new plugin
        const response = await fetch(`${API_BASE_URL}/plugin-auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            await chrome.storage.local.set({
                pluginId: data.pluginId,
                pluginSecret: data.pluginSecret,
                authorized: false
            });
            console.log('Plugin registriert:', data.pluginId);
        } else {
            console.error('Plugin-Registrierung fehlgeschlagen:', data.message);
        }
    } catch (error) {
        console.error('Fehler bei Plugin-Registrierung:', error);
    }
}

/**
 * Start background auth check polling
 * Called by popup when user initiates authorization
 */
function startAuthPolling() {
    if (authCheckInterval) {
        console.log('[NoKe SW] Auth polling already running');
        return;
    }
    
    console.log('[NoKe SW] Starting background auth polling...');
    
    authCheckInterval = setInterval(async () => {
        console.log('[NoKe SW] Checking authorization...');
        
        try {
            const creds = await chrome.storage.local.get(['pluginId', 'pluginSecret', 'authorized']);
            
            if (!creds.pluginId || !creds.pluginSecret) {
                console.log('[NoKe SW] No credentials, stopping poll');
                stopAuthPolling();
                return;
            }
            
            // Already authorized?
            if (creds.authorized) {
                console.log('[NoKe SW] Already authorized, stopping poll');
                stopAuthPolling();
                return;
            }
            
            const response = await fetch(`${API_BASE_URL}/plugin-auth/check-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pluginId: creds.pluginId,
                    pluginSecret: creds.pluginSecret
                })
            });
            
            const data = await response.json();
            console.log('[NoKe SW] check-auth response:', data);
            
            if (data.success && data.authorized && data.rollingKey) {
                console.log('[NoKe SW] Authorization successful!');
                
                // Save credentials
                await chrome.storage.local.set({
                    authorized: true,
                    username: data.username,
                    rollingKey: data.rollingKey
                });
                
                stopAuthPolling();
                
                // Notify any open popups
                chrome.runtime.sendMessage({
                    action: 'authComplete',
                    username: data.username
                }).catch(() => {
                    // Popup might not be open, that's ok
                });
            }
        } catch (error) {
            console.error('[NoKe SW] Auth check error:', error);
        }
    }, 2000);
    
    // Auto-stop after 5 minutes
    setTimeout(() => {
        if (authCheckInterval) {
            console.log('[NoKe SW] Auth polling timeout');
            stopAuthPolling();
        }
    }, 5 * 60 * 1000);
}

function stopAuthPolling() {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
        console.log('[NoKe SW] Auth polling stopped');
    }
}

// Tab-Update Listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        try {
            const result = await chrome.storage.local.get(['rollingKey', 'authorized']);
            if (result.authorized && result.rollingKey) {
                // Could show badge with matching entries count
            }
        } catch (error) {
            // Tab error, ignore
        }
    }
});

// Context Menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus?.create({
        id: 'noke-autofill',
        title: '🔐 Mit NoKe ausfüllen',
        contexts: ['editable']
    });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'noke-autofill') {
        chrome.action.openPopup();
    }
});

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[NoKe SW] Message received:', message.action);
    
    if (message.action === 'startAuthPolling') {
        startAuthPolling();
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'stopAuthPolling') {
        stopAuthPolling();
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'getCredentials') {
        chrome.storage.local.get(['pluginId', 'rollingKey', 'authorized', 'username'], (result) => {
            sendResponse(result);
        });
        return true;
    }
    
    if (message.action === 'updateRollingKey') {
        chrome.storage.local.set({ rollingKey: message.newKey }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (message.action === 'checkUrl') {
        sendResponse({ success: true });
        return true;
    }
});

console.log('NoKe Service Worker gestartet');
