// Popup script: manage provider settings and model selection

const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKey');
const apiKeyLabel = document.getElementById('apiKeyLabel');
const modelSelect = document.getElementById('modelSelect');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
const fetchModelsBtn = document.getElementById('fetchModelsBtn');
const fetchStatus = document.getElementById('fetchStatus');
const downloadModelBtn = document.getElementById('downloadModelBtn');
const downloadStatus = document.getElementById('downloadStatus');
const costInfo = document.getElementById('costInfo');
const helpText = document.getElementById('helpText');
const dangerNote = document.getElementById('dangerNote');

const DEFAULT_SETTINGS = {
  provider: 'groq',
  apiKeyGroq: '',
  apiKeyOpenAI: '',
  modelGroq: 'whisper-large-v3',
  modelOpenAI: 'gpt-4o-mini-transcribe',
  modelLocal: 'Xenova/whisper-small',
  localMode: 'browser'
};

const PROVIDER_META = {
  groq: {
    label: 'Groq API Key',
    keyPlaceholder: 'gsk_...',
    helpHtml:
      'How to use:<br />' +
      '1. Get a Groq API key at <a href="https://console.groq.com/keys" target="_blank">Groq Console</a>.<br />' +
      '2. Paste it above and Save.<br />' +
      '3. Go to or refresh WhatsApp Web. Audio messages will show a Transcribe button.<br />' +
      'Your key is stored only locally (Chrome sync storage).',
    costByModel: {
      'whisper-large-v3-turbo': '$0.00067 / min (Groq)',
      'whisper-large-v3': '$0.00185 / min (Groq)',
      'distil-whisper-large-v3-en': '$0.00033 / min (Groq)'
    },
    minBillingNote: 'Groq bills a minimum of ~10 seconds per request.'
  },
  openai: {
    label: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    helpHtml:
      'How to use:<br />' +
      '1. Create an API key at <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>.<br />' +
      '2. Paste it above and Save.<br />' +
      '3. Go to or refresh WhatsApp Web. Audio messages will show a Transcribe button.<br />' +
      'Your key is stored only locally (Chrome sync storage).',
    costByModel: {
      'gpt-4o-mini-transcribe': '$0.003 / min (OpenAI)',
      'gpt-4o-transcribe': '$0.006 / min (OpenAI)',
      'whisper-1': '$0.006 / min (OpenAI)'
    }
  },
  local: {
    label: 'Local (browser) setup',
    keyPlaceholder: 'No API key required',
    helpHtml:
      'Local mode downloads the model in your browser (no server). ' +
      'First run can take a while depending on model size. ' +
      'If a large model fails, try Xenova/whisper-small.',
    costByModel: {
      'Xenova/whisper-tiny': '$0 / min (local)',
      'Xenova/whisper-base': '$0 / min (local)',
      'Xenova/whisper-small': '$0 / min (local)',
      'Xenova/whisper-medium': '$0 / min (local)',
      'Xenova/whisper-large-v2': '$0 / min (local)',
      'Xenova/whisper-large-v3': '$0 / min (local)'
    }
  }
};

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
    providerSelect.value = items.provider;
    updateProviderUI(items.provider, items);
    if (items.provider === 'groq' && (items.apiKeyGroq || '').startsWith('gsk_')) {
      fetchModels();
    }
  });
}

function getProviderKey(provider, items) {
  return provider === 'groq' ? items.apiKeyGroq : items.apiKeyOpenAI;
}

function setProviderKey(provider, value) {
  if (provider === 'groq') return { apiKeyGroq: value };
  if (provider === 'openai') return { apiKeyOpenAI: value };
  return {};
}

function getProviderModel(provider, items) {
  if (provider === 'groq') return items.modelGroq;
  if (provider === 'openai') return items.modelOpenAI;
  return items.modelLocal || 'Xenova/whisper-small';
}

function setProviderModel(provider, value) {
  if (provider === 'groq') return { modelGroq: value };
  if (provider === 'openai') return { modelOpenAI: value };
  if (provider === 'local') return { modelLocal: value };
  return {};
}

function updateCostInfo(provider) {
  const meta = PROVIDER_META[provider];
  const model = modelSelect.value;
  const cost = (meta.costByModel && meta.costByModel[model]) || 'Cost varies by model';
  const extra = meta.minBillingNote ? `<br /><span style="opacity:.8">${meta.minBillingNote}</span>` : '';
  costInfo.innerHTML = `<strong>Approx cost:</strong> ${cost}${extra}`;
}

function setModelOptions(provider) {
  modelSelect.innerHTML = '';
  if (provider === 'local') {
    const localModels = [
      'Xenova/whisper-tiny',
      'Xenova/whisper-base',
      'Xenova/whisper-small',
      'Xenova/whisper-medium',
      'Xenova/whisper-large-v2',
      'Xenova/whisper-large-v3'
    ];
    localModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    modelSelect.disabled = false;
    fetchModelsBtn.disabled = true;
    fetchStatus.textContent = '';
    updateCostInfo(provider);
    return;
  }

  modelSelect.disabled = false;
  const defaultModels =
    provider === 'groq'
      ? ['whisper-large-v3-turbo', 'whisper-large-v3', 'distil-whisper-large-v3-en']
      : ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'];

  defaultModels.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  });
  updateCostInfo(provider);
}

