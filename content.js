// Listen for messages from the injected script
window.addEventListener('message', async function (event) {
    // We only accept messages from ourselves
    if (event.source != window) return;

    if (event.data.type === 'TRANSCRIBE_AUDIO') {
        try {
            // Convert base64 to blob
            const binaryStr = atob(event.data.audioData);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: 'audio/webm' });

            // Create FormData and append the audio file
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            // Retrieve API key and model from storage
            const settings = await new Promise(resolve => chrome.storage.sync.get({ apiKey: '', model: 'whisper-large-v3' }, resolve));

            // Validate that we have a proper API key that starts with "gsk_"
            if (!settings.apiKey || !settings.apiKey.trim() || !settings.apiKey.startsWith('gsk_')) {
                console.error('GROQ API key is missing or invalid! Please configure it in the extension options.');
                window.postMessage({
                    type: 'TRANSCRIBE_RESPONSE',
                    messageId: event.data.messageId,
                    success: false,
                    error: "GROQ API MISSING OR INVALID",
                    options: true
                }, '*');
                return; // Stop execution if no valid API key
            }

            formData.append('model', settings.model);

            // Make API call directly from content script
            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${settings.apiKey.trim()}`
                },
                body: formData
            });

            const result = await response.json();

            // Send response back to injected script
            window.postMessage({
                type: 'TRANSCRIBE_RESPONSE',
                messageId: event.data.messageId,
                success: true,
                data: result
            }, '*');
        } catch (error) {
            console.error('GROQ API Error:', error);
            window.postMessage({
                type: 'TRANSCRIBE_RESPONSE',
                messageId: event.data.messageId,
                success: false,
                error: error.message
            }, '*');
        }
    }


    if (event.data.type === 'OPEN_OPTIONS_PAGE') {
        chrome.runtime.sendMessage({ action: "openOptions" });
    }
}, false);

// Inject our script into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();