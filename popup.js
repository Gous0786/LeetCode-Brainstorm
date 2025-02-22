// Global array to hold all shapes drawn on the canvas
let shapes = []; // This will hold all the shapes drawn on the canvas

let driveService; // Declare driveService variable

document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clear');
    const colorPicker = document.getElementById('colorPicker');
    const brushSize = document.getElementById('brushSize');
    const saveBtn = document.getElementById('save');
    const loadBtn = document.getElementById('load');
    const eraserBtn = document.getElementById('eraser');
    const canvasContainer = document.querySelector('.canvas-container');
    const googleSignInBtn = document.getElementById('google-signin');
    const userProfile = document.getElementById('user-profile');
    const userEmail = document.getElementById('user-email');
    const signOutBtn = document.getElementById('sign-out');

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let currentShape = 'free'; // always freehand
    let isEraser = false;
    let startX = 0;
    let startY = 0;
    let snapshot = null;

    let isResizing = false;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    let canvasScale = {
        width: 500,  // Initial canvas width
        height: 400  // Initial canvas height
    };

    let smoothedPoints = [];
    let pathPoints = [];
    const SMOOTHING_FACTOR = 0.3; // increased smoothing effect

    // Function to initialize the Google Drive service
    function initializeDriveService(token) {
        driveService = new GoogleDriveService(token); // Initialize driveService with the token
        console.log('Drive service initialized'); 
        loadDrawing();// Log initialization
    }
   


    // Check authentication and initialize driveService
    chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, response => {
        if (response && response.token) {
            console.log('Token retrieved:', response.token); // Log the token
            initializeDriveService(response.token); // Initialize driveService with the token
            console.log('Drive service initialized');
            userProfile.style.display = 'flex';
            userEmail.textContent = 'Connected to Google Drive';
            googleSignInBtn.style.display = 'none'; // Hide login button
        } else {
            console.error('Failed to initialize drive service: No token received');
            googleSignInBtn.style.display = 'flex'; // Show login button if no token
            userProfile.style.display = 'none'; // Hide user profile
        }
    });

    // Move checkAuthStatus function here
    async function checkAuthStatus() {
        console.log('Checking authentication status...');
        chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, (response) => {
            console.log('Auth response:', response);
            if (response && response.token) {
                googleSignInBtn.style.display = "none";
                userProfile.style.display = "flex";
                userEmail.textContent = "Connected to Google Drive";
            } else {
                googleSignInBtn.style.display = "flex";
                userProfile.style.display = "none";
            }
        });
    }

// Add click handlers for authentication
googleSignInBtn.addEventListener('click', async () => {
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
            await checkAuthStatus();
            showNotification('Successfully signed in!');
        } else {
            throw new Error(response?.error || 'Sign in failed');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showNotification('Failed to sign in: ' + error.message);
    }
});


signOutBtn.addEventListener('click', async () => {
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "SIGN_OUT" }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });

        if (response && response.success) {
            await checkAuthStatus();
            showNotification('Signed out successfully');
        } else {
            throw new Error(response?.error || 'Sign out failed');
        }
    } catch (error) {
        console.error('Sign out failed:', error);
        showNotification('Failed to sign out: ' + error.message);
    }
});
    // Initialize canvas size
    function resizeCanvas() {
        const rect = canvasContainer.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Enable anti-aliasing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Restore drawing settings
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = brushSize.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Redraw all shapes with the new scale
        redrawShapes();
    }

    // Handle window resize
    window.addEventListener('resize', debounce(() => {
        if (window.innerWidth !== lastWidth || window.innerHeight !== lastHeight) {
            resizeCanvas();
            lastWidth = window.innerWidth;
            lastHeight = window.innerHeight;
        }
    }, 100));

    // Debounce function to limit resize calls
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Custom resize handle functionality
    const resizeHandle = document.querySelector('.resize-handle');
    
    resizeHandle.addEventListener('mousedown', initResize);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);

    function initResize(e) {
        isResizing = true;
        e.preventDefault();
    }

    function resize(e) {
        if (!isResizing) return;

        const width = e.clientX + 10;
        const height = e.clientY + 10;

        // Set minimum and maximum sizes
        const newWidth = Math.max(400, Math.min(width, 1200));
        const newHeight = Math.max(500, Math.min(height, 800));

        document.body.style.width = newWidth + 'px';
        document.body.style.height = newHeight + 'px';

        resizeCanvas();
    }

    function stopResize() {
        isResizing = false;
    }

    // Update the calculateBounds function to handle both freehand and shape points
    function calculateBounds(points, isPercentage = false) {
        if (!Array.isArray(points)) return null;
        
        const xs = points.filter((_, i) => i % 2 === 0);
        const ys = points.filter((_, i) => i % 2 === 1);
        
        if (isPercentage) {
            return {
                x1: Math.min(...xs) - 2,
                y1: Math.min(...ys) - 2,
                x2: Math.max(...xs) + 2,
                y2: Math.max(...ys) + 2,
                isPercentage: true
            };
        }
        
        // For non-percentage coordinates
        return {
            x1: Math.min(...xs) - 10,
            y1: Math.min(...ys) - 10,
            x2: Math.max(...xs) + 10,
            y2: Math.max(...ys) + 10,
            isPercentage: false
        };
    }

    // Update isPointInBounds to handle both types of shapes
    function isPointInBounds(x, y, bounds) {
        if (!bounds) return false;
        
        let xValue = x;
        let yValue = y;
        
        // Convert coordinates to percentages if needed
        if (bounds.isPercentage) {
            xValue = (x / canvas.width) * 100;
            yValue = (y / canvas.height) * 100;
        }
        
        // Add a small tolerance for easier selection
        const tolerance = bounds.isPercentage ? 2 : 5;
        
        return xValue >= bounds.x1 - tolerance && 
               xValue <= bounds.x2 + tolerance && 
               yValue >= bounds.y1 - tolerance && 
               yValue <= bounds.y2 + tolerance;
    }

    // Update addShape to include proper bounds calculation
    function addShape(points, style) {
        const percentagePoints = points.map((point, index) => {
            return index % 2 === 0
                ? (point / canvas.width) * 100
                : (point / canvas.height) * 100;
        });
        
        const bounds = calculateBounds(percentagePoints, true);
        
        shapes.push({
            type: 'free',
            points: percentagePoints,
            style: { ...style },
            bounds: bounds
        });
        
        redrawShapes();
    }

    // Update isPointInBounds to handle both types of shapes
    function isPointInBounds(x, y, bounds) {
        if (!bounds) return false;
        
        // Convert point to percentages if the bounds are in percentages
        const xValue = bounds.isPercentage ? (x / canvas.width) * 100 : x;
        const yValue = bounds.isPercentage ? (y / canvas.height) * 100 : y;
        
        return xValue >= bounds.x1 && xValue <= bounds.x2 && 
               yValue >= bounds.y1 && yValue <= bounds.y2;
    }

    // Update redrawShapes to handle percentage-based coordinates
    function redrawShapes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        shapes.forEach(shape => {
            ctx.strokeStyle = shape.style.strokeStyle;
            ctx.lineWidth = shape.style.lineWidth;
            ctx.beginPath();
            
            if (shape.type === 'free') {
                const actualPoints = shape.points.map((point, index) => {
                    return index % 2 === 0
                        ? (point * canvas.width) / 100
                        : (point * canvas.height) / 100;
                });
                drawFreehandPath(actualPoints);
            } else {
                // Convert percentage coordinates back to actual canvas coordinates
                const startX = (shape.startX * canvas.width) / 100;
                const startY = (shape.startY * canvas.height) / 100;
                const endX = (shape.endX * canvas.width) / 100;
                const endY = (shape.endY * canvas.height) / 100;
                
                // Draw the shape using actual coordinates
                drawShapeByType(shape.type, startX, startY, endX, endY);
            }
            ctx.stroke();
        });
    }

    // Add helper function to draw shapes
    function drawShapeByType(type, startX, startY, endX, endY) {
        ctx.beginPath(); // Begin a new path for each shape
        switch (type) {
            case 'circle': {
                const dx = endX - startX;
                const dy = endY - startY;
                const radius = Math.sqrt(dx * dx + dy * dy);
                ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                break;
            }
            case 'rectangle': {
                const rx = Math.min(startX, endX);
                const ry = Math.min(startY, endY);
                const w = Math.abs(endX - startX);
                const h = Math.abs(endY - startY);
                ctx.rect(rx, ry, w, h);
                break;
            }
            case 'line': {
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                break;
            }
            case 'arrow': {
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                drawArrow(ctx, startX, startY, endX, endY);
                break;
            }
            case 'array': {
                const rx = Math.min(startX, endX);
                const ry = Math.min(startY, endY);
                const w = Math.abs(endX - startX);
                const h = Math.abs(endY - startY);
                const cellWidth = w / 5;
                for (let i = 0; i < 5; i++) {
                    ctx.rect(rx + i * cellWidth, ry, cellWidth, h);
                }
                break;
            }
            case 'stack': {
                const rx = Math.min(startX, endX);
                const ry = Math.min(startY, endY);
                const w = Math.abs(endX - startX);
                const h = Math.abs(endY - startY);
                const cellHeight = h / 5;
                for (let i = 0; i < 5; i++) {
                    ctx.rect(rx, ry + i * cellHeight, w, cellHeight);
                }
                break;
            }
        }
        ctx.stroke(); // Stroke after each shape is drawn
    }

    // Event Listeners
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    clearBtn.addEventListener('click', clearCanvas);
    colorPicker.addEventListener('change', updateColor);
    brushSize.addEventListener('change', updateBrushSize);
    saveBtn.addEventListener('click', saveDrawing);
    loadBtn.addEventListener('click', loadDrawing);
    eraserBtn.addEventListener('click', selectEraser);

    let currentPath = [];

    function startDrawing(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        [lastX, lastY] = [startX, startY];
        
        if (isEraser) {
            eraseShapesAt(startX, startY);
        } else {
            if (currentShape === 'free') {
                currentPath = [startX, startY];
                pathPoints = [startX, startY];
            } else {
                // For non‐freehand shapes, capture the current canvas snapshot for preview.
                snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
        }
    }

    function draw(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (isEraser) {
            eraseShapesAt(x, y);
        } else if (currentShape === 'free') {
            drawFreehand(x, y);
            currentPath.push(x, y);
        } else {
            // For shapes, restore snapshot and draw preview
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
                ctx.strokeStyle = colorPicker.value; // Ensure color is maintained
                ctx.lineWidth = brushSize.value; // Ensure line width is maintained
                drawShapeByType(currentShape, startX, startY, x, y);
            }
            // Update lastX and lastY for commit
            [lastX, lastY] = [x, y];
        }
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        snapshot = null;

        if (!isEraser) {
            if (currentShape === 'free' && currentPath.length > 0) {
                const style = {
                    strokeStyle: ctx.strokeStyle,
                    lineWidth: ctx.lineWidth
                };
                const smoothed = smoothPoints(currentPath);
                addShape(smoothed, style);
            } else if (currentShape !== 'free') {
                const style = {
                    strokeStyle: ctx.strokeStyle,
                    lineWidth: ctx.lineWidth
                };
                addNonFreeShape(startX, startY, lastX, lastY, style, currentShape);
            }
        }
        currentPath = [];
        pathPoints = [];
    }

    function drawPreviewShape(x, y) {
        ctx.beginPath();
        switch (currentShape) {
            case 'circle': {
                const dx = x - startX;
                const dy = y - startY;
                const radius = Math.sqrt(dx * dx + dy * dy);
                ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                break;
            }
            case 'rectangle': {
                const rx = Math.min(startX, x);
                const ry = Math.min(startY, y);
                const w = Math.abs(x - startX);
                const h = Math.abs(y - startY);
                ctx.rect(rx, ry, w, h);
                break;
            }
            case 'line': {
                ctx.moveTo(startX, startY);
                ctx.lineTo(x, y);
                break;
            }
            case 'arrow': {
                ctx.moveTo(startX, startY);
                ctx.lineTo(x, y);
                drawArrow(ctx, startX, startY, x, y);
                break;
            }
            case 'array': {
                // Draw an "array" as five adjacent boxes.
                const rx = Math.min(startX, x);
                const ry = Math.min(startY, y);
                const w = Math.abs(x - startX);
                const h = Math.abs(y - startY);
                const cellWidth = w / 5;
                for (let i = 0; i < 5; i++) {
                    ctx.rect(rx + i * cellWidth, ry, cellWidth, h);
                }
                break;
            }
            case 'stack': {
                // Draw a "stack" as five stacked boxes.
                const rx = Math.min(startX, x);
                const ry = Math.min(startY, y);
                const w = Math.abs(x - startX);
                const h = Math.abs(y - startY);
                const cellHeight = h / 5;
                for (let i = 0; i < 5; i++) {
                    ctx.rect(rx, ry + i * cellHeight, w, cellHeight);
                }
                break;
            }
        }
        ctx.stroke();
    }

    // Update addNonFreeShape to include isPercentage flag
    function addNonFreeShape(sx, sy, ex, ey, style, type) {
        // Convert coordinates to percentages for consistent storage
        const x1Percent = (Math.min(sx, ex) / canvas.width) * 100;
        const y1Percent = (Math.min(sy, ey) / canvas.height) * 100;
        const x2Percent = (Math.max(sx, ex) / canvas.width) * 100;
        const y2Percent = (Math.max(sy, ey) / canvas.height) * 100;
        
        const bounds = {
            x1: x1Percent,
            y1: y1Percent,
            x2: x2Percent,
            y2: y2Percent,
            isPercentage: true
        };
        
        // Add padding to bounds for easier selection
        bounds.x1 -= 2;
        bounds.y1 -= 2;
        bounds.x2 += 2;
        bounds.y2 += 2;
        
        shapes.push({ 
            type, 
            startX: (sx / canvas.width) * 100, 
            startY: (sy / canvas.height) * 100,
            endX: (ex / canvas.width) * 100,
            endY: (ey / canvas.height) * 100,
            style,
            bounds
        });
        redrawShapes();
    }

    function drawFreehand(x, y) {
        pathPoints.push(x, y);
        
        if (pathPoints.length >= 4) {
            const smoothed = smoothPoints(pathPoints);
            
            ctx.beginPath();
            ctx.moveTo(smoothed[0], smoothed[1]);
            
            // Use quadratic curves for smoother lines
            for (let i = 2; i < smoothed.length - 2; i += 2) {
                const xc = (smoothed[i] + smoothed[i + 2]) / 2;
                const yc = (smoothed[i + 1] + smoothed[i + 3]) / 2;
                ctx.quadraticCurveTo(smoothed[i], smoothed[i + 1], xc, yc);
            }
            
            ctx.stroke();
            // Keep only the last few points to continue the stroke smoothly
            pathPoints = pathPoints.slice(-8);
        } else {
            // For the first few points, use a simple line-to
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        
        [lastX, lastY] = [x, y];
    }

    function drawShape(shape) {
        // For debugging, log the shape
        console.log('Drawing freehand shape:', shape);
        drawFreehandPath(shape.points);
        ctx.stroke(); // Stroke the path
    }

    function eraseShapesAt(x, y) {
        const shapesToRemove = [];
        shapes.forEach((shape, index) => {
            if (isPointInBounds(x, y, shape.bounds)) {
                shapesToRemove.push(index);
            }
        });
        
        if (shapesToRemove.length > 0) {
            shapes = shapes.filter((_, index) => !shapesToRemove.includes(index));
            redrawShapes();
        }
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        shapes = [];
    }

    function updateColor(e) {
        ctx.strokeStyle = e.target.value;
        if (isEraser) {
            toggleEraser();
        }
    }

    function updateBrushSize(e) {
        ctx.lineWidth = e.target.value;
    }

    // Function to extract problemId from the current URL
    function getProblemIdFromUrl(url) {
        const urlPattern = /leetcode\.com\/problems\/([a-zA-Z0-9_-]+)/; // Adjust the regex as needed
        const match = url.match(urlPattern);
        return match ? match[1] : null; // Return the problem ID or null if not found
    }

    // Use this function in your saveDrawing function
    async function saveDrawing() {
        if (!driveService) {
            console.error('Drive service is not initialized');
            showNotification('Failed to save drawing: Drive service is not initialized');
            return;
        }

        // Get the active tab's URL to extract the problem ID
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const currentTab = tabs[0];
            const problemId = getProblemIdFromUrl(currentTab.url); // Extract problem ID from URL

            if (!problemId) {
                console.error('Problem ID is not defined');
                showNotification('Failed to save drawing: Problem ID is not defined');
                return;
            }

            console.log('Problem ID for saving:', problemId);

            // Get the drawing data from the canvas
            const drawingData = getDrawingDataFromCanvas(); // Convert canvas to editable format
            console.log('Drawing data to save:', drawingData); // Log the drawing data

            try {
                // Check if the draft already exists
                const existingDraft = await driveService.loadDraft(problemId);

                if (existingDraft) {
                    // If the draft exists, update it
                    await driveService.updateDraft(problemId, drawingData);
                    showNotification('Drawing updated successfully!');
                } else {
                    // If the draft does not exist, create a new one
                    await driveService.saveDraft(problemId, drawingData);
                    showNotification('Drawing saved successfully!');
                }
 // Download the drawing data
            } catch (error) {
                console.error('Save failed:', error);
                showNotification('Failed to save drawing: ' + error.message);
            }
        });
    }


    // Function to download the drawing data as a JSON file
    function downloadDrawingData(problemId, drawingData) {
        const blob = new Blob([JSON.stringify(drawingData, null, 2)], { type: 'application/json' }); // Create a Blob from the drawing data
        const url = URL.createObjectURL(blob); // Create a URL for the Blob
        const a = document.createElement('a'); // Create an anchor element
        a.href = url; // Set the href to the Blob URL
        a.download = `drawing_${problemId}.json`; // Set the download attribute with the filename
        document.body.appendChild(a); // Append the anchor to the body
        a.click(); // Programmatically click the anchor to trigger the download
        document.body.removeChild(a); // Remove the anchor from the document
        URL.revokeObjectURL(url); // Release the Blob URL
    }

    async function loadDrawing() {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const currentTab = tabs[0];
            const problemId = getProblemIdFromUrl(currentTab.url);
    
            if (!problemId) {
                console.error('Problem ID is not defined');
                showNotification('Failed to load drawing: Problem ID is not defined');
                return;
            }
    
            try {
                const drawingData = await driveService.loadDraft(problemId);
                console.log('Loaded drawing data:', drawingData);
    
                if (drawingData && drawingData.shapes) {
                    // Clear existing shapes and canvas
                    clearCanvas();
                    
                    // Restore the shapes array with the loaded shapes
                    shapes = drawingData.shapes.map(shape => ({
                        ...shape,
                        // Ensure bounds are properly calculated for the loaded shape
                        bounds: calculateBounds(shape.points, true)
                    }));
    
                    // Redraw all shapes with proper scaling
                    redrawShapes();
                    
                    showNotification('Drawing loaded successfully!');
                } else {
                    console.error('No shapes found in the loaded drawing data');
                    showNotification('No drawing found for this problem');
                }
            } catch (error) {
                console.error('Error loading drawing:', error);
                showNotification('Failed to load drawing: ' + error.message);
            }
        });
    }

    function selectEraser() {
        isEraser = true;
        currentShape = 'eraser';
        // Remove active class from all shape buttons
        shapeBtns.forEach(btn => btn.classList.remove('active'));
        // Add active class to eraser button
        eraserBtn.classList.add('active');
    }

    function drawArrow(ctx, fromx, fromy, tox, toy) {
        const headlen = 15;
        const angle = Math.atan2(toy - fromy, tox - fromx);
        
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        
        ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    function smoothPoints(points) {
        if (points.length < 4) return points;
        
        const smoothed = [];
        smoothed.push(points[0], points[1]); // Keep first point

        for (let i = 2; i < points.length - 2; i += 2) {
            const x = points[i];
            const y = points[i + 1];
            const nextX = points[i + 2];
            const nextY = points[i + 3];
            const prevX = points[i - 2];
            const prevY = points[i - 1];

            const smoothX = prevX * SMOOTHING_FACTOR + 
                          x * (1 - 2 * SMOOTHING_FACTOR) + 
                          nextX * SMOOTHING_FACTOR;
            const smoothY = prevY * SMOOTHING_FACTOR + 
                          y * (1 - 2 * SMOOTHING_FACTOR) + 
                          nextY * SMOOTHING_FACTOR;

            smoothed.push(smoothX, smoothY);
        }

        // Keep last point
        smoothed.push(points[points.length - 2], points[points.length - 1]);
        return smoothed;
    }

    // Initialize
    resizeCanvas();

    // Check authentication status on load
    checkAuthStatus();

    // Add shape selection event listeners:
    const shapeBtns = document.querySelectorAll('.shape-btn');
    shapeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Disable eraser mode when a shape is selected
            isEraser = false;
            eraserBtn.classList.remove('active');
            // Remove active class from all shape buttons
            shapeBtns.forEach(b => b.classList.remove('active'));
            // Add active class to the clicked button
            btn.classList.add('active');
            // Update currentShape based on the clicked button's data attribute
            currentShape = btn.getAttribute('data-shape');
        });
    });

    // Move drawFreehandPath inside DOMContentLoaded scope
    function drawFreehandPath(points) {
        if (points.length < 2) return;
        
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        
        // Use quadratic curves for smoother lines
        for (let i = 2; i < points.length - 2; i += 2) {
            const xc = (points[i] + points[i + 2]) / 2;
            const yc = (points[i + 1] + points[i + 3]) / 2;
            ctx.quadraticCurveTo(points[i], points[i + 1], xc, yc);
        }
        
        // Draw the last segment if there are remaining points
        if (points.length > 2) {
            ctx.lineTo(points[points.length - 2], points[points.length - 1]);
        }
    }

}); 
document.addEventListener('DOMContentLoaded', () => {
    // Retry auth check a few times if it fails initially
    let retryCount = 0;
    const maxRetries = 3;
    
    function tryCheckAuth() {
        checkAuthStatus().catch(error => {
            console.log('Auth check attempt failed:', error);
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(tryCheckAuth, 500); // Wait 500ms before retry
            }
        });
    }
    
    tryCheckAuth();
});

// Function to get drawing data from the canvas
function getDrawingDataFromCanvas() {
    return { shapes }; // Assuming shapes is defined globally
}

// Function to draw shapes on the canvas (for demonstration purposes)
function drawShape(type, x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();

    switch (type) {
        case 'circle':
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            shapes.push({ type: 'circle', x, y, radius, color }); // Track the shape
            break;
        case 'rectangle':
            ctx.rect(x, y, width, height);
            ctx.fill();
            shapes.push({ type: 'rectangle', x, y, width, height, color }); // Track the shape
            break;
        // Add more shapes as needed
    }

    ctx.stroke();
}

// Example of how to use the drawShape function
function exampleDraw() {
    drawShape('circle', 50, 50, null, null, 20, 'red'); // Draw a red circle
    drawShape('rectangle', 100, 100, 50, 30, null, 'blue'); // Draw a blue rectangle
}

// Call this function to demonstrate drawing shapes
exampleDraw();

async function fetchFiles(token) {
    // Log the token for debugging
    console.log('Token retrieved:', token);

    const response = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27LeetCode%20Drafts%27%20and%20mimeType%3D%27application%2Fvnd.google-apps.folder%27%20and%20trashed%3Dfalse', {
        headers: {
            'Authorization': `Bearer ${token}` // Ensure the token is included in the request
        }
    });

    if (!response.ok) {
        console.error('Error fetching files:', response.status, response.statusText);
        // Handle error (e.g., re-authenticate if 401)
        if (response.status === 401) {
            console.error('Unauthorized access. Please re-authenticate.');
            // Optionally, you can call authenticate() here to re-initiate the sign-in process
        }
    } else {
        const data = await response.json();
        console.log('Files:', data);
    }
}
// Example function to authenticate and fetch files
async function authenticateAndFetch() {
    const token = await getAccessToken(); // Implement this function to retrieve the token

    if (token) {
        await fetchFiles(token); // Call fetchFiles with the retrieved token
    } else {
        console.error('No token found. Please authenticate.');
    }
}
