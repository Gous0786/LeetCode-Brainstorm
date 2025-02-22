// content.js

console.log('Content script loaded'); // Log to confirm the content script is running

// Function to initialize the drawer UI
function initializeDrawer() {
    console.log('Initializing drawer...'); // Log when initializing
    const drawer = document.createElement('div');
    drawer.id = 'leetcode-brainstorm-drawer';
    drawer.innerHTML = `
      <div class="drawer-header">
        <button id="toggle-drawer">📝</button>
        <div class="auth-section">
          <button id="login-button" style="display: none;">Login with Google</button>
          <span id="user-info" style="display: none;"></span>
        </div>
      </div>
      <div class="drawer-content">
        <iframe id="canvas-frame" src="${chrome.runtime.getURL('popup.html')}" style="display: none;"></iframe>
      </div>
    `;
    document.body.appendChild(drawer);
    
    console.log('Drawer initialized:', drawer); // Log the drawer element

    // Initialize event listeners
    document.getElementById('toggle-drawer').addEventListener('click', toggleDrawer);
    document.getElementById('login-button').addEventListener('click', handleLogin);
    
    checkAuthStatus(); // Call to check authentication status
}

// Function to check the authentication status
async function checkAuthStatus() {
    const loginButton = document.getElementById('login-button');
    const userInfo = document.getElementById('user-info');

    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, resolve);
        });

        console.log('Auth response:', response); // Log the response for debugging

        if (response && response.token) { // Check if response is defined
            loginButton.style.display = 'none'; // Hide login button
            userInfo.style.display = 'block'; // Show user info
            userInfo.textContent = 'Connected to Google Drive';
            loadSavedDraft(); // Load any saved drafts
        } else {
            loginButton.style.display = 'block'; // Show login button
            userInfo.style.display = 'none'; // Hide user info
            console.error('No token received'); // Log an error if no token is received
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        loginButton.style.display = 'block'; // Show login button on error
        userInfo.style.display = 'none'; // Hide user info
    }
}

// Function to handle login button click
async function handleLogin() {
    try {
        console.log('Initiating auth...');
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "INITIATE_AUTH" }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });

        console.log('Auth response:', response);
        
        if (response && response.success) {
            await checkAuthStatus(); // Check auth status after successful login
            showNotification('Successfully signed in!');
        } else {
            throw new Error(response?.error || 'Sign in failed');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showNotification('Failed to sign in: ' + error.message);
    }
}

// Function to toggle the drawer visibility
function toggleDrawer() {
    const drawer = document.getElementById('leetcode-brainstorm-drawer');
    if (drawer.style.display === 'none' || drawer.style.display === '') {
        drawer.style.display = 'block';
    } else {
        drawer.style.display = 'none';
    }
}

// Function to show notifications
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 2000);
}

// Function to get the problem ID from the URL
function getProblemIdFromUrl() {
    const url = window.location.href; // Get the current URL
    console.log('Current URL:', url); // Log the current URL for debugging
    const match = url.match(/leetcode\.com\/problems\/([^/?]+)/); // Regex to match the problem ID
    if (match) {
        return match[1]; // Return the problem ID
    }
    return null; // Return null if not found
}

// Send the problem ID back to the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request); // Log the received message
    if (request.type === 'GET_PROBLEM_ID') {
        const problemId = getProblemIdFromUrl();
        console.log('Extracted Problem ID:', problemId); // Log the extracted problem ID
        sendResponse({ problemId });
    }
});

// Initialize the drawer when the script loads
initializeDrawer();