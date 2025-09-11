// On install, open a settings tab (cannot auto-open popup directly)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open popup.html in a regular tab for first-run setup
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});