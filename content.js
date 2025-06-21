// Content script for DOM operations on web pages
console.log('Web Helper Content Script loaded');

// Initialize selection variables only if not already declared
if (typeof window.webHelperSelectionState === 'undefined') {
  window.webHelperSelectionState = {
    isSelecting: false,
    selectionOverlay: null,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAreaSelection') {
    startAreaSelection();
    sendResponse({ success: true });
  }
});

function startAreaSelection() {
  const state = window.webHelperSelectionState;
  if (state.isSelecting) return;
  
  state.isSelecting = true;
  document.body.style.cursor = 'crosshair';
  
  // Create overlay
  state.selectionOverlay = document.createElement('div');
  state.selectionOverlay.id = 'screenshot-selection-overlay';
  state.selectionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    pointer-events: auto;
  `;
  
  // Create selection box
  const selectionBox = document.createElement('div');
  selectionBox.id = 'screenshot-selection-box';
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px solid #007bff;
    background: rgba(0, 123, 255, 0.1);
    display: none;
    pointer-events: none;
  `;
  
  state.selectionOverlay.appendChild(selectionBox);
  document.body.appendChild(state.selectionOverlay);
  
  // Add event listeners to overlay
  state.selectionOverlay.addEventListener('mousedown', onMouseDown);
  state.selectionOverlay.addEventListener('mousemove', onMouseMove);
  state.selectionOverlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

function onMouseDown(e) {
  const state = window.webHelperSelectionState;
  if (!state.isSelecting) return;
  
  state.startX = e.clientX;
  state.startY = e.clientY;
  
  const selectionBox = document.getElementById('screenshot-selection-box');
  selectionBox.style.left = state.startX + 'px';
  selectionBox.style.top = state.startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
}

function onMouseMove(e) {
  const state = window.webHelperSelectionState;
  if (!state.isSelecting || !document.getElementById('screenshot-selection-box')) return;
  
  const selectionBox = document.getElementById('screenshot-selection-box');
  if (selectionBox.style.display === 'none') return;
  
  state.endX = e.clientX;
  state.endY = e.clientY;
  
  const left = Math.min(state.startX, state.endX);
  const top = Math.min(state.startY, state.endY);
  const width = Math.abs(state.endX - state.startX);
  const height = Math.abs(state.endY - state.startY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function onMouseUp(e) {
  const state = window.webHelperSelectionState;
  if (!state.isSelecting) return;
  
  state.endX = e.clientX;
  state.endY = e.clientY;
  
  // Calculate selection area
  const left = Math.min(state.startX, state.endX);
  const top = Math.min(state.startY, state.endY);
  const width = Math.abs(state.endX - state.startX);
  const height = Math.abs(state.endY - state.startY);
  
  // Only proceed if selection is large enough
  if (width > 10 && height > 10) {
    const selectionArea = {
      x: left,
      y: top,
      width: width,
      height: height
    };
    
    // First remove the overlay to avoid it appearing in screenshot
    endAreaSelection();
    
    // Wait a bit for overlay to be completely removed, then take screenshot
    setTimeout(() => {
      console.log('Sending area screenshot request:', selectionArea);
      chrome.runtime.sendMessage({
        action: 'captureAreaScreenshot',
        area: selectionArea
      }, (response) => {
        console.log('Area screenshot response:', response);
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
        }
      });
    }, 150); // Wait 150ms for overlay removal
  } else {
    // Just end selection if area is too small
    endAreaSelection();
  }
}

function onKeyDown(e) {
  const state = window.webHelperSelectionState;
  if (!state.isSelecting) return;
  
  // Cancel selection on Escape key
  if (e.key === 'Escape') {
    endAreaSelection();
  }
}

function endAreaSelection() {
  const state = window.webHelperSelectionState;
  if (!state.isSelecting) return;
  
  state.isSelecting = false;
  document.body.style.cursor = '';
  
  // Remove event listeners
  if (state.selectionOverlay) {
    state.selectionOverlay.removeEventListener('mousedown', onMouseDown);
    state.selectionOverlay.removeEventListener('mousemove', onMouseMove);
    state.selectionOverlay.removeEventListener('mouseup', onMouseUp);
  }
  document.removeEventListener('keydown', onKeyDown);
  
  // Remove overlay
  if (state.selectionOverlay && state.selectionOverlay.parentNode) {
    document.body.removeChild(state.selectionOverlay);
    state.selectionOverlay = null;
  }
}
