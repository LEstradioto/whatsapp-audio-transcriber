// Popup script: manage GROQ API key + model selection

const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
const fetchModelsBtn = document.getElementById('fetchModelsBtn');
const fetchStatus = document.getElementById('fetchStatus');

// Load existing settings
chrome.storage.sync.get({ apiKey: '', model: 'whisper-large-v3' }, items => {
    apiKeyInput.value = items.apiKey;
    modelSelect.value = items.model;
    if (items.apiKey && items.apiKey.startsWith('gsk_')) {
        fetchModels();
    } else {
        fetchModelsBtn.disabled = true;
    }
});

saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    saveBtn.disabled = true;
    statusDiv.textContent = 'Saving…';
    statusDiv.style.color = 'inherit';
    chrome.storage.sync.set({ apiKey, model }, () => {
        statusDiv.textContent = 'Saved';
        statusDiv.style.color = 'green';
        saveBtn.disabled = false;
        setTimeout(() => statusDiv.textContent = '', 2500);
    });
});

fetchModelsBtn.addEventListener('click', () => fetchModels());

apiKeyInput.addEventListener('input', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey.startsWith('gsk_')) {
        fetchModelsBtn.disabled = false;
    } else {
        fetchModelsBtn.disabled = true;
        fetchStatus.textContent = '';
    }
});

apiKeyInput.addEventListener('change', () => {
    fetchModels();
});

async function fetchModels() {
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
            opt.value = m.id; opt.textContent = m.id; modelSelect.appendChild(opt);
        });
        const preferred = ['whisper-large-v3-turbo', 'whisper-large-v3'];
        for (const p of preferred) {
            if ([...modelSelect.options].some(o => o.value === p)) { modelSelect.value = p; break; }
        }
        fetchStatus.textContent = 'Models updated';
        fetchStatus.style.color = 'green';
    } catch (e) {
        fetchStatus.textContent = 'Error: ' + e.message;
        fetchStatus.style.color = 'red';
    } finally {
        fetchModelsBtn.disabled = false;
    }
}
