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

    // Load saved transcriptions from localStorage
    const loadSavedTranscriptions = () => {
        const saved = localStorage.getItem('whatsappTranscriptions');
        if (!saved) return {};
        const transcriptions = JSON.parse(saved);

        // Remove transcriptions older than 3 days
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        Object.keys(transcriptions).forEach(key => {
            if (transcriptions[key].timestamp < threeDaysAgo) {
                delete transcriptions[key];
            }
        });

        return transcriptions;
    };

    // Save transcription to localStorage
    const saveTranscription = (messageId, text) => {
        const transcriptions = loadSavedTranscriptions();
        transcriptions[messageId] = {
            text,
            timestamp: Date.now()
        };
        localStorage.setItem('whatsappTranscriptions', JSON.stringify(transcriptions));
    };

    // Update the event listener for transcription responses
    window.addEventListener('message', function(event) {
        if (event.data.type === 'TRANSCRIBE_RESPONSE') {
            const messageId = event.data.messageId;
            const button = document.querySelector(`button[data-message-id="${messageId}"]`);
            const transcriptionContainer = document.querySelector(`div.transcription-container[data-message-id="${messageId}"]`);
            const textContentDiv = transcriptionContainer ? transcriptionContainer.querySelector('.transcription-text') : null;

            if (button && transcriptionContainer && textContentDiv) {
                if (event.data.success) {
                    button.textContent = 'Transcribe again';
                    button.style.background = 'rgb(0 92 75)';
                    button.disabled = false;
                    transcriptionContainer.style.display = 'block';
                    textContentDiv.textContent = event.data.data.text;
                    // Save transcription
                    saveTranscription(messageId, event.data.data.text);
                } else {
                    console.error('GROQ API Error:', event.data.error);
                    button.textContent = 'Error - Try again';
                    button.style.background = '#f44336';
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
                    if (event.data.options && event.data.error === "GROQ API MISSING OR INVALID") {
                        errorMessage.innerHTML = event.data.error + ' <a href="#" id="open-options" style="color:#0084ff;text-decoration:underline;">Open extension options</a>';
                        errorMessage.querySelector('a').addEventListener('click', () => {
                            window.postMessage({ type: 'OPEN_OPTIONS_PAGE' }, '*');
                        });
                    } else {
                        errorMessage.textContent = event.data.error;
                    }
                    transcriptionContainer.appendChild(errorMessage);
                }
            }
        }
    });

    function injectTranscribeButtons() {
      const messages = document.querySelectorAll('[data-id]');
      const savedTranscriptions = loadSavedTranscriptions();

      // Define SVG icons as constants to avoid repetition
      const SVG_ICONS = {
        COPY: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg>',
        SUCCESS: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>',
        ERROR: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="gray"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>'
      };

      messages.forEach(messageElement => {
        const id = messageElement.getAttribute('data-id');
        if (!id || !id.startsWith('false_')) return;
        const waveformContainer = messageElement.querySelector('canvas');
        if (!waveformContainer || waveformContainer.dataset.hasButton) return;

        // Find the parent row element
        const rowElement = messageElement.closest('[role="row"]');

        // Create transcribe button
        const button = document.createElement('button');
        button.className = 'transcribe-btn';
        button.textContent = 'Transcribe';
        button.dataset.messageId = id;  // Add message ID as data attribute
        button.style.cssText = `
          position: absolute;
          right: -200px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 12px;
          padding: 4px 8px;
          z-index: 1000;
          cursor: pointer;
          background: #00a884;
          color: white;
          border: none;
          border-radius: 4px;
        `;

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
        textContentDiv.className = 'transcription-text';
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
        }

        // Add copy button click handler
        copyButton.addEventListener('click', async function() {
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
            button.textContent = 'Transcribing...';
            button.disabled = true;
            button.style.background = '#999999';

            const storeMsg = window.Store.Msg.get(id);
            const msg = window.WWebJS.getMessageModel(storeMsg);
            const dlFn = window.Store.DownloadManager.downloadAndDecrypt || window.Store.DownloadManager.downloadAndMaybeDecrypt;

            if (msg && msg.type === 'audio' || msg.type === 'ptt') {
              const blobData = await dlFn({
                directPath: msg.directPath,
                encFilehash: msg.encFilehash,
                filehash: msg.filehash,
                mediaKey: msg.mediaKey,
                mediaKeyTimestamp: msg.mediaKeyTimestamp,
                type: msg.type,
                signal: new AbortController().signal,
              });

              const blob = new Blob([blobData], { type: 'application/octet-stream' });
              const reader = new FileReader();

              reader.onload = async function() {
                if (!reader.result || typeof reader.result !== 'string') return;

                const audioData = reader.result.split(',')[1];

                // Send message to content script
                window.postMessage({
                  type: 'TRANSCRIBE_AUDIO',
                  audioData: audioData,
                  messageId: id
                }, '*');
              };

              reader.readAsDataURL(blob);
            }
          } catch (error) {
            console.error('Processing Error:', error);
            button.textContent = 'Error - Try again';
            button.style.background = '#f44336';
            button.disabled = false;
          }
        });

        waveformContainer.parentElement.appendChild(button);
        waveformContainer.dataset.hasButton = 'true';
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

      new MutationObserver(injectTranscribeButtons).observe(container, {
        childList: true,
        subtree: true
      });

      console.log("Mutation observer active on:", container);
      return container;
    }

    setupMutationObserver();
})();