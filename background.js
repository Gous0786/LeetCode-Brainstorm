// Constants for OAuth 2.0
const CLIENT_ID = '42027544480-oftio244laqrpfjs54di6e6th4sjn1b8.apps.googleusercontent.com';
const REDIRECT_URI = chrome.identity.getRedirectURL();
console.log('Redirect URI:', REDIRECT_URI);
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata'
];

// Store the auth token
let authToken = null;

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Listen for tab updates to detect LeetCode problems
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.includes('leetcode.com/problems/')) {
    // Open the popup
    chrome.windows.create({
      url: 'popup.html', // The URL of your popup
      type: 'popup',
      width: 800,
      height: 600
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'INITIATE_AUTH':
      initiateAuth().then(token => {
        sendResponse({ success: true, token: token });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response

    case 'GET_AUTH_TOKEN':
      sendResponse({ token: authToken });
      return true;

    case 'SIGN_OUT':
      signOut().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Sign out failed:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
  }
});

// Initiate OAuth flow
async function initiateAuth() {
  try {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('prompt', 'consent');
    
    // Launch OAuth flow
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
    
    // Extract token from response URL
    const urlParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
    const token = urlParams.get('access_token');
    const expiresIn = parseInt(urlParams.get('expires_in')) || 3600; // Default to 1 hour if not provided
    console.log(token);
    
    if (token) {
      authToken = token;
      storeToken(token, expiresIn);
      return token;
    } else {
      throw new Error('No access token found in the response');
    }
  } catch (error) {
    console.error('Auth flow failed:', error);
    throw error;
  }
}

// Verify if token is still valid
async function verifyToken(token) {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.exp > Math.floor(Date.now() / 1000);
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
}

// Sign out user
async function signOut() {
    try {
        if (authToken) {
            // Revoke the token
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${authToken}`);
            // Clear stored token and expiration
            await chrome.storage.local.remove(['oauthToken', 'tokenExpiration']);
            authToken = null;
            return { success: true };
        }
        return { success: true }; // Return success even if no token (already signed out)
    } catch (error) {
        console.error('Token revocation failed:', error);
        throw error;
    }
}

// Add token expiration time to storage
function storeToken(token, expiresIn) {
    const expirationTime = Date.now() + (expiresIn * 1000); // Convert seconds to milliseconds
    chrome.storage.local.set({ 
        oauthToken: token,
        tokenExpiration: expirationTime
    }, () => {
        console.log('Token stored successfully with expiration');
    });
}

// Update getTokenFromStorage to check expiration
async function getTokenFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['oauthToken', 'tokenExpiration'], async (result) => {
            if (!result.oauthToken || !result.tokenExpiration) {
                reject('No token found');
                return;
            }

            // Check if token is expired or about to expire (within 5 minutes)
            const isExpired = Date.now() >= (result.tokenExpiration - 300000); // 5 minutes buffer
            
            if (isExpired) {
                try {
                    // Clear expired token
                    chrome.storage.local.remove(['oauthToken', 'tokenExpiration']);
                    // Get new token
                    const newToken = await initiateAuth();
                    resolve(newToken);
                } catch (error) {
                    reject('Failed to refresh token: ' + error.message);
                }
            } else {
                resolve(result.oauthToken);
            }
        });
    });
}

async function authenticateUser() {
    try {
        const token = await getOAuthToken(); // Implement this function to get the OAuth token
        storeToken(token); // Store the token after successful authentication
        return token;
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

