// =================================================================
// 🤖 TRADING ASSISTANT BOT LOGIC (Core Logic and Shared Functions)
// Exports: TradingBot object and Shared Telegram Helpers
// =================================================================

// --- 0. CONFIGURATION (Shared values for all functions) ---
// ⚠️ මෙම CONFIG එකේ ඇති Token සහ Chat ID දැන් News Bot එකත් භාවිත කරයි.
const TRADING_CONFIG = {
    // 🛑 SHARED BOT TOKEN: (Trading Assistant Token)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 SHARED CHANNEL/GROUP CHAT ID:
    TELEGRAM_CHAT_ID: "-1002947156921",
    
    // 🛑 OWNER CHAT ID:
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 SHARED GEMINI API KEY:
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    DAILY_LIMIT: 5
};

TRADING_CONFIG.TELEGRAM_API_BASE = `https://api.telegram.org/bot${TRADING_CONFIG.TELEGRAM_BOT_TOKEN}`;


// =================================================================
// --- 1. SHARED TELEGRAM FUNCTIONS (MUST BE EXPORTED) ---
// =================================================================

// Main function for all Telegram API calls (used by both Trading and News)
export async function sendRawTelegramMessage(chatId, message, imgUrl = null, replyMarkup = null, replyToId = null, parseMode = 'HTML') {
    const TELEGRAM_API_URL = TRADING_CONFIG.TELEGRAM_API_BASE;
    let apiMethod = imgUrl ? 'sendPhoto' : 'sendMessage';
    let currentImgUrl = imgUrl; 
    let maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let payload = { chat_id: chatId, parse_mode: parseMode };

        if (apiMethod === 'sendPhoto' && currentImgUrl) {
            payload.photo = currentImgUrl;
            payload.caption = message;
        } else {
            payload.text = message;
            apiMethod = 'sendMessage'; 
        }
        
        if (replyMarkup && apiMethod === 'sendMessage') {
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

            if (!response.ok && apiMethod === 'sendPhoto') {
                currentImgUrl = null; 
                apiMethod = 'sendMessage';
                attempt = -1; // Restart loop as sendMessage
                continue; 
            }
            return response.ok; 
        } catch (error) {
            continue; 
        }
    }
    return false; 
}

// Helper for sending Channel Post (Markdown) - Used by Trading Bot
export async function sendTelegramMessage(caption) {
    return sendRawTelegramMessage(TRADING_CONFIG.TELEGRAM_CHAT_ID, caption, null, null, null, 'Markdown');
}

// Helper for replying to users (Markdown) - Used by Trading Bot
export async function sendTelegramReply(chatId, text, messageId) {
    return sendRawTelegramMessage(chatId, text, null, null, messageId, 'Markdown');
}

// Helper for sending to Owner (Markdown) - Used by both for logging/alerts
export async function sendTelegramReplyToOwner(text, keyboard = null) {
    const ownerChatIdString = TRADING_CONFIG.OWNER_CHAT_ID.toString();
    const TELEGRAM_API_ENDPOINT = `${TRADING_CONFIG.TELEGRAM_API_BASE}/sendMessage`;
    const body = {
        chat_id: ownerChatIdString, 
        text: text,
        parse_mode: 'Markdown' 
    };
    if (keyboard) {
        body.reply_markup = { inline_keyboard: keyboard };
    }
    const response = await fetch(TELEGRAM_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return response.ok;
}

// Helper for Membership Check (Used by News Bot)
export async function checkChannelMembership(userId) {
    const CHAT_ID = TRADING_CONFIG.TELEGRAM_CHAT_ID;
    const TELEGRAM_API_URL = TRADING_CONFIG.TELEGRAM_API_BASE;
    const url = `${TELEGRAM_API_URL}/getChatMember?chat_id=${CHAT_ID}&user_id=${userId}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok && data.result) {
            const status = data.result.status;
            return (status === 'member' || status === 'administrator' || status === 'creator');
        }
        return false; 
    } catch (error) {
        return false; 
    }
}


// --- TRADING BOT INTERNAL HELPER FUNCTIONS ---
// (Your original helper functions that are not exported)
async function sendTypingAction(chatId) { 
    // Simplified placeholder
    // await fetch(`${TRADING_CONFIG.TELEGRAM_API_BASE}/sendChatAction?chat_id=${chatId}&action=typing`);
}
async function editTelegramMessage(chatId, messageId, text) { 
    // Simplified placeholder
    // await sendRawTelegramMessage(chatId, text, null, null, null, 'Markdown');
}
async function answerCallbackQuery(callbackQueryId, text, showAlert) { 
    // Simplified placeholder
    // await fetch(`${TRADING_CONFIG.TELEGRAM_API_BASE}/answerCallbackQuery?callback_query_id=${callbackQueryId}&text=${text}&show_alert=${showAlert}`);
}
function escapeMarkdown(text) { /* ... */ return text; }
function generateRandomId(length = 6) { /* ... */ return 'RNDID'; }


// =================================================================
// --- 2. CORE TRADING AI FUNCTIONS (INTERNAL) ---
// =================================================================

// [Full generateScheduledContent logic using TRADING_CONFIG.GEMINI_API_KEY and env.POST_STATUS_KV]
async function generateScheduledContent(env) { 
    // PLACEHOLDER: Insert your actual Gemini logic here
    return "Testing Trading Post: RSI කියන්නේ මොකක්ද? [Generated by Trading Assistant]";
}

// [Full generateReplyContent logic]
async function generateReplyContent(userQuestion) { 
    // PLACEHOLDER: Insert your actual Gemini reply logic here
    return `*Order Flow Concept එක මොකද්ද?* \n\nඔබ ඇසූ ප්‍රශ්නයට පිළිතුර මෙහි ඇත. [AI Response]`;
}

// [Full validateTopic logic]
async function validateTopic(userQuestion) { 
    // PLACEHOLDER: Insert your topic validation logic here
    return true; // Assume trading topic
}

// [checkAndIncrementUsage, updateAndEditUserCount]
async function checkAndIncrementUsage(env, chatId) { 
    // PLACEHOLDER: Insert your KV usage check logic here
    return { allowed: true, count: 1 };
}

// [handleCallbackQuery]
async function handleCallbackQuery(query, env) {
    // PLACEHOLDER: [Full handleCallbackQuery logic for APPROVE/REJECT and SHOW_PRIVATE_INFO]
    await answerCallbackQuery(query.id, "Callback handled.", false);
    return true;
}


// =================================================================
// --- 3. MAIN TRADING HANDLER (Called by index.js) ---
// =================================================================

// Full logic for processing ALL messages/callbacks received by the unified webhook
export async function handleTradingLogic(update, env) {
    try {
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env);
        }

        if (update && update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text.trim();

            // --- OWNER COMMANDS (/send_count_post, /unlimit) ---
            if (chatId.toString() === TRADING_CONFIG.OWNER_CHAT_ID.toString()) {
                if (text.startsWith('/send_count_post')) {
                    // [Your sendInitialCountPost logic here]
                    await sendTelegramReply(chatId, `✅ Count Post command processed.`, messageId);
                    return true;
                }
                if (text.startsWith('/unlimit')) {
                    // [Your /unlimit logic here]
                    await sendTelegramReply(chatId, `✅ Unlimit command processed.`, messageId);
                    return true;
                }
            }

            // --- TRADING QUESTION LOGIC (Default behavior) ---
            
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...*", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                const usageResult = await checkAndIncrementUsage(env, chatId);
                
                if (!usageResult.allowed) {
                    // [Rate Limit Logic with inline button here]
                    await editTelegramMessage(chatId, validationMessageId, `🛑 *Usage Limit Reached!*`);
                    return true;
                }
                
                await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...*");
                await sendTypingAction(chatId); 
                const replyText = await generateReplyContent(text);
                await editTelegramMessage(chatId, validationMessageId, replyText);
                
            } else {
                await editTelegramMessage(chatId, validationMessageId, `⚠️ *Sorry! Mama **Trading** questions walata witharak answer karanawa.*`);
            }
            
            return true;
        }
        
    } catch (e) {
        console.error("Error processing unified logic in Trading Assistant:", e);
    }
    return true;
}


// =================================================================
// --- 4. EXPORTED ENTRY POINT FOR INDEX.JS ---
// =================================================================

export const TradingBot = {
    config: TRADING_CONFIG, // Export config for News Bot's use
    
    // Scheduled Handler (Daily Post)
    async scheduled(env, ctx) {
        const postContent = await generateScheduledContent(env); 
        if (postContent) {
            ctx.waitUntil(sendTelegramMessage(postContent));
        }
    },
    
    // Fetch Handler (Handles manual triggers internally)
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/trigger-manual') {
            const postContent = await generateScheduledContent(env);
            if (postContent) {
                const success = await sendTelegramMessage(postContent); 
                return new Response(`✅ Trading Manual Post: ${success ? 'Success' : 'Failed'}`, { status: 200 });
            }
            return new Response('❌ Trading Manual Post Failed: Content Generation Failed.', { status: 500 });
        }
        return new Response('Trading Endpoint.', { status: 200 });
    }
};
