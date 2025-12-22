// Auth0 Configuration - UPDATE THESE VALUES
// Get these from your Auth0 Dashboard: https://manage.auth0.com/dashboard/
const AUTH0_CONFIG = {
    domain: 'noke.eu.auth0.com', // e.g., 'dev-xxxxx.us.auth0.com'
    clientId: 'JggU0AdC5XSjFdcDBx87Sv0MjOlsEqsJ'       // e.g., 'abc123def456...'
};

// Export for use in auth0-app.js
window.AUTH0_CONFIG = AUTH0_CONFIG;

/*
📋 MANUAL SETUP INSTRUCTIONS:

1. Go to https://manage.auth0.com/dashboard/
2. Click 'Create Application' → Choose 'Single Page Application'
3. Go to Application Settings and copy:
   - Domain → paste above as AUTH0_CONFIG.domain
   - Client ID → paste above as AUTH0_CONFIG.clientId

4. Configure Application URLs (scroll down in Settings):
   - Allowed Callback URLs: http://localhost:5500, http://127.0.0.1:5500
   - Allowed Logout URLs: http://localhost:5500, http://127.0.0.1:5500
   - Allowed Web Origins: http://localhost:5500, http://127.0.0.1:5500

   ⚠️ IMPORTANT: Add your production URL when deploying!
   
5. Save Changes

⚠️ CRITICAL: Allowed Web Origins is required for silent authentication.
   Without it, users will be logged out when they refresh the page.

📝 NOTE: If using a different local server port, update the URLs accordingly.
   Common alternatives: http://localhost:3000, http://localhost:8080
*/
