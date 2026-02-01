// Our actual code that will run in the page's context
(async () => {
    console.log('Injected script waiting for WhatsApp require...');

    // Function to check if require is available and working
    const checkRequire = () => {
        try {
            if (typeof window.require === 'function') {
                return true;
            }
        } catch (err) {
            return false;
        }
        return false;
    };

    // Wait for require to be available
    while (!checkRequire()) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // At this point, require is available

    // Function to load WhatsApp modules with retry
    const loadWhatsAppModules = async (retryCount = 0, maxRetries = 3) => {
        try {
            window.Store = Object.assign({}, window.require('WAWebCollections'));

            const downloadManager = window.require('WAWebDownloadManager');
            window.Store.DownloadManager = downloadManager.downloadManager;

            window.Store.Validators = window.require('WALinkify');

            console.log('WhatsApp modules loaded successfully');
            return true;
        } catch (error) {
            console.warn(`Failed to load WhatsApp modules (attempt ${retryCount + 1}/${maxRetries}):`, error);

            if (retryCount < maxRetries) {
                console.log(`Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return loadWhatsAppModules(retryCount + 1, maxRetries);
            } else {
                console.error('Failed to load WhatsApp modules after maximum retries');
                return false;
            }
        }
    };

    // Initial load attempt
    await loadWhatsAppModules();

    window.WWebJS = {};

    window.WWebJS.getMessageModel = message => {
        const msg = message.serialize();

        msg.isEphemeral = message.isEphemeral;
        msg.isStatusV3 = message.isStatusV3;
        msg.links = (window.Store.Validators.findLinks(message.mediaObject ? message.caption : message.body)).map((link) => ({
            link: link.href,
            isSuspicious: Boolean(link.suspiciousCharacters && link.suspiciousCharacters.size)
        }));

        if (msg.buttons) {
            msg.buttons = msg.buttons.serialize();
        }
        if (msg.dynamicReplyButtons) {
            msg.dynamicReplyButtons = JSON.parse(JSON.stringify(msg.dynamicReplyButtons));
        }
        if (msg.replyButtons) {
            msg.replyButtons = JSON.parse(JSON.stringify(msg.replyButtons));
        }

        if (typeof msg.id.remote === 'object') {
            msg.id = Object.assign({}, msg.id, { remote: msg.id.remote._serialized });
        }

        delete msg.pendingAckUpdate;

        return msg;
    };

    // Cache of transcriptions pulled from extension storage
    let cachedTranscriptions = {};
    const pendingRequests = new Map();

    const isOutgoingId = (id) => typeof id === 'string' && id.startsWith('true_');
    const INBOUND_BUTTON_X = 470;
    const OUTBOUND_BUTTON_X = 470;
    const buttonAnchors = new WeakMap();

    const positionButton = (button, id) => {
        if (!button) return;
        const anchor = buttonAnchors.get(button);
        const host = (anchor && anchor.host) || button.offsetParent || button.parentElement;
        if (!host) return;

        const hostRect = host.getBoundingClientRect();
        const topPx = hostRect.height / 2;
        if (isOutgoingId(id)) {
            button.style.right = `${Math.round(OUTBOUND_BUTTON_X)}px`;
            button.style.left = 'auto';
        } else {
            button.style.left = `${Math.round(INBOUND_BUTTON_X)}px`;
            button.style.right = 'auto';
        }
        button.style.top = `${Math.round(topPx)}px`;
    };

    const requestSavedTranscriptions = () => {
        window.postMessage({ type: 'GET_SAVED_TRANSCRIPTIONS' }, '*');
    };

    requestSavedTranscriptions(); // initial load

    // Update the event listener for transcription responses
    window.addEventListener('message', function (event) {
        if (event.data.type === 'TRANSCRIBE_RESPONSE') {
            const messageId = event.data.messageId;
            const button = document.querySelector(`button[data-message-id="${messageId}"]`);
            const transcriptionContainer = document.querySelector(`div.transcription-container[data-message-id="${messageId}"]`);
            const textContentDiv = transcriptionContainer ? transcriptionContainer.querySelector('.transcription-text') : null;

            if (button && transcriptionContainer && textContentDiv) {
                const pending = pendingRequests.get(messageId);
                if (pending && pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
                pendingRequests.delete(messageId);
                const existingError = transcriptionContainer.querySelector('.error-message');
                if (existingError) existingError.remove();
                if (event.data.success) {
                    button.textContent = 'Transcribe again';
                    button.style.background = 'rgb(0 92 75)';
                    positionButton(button, messageId);
                    button.disabled = false;
                    transcriptionContainer.style.display = 'block';
                    textContentDiv.textContent = event.data.data.text;
                    // Content script persists it; update cache locally too
                    cachedTranscriptions[messageId] = { text: event.data.data.text, timestamp: Date.now() };
                } else {
                    console.error('Transcription Error:', event.data.error);
                    button.textContent = 'Error - Try again';
                    button.style.background = '#f44336';
                    positionButton(button, messageId);
                    button.disabled = false;

                    // Show error message
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'error-message';
                    errorMessage.style.cssText = `
                        font-size: 12px;
                        color: #f44336;
                        margin-top: 4px;
                        padding: 4px 8px;
                        border-radius: 4px;
                        background: #f44336;
                        color: white;
                    `;
                    if (event.data.options && /API MISSING OR INVALID/i.test(event.data.error || '')) {
                        errorMessage.innerHTML = event.data.error + ' <a href="#" id="open-settings" style="color:#0084ff;text-decoration:underline;">Open settings</a>';
                        errorMessage.querySelector('a').addEventListener('click', () => {
                            window.postMessage({ type: 'OPEN_SETTINGS' }, '*');
                        });
                    } else {
                        errorMessage.textContent = event.data.error;
                    }
                    transcriptionContainer.appendChild(errorMessage);
                }
            }
        }
    });

    // Listen for saved transcription payload
    window.addEventListener('message', function (event) {
        if (event.data.type === 'SAVED_TRANSCRIPTIONS') {
            cachedTranscriptions = event.data.payload || {};
            injectTranscribeButtons(document);
        }
    });

    function injectTranscribeButtons(root = document) {
        const canvases = root.querySelectorAll('canvas:not([data-watr-processed])');
        const savedTranscriptions = cachedTranscriptions;

        // Define SVG icons as constants to avoid repetition
        const SVG_ICONS = {
            COPY: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg>',
            SUCCESS: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>',
            ERROR: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>'
        };

        canvases.forEach(waveformContainer => {
            const messageElement = waveformContainer.closest('[data-id]');
            const id = messageElement ? messageElement.getAttribute('data-id') : null;
            if (!id || waveformContainer.dataset.watrProcessed) return;
            if (document.querySelector(`button.transcribe-btn[data-message-id="${id}"]`)) {
                waveformContainer.dataset.watrProcessed = 'true';
                return;
            }
            const storeMsg = window.Store && window.Store.Msg && window.Store.Msg.get ? window.Store.Msg.get(id) : null;
            const msgType = storeMsg && (storeMsg.type || (storeMsg.mediaData && storeMsg.mediaData.type));
            if (msgType && !(msgType === 'audio' || msgType === 'ptt')) {
                waveformContainer.dataset.watrProcessed = 'true';
                return;
            }
            if (!msgType) {
                const hasAudioPlay = messageElement && messageElement.querySelector('[data-icon="audio-play"], [data-icon="audio-pause"]');
                const ariaAudio = messageElement && messageElement.querySelector('[aria-label*="mensagem de voz" i], [aria-label*="voice message" i]');
                if (!hasAudioPlay && !ariaAudio) {
                    waveformContainer.dataset.watrProcessed = 'true';
                    return;
                }
            }

            // Find the parent row element
            const rowElement = messageElement.closest('[role="row"]');

            // Create transcribe button
            const button = document.createElement('button');
            button.className = 'transcribe-btn';
            button.textContent = 'Transcribe';
            button.dataset.messageId = id;  // Add message ID as data attribute
            button.style.cssText = `
          position: absolute;
          top: 0;
          transform: translateY(-50%);
          font-size: 12px;
          padding: 6px 10px;
          z-index: 1000;
          cursor: pointer;
          background: #00a884;
          color: white;
          border: none;
          border-radius: 4px;
        `;
            button.style.visibility = 'hidden';

            // Create transcription container (hidden initially)
            waveformContainer.style.position = 'relative';
            const transcriptionContainer = document.createElement('div');
            transcriptionContainer.className = 'transcription-container';
            transcriptionContainer.dataset.messageId = id;  // Add message ID as data attribute
            transcriptionContainer.style.cssText = `
            display: none;
            padding: 6px 8px 8px;
            margin: 0px 60px 4px;
            background: rgb(240, 242, 245);
            border-radius: 7.5px;
            margin-top: 2px;
            color: rgb(17, 27, 33);
            user-select: text;
            cursor: text;
            position: relative;
            overflow: hidden;
        `;

            // Create header div for copy button
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = `
            position: absolute;
            right: 6px;
            background: radial-gradient(circle at top right,rgb(240, 242, 245) 40%,rgba(var(--outgoing-background-rgb),0) 80%);
        `;

            // Add copy button to header
            const copyButton = document.createElement('button');
            copyButton.innerHTML = SVG_ICONS.COPY;
            copyButton.title = "Copy transcription";
            copyButton.style.cssText = `
            padding: 2px;
            cursor: pointer;
            background: transparent;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
            headerDiv.appendChild(copyButton);
            transcriptionContainer.appendChild(headerDiv);

            // Create a wrapper for the text content
            const textContentDiv = document.createElement('div');
            textContentDiv.className = 'transcription-text selectable-text';
            textContentDiv.style.cssText = `
            font-size: 14.2px;
            line-height: 19px;
            user-select: text;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            margin-top: 0;
            padding: 0;
        `;
            transcriptionContainer.appendChild(textContentDiv);

            // Small text at the bottom of the transcription container
            const smallText = document.createElement('p');
            smallText.innerHTML = 'This transcription is only visible to you through the WhatsApp Transcriber extension';
            smallText.style.cssText = `
            font-size: 11px;
            color: rgb(79 168 54);
            font-style: italic;
            margin: 8px 0 0;
            padding: 0;
        `;
            transcriptionContainer.appendChild(smallText);

            // Insert after the row element
            if ((rowElement && rowElement.nextSibling && !rowElement.nextSibling.classList.contains('transcription-container')) || (rowElement && rowElement === rowElement.parentNode.lastElementChild)) {
                rowElement.parentNode.insertBefore(transcriptionContainer, rowElement.nextSibling);
            }

            // Check if we have a saved transcription and change state
            if (savedTranscriptions[id]) {
                transcriptionContainer.style.display = 'block';
                textContentDiv.textContent = savedTranscriptions[id].text;
                button.textContent = 'Transcribe again';
                button.style.background = 'rgb(0 92 75)';
                positionButton(button, id);
            }

            // Add copy button click handler
            copyButton.addEventListener('click', async function () {
                // Get the text from the textContentDiv
                const textToCopy = textContentDiv.textContent;

                try {
                    // Use the Async Clipboard API
                    await navigator.clipboard.writeText(textToCopy);

                    // Visual feedback
                    const originalHTML = copyButton.innerHTML;
                    copyButton.innerHTML = SVG_ICONS.SUCCESS;
                    setTimeout(() => {
                        copyButton.innerHTML = originalHTML;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy using Clipboard API:', err);

                    // Fallback only if the browser doesn't support the API or if we're not in a secure context
                    if (!navigator.clipboard || !window.isSecureContext) {
                        const textarea = document.createElement('textarea');
                        textarea.value = textToCopy;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();

                        try {
                            document.execCommand('copy');
                            copyButton.innerHTML = SVG_ICONS.SUCCESS;
                        } catch (e) {
                            console.error('Fallback copy failed:', e);
                            copyButton.innerHTML = SVG_ICONS.ERROR;
                        }

                        document.body.removeChild(textarea);

                        setTimeout(() => {
                            copyButton.innerHTML = SVG_ICONS.COPY;
                        }, 2000);
                    } else {
                        // Show error indicator if Clipboard API fails in a secure context
                        copyButton.innerHTML = SVG_ICONS.ERROR;
                        setTimeout(() => {
                            copyButton.innerHTML = SVG_ICONS.COPY;
                        }, 2000);
                    }
                }
            });

            // Add transcribe button click handler
            button.addEventListener('click', async () => {
                try {
                    const existingError = transcriptionContainer.querySelector('.error-message');
                    if (existingError) existingError.remove();
                    button.textContent = 'Transcribing...';
                    positionButton(button, id);
                    button.disabled = true;
                    button.style.background = '#999999';
                    const timeoutId = setTimeout(() => {
                        button.textContent = 'Timed out';
                        positionButton(button, id);
                        button.style.background = '#f44336';
                        button.disabled = false;
                    }, 60000);
                    pendingRequests.set(id, { timeoutId });

                    const storeMsg = window.Store.Msg.get(id);

                    if (!storeMsg) {
                        throw new Error('Message not found');
                    }

                    let mediaData = storeMsg.mediaData;
                    const msgType = storeMsg.type || (mediaData && mediaData.type);

                    if (!(msgType === 'audio' || msgType === 'ptt')) {
                        button.textContent = 'Not an audio message';
                        positionButton(button, id);
                        button.style.background = '#f44336';
                        button.disabled = false;
                        return;
                    }

                    const dlMgr = window.Store.DownloadManager;
                    const signal = new AbortController().signal;

                    if (!mediaData && typeof storeMsg.downloadMedia === 'function') {
                        await storeMsg.downloadMedia({
                            downloadEvenIfExpensive: true,
                            rmrReason: 1
                        });
                        mediaData = storeMsg.mediaData;
                    }

                    if (mediaData) {
                        const stage = mediaData.mediaStage;
                        if (stage === 'REUPLOADING') {
                            throw new Error('Media expired (WhatsApp is reuploading)');
                        }
                        if (stage !== 'RESOLVED' && typeof storeMsg.downloadMedia === 'function') {
                            await storeMsg.downloadMedia({
                                downloadEvenIfExpensive: true,
                                rmrReason: 1
                            });
                            mediaData = storeMsg.mediaData || mediaData;
                        }
                        const refreshedStage = mediaData && mediaData.mediaStage;
                        if (refreshedStage === 'FETCHING' || (typeof refreshedStage === 'string' && refreshedStage.includes('ERROR'))) {
                            throw new Error('Media not ready for download');
                        }
                    }

                    let blobData;

                    if (dlMgr.downloadAndMaybeDecrypt && mediaData) {
                        const mockQpl = {
                            addAnnotations: function () { return this; },
                            addPoint: function () { return this; }
                        };
                        blobData = await dlMgr.downloadAndMaybeDecrypt({
                            directPath: mediaData.directPath || storeMsg.directPath,
                            encFilehash: mediaData.encFilehash || storeMsg.encFilehash,
                            filehash: mediaData.filehash || storeMsg.filehash,
                            mediaKey: mediaData.mediaKey || storeMsg.mediaKey,
                            mediaKeyTimestamp: mediaData.mediaKeyTimestamp || storeMsg.mediaKeyTimestamp,
                            type: msgType,
                            signal,
                            downloadQpl: mockQpl
                        });
                    } else if (dlMgr.downloadAndDecrypt) {
                        const mediaInfo = mediaData || storeMsg;
                        if (!mediaInfo || !mediaInfo.directPath) {
                            throw new Error('Missing media info for downloadAndDecrypt');
                        }
                        blobData = await dlMgr.downloadAndDecrypt({
                            directPath: mediaInfo.directPath,
                            encFilehash: mediaInfo.encFilehash,
                            filehash: mediaInfo.filehash,
                            mediaKey: mediaInfo.mediaKey,
                            mediaKeyTimestamp: mediaInfo.mediaKeyTimestamp,
                            type: msgType,
                            signal,
                        });
                    } else {
                        throw new Error('Download manager unavailable');
                    }

                    const mimeType = (mediaData && mediaData.mimetype) || 'audio/webm';
                    const blob = new Blob([blobData], { type: mimeType });
                    const reader = new FileReader();

                    reader.onload = async function () {
                        if (!reader.result || typeof reader.result !== 'string') return;

                        const audioData = reader.result.split(',')[1];

                        // Send message to content script
                        window.postMessage({
                            type: 'TRANSCRIBE_AUDIO',
                            audioData: audioData,
                            messageId: id,
                            mimeType
                        }, '*');
                    };

                    reader.readAsDataURL(blob);
                } catch (error) {
                    console.error('Processing Error:', error);
                    button.textContent = 'Error - Try again';
                    positionButton(button, id);
                    button.style.background = '#f44336';
                    button.disabled = false;
                    const pending = pendingRequests.get(id);
                    if (pending && pending.timeoutId) clearTimeout(pending.timeoutId);
                    pendingRequests.delete(id);
                }
            });

            const buttonHost = rowElement || messageElement || waveformContainer.parentElement || waveformContainer;
            if (buttonHost) {
                buttonHost.style.position = buttonHost.style.position || 'relative';
                buttonHost.style.overflow = 'visible';
                buttonHost.appendChild(button);
                buttonAnchors.set(button, { host: buttonHost });
                requestAnimationFrame(() => {
                    positionButton(button, id);
                    button.style.visibility = 'visible';
                });
            }
            waveformContainer.dataset.watrProcessed = 'true';
        });
    }

    async function setupMutationObserver(retries = 0) {
        const MAX_RETRIES = 5;
        const container = document.body;

        if (!container && retries < MAX_RETRIES) {
            console.log(`Message container not found - retry ${retries + 1}/${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return setupMutationObserver(retries + 1);
        }

        if (!container) {
            throw new Error('Failed to find message container after multiple attempts');
        }

        let scheduled = false;
        const scheduleInject = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                injectTranscribeButtons(document);
            });
        };

        new MutationObserver(scheduleInject).observe(container, {
            childList: true,
            subtree: true
        });

        console.log("Mutation observer active on:", container);
        return container;
    }

    injectTranscribeButtons(document);
    setupMutationObserver();
})();
