/**
 * Lazy Mode Extension for SillyTavern
 * 
 * Generates AI-powered action suggestions for the user's character.
 * Inspired by SillyTavern-Roadway, styled after TunnelVision.
 */

import { eventSource, event_types } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const MODULE_NAME = 'lazy_mode';
const EXTENSION_FOLDER = 'third-party/lazy-mode';

const DEFAULT_PROMPT = `Based on the current conversation context, generate {{count}} creative and varied action suggestions for {{user}}'s next move.

Consider:
- Dialogue options (talk to characters, ask questions, make statements)
- Physical actions (move, interact with objects, examine surroundings)
- Emotional responses (react to events, express feelings, make decisions)
- Strategic choices (plan ahead, use items, prepare for threats)

Format each suggestion as a numbered list item (1., 2., 3., etc.).
Keep each suggestion concise (1-2 sentences).
Make them diverse and interesting, not just generic actions.`;

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    prompt: DEFAULT_PROMPT,
    connectionProfile: '',
    maxTokens: 500,
    numSuggestions: 4,
    autoTrigger: false,
    autoOpen: true,
    showUseButton: true,
    autoSend: false,
    allowEdit: true,
});

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }
    return extension_settings[MODULE_NAME];
}

function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Checks if the extension is enabled
 */
function isEnabled() {
    return getSettings().enabled;
}

/**
 * Adds the lazy-mode button to a message element
 */
function addLazyButton(messageElement, messageId) {
    if (!messageElement) return;
    
    const extraButtons = messageElement.querySelector('.extraMesButtons');
    if (!extraButtons) return;
    
    if (extraButtons.querySelector('.lm-message-btn')) return;
    
    const button = document.createElement('div');
    button.className = 'lm-message-btn fa-solid fa-couch';
    button.title = 'Generate action suggestions';
    button.dataset.messageId = messageId;
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        handleLazyButtonClick(messageId, button);
    });
    
    extraButtons.insertBefore(button, extraButtons.firstChild);
}

/**
 * Handles clicking the lazy-mode button
 */
async function handleLazyButtonClick(messageId, button) {
    if (!isEnabled()) {
        toastr.warning('Lazy Mode is disabled. Enable it in extension settings.', 'Lazy Mode');
        return;
    }
    
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];
    if (!message) return;
    
    button.classList.add('lm-spinning');
    
    try {
        await generateSuggestions(messageId);
    } catch (error) {
        console.error('[Lazy Mode] Error generating suggestions:', error);
        toastr.error('Failed to generate suggestions: ' + error.message, 'Lazy Mode');
    } finally {
        button.classList.remove('lm-spinning');
    }
}

/**
 * Generates action suggestions using the configured API
 */
async function generateSuggestions(targetMessageId) {
    const settings = getSettings();
    const context = SillyTavern.getContext();
    
    const promptText = settings.prompt
        .replace(/{{user}}/gi, context.name1)
        .replace(/{{char}}/gi, context.name2)
        .replace(/{{count}}/gi, settings.numSuggestions);
    
    const messages = buildMessagesUpTo(targetMessageId, promptText);
    
    let response;
    if (settings.connectionProfile) {
        response = await generateWithProfile(messages, settings);
    } else {
        response = await generateWithMainAPI(messages, settings);
    }
    
    const suggestions = parseSuggestions(response, settings.numSuggestions);
    insertSuggestionsMessage(targetMessageId, suggestions, response);
}

/**
 * Builds the message array up to the target message
 */
function buildMessagesUpTo(targetMessageId, promptText) {
    const context = SillyTavern.getContext();
    const messages = [];
    
    for (let i = 0; i <= targetMessageId && i < context.chat.length; i++) {
        const msg = context.chat[i];
        if (!msg || !msg.mes) continue;
        
        messages.push({
            role: msg.is_user ? 'user' : 'assistant',
            content: msg.mes,
            name: msg.name || (msg.is_user ? context.name1 : context.name2),
        });
    }
    
    messages.push({
        role: 'user',
        content: promptText,
    });
    
    return messages;
}

