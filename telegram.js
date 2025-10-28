// telegram.js (Updated with POST_STATUS_KV binding)

import { CONFIG } from './config.js'; 

const TELEGRAM_API_BASE = CONFIG.TELEGRAM_API_BASE;

// -------------------------------------------------------------
// KV STORAGE UTILITIES (Exported for use in other files)
// -------------------------------------------------------------
export async function readKV(env, key, type = 'json') {
    // 🛑 UPDATED: Use env.POST_STATUS_KV
    const value = await env.POST_STATUS_KV.get(key); 
    if (!value) return null;
    if (type === 'json') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return value; 
        }
    }
    return value;
}

export async function writeKV(env, key, value) {
    const valueToWrite = typeof value === 'object' ? JSON.stringify(value) : value;
    // 🛑 UPDATED: Use env.POST_STATUS_KV
    await env.POST_STATUS_KV.put(key, valueToWrite);
}

// -------------------------------------------------------------
// CORE API CALL UTILITY
// -------------------------------------------------------------
async function telegramApiCall(method, body) {
    const url = `${TELEGRAM_API_BASE}/${method}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!result.ok) {
        console.error(`Telegram API Error: ${result.description}`);
    }
    return result;
}

// -------------------------------------------------------------
// SENDING MESSAGES
// -------------------------------------------------------------
export async function sendUnifiedMessage(chatId, text, parseMode = 'Markdown', photoUrl = null, replyMarkup = null) {
    if (photoUrl) {
        return telegramApiCall('sendPhoto', {
            chat_id: chatId,
            photo: photoUrl,
            caption: text,
            parse_mode: parseMode,
            reply_markup: replyMarkup
        });
    } else {
        return telegramApiCall('sendMessage', {
            chat_id: chatId,
            text: text,
            parse_mode: parseMode,
            reply_markup: replyMarkup,
            disable_web_page_preview: true
        });
    }
}

// -------------------------------------------------------------
// MESSAGE EDITING & ACTIONS
// -------------------------------------------------------------
export async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
    return telegramApiCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
        disable_web_page_preview: true
    });
}

export async function editPhotoCaption(chatId, messageId, caption, replyMarkup = {}) {
    return telegramApiCall('editMessageCaption', {
        chat_id: chatId,
        message_id: messageId,
        caption: caption,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
    });
}

export async function editTelegramMessageWithKeyboard(chatId, messageId, text, keyboard) {
    const replyMarkup = { inline_keyboard: keyboard };
    return editTelegramMessage(chatId, messageId, text, replyMarkup);
}

export async function removeInlineKeyboard(chatId, messageId) {
    return telegramApiCall('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }
    });
}

export async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    return telegramApiCall('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
    });
}

export async function sendTelegramReply(chatId, text, replyToMessageId) {
    return telegramApiCall('sendMessage', {
        chat_id: chatId,
        text: text,
        reply_to_message_id: replyToMessageId,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    });
}

export async function sendTelegramReplyToOwner(text) {
    return sendUnifiedMessage(CONFIG.OWNER_CHAT_ID, text, 'Markdown');
}

export async function checkAdminStatus(chatId, userId) {
    return userId.toString() === CONFIG.OWNER_CHAT_ID;
}
