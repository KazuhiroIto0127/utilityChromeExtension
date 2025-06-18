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

async function captureFullPage(tabId, filename) {
  try {
    // デバッガーをアタッチ
    await chrome.debugger.attach({ tabId }, '1.3');

    try {
      // Page domain を有効化
      await send(tabId, 'Page.enable');
      
      // レイアウト情報を取得
      const { contentSize } = await send(tabId, 'Page.getLayoutMetrics');
      
      console.log('Page content size:', contentSize);

      // ① 画面サイズをページ全体に拡大
      await send(tabId, 'Emulation.setDeviceMetricsOverride', {
        mobile: false,
        deviceScaleFactor: 1,
        width: Math.ceil(contentSize.width),
        height: Math.ceil(contentSize.height)
      });

      // 少し待機（レイアウト調整のため）
      await new Promise(resolve => setTimeout(resolve, 500));

      // ② スクリーンショット取得
      const { data } = await send(tabId, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true
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


