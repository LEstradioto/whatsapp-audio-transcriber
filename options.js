// Script for options.html to load and save GROQ settings

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const fetchStatus = document.getElementById('fetchStatus');

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
      // On load, disable fetch button if no valid key, else auto-fetch
      if (!items.apiKey || !items.apiKey.startsWith('gsk_')) {
        fetchModelsBtn.disabled = true;
      } else {
        fetchModelsBtn.disabled = false;
        fetchAndUpdateModels(items.apiKey);
      }
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

  // Fetch models from GROQ API and update the select
  fetchModelsBtn.addEventListener('click', async () => {
    fetchStatus.textContent = '';
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey || !apiKey.startsWith('gsk_')) {
      fetchStatus.textContent = 'Please enter a valid GROQ API key first.';
      fetchStatus.style.color = 'red';
      return;
    }
    fetchModelsBtn.disabled = true;
    fetchStatus.textContent = 'Fetching models...';
    fetchStatus.style.color = 'blue';
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      // Filter for audio models (id contains 'whisper' or 'distil-whisper')
      const audioModels = (data.data || []).filter(m => /whisper|distil-whisper/i.test(m.id));
      if (audioModels.length === 0) {
        fetchStatus.textContent = 'No audio models found.';
        fetchStatus.style.color = 'red';
        fetchModelsBtn.disabled = false;
        return;
      }
      // Clear and repopulate the select
      modelSelect.innerHTML = '';
      audioModels.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.id;
        modelSelect.appendChild(opt);
      });
      // Default to whisper-large-v3-turbo if present
      const turboOpt = Array.from(modelSelect.options).find(opt => opt.value === 'whisper-large-v3-turbo');
      if (turboOpt) {
        modelSelect.value = 'whisper-large-v3-turbo';
      } else if (modelSelect.options.length > 0) {
        modelSelect.selectedIndex = 0;
      }
      fetchStatus.textContent = 'Audio models updated!';
      fetchStatus.style.color = 'green';
    } catch (err) {
      fetchStatus.textContent = 'Error: ' + err.message;
      fetchStatus.style.color = 'red';
    } finally {
      fetchModelsBtn.disabled = false;
    }
  });

  // Helper: fetch and update models
  async function fetchAndUpdateModels(apiKey) {
    fetchStatus.textContent = '';
    fetchModelsBtn.disabled = true;
    fetchStatus.textContent = 'Fetching models...';
    fetchStatus.style.color = 'blue';
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const audioModels = (data.data || []).filter(m => /whisper|distil-whisper/i.test(m.id));
      if (audioModels.length === 0) {
        fetchStatus.textContent = 'No audio models found.';
        fetchStatus.style.color = 'red';
        fetchModelsBtn.disabled = false;
        return;
      }
      modelSelect.innerHTML = '';
      audioModels.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.id;
        modelSelect.appendChild(opt);
      });
      // Default to whisper-large-v3-turbo if present
      const turboOpt = Array.from(modelSelect.options).find(opt => opt.value === 'whisper-large-v3-turbo');
      if (turboOpt) {
        modelSelect.value = 'whisper-large-v3-turbo';
      } else if (modelSelect.options.length > 0) {
        modelSelect.selectedIndex = 0;
      }
      fetchStatus.textContent = 'Audio models updated!';
      fetchStatus.style.color = 'green';
    } catch (err) {
      fetchStatus.textContent = 'Error: ' + err.message;
      fetchStatus.style.color = 'red';
    } finally {
      fetchModelsBtn.disabled = false;
    }
  }

  // Listen for changes in API key input to enable/disable fetch button and auto-fetch
  apiKeyInput.addEventListener('input', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey.startsWith('gsk_')) {
      fetchModelsBtn.disabled = false;
      await fetchAndUpdateModels(apiKey);
    } else {
      fetchModelsBtn.disabled = true;
      fetchStatus.textContent = '';
    }
  });
});