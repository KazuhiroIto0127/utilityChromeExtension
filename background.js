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
