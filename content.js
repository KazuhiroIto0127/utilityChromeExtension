(() => {
  // Use a module-scoped state object to avoid polluting the global scope.
  const state = {
    isSelecting: false,
    selectionOverlay: null,
    selectionBox: null,
    startX: 0,
    startY: 0,
  };

  // Listen for messages from the background script.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startAreaSelection') {
      startAreaSelection();
      sendResponse({ success: true });
    }
  });

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'screenshot-selection-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.3); z-index: 999999; cursor: crosshair;
    `;

    const box = document.createElement('div');
    box.id = 'screenshot-selection-box';
    box.style.cssText = `
      position: absolute; border: 2px solid #007bff;
      background: rgba(0, 123, 255, 0.1); display: none;
    `;

    overlay.appendChild(box);
    return { overlay, box };
  }

  function startAreaSelection() {
    if (state.isSelecting) return;

    state.isSelecting = true;
    const { overlay, box } = createOverlay();
    state.selectionOverlay = overlay;
    state.selectionBox = box;

    document.body.appendChild(overlay);

    // Add event listeners directly to the overlay and document.
    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function endAreaSelection() {
    if (!state.isSelecting) return;

    state.isSelecting = false;
    if (state.selectionOverlay) {
      state.selectionOverlay.remove();
      state.selectionOverlay = null;
      state.selectionBox = null;
    }
    // Clean up all listeners at once.
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    // Prevent the default browser action (e.g., text selection).
    e.preventDefault();

    state.startX = e.clientX;
    state.startY = e.clientY;

    state.selectionBox.style.left = `${state.startX}px`;
    state.selectionBox.style.top = `${state.startY}px`;
    state.selectionBox.style.width = '0px';
    state.selectionBox.style.height = '0px';
    state.selectionBox.style.display = 'block';

    // Add move and up listeners only after mousedown.
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    const left = Math.min(state.startX, e.clientX);
    const top = Math.min(state.startY, e.clientY);
    const width = Math.abs(e.clientX - state.startX);
    const height = Math.abs(e.clientY - state.startY);

    state.selectionBox.style.left = `${left}px`;
    state.selectionBox.style.top = `${top}px`;
    state.selectionBox.style.width = `${width}px`;
    state.selectionBox.style.height = `${height}px`;
  }

  function onMouseUp(e) {
    const left = Math.min(state.startX, e.clientX);
    const top = Math.min(state.startY, e.clientY);
    const width = Math.abs(e.clientX - state.startX);
    const height = Math.abs(e.clientY - state.startY);

    // Clean up immediately.
    endAreaSelection();

    if (width > 10 && height > 10) {
      // Use a short timeout to ensure the overlay is visually gone.
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'captureAreaScreenshot',
          area: { x: left, y: top, width, height },
        });
      }, 50); // Reduced timeout
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      endAreaSelection();
    }
  }
})();
