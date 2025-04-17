// Script for options.html to load and save GROQ settings

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Function to check and clear corrupted storage data
  const clearCorruptedData = (items) => {
    if (items.apiKey && items.apiKey.includes('Content Security Policy directive')) {
      console.log('Detected corrupted API key data - clearing it');
      chrome.storage.sync.set({ apiKey: '' }, () => {
        apiKeyInput.value = '';
        statusDiv.textContent = 'Invalid API key data cleared. Please enter your GROQ API key.';
        statusDiv.style.color = 'red';
      });
      return true;
    }
    return false;
  };

  // Load saved settings (fallback to empty key and default model)
  chrome.storage.sync.get({ apiKey: '', model: 'whisper-large-v3' }, items => {
    // Check for corrupted data
    if (!clearCorruptedData(items)) {
      apiKeyInput.value = items.apiKey;
      modelSelect.value = items.model;
    }
  });

  // Save settings when button clicked
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    // Disable button and show saving status
    saveBtn.disabled = true;
    statusDiv.textContent = 'Saving...';
    statusDiv.style.color = 'black';
    chrome.storage.sync.set({ apiKey, model }, () => {
      // Re-enable button and show saved status
      saveBtn.disabled = false;
      statusDiv.textContent = 'Settings saved.';
      statusDiv.style.color = 'green';
      setTimeout(() => statusDiv.textContent = '', 3000);
    });
  });
});