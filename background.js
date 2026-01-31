const DEFAULT_SETTINGS = {
  provider: 'groq',
  apiKeyGroq: '',
  apiKeyOpenAI: '',
  modelGroq: 'whisper-large-v3',
  modelOpenAI: 'gpt-4o-mini-transcribe',
  modelLocal: 'Xenova/whisper-small',
  localMode: 'browser'
};

function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve));
}

function base64ToBlob(base64, mimeType) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/webm' });
}

async function transcribeWithProvider({ audioData, mimeType }) {
  const settings = await getSettings();
  const provider = settings.provider || 'groq';

  if (provider === 'local') {
    try {
      const response = await sendToOffscreenWithRetry({
        type: 'LOCAL_TRANSCRIBE',
        model: settings.modelLocal || 'Xenova/whisper-small',
        audioData,
        mimeType
      });
      return response || { success: false, error: 'Local transcription failed' };
    } catch (error) {
      return { success: false, error: error.message || 'Local transcription failed' };
    }
  }

  const isGroq = provider === 'groq';
  const apiKey = isGroq ? settings.apiKeyGroq : settings.apiKeyOpenAI;
  const model = isGroq ? settings.modelGroq : settings.modelOpenAI;
  const apiBase = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';

  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      error: isGroq ? 'GROQ API MISSING OR INVALID' : 'OPENAI API MISSING OR INVALID',
      options: true
    };
  }
  if (isGroq && !apiKey.trim().startsWith('gsk_')) {
    return {
      success: false,
      error: 'GROQ API MISSING OR INVALID',
      options: true
    };
  }

  const formData = new FormData();
  const audioBlob = base64ToBlob(audioData, mimeType);
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', model);

  const response = await fetch(`${apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: formData
  });

  let result;
  try {
    result = await response.json();
  } catch (e) {
    result = null;
  }

  if (!response.ok) {
    const message =
      (result && result.error && result.error.message) ||
      (result && result.message) ||
      `Request failed (${response.status})`;
    return { success: false, error: message };
  }

  return { success: true, data: result };
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    throw new Error('Offscreen API not available in this Chrome version');
  }
  const hasDocument = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['BLOBS', 'AUDIO_PLAYBACK'],
      justification: 'Run local speech-to-text model in an offscreen context'
    });
  }
  await waitForOffscreenReady();
}

function sendToOffscreen(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ ...message, _target: 'offscreen' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function waitForOffscreenReady(retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ _target: 'offscreen', type: 'OFFSCREEN_PING' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(res);
        }
      });
    });
    if (response && response.ready) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Offscreen page not ready');
}

async function resetOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.closeDocument) {
    const hasDocument = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
    if (hasDocument) {
      await chrome.offscreen.closeDocument();
    }
  }
  await ensureOffscreenDocument();
}

async function sendToOffscreenWithRetry(message) {
  await ensureOffscreenDocument();
  let response = await sendToOffscreen(message);
  if (response && response.success === false && /message port closed/i.test(response.error || '')) {
    await resetOffscreenDocument();
    response = await sendToOffscreen(message);
  }
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'TRANSCRIBE_REQUEST') {
    transcribeWithProvider(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message || 'Unknown error' }));
    return true; // async response
  }

  if (message && message.type === 'OPEN_SETTINGS_TAB') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    sendResponse({ success: true });
  }

  if (message && message.type === 'LOCAL_PRELOAD') {
    (async () => {
      try {
        const response = await sendToOffscreenWithRetry({
          type: 'LOCAL_PRELOAD',
          model: message.model
        });
        sendResponse(response || { success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || 'Local preload failed' });
      }
    })();
    return true;
  }
});

// On install, open a settings tab (cannot auto-open popup directly)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});