/**
 * Generates text using a connection profile
 */
async function generateWithProfile(messages, settings) {
    const context = SillyTavern.getContext();
    
    const requestBody = {
        messages: messages,
        max_tokens: settings.maxTokens,
        temperature: 0.8,
    };
    
    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Connection-Profile': settings.connectionProfile,
        },
        body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.text || '';
}

/**
 * Generates text using the main API
 */
async function generateWithMainAPI(messages, settings) {
    const { generateRaw } = SillyTavern.getContext();
    
    const prompt = messages.map(m => {
        if (m.role === 'system') return `System: ${m.content}`;
        if (m.role === 'user') return `${m.name || 'User'}: ${m.content}`;
        return `${m.name || 'Assistant'}: ${m.content}`;
    }).join('\n\n');
    
    const result = await generateRaw({
        prompt: prompt,
        maxTokens: settings.maxTokens,
        temperature: 0.8,
    });
    
    return result;
}

/**
 * Parses suggestions from the AI response
 */
function parseSuggestions(response, maxCount) {
    if (!response) return [];
    
    const lines = response.split('\n').filter(line => line.trim());
    const suggestions = [];
    
    const numberedRegex = /^\s*(?:\d+[.):\-\s]+)\s*(.+)$/;
    const bulletRegex = /^\s*(?:[-*+])\s*(.+)$/;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        let match = trimmed.match(numberedRegex);
        if (!match) {
            match = trimmed.match(bulletRegex);
        }
        
        if (match) {
            suggestions.push(match[1].trim());
        } else if (suggestions.length === 0 && trimmed.length > 10) {
            suggestions.push(trimmed);
        }
        
        if (suggestions.length >= maxCount) break;
    }
    
    return suggestions;
}

/**
 * Inserts a suggestions message into the chat
 */
function insertSuggestionsMessage(targetMessageId, suggestions, rawContent) {
    const context = SillyTavern.getContext();
    const settings = getSettings();
    
    const existingIndex = findExistingSuggestions(targetMessageId);
    
    const suggestionData = {
        targetMessageId: targetMessageId,
        suggestions: suggestions,
        rawContent: rawContent,
    };
    
    const messageHtml = buildSuggestionsHtml(suggestionData, settings);
    
    const message = {
        name: 'Lazy Mode',
        is_user: false,
        is_system: true,
        send_date: Date.now(),
        mes: messageHtml,
        extra: {
            isSmallSys: true,
            lazy_mode_data: suggestionData,
        },
    };
    
    if (existingIndex >= 0) {
        context.chat[existingIndex] = message;
        updateMessageInUI(existingIndex, message);
    } else {
        const insertIndex = targetMessageId + 1;
        context.chat.splice(insertIndex, 0, message);
        context.addOneMessage(message, { insertAt: insertIndex });
    }
    
    context.saveChat();
}

/**
 * Finds existing suggestions for a target message
 */
function findExistingSuggestions(targetMessageId) {
    const context = SillyTavern.getContext();
    for (let i = 0; i < context.chat.length; i++) {
        const msg = context.chat[i];
        if (msg?.extra?.lazy_mode_data?.targetMessageId === targetMessageId) {
            return i;
        }
    }
    return -1;
}

/**
 * Updates a message in the UI without re-rendering the whole chat
 */
function updateMessageInUI(messageId, message) {
    const messageBlock = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!messageBlock) return;
    
    const mesText = messageBlock.querySelector('.mes_text');
    if (mesText) {
        mesText.innerHTML = message.mes;
        bindSuggestionEvents(messageBlock, message.extra?.lazy_mode_data);
    }
}

/**
 * Builds the HTML for suggestions display
 */
