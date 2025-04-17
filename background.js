// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openOptions") {
    // Open the options page
    chrome.runtime.openOptionsPage();
  }
});