/**
 * Auth0 SPA JS SDK Integration
 * This file handles all authentication logic using the Auth0 SPA SDK via CDN
 */

// Auth0 client instance
let auth0Client = null;

// DOM elements cache
const domElements = {
    loading: null,
    error: null,
    errorDetails: null,
    app: null,
    loggedOutSection: null,
    loggedInSection: null,
    loginBtn: null,
    logoutBtn: null,
    profileContainer: null
};

/**
 * Initialize DOM element references
 */
function initDomElements() {
    domElements.loading = document.getElementById('auth0-loading');
    domElements.error = document.getElementById('auth0-error');
    domElements.errorDetails = document.getElementById('auth0-error-details');
    domElements.app = document.getElementById('auth0-app');
    domElements.loggedOutSection = document.getElementById('auth0-logged-out');
    domElements.loggedInSection = document.getElementById('auth0-logged-in');
    domElements.loginBtn = document.getElementById('auth0-login-btn');
    domElements.logoutBtn = document.getElementById('auth0-logout-btn');
    domElements.profileContainer = document.getElementById('auth0-profile');
}

/**
 * Initialize Auth0 client
 */
async function initAuth0() {
    try {
        initDomElements();

        // Validate configuration
        if (!window.AUTH0_CONFIG) {
            throw new Error('Auth0 configuration not found. Please check auth0-config.js is loaded before this script.');
        }

        const { domain, clientId } = window.AUTH0_CONFIG;

        if (!domain || domain === 'YOUR_AUTH0_DOMAIN.auth0.com') {
            throw new Error('Auth0 Domain not configured. Please update auth0-config.js with your Auth0 domain.');
        }

        if (!clientId || clientId === 'YOUR_AUTH0_CLIENT_ID') {
            throw new Error('Auth0 Client ID not configured. Please update auth0-config.js with your Auth0 Client ID.');
        }

        // Validate domain format
        if (!domain.includes('.auth0.com')) {
            console.warn('Auth0 domain format might be incorrect. Expected format: your-domain.auth0.com or your-domain.region.auth0.com');
        }

        // Create Auth0 client using the global auth0 object from CDN
        auth0Client = await window.auth0.createAuth0Client({
            domain: domain,
            clientId: clientId,
            authorizationParams: {
                redirect_uri: window.location.origin + window.location.pathname.replace(/[^\/]*$/, '')
            },
            cacheLocation: 'localstorage' // Persist session across page refreshes
        });

        // Check if user is returning from login redirect
        if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
            await handleRedirectCallback();
        }

        // Update UI based on authentication state
        await updateUI();

    } catch (err) {
        console.error('Auth0 initialization error:', err);
        showError(err.message);
    }
}

/**
 * Handle redirect callback after Auth0 login
 */
async function handleRedirectCallback() {
    try {
        await auth0Client.handleRedirectCallback();
        // Clean up the URL to remove query parameters
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
        console.error('Redirect callback error:', err);
        showError('Authentication failed: ' + err.message);
    }
}

/**
 * Update UI based on authentication state
 */
async function updateUI() {
    try {
        const isAuthenticated = await auth0Client.isAuthenticated();

        if (isAuthenticated) {
            showLoggedIn();
            await displayProfile();
            
            // Dispatch custom event for other parts of the app
            window.dispatchEvent(new CustomEvent('auth0:authenticated', {
                detail: { user: await auth0Client.getUser() }
            }));
        } else {
            showLoggedOut();
            
            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('auth0:unauthenticated'));
        }

        hideLoading();
    } catch (err) {
        console.error('UI update error:', err);
        showError(err.message);
    }
}

/**
 * Display user profile information
 */