function buildSuggestionsHtml(data, settings) {
    const { suggestions } = data;
    const isOpen = settings.autoOpen ? 'open' : '';
    
    let cardsHtml = '';
    for (let i = 0; i < suggestions.length; i++) {
        cardsHtml += buildSuggestionCard(i, suggestions[i], settings);
    }
    
    return `
        <div class="lm-suggestions-container">
            <details class="lm-suggestions-details" ${isOpen}>
                <summary class="lm-suggestions-summary">
                    <span class="lm-suggestions-icon">🛋️</span>
                    <span class="lm-suggestions-title">Lazy Mode Suggestions</span>
                    <span class="lm-count-badge">${suggestions.length}</span>
                </summary>
                <div class="lm-suggestions-grid">
                    ${cardsHtml}
                </div>
            </details>
        </div>
    `;
}

/**
 * Builds a single suggestion card
 */
function buildSuggestionCard(index, text, settings) {
    const useButton = settings.showUseButton 
        ? `<button class="lm-suggestion-btn lm-suggestion-use" data-action="use" title="Use this suggestion">
            <i class="fa-solid fa-play"></i>
           </button>` 
        : '';
    
    const editButton = settings.allowEdit
        ? `<button class="lm-suggestion-btn lm-suggestion-edit" data-action="edit" title="Edit this suggestion">
            <i class="fa-solid fa-pen"></i>
           </button>`
        : '';
    
    return `
        <div class="lm-suggestion-card" data-index="${index}">
            <div class="lm-suggestion-content">${escapeHtml(text)}</div>
            <div class="lm-suggestion-actions">
                ${useButton}
                ${editButton}
                <button class="lm-suggestion-btn lm-suggestion-impersonate" data-action="impersonate" title="Generate as {{user}}">
                    <i class="fa-solid fa-user-pen"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Binds events to suggestion buttons
 */
function bindSuggestionEvents(messageBlock, data) {
    if (!data) return;
    
    const cards = messageBlock.querySelectorAll('.lm-suggestion-card');
    cards.forEach(card => {
        const index = parseInt(card.dataset.index);
        const text = data.suggestions[index];
        if (text === undefined) return;
        
        const buttons = card.querySelectorAll('.lm-suggestion-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSuggestionAction(btn.dataset.action, text, card);
            });
        });
    });
}

/**
 * Handles suggestion action button clicks
 */
async function handleSuggestionAction(action, text, card) {
    const settings = getSettings();
    
    switch (action) {
        case 'use':
            await useSuggestion(text, card);
            break;
        case 'edit':
            startEditing(card, text);
            break;
        case 'impersonate':
            await impersonateSuggestion(text);
            break;
    }
}

/**
 * Inserts a suggestion into the input textarea
 */
async function useSuggestion(text, card) {
    const context = SillyTavern.getContext();
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    const useBtn = card.querySelector('.lm-suggestion-use');
    if (useBtn) {
        const originalHtml = useBtn.innerHTML;
        useBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        useBtn.classList.add('lm-suggestion-used');
        setTimeout(() => {
            useBtn.innerHTML = originalHtml;
            useBtn.classList.remove('lm-suggestion-used');
        }, 1000);
    }
    
    if (getSettings().autoSend) {
        const sendButton = document.getElementById('send_but');
        if (sendButton) {
            sendButton.click();
        }
    }
}

/**
 * Starts inline editing of a suggestion
 */
function startEditing(card, text) {
    const contentDiv = card.querySelector('.lm-suggestion-content');
    if (!contentDiv) return;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'lm-suggestion-edit-input';
    textarea.value = text;
    textarea.rows = 2;
    
    const saveEdit = () => {
        const newText = textarea.value.trim();
        if (newText) {
            contentDiv.textContent = newText;
            updateSuggestionData(card, newText);
        } else {
            contentDiv.textContent = text;
        }
    };
    
    textarea.addEventListener('blur', saveEdit);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textarea.blur();
        }
    });
    
    contentDiv.innerHTML = '';
    contentDiv.appendChild(textarea);
    textarea.focus();
    textarea.select();
}

/**
 * Updates the suggestion data after editing
 */
function updateSuggestionData(card, newText) {
    const messageBlock = card.closest('.mes');
    if (!messageBlock) return;
    
    const messageId = parseInt(messageBlock.getAttribute('mesid'));
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];
    
    if (message?.extra?.lazy_mode_data) {
        const index = parseInt(card.dataset.index);
        message.extra.lazy_mode_data.suggestions[index] = newText;
        context.saveChat();
    }
}

/**
 * Triggers an impersonate generation based on a suggestion
 */
async function impersonateSuggestion(text) {
    const context = SillyTavern.getContext();
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    
    const impersonatePrompt = `Continue the scene by writing {{user}}'s next action or dialogue based on this idea: "${text}". Write only {{user}}'s response, in first person.`;
    
    textarea.value = `/impersonate ${impersonatePrompt}`;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    const sendButton = document.getElementById('send_but');
    if (sendButton) {
        sendButton.click();
    }
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Processes all visible messages to add lazy-mode buttons
 */
function processVisibleMessages() {
    if (!isEnabled()) return;
    
    const messageBlocks = document.querySelectorAll('.mes');
    messageBlocks.forEach(block => {
        const messageId = parseInt(block.getAttribute('mesid'));
        const message = SillyTavern.getContext().chat[messageId];
        
        if (message && !message.is_user && !message.is_system) {
            addLazyButton(block, messageId);
        }
    });
}

/**
 * Re-binds events to existing suggestion messages after chat changes
 */
function rebindExistingSuggestions() {
    const context = SillyTavern.getContext();
    const messageBlocks = document.querySelectorAll('.mes');
    
    messageBlocks.forEach(block => {
        const messageId = parseInt(block.getAttribute('mesid'));
        const message = context.chat[messageId];
        
        if (message?.extra?.lazy_mode_data) {
            bindSuggestionEvents(block, message.extra.lazy_mode_data);
        }
    });
}

/**
 * Sets up the settings UI and event handlers
 */
async function setupSettings() {
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_FOLDER, 'settings');
    const container = document.getElementById('extensions_settings2');
    if (!container) return;
    
    container.insertAdjacentHTML('beforeend', settingsHtml);
    
    const settings = getSettings();
    
    // Master toggle
    const masterToggle = document.getElementById('lm_master_toggle');
    if (masterToggle) {
        masterToggle.checked = settings.enabled;
        masterToggle.addEventListener('change', () => {
            settings.enabled = masterToggle.checked;
            saveSettings();
            if (settings.enabled) {
                processVisibleMessages();
            }
        });
    }
    
    // Prompt
    const promptText = document.getElementById('lm_prompt_text');
    if (promptText) {
        promptText.value = settings.prompt;
        promptText.addEventListener('input', () => {
            settings.prompt = promptText.value;
            saveSettings();
        });
    }
    
    // Restore default prompt
    const restoreBtn = document.getElementById('lm_restore_default_prompt');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            settings.prompt = DEFAULT_PROMPT;
            if (promptText) promptText.value = DEFAULT_PROMPT;
            saveSettings();
            toastr.success('Default prompt restored', 'Lazy Mode');
        });
    }
    
    // Connection profile
    const profileSelect = document.getElementById('lm_connection_profile');
    if (profileSelect) {
        populateConnectionProfiles(profileSelect);
        profileSelect.value = settings.connectionProfile;
        profileSelect.addEventListener('change', () => {
            settings.connectionProfile = profileSelect.value;
            saveSettings();
        });
    }
    
    // Max tokens
    const maxTokens = document.getElementById('lm_max_tokens');
    if (maxTokens) {
        maxTokens.value = settings.maxTokens;
        maxTokens.addEventListener('input', () => {
            settings.maxTokens = parseInt(maxTokens.value) || 500;
            saveSettings();
        });
    }
    
    // Number of suggestions
    const numSuggestions = document.getElementById('lm_num_suggestions');
    if (numSuggestions) {
        numSuggestions.value = settings.numSuggestions;
        numSuggestions.addEventListener('input', () => {
            settings.numSuggestions = parseInt(numSuggestions.value) || 4;
            saveSettings();
        });
    }
    
    // Auto trigger
    const autoTrigger = document.getElementById('lm_auto_trigger');
    if (autoTrigger) {
        autoTrigger.checked = settings.autoTrigger;
        autoTrigger.addEventListener('change', () => {
            settings.autoTrigger = autoTrigger.checked;
            saveSettings();
        });
    }
    
    // Auto open
    const autoOpen = document.getElementById('lm_auto_open');
    if (autoOpen) {
        autoOpen.checked = settings.autoOpen;
        autoOpen.addEventListener('change', () => {
            settings.autoOpen = autoOpen.checked;
            saveSettings();
        });
    }
    
    // Show use button
    const showUseButton = document.getElementById('lm_show_use_button');
    if (showUseButton) {
        showUseButton.checked = settings.showUseButton;
        showUseButton.addEventListener('change', () => {
            settings.showUseButton = showUseButton.checked;
            saveSettings();
        });
    }
    
    // Auto send
    const autoSend = document.getElementById('lm_auto_send');
    if (autoSend) {
        autoSend.checked = settings.autoSend;
        autoSend.addEventListener('change', () => {
            settings.autoSend = autoSend.checked;
            saveSettings();
        });
    }
    
    // Allow edit
    const allowEdit = document.getElementById('lm_allow_edit');
    if (allowEdit) {
        allowEdit.checked = settings.allowEdit;
        allowEdit.addEventListener('change', () => {
            settings.allowEdit = allowEdit.checked;
            saveSettings();
        });
    }
    
    // Collapsible card headers
    document.querySelectorAll('.lm-card-header-collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const collapseKey = header.dataset.collapse;
            const body = document.getElementById(`lm_${collapseKey}_body`);
            if (body) {
                const isExpanded = body.style.display !== 'none';
                body.style.display = isExpanded ? 'none' : 'block';
                header.classList.toggle('expanded', !isExpanded);
            }
        });
    });
}

/**
 * Populates the connection profile dropdown
 */
function populateConnectionProfiles(select) {
    // This would ideally fetch from SillyTavern's connection manager
    // For now, we'll leave it with just the default option
    // Users can type in custom profile names if needed
}

/**
 * Handles auto-trigger on new character messages
 */
function handleCharacterMessageRendered(data) {
    if (!isEnabled()) return;
    if (!getSettings().autoTrigger) return;
    
    const messageId = typeof data === 'number' ? data : data?.messageId;
    if (messageId === undefined) return;
    
    const context = SillyTavern.getContext();
    const message = context.chat[messageId];
    if (!message || message.is_user || message.is_system) return;
    
    // Add button first
    setTimeout(() => {
        const messageBlock = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageBlock) {
            addLazyButton(messageBlock, messageId);
        }
        
        // Auto-generate suggestions
        generateSuggestions(messageId).catch(err => {
            console.error('[Lazy Mode] Auto-trigger failed:', err);
        });
    }, 100);
}

// Event listeners
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleCharacterMessageRendered);

eventSource.on(event_types.CHAT_CHANGED, () => {
    setTimeout(() => {
        processVisibleMessages();
        rebindExistingSuggestions();
    }, 500);
});

eventSource.on(event_types.MESSAGE_DELETED, () => {
    setTimeout(processVisibleMessages, 100);
});

eventSource.on(event_types.MESSAGE_EDITED, () => {
    setTimeout(processVisibleMessages, 100);
});

// Initialize when app is ready
eventSource.on(event_types.APP_READY, async () => {
    await setupSettings();
    processVisibleMessages();
    rebindExistingSuggestions();
    console.log('[Lazy Mode] Extension loaded');
});

// Also process on initial load in case APP_READY already fired
jQuery(async () => {
    if (SillyTavern?.getContext()?.chat?.length > 0) {
        await setupSettings();
        processVisibleMessages();
        rebindExistingSuggestions();
    }
});
