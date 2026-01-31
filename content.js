// Helper: fetch transcripts map from chrome.storage.local
async function getTranscriptions() {
    return await new Promise(resolve => chrome.storage.local.get({ transcriptions: {} }, items => resolve(items.transcriptions)));
}

const TRANSCRIPTION_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_TRANSCRIPTIONS = 1000;

// TTL + size cleanup
async function pruneOld(transcriptions) {
    const threeDaysAgo = Date.now() - TRANSCRIPTION_TTL_MS;
    let changed = false;
    for (const k of Object.keys(transcriptions)) {
        if (transcriptions[k].timestamp < threeDaysAgo) { delete transcriptions[k]; changed = true; }
    }
    const keys = Object.keys(transcriptions);
    if (keys.length > MAX_TRANSCRIPTIONS) {
        const sorted = keys.sort((a, b) => (transcriptions[a].timestamp || 0) - (transcriptions[b].timestamp || 0));
        const toRemove = sorted.slice(0, keys.length - MAX_TRANSCRIPTIONS);
        for (const k of toRemove) {
            delete transcriptions[k];
        }
        changed = true;
    }
    if (changed) {
        await new Promise(r => chrome.storage.local.set({ transcriptions }, r));
    }
    return transcriptions;
}

async function saveTranscription(messageId, text) {
    const transcriptions = await getTranscriptions();
    transcriptions[messageId] = { text, timestamp: Date.now() };
    await new Promise(r => chrome.storage.local.set({ transcriptions }, r));
}

// Listen for messages from the injected script
window.addEventListener('message', async function (event) {
    // We only accept messages from ourselves
    if (event.source != window) return;

    if (event.data.type === 'TRANSCRIBE_AUDIO') {
        try {
            if (!event.data.messageId || !event.data.audioData) return;
            const button = document.querySelector(`button.transcribe-btn[data-message-id="${event.data.messageId}"]`);
            if (!button) return;
            const result = await safeSendMessage({
                type: 'TRANSCRIBE_REQUEST',
                audioData: event.data.audioData,
                mimeType: event.data.mimeType || 'audio/webm',
                messageId: event.data.messageId
            });

            // Send response back to injected script
            window.postMessage({
                type: 'TRANSCRIBE_RESPONSE',
                messageId: event.data.messageId,
                success: Boolean(result && result.success),
                data: result && result.data,
                error: result && result.error,
                options: result && result.options
            }, '*');
            // Persist transcription text if available
            if (result && result.data && result.data.text) {
                saveTranscription(event.data.messageId, result.data.text);
            }
        } catch (error) {
            console.error('Transcription Error:', error);
            window.postMessage({
                type: 'TRANSCRIBE_RESPONSE',
                messageId: event.data.messageId,
                success: false,
                error: error.message
            }, '*');
        }
    }

    if (event.data.type === 'GET_SAVED_TRANSCRIPTIONS') {
        const transcriptions = await pruneOld(await getTranscriptions());
        window.postMessage({ type: 'SAVED_TRANSCRIPTIONS', payload: transcriptions }, '*');
    }

    if (event.data.type === 'OPEN_SETTINGS') {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS_TAB' });
        }
    }
}, false);

// Inject our script into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

async function safeSendMessage(payload) {
    if (!chrome.runtime || !chrome.runtime.id) {
        return {
            success: false,
            error: 'Extension context invalidated. Refresh WhatsApp Web and try again.'
        };
    }
    try {
        return await chrome.runtime.sendMessage(payload);
    } catch (error) {
        return {
            success: false,
            error: 'Extension context invalidated. Refresh WhatsApp Web and try again.'
        };
    }
}
