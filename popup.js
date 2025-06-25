document.addEventListener('DOMContentLoaded', function () {
  const status = document.getElementById('status');

  // --- Helper Functions ---
  const showStatus = (message, type = 'info') => {
    status.textContent = message;
    status.className = `status ${type}`;
    if (type !== 'info') { // Keep info messages until next action
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 3000);
    }
  };

  const getCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };

  // --- Action Handlers ---

  const handleScreenshot = async (action, options) => {
    const { startMsg, successMsg, errorMsg, closePopup = false } = options;
    try {
      showStatus(startMsg, 'info');
      const tab = await getCurrentTab();
      const response = await chrome.runtime.sendMessage({
        action: action,
        tabId: tab.id, // Not always needed by receiver, but safe to send
      });

      if (response.success) {
        showStatus(successMsg, closePopup ? 'info' : 'success');
        if (closePopup) {
          window.close();
        }
      } else {
        showStatus(`エラー: ${response.error || '不明なエラー'}`, 'error');
      }
    } catch (error) {
      console.error(`${action} error:`, error);
      showStatus(errorMsg, 'error');
    }
  };

  const handleCheckbox = async (check) => {
    try {
      showStatus('チェックボックスを操作中...', 'info');
      const tab = await getCurrentTab();
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: setAllCheckboxes,
        args: [check],
      });
      const count = result.result;
      const message = check
        ? `${count}個のチェックボックスをオンにしました`
        : `${count}個のチェックボックスをオフにしました`;
      showStatus(message, 'success');
    } catch (error) {
      console.error('Checkbox error:', error);
      showStatus('チェックボックスの操作に失敗しました', 'error');
    }
  };

  // --- Event Listeners ---

  document.getElementById('screenshot-btn').addEventListener('click', () => handleScreenshot('takeScreenshot', {
    startMsg: 'フルページスクリーンショットを取得中...',
    successMsg: 'フルページスクリーンショットをダウンロードしました',
    errorMsg: 'スクリーンショットの取得に失敗しました',
  }));

  document.getElementById('screenshot-visible-btn').addEventListener('click', () => handleScreenshot('takeVisibleScreenshot', {
    startMsg: '表示範囲スクリーンショットを取得中...',
    successMsg: '表示範囲スクリーンショットをダウンロードしました',
    errorMsg: '表示範囲スクリーンショットの取得に失敗しました',
  }));

  document.getElementById('screenshot-area-btn').addEventListener('click', () => handleScreenshot('startAreaSelection', {
    startMsg: '範囲を選択してください...',
    successMsg: 'ドラッグして範囲を選択し、マウスを離してください',
    errorMsg: '範囲選択の開始に失敗しました',
    closePopup: true,
  }));

  document.getElementById('checkbox-all-btn').addEventListener('click', () => handleCheckbox(true));

  document.getElementById('checkbox-none-btn').addEventListener('click', () => handleCheckbox(false));
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