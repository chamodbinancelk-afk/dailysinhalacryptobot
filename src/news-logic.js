// =================================================================
// === src/news-logic.js (FIXED - Unified Start Message) ===
// =================================================================

// --- ES MODULE IMPORTS ---
import { load } from 'cheerio';
import moment from 'moment-timezone';

// ... (CONSTANTS and UTILITY FUNCTIONS - No change) ...
// ... (GEMINI AI INTEGRATION - No change) ...
// ... (CORE FOREX NEWS LOGIC - No change) ...


// --- TELEGRAM WEBHOOK HANDLER ---

/**
 * Webhook Handler - Responds to /fundamental and /start commands.
 * @param {object} update - Telegram Webhook Update object
 * @param {object} env - Cloudflare Environment
 * @param {object} CONFIG - The unified configuration object from index.js
 * @returns {Response | null} - Returns null if the message is not handled by News Logic.
 */
export async function handleNewsWebhook(update, env, CONFIG) { 
    const CHAT_ID = CONFIG.TELEGRAM_CHAT_ID;
    const OWNER_ID = CONFIG.OWNER_CHAT_ID;

    if (!update.message || !update.message.text) {
        return null;
    }

    const text = update.message.text.trim();
    const command = text.split(' ')[0].toLowerCase();
    const userId = update.message.from.id;
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;
    const username = update.message.from.username || update.message.from.first_name;

    // --- 1. MANDATORY MEMBERSHIP CHECK (Only for /fundamental command) ---
    if (command === '/fundamental') {
        const isMember = await checkChannelMembership(userId, CONFIG);

        if (!isMember) {
            const denialMessage =
                `⛔ <b>Access Denied</b> ⛔\n\n` +
                `Hey There <a href="tg://user?id=${userId}">${username}</a>,\n` +
                `You Must Join <b>${CHANNEL_LINK_TEXT}</b> Channel To Use This BOT.\n` +
                `So, Please Join it & Try Again.👀 Thank You ✍️`;

            const replyMarkup = {
                inline_keyboard: [
                    [{
                        text: `🔥 ${CHANNEL_LINK_TEXT} < / >`,
                        url: CHANNEL_LINK_URL
                    }]
                ]
            };

            await sendRawTelegramMessage(chatId, denialMessage, CONFIG, null, replyMarkup, messageId);
            return new Response('Handled by News Bot: Membership Check Failed', { status: 200 });
        }
    }

    // --- 2. COMMAND EXECUTION ---
    switch (command) {
        case '/start':
        case '/help': // 🛑 /help command එකත් මෙතනින්ම handle කරයි.
            
            // Trading Bot Logic වලට අවශ්‍ය User Count Update මෙතැනට ගෙන ආවා
            const tradingLogic = await import('./trading-logic');
            await tradingLogic.updateAndEditUserCount(env, userId, CONFIG); 
            
            const replyText =
                `<b>👋 Welcome to the Trading & News Assistant Bot!</b>\n\n` +
                `✨ <b>Assistant Features (AI Trading Q&A)</b>\n\n` +
                `💁‍♂️ ඔබට **Trading, Finance, Crypto** සම්බන්ධ ඕනෑම ප්‍රශ්නයක් සිංහලෙන් ඇසිය හැක.\n\n` +
                `උදා: <code>Order Flow Concept එක මොකද්ද?</code>\n\n` +
                `*⚠️ Limit:* ඔබට දිනකට *Trading Questions 5* ක් පමණක් ඇසිය හැක. Owner හට Unlimited.\n\n` +
                `◇───────────────◇\n\n` +
                `📰 <b>News Feature</b>\n\n` +
                `🙋‍♂️ Commands වල Usage එක මෙහෙමයි👇\n\n` +
                `◇ <code>/fundamental</code> :- 📰 Last Fundamental News\n\n` +
                `🎯 මේ BOT පැය 24ම Active එකේ තියෙනවා.🔔.. ✍️\n\n` +
                `🚀 <b>Developer :</b> @chamoddeshan\n` +
                `🔥 <b>Mr Chamo Corporation ©</b>`;
            
            await sendRawTelegramMessage(chatId, replyText, CONFIG, null, null, messageId);
            return new Response('Handled by News Bot: /start or /help', { status: 200 });

        case '/fundamental':
            const messageKey = LAST_FULL_MESSAGE_KEY;
            const lastImageUrl = await readKV(env, LAST_IMAGE_URL_KEY);

            const lastFullMessage = await readKV(env, messageKey);

            if (lastFullMessage) {
                await sendRawTelegramMessage(chatId, lastFullMessage, CONFIG, lastImageUrl, null, messageId);
            } else {
                const fallbackText = "Sorry, no recent fundamental news has been processed yet. Please wait for the next update.";
                await sendRawTelegramMessage(chatId, fallbackText, CONFIG, null, null, messageId);
            }
            return new Response('Handled by News Bot: /fundamental', { status: 200 });

        default:
            // /fundamental command එක හැර වෙනත් commands / text Trading logic වෙත යැවීම
            return null;
    }
}


// --- SCHEDULED HANDLER ---
// ... (handleNewsScheduled - No change) ...