async function displayProfile() {
    try {
        const user = await auth0Client.getUser();
        
        // Placeholder image for users without profile picture
        const placeholderImage = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110' viewBox='0 0 110 110'%3E%3Ccircle cx='55' cy='55' r='55' fill='%23C49C48'/%3E%3Cpath d='M55 50c8.28 0 15-6.72 15-15s-6.72-15-15-15-15 6.72-15 15 6.72 15 15 15zm0 7.5c-10 0-30 5.02-30 15v3.75c0 2.07 1.68 3.75 3.75 3.75h52.5c2.07 0 3.75-1.68 3.75-3.75V72.5c0-9.98-20-15-30-15z' fill='%23000'/%3E%3C/svg%3E`;

        if (domElements.profileContainer) {
            domElements.profileContainer.innerHTML = `
                <div class="auth0-profile-content">
                    <img 
                        src="${user.picture || placeholderImage}" 
                        alt="${user.name || 'User'}" 
                        class="auth0-profile-picture"
                        onerror="this.src='${placeholderImage}'"
                    />
                    <div class="auth0-profile-info">
                        <div class="auth0-profile-name">${user.name || 'User'}</div>
                        <div class="auth0-profile-email">${user.email || 'No email provided'}</div>
                    </div>
                </div>
            `;
        }

        // Store user in window for other parts of the app
        window.auth0User = user;

    } catch (err) {
        console.error('Error displaying profile:', err);
    }
}

/**
 * Login with redirect
 */
async function login() {
    try {
        await auth0Client.loginWithRedirect();
    } catch (err) {
        console.error('Login error:', err);
        showError('Login failed: ' + err.message);
    }
}

/**
 * Login with popup (alternative method)
 */
async function loginWithPopup() {
    try {
        await auth0Client.loginWithPopup();
        await updateUI();
    } catch (err) {
        if (err.error !== 'popup_closed_by_user') {
            console.error('Popup login error:', err);
            showError('Login failed: ' + err.message);
        }
    }
}

/**
 * Logout user
 */
async function logout() {
    try {
        await auth0Client.logout({
            logoutParams: {
                returnTo: window.location.origin + window.location.pathname.replace(/[^\/]*$/, '')
            }
        });
    } catch (err) {
        console.error('Logout error:', err);
        showError('Logout failed: ' + err.message);
    }
}

/**
 * Get access token for API calls
 */
async function getAccessToken(audience, scope) {
    try {
        const token = await auth0Client.getTokenSilently({
            authorizationParams: {
                audience: audience,
                scope: scope || 'openid profile email'
            }
        });
        return token;
    } catch (err) {
        console.error('Error getting access token:', err);
        throw err;
    }
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
    if (!auth0Client) return false;
    return await auth0Client.isAuthenticated();
}

/**
 * Get current user
 */
async function getUser() {
    if (!auth0Client) return null;
    return await auth0Client.getUser();
}

// UI State Management Functions
function showLoading() {
    if (domElements.loading) domElements.loading.style.display = 'flex';
    if (domElements.error) domElements.error.style.display = 'none';
    if (domElements.app) domElements.app.style.display = 'none';
}

function hideLoading() {
    if (domElements.loading) domElements.loading.style.display = 'none';
    if (domElements.app) domElements.app.style.display = 'flex';
}

function showError(message) {
    if (domElements.loading) domElements.loading.style.display = 'none';
    if (domElements.app) domElements.app.style.display = 'none';
    if (domElements.error) {
        domElements.error.style.display = 'flex';
        if (domElements.errorDetails) {
            domElements.errorDetails.textContent = message;
        }
    }
    console.error('Auth0 Error:', message);
}

function showLoggedIn() {
    if (domElements.loggedOutSection) domElements.loggedOutSection.style.display = 'none';
    if (domElements.loggedInSection) domElements.loggedInSection.style.display = 'flex';
}

function showLoggedOut() {
    if (domElements.loggedInSection) domElements.loggedInSection.style.display = 'none';
    if (domElements.loggedOutSection) domElements.loggedOutSection.style.display = 'flex';
}

// Set up event listeners when DOM is ready
function setupEventListeners() {
    if (domElements.loginBtn) {
        domElements.loginBtn.addEventListener('click', login);
    }
    if (domElements.logoutBtn) {
        domElements.logoutBtn.addEventListener('click', logout);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initDomElements();
    setupEventListeners();
    initAuth0();
});

// Export functions for external use
window.Auth0App = {
    login,
    loginWithPopup,
    logout,
    isAuthenticated,
    getUser,
    getAccessToken,
    getClient: () => auth0Client
};
