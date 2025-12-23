// Empfange Autofill-Nachrichten vom Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autofill') {
        autofillForm(message.username, message.password);
        sendResponse({ success: true });
    }
    return true;
});

// Formular automatisch ausfüllen
function autofillForm(username, password) {
    // Benutzername-Felder finden
    const usernameSelectors = [
        'input[type="email"]',
        'input[type="text"][name*="user"]',
        'input[type="text"][name*="email"]',
        'input[type="text"][name*="login"]',
        'input[type="text"][name*="name"]',
        'input[type="text"][id*="user"]',
        'input[type="text"][id*="email"]',
        'input[type="text"][id*="login"]',
        'input[type="text"][id*="name"]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        'input[name="identifier"]',
        'input[name="login"]',
        'input[name="email"]',
        'input[name="username"]'
    ];

    // Passwort-Felder finden
    const passwordSelectors = [
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="new-password"]'
    ];

    let usernameField = null;
    let passwordField = null;

    // Benutzername-Feld finden
    for (const selector of usernameSelectors) {
        const fields = document.querySelectorAll(selector);
        for (const field of fields) {
            if (isVisible(field) && !field.disabled && !field.readOnly) {
                usernameField = field;
                break;
            }
        }
        if (usernameField) break;
    }

    // Passwort-Feld finden
    for (const selector of passwordSelectors) {
        const fields = document.querySelectorAll(selector);
        for (const field of fields) {
            if (isVisible(field) && !field.disabled && !field.readOnly) {
                passwordField = field;
                break;
            }
        }
        if (passwordField) break;
    }

    // Benutzername ausfüllen
    if (usernameField) {
        fillField(usernameField, username);
    }

    // Passwort ausfüllen
    if (passwordField) {
        fillField(passwordField, password);
    }

    // Visuelles Feedback geben
    if (usernameField || passwordField) {
        showAutofillNotification();
    }
}

// Feld ausfüllen und Events auslösen
function fillField(field, value) {
    // Focus setzen
    field.focus();
    
    // Wert setzen
    field.value = value;
    
    // Native Input Event für React, Vue, Angular etc.
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(field, value);
    
    // Events auslösen, damit die Website die Änderung erkennt
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    
    // Blur zum Abschluss
    field.blur();
}

// Prüfen, ob Element sichtbar ist
function isVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// Visuelle Benachrichtigung bei erfolgreichem Autofill
function showAutofillNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #C49C48, #d4a84e);
        color: #000;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = '🔐 NoKe: Anmeldedaten eingefügt';
    
    // Animation hinzufügen
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // Nach 3 Sekunden ausblenden
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
