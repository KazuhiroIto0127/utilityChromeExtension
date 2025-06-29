document.addEventListener('DOMContentLoaded', function() {
  const screenshotBtn = document.getElementById('screenshot-btn');
  const screenshotVisibleBtn = document.getElementById('screenshot-visible-btn');
  const screenshotAreaBtn = document.getElementById('screenshot-area-btn');
  const checkboxAllBtn = document.getElementById('checkbox-all-btn');
  const checkboxNoneBtn = document.getElementById('checkbox-none-btn');
  const status = document.getElementById('status');

  function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 3000);
  }

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  screenshotBtn.addEventListener('click', async () => {
    try {
      showStatus('フルページスクリーンショットを取得中...', 'info');
      const tab = await getCurrentTab();
      
      const response = await chrome.runtime.sendMessage({
        action: 'takeScreenshot',
        tabId: tab.id
      });
      
      if (response.success) {
        showStatus('フルページスクリーンショットをダウンロードしました', 'success');
      } else {
        showStatus(`エラー: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Screenshot error:', error);
      showStatus('スクリーンショットの取得に失敗しました', 'error');
    }
  });

  screenshotVisibleBtn.addEventListener('click', async () => {
    try {
      showStatus('表示範囲スクリーンショットを取得中...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        action: 'takeVisibleScreenshot'
      });
      
      if (response.success) {
        showStatus('表示範囲スクリーンショットをダウンロードしました', 'success');
      } else {
        showStatus(`エラー: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Visible screenshot error:', error);
      showStatus('表示範囲スクリーンショットの取得に失敗しました', 'error');
    }
  });

  screenshotAreaBtn.addEventListener('click', async () => {
    try {
      showStatus('範囲を選択してください...', 'info');
      const tab = await getCurrentTab();
      
      const response = await chrome.runtime.sendMessage({
        action: 'startAreaSelection',
        tabId: tab.id
      });
      
      if (response.success) {
        showStatus('ドラッグして範囲を選択し、マウスを離してください', 'info');
        // Close popup to allow area selection
        window.close();
      } else {
        showStatus(`エラー: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Area selection error:', error);
      showStatus('範囲選択の開始に失敗しました', 'error');
    }
  });

  checkboxAllBtn.addEventListener('click', async () => {
    try {
      showStatus('チェックボックスを操作中...', 'info');
      const tab = await getCurrentTab();
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: setAllCheckboxes,
        args: [true]
      });
      
      const count = result[0].result;
      showStatus(`${count}個のチェックボックスをチェックしました`, 'success');
    } catch (error) {
      console.error('Checkbox error:', error);
      showStatus('チェックボックスの操作に失敗しました', 'error');
    }
  });

  checkboxNoneBtn.addEventListener('click', async () => {
    try {
      showStatus('チェックボックスを操作中...', 'info');
      const tab = await getCurrentTab();
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: setAllCheckboxes,
        args: [false]
      });
      
      const count = result[0].result;
      showStatus(`${count}個のチェックボックスのチェックを解除しました`, 'success');
    } catch (error) {
      console.error('Checkbox error:', error);
      showStatus('チェックボックスの操作に失敗しました', 'error');
    }
  });
});


function setAllCheckboxes(checked) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(:disabled)');
  let count = 0;
  
  checkboxes.forEach(checkbox => {
    if (checkbox.checked !== checked) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      count++;
    }
  });
  
  return count;
}