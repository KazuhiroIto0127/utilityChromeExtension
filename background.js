chrome.runtime.onInstalled.addListener(() => {
  console.log('Web Helper Chrome Extension installed');
});

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'takeScreenshot') {
    takeScreenshot(request.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'takeVisibleScreenshot') {
    handleVisibleScreenshot(sendResponse);
    return true;
  }

  if (request.action === 'startAreaSelection') {
    handleAreaSelection(request.tabId, sendResponse);
    return true;
  }

  if (request.action === 'captureAreaScreenshot') {
    handleAreaScreenshot(request.area, sendResponse);
    return true;
  }

  if (request.action === 'downloadScreenshot') {
    chrome.downloads.download({
      url: request.dataUrl,
      filename: request.filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    return true;
  }
});

async function takeScreenshot(tabId) {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `screenshot_${timestamp}.png`;

    return await captureFullPage(tabId, filename);

  } catch (error) {
    console.error('Screenshot error:', error);
    return { success: false, error: error.message };
  }
}

async function handleVisibleScreenshot(sendResponse) {
  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    
    // Download the image
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    chrome.downloads.download({
      url: dataUrl,
      filename: `visible-screenshot-${timestamp}.png`
    });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Visible screenshot error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAreaSelection(tabId, sendResponse) {
  try {
    // Inject content script to start area selection
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });

    // Send message to content script to start selection
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'startAreaSelection'
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('Area selection error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAreaScreenshot(area, sendResponse) {
  console.log('handleAreaScreenshot called with area:', area);
  
  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab.id);

    // Capture visible tab first
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    console.log('Captured visible tab, data URL length:', dataUrl.length);

    // Get device pixel ratio using Manifest V3 API
    let devicePixelRatio = 1;
    try {
      const dprResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => { return window.devicePixelRatio; }
      });
      devicePixelRatio = dprResult[0].result || 1;
      console.log('Device pixel ratio:', devicePixelRatio);
    } catch (error) {
      console.warn('Failed to get device pixel ratio, using 1:', error);
    }

    // Create an image bitmap for processing (Service Worker compatible)
    const imageBitmap = await createImageBitmap(await fetch(dataUrl).then(r => r.blob()));
    
    console.log('ImageBitmap created, dimensions:', imageBitmap.width, 'x', imageBitmap.height);
    
    // Create canvas for cropping
    const canvas = new OffscreenCanvas(area.width, area.height);
    const ctx = canvas.getContext('2d');

    // Scale coordinates for high DPI displays
    const scaledX = area.x * devicePixelRatio;
    const scaledY = area.y * devicePixelRatio;
    const scaledWidth = area.width * devicePixelRatio;
    const scaledHeight = area.height * devicePixelRatio;

    console.log('Scaled coordinates:', {
      x: scaledX, y: scaledY, 
      width: scaledWidth, height: scaledHeight
    });

    // Draw the cropped area
    ctx.drawImage(
      imageBitmap,
      scaledX, scaledY, scaledWidth, scaledHeight,
      0, 0, area.width, area.height
    );

    // Convert to blob and create data URL
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    console.log('Canvas converted to blob, size:', blob.size);

    // Use FileReader to convert blob to data URL
    const reader = new FileReader();
    reader.onload = function() {
      // Download the cropped image
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `area-screenshot-${timestamp}.png`;
      
      console.log('Downloading file:', filename);
      chrome.downloads.download({
        url: reader.result,
        filename: filename
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Download started with ID:', downloadId);
          sendResponse({ success: true, downloadId });
        }
      });
    };
    
    reader.onerror = function(error) {
      console.error('FileReader error:', error);
      sendResponse({ success: false, error: 'Failed to read blob as data URL' });
    };
    
    reader.readAsDataURL(blob);

  } catch (error) {
    console.error('Area screenshot error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

const LIMIT = 16384;
const TILE = 8000;

async function captureFullPage(tabId, filename) {
  try {
    // デバッガーをアタッチ
    await chrome.debugger.attach({ tabId }, '1.3');

    try {
      // Page domain を有効化
      await send(tabId, 'Page.enable');

      // レイアウト情報を取得
      const { contentSize, cssContentSize } = await send(tabId, 'Page.getLayoutMetrics');

      console.log('Page content size:', contentSize);
      // cssContentSize は余白を除いたサイズになることがある（Chrome DevTools が使う値）
      const targetSize = cssContentSize || contentSize;
      console.log('Using cssContentSize (if present):', targetSize);

      const fullH = Math.ceil(targetSize.height);
      const fullW = Math.ceil(targetSize.width);

      // サイズ制限を超えないなら従来どおり
      if (fullH <= LIMIT) {
        return await captureOneShot(tabId, fullW, fullH, filename);
      }

      // ---- ここから分割モード ----
      console.log(`Large page detected (${fullH}px), using tiled capture`);

      const chunks = [];
      for (let y = 0; y < fullH; y += TILE) {
        const h = Math.min(TILE, fullH - y);
        console.log(`Capturing tile: y=${y}, height=${h}`);

        const { data } = await send(tabId, 'Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { x: 0, y, width: fullW, height: h, scale: 1 }
        });

        chunks.push(await createImageBitmap(base64ToBlob(data)));
      }

      // OffscreenCanvas で連結
      const dprResult = await send(tabId, 'Runtime.evaluate', {
        expression: 'window.devicePixelRatio'
      });
      const dpr = dprResult.result.value || 1;

      const canvas = new OffscreenCanvas(fullW * dpr, fullH * dpr);
      let ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      let offsetY = 0;
      for (const img of chunks) {
        ctx.drawImage(img, 0, offsetY);
        offsetY += img.height / dpr;
      }

      // ----------- 余白が生まれた場合はキャンバスを切り詰める -----------
      const logicalDrawnHeight = offsetY;             // 単位: CSS px
      if (logicalDrawnHeight < fullH) {
        // 不要領域 (fullH - logicalDrawnHeight) px ぶんは描画されていないので切り落とす
        const cropped = new OffscreenCanvas(fullW * dpr, logicalDrawnHeight * dpr);
        const cctx = cropped.getContext('2d');
        cctx.drawImage(canvas, 0, 0); // 上端から詰めてコピー
        canvas.width = cropped.width;
        canvas.height = cropped.height;
        ctx = cctx; // 後続処理は新しいキャンバスを利用
      }

      const blob = await canvas.convertToBlob({ type: 'image/png' });

      // Use FileReader because URL.createObjectURL is unavailable in Service Workers
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: false
      });

      return { success: true, downloadId };

    } finally {
      // デバッガーをデタッチ
      await chrome.debugger.detach({ tabId });
    }

  } catch (error) {
    console.error('Capture error:', error);

    // エラー時もデバッガーをデタッチ
    try {
      await chrome.debugger.detach({ tabId });
    } catch (detachError) {
      console.error('Detach error:', detachError);
    }

    return { success: false, error: error.message };
  }
}

async function captureOneShot(tabId, fullW, fullH, filename) {
  console.log('Using one-shot capture for small page');

  // ① 画面サイズをページ全体に拡大
  await send(tabId, 'Emulation.setDeviceMetricsOverride', {
    mobile: false,
    width: fullW,
    height: fullH,
    deviceScaleFactor: 1
  });

  // 少し待機（レイアウト調整のため）
  await new Promise(resolve => setTimeout(resolve, 500));

  // ② スクリーンショット取得
  const { data } = await send(tabId, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true
  });

  // ③ 元に戻す
  await send(tabId, 'Emulation.clearDeviceMetricsOverride');

  // データURLに変換
  const url = 'data:image/png;base64,' + data;

  // ダウンロード
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs: false
  });

  return { success: true, downloadId };
}

function base64ToBlob(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}

async function send(tabId, command, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, command, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}
