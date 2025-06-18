chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'takeScreenshot') {
    takeFullPageScreenshot()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'setCheckboxes') {
    try {
      const count = setAllCheckboxes(request.checked);
      sendResponse({ success: true, count: count });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

function takeFullPageScreenshot() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onerror = () => reject(new Error('Failed to load html2canvas'));
    
    script.onload = function() {
      html2canvas(document.body, {
        height: Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        ),
        width: Math.max(
          document.body.scrollWidth,
          document.body.offsetWidth,
          document.documentElement.clientWidth,
          document.documentElement.scrollWidth,
          document.documentElement.offsetWidth
        ),
        useCORS: true,
        allowTaint: true,
        scale: 1
      }).then(canvas => {
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `screenshot_${timestamp}.png`;
        
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        resolve();
      }).catch(error => {
        reject(error);
      });
    };
    
    document.head.appendChild(script);
  });
}

function setAllCheckboxes(checked) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(:disabled)');
  let count = 0;
  
  checkboxes.forEach(checkbox => {
    if (checkbox.checked !== checked) {
      checkbox.checked = checked;
      
      const changeEvent = new Event('change', { bubbles: true });
      checkbox.dispatchEvent(changeEvent);
      
      const clickEvent = new Event('click', { bubbles: true });
      checkbox.dispatchEvent(clickEvent);
      
      count++;
    }
  });
  
  return count;
}