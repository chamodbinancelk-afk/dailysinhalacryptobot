// telegram.js

import { CONFIG, PERMISSIONS } from './config.js';

// --- Telegram API Utilities ---

/**
 * Sends a message to Telegram. (Unified)
 * (Cloudflare Workers fetch වෙනුවට සාමාන්‍ය Node.js fetch භාවිත කරයි)
 */
export async function sendUnifiedMessage(chatId, message, parseMode = 'Markdown', imgUrl = null, replyMarkup = null, replyToId = null) {
    const TELEGRAM_API_URL = CONFIG.TELEGRAM_API_BASE; 
    let apiMethod = imgUrl ? 'sendPhoto' : 'sendMessage';
    let payload = { chat_id: chatId, parse_mode: parseMode };

    if (apiMethod === 'sendPhoto' && imgUrl) {
        payload.photo = imgUrl;
        payload.caption = message;
    } else {
        payload.text = message;
        apiMethod = 'sendMessage'; 
    }
    
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }
    if (replyToId) {
        payload.reply_to_message_id = replyToId;
        payload.allow_sending_without_reply = true;
    }

    const apiURL = `${TELEGRAM_API_URL}/${apiMethod}`;
    
    try {
        const response = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!data.ok) {
            // handle error
            console.error(`Telegram API Error: ${data.description}`);
        }
        return { success: data.ok, messageId: data.result ? data.result.message_id : null }; 
    } catch (error) {
        console.error("sendUnifiedMessage failed:", error);
        return { success: false, messageId: null };
    }
}

// Helper for sending simple replies
export async function sendTelegramReply(chatId, text, messageId) {
    const result = await sendUnifiedMessage(chatId, text, 'Markdown', null, null, messageId);
    return result.messageId; 
}

// Other necessary telegram functions (simplified)
export async function editTelegramMessage(chatId, messageId, text) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageText`;
    // ... [implementation using fetch] ...
     try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                text: text,
                parse_mode: 'Markdown'
            }),
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

export async function answerCallbackQuery(callbackQueryId, text, showAlert) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/answerCallbackQuery`;
    // ... [implementation using fetch] ...
     try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId, 
                text: text,
                show_alert: showAlert 
            }),
        });
        return true;
    } catch (e) {
        return false;
    }
}

// ... [Add other Telegram functions like editTelegramMessageWithKeyboard, editPhotoCaption, etc., here] ...

// The simplified edit function:
export async function editTelegramMessageWithKeyboard(chatId, messageId, text, keyboard) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageText`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                text: text,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }),
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

export async function sendTelegramMessage(chatId, caption, parseMode = 'Markdown', replyMarkup = null) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendMessage`;
    try {
        const payload = {
            chat_id: chatId, 
            text: caption,
            parse_mode: parseMode 
        };
        if (replyMarkup) {
            payload.reply_markup = replyMarkup;
        }
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        return response.ok;
    } catch (e) {
        return false;
    }
}

export async function checkAdminStatus(chatId, userId) {
    const TELEGRAM_API_URL = CONFIG.TELEGRAM_API_BASE;
    const url = `${TELEGRAM_API_URL}/getChatMember?chat_id=${chatId}&user_id=${userId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok && data.result) {
            const status = data.result.status;
            if (status === 'administrator' || status === 'creator') {
                return true;
            }
        }
        return false; 
    } catch (error) {
        console.error("checkAdminStatus failed:", error);
        return false; 
    }
}