function updateProviderUI(provider, items) {
  const meta = PROVIDER_META[provider];
  apiKeyLabel.textContent = meta.label;
  apiKeyInput.placeholder = meta.keyPlaceholder;
  apiKeyInput.value = provider === 'local' ? '' : (getProviderKey(provider, items) || '');
  apiKeyInput.disabled = provider === 'local';
  fetchModelsBtn.style.display = provider === 'groq' ? 'inline' : 'none';
  fetchModelsBtn.disabled = provider !== 'groq' || !apiKeyInput.value.trim().startsWith('gsk_');
  fetchStatus.textContent = '';
  helpText.innerHTML = meta.helpHtml;
  dangerNote.style.display = provider === 'local' ? 'none' : 'block';
  const showLocal = provider === 'local';
  downloadModelBtn.style.display = showLocal ? 'inline' : 'none';
  downloadStatus.style.display = showLocal ? 'block' : 'none';
  downloadStatus.textContent = '';

  setModelOptions(provider);
  const model = getProviderModel(provider, items);
  if (model && [...modelSelect.options].some(o => o.value === model)) {
    modelSelect.value = model;
  }
  updateCostInfo(provider);
}

saveBtn.addEventListener('click', () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  saveBtn.disabled = true;
  statusDiv.textContent = 'Saving…';
  statusDiv.style.color = 'inherit';

  const payload = {
    provider,
    ...setProviderKey(provider, apiKey),
    ...setProviderModel(provider, model)
  };

  chrome.storage.sync.set(payload, () => {
    statusDiv.textContent = 'Saved';
    statusDiv.style.color = 'green';
    saveBtn.disabled = false;
    setTimeout(() => (statusDiv.textContent = ''), 2500);
  });
});

providerSelect.addEventListener('change', () => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
    items.provider = providerSelect.value;
    updateProviderUI(providerSelect.value, items);
  });
});

modelSelect.addEventListener('change', () => updateCostInfo(providerSelect.value));

fetchModelsBtn.addEventListener('click', () => fetchModels());

downloadModelBtn.addEventListener('click', () => preloadLocalModel());

apiKeyInput.addEventListener('input', () => {
  const apiKey = apiKeyInput.value.trim();
  if (providerSelect.value === 'groq') {
    fetchModelsBtn.disabled = !apiKey.startsWith('gsk_');
    if (!apiKey.startsWith('gsk_')) fetchStatus.textContent = '';
  }
});

apiKeyInput.addEventListener('change', () => {
  if (providerSelect.value === 'groq') fetchModels();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'LOCAL_PROGRESS' && providerSelect.value === 'local') {
    if (message.model && message.model !== modelSelect.value) return;
    const payload = message.payload || {};
    const status = payload.status || 'downloading';
    if (typeof payload.progress === 'number') {
      const pct = payload.progress <= 1 ? Math.round(payload.progress * 100) : Math.round(payload.progress);
      downloadStatus.textContent = `${status} ${Math.min(pct, 100)}%`;
    } else if (typeof payload.loaded === 'number' && typeof payload.total === 'number' && payload.total > 0) {
      const pct = Math.round((payload.loaded / payload.total) * 100);
      downloadStatus.textContent = `${status} ${Math.min(pct, 100)}%`;
    } else if (payload.file) {
      downloadStatus.textContent = `${status}: ${payload.file}`;
    } else {
      downloadStatus.textContent = status;
    }
  }
});

async function preloadLocalModel() {
  if (providerSelect.value !== 'local') return;
  const model = modelSelect.value;
  downloadModelBtn.disabled = true;
  downloadStatus.textContent = 'Starting download…';
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LOCAL_PRELOAD',
      model
    });
    if (response && response.success) {
      downloadStatus.textContent = 'Model ready';
    } else {
      downloadStatus.textContent = 'Error: ' + ((response && response.error) || 'Download failed');
    }
  } catch (error) {
    downloadStatus.textContent = 'Error: ' + (error.message || 'Download failed');
  } finally {
    downloadModelBtn.disabled = false;
  }
}

async function fetchModels() {
  const provider = providerSelect.value;
  if (provider !== 'groq') return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey || !apiKey.startsWith('gsk_')) return;
  fetchModelsBtn.disabled = true;
  fetchStatus.textContent = 'Loading models…';
  fetchStatus.style.color = 'inherit';
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();
    const audioModels = (data.data || []).filter(m => /whisper|distil-whisper/i.test(m.id));
    modelSelect.innerHTML = '';
    audioModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id;
      modelSelect.appendChild(opt);
    });
    const preferred = ['whisper-large-v3-turbo', 'whisper-large-v3'];
    for (const p of preferred) {
      if ([...modelSelect.options].some(o => o.value === p)) {
        modelSelect.value = p;
        break;
      }
    }
    fetchStatus.textContent = 'Models updated';
    fetchStatus.style.color = 'green';
    updateCostInfo(provider);
  } catch (e) {
    fetchStatus.textContent = 'Error: ' + e.message;
    fetchStatus.style.color = 'red';
  } finally {
    fetchModelsBtn.disabled = false;
  }
}

loadSettings();
