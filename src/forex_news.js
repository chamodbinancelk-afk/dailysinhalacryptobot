// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio';
import moment from 'moment-timezone';

// --- IMPORT SHARED FUNCTIONS AND CONFIG FROM TRADING ASSISTANT ---
import { 
    TradingBot, // To access the TRADING_CONFIG
    sendRawTelegramMessage, // To send messages (News posts, replies)
    checkChannelMembership
} from './trading_assistant.js';

// =================================================================
// 🗞️ FOREX NEWS BOT LOGIC (Now uses TradingBot's Config)
// =================================================================

// --- CONFIGURATION (Uses shared token but needs News-specific keys) ---
// ⚠️ HARDCODED_CONFIG IS REMOVED. Use TradingBot.config for credentials.

const NEWS_CONFIG = {
    // ⚠️ Note: TELEGRAM_TOKEN, CHAT_ID, GEMINI_API_KEY are now taken from TradingBot.config
    // If any other API key is required, define it here.
    // GEMINI_API_KEY: TradingBot.config.GEMINI_API_KEY, // Use shared key
};

// --- CONSTANTS (Remain the same) ---
const CHANNEL_USERNAME = 'C_F_News';
const CHANNEL_LINK_TEXT = 'C F NEWS ₿';
const CHANNEL_LINK_URL = `https://t.me/${CHANNEL_USERNAME}`;
const COLOMBO_TIMEZONE = 'Asia/Colombo';
const FF_NEWS_URL = "https://www.forexfactory.com/news";
const LAST_HEADLINE_KEY = 'last_forex_headline'; 
const LAST_FULL_MESSAGE_KEY = 'last_full_news_message'; 
const LAST_IMAGE_URL_KEY = 'last_image_url'; 
const FALLBACK_DESCRIPTION_EN = "No description found.";
// [HEADERS and other constants are here]

// --- INTERNAL HELPER FUNCTIONS (Need readKV/writeKV) ---
async function readKV(env, key) { 
    // PLACEHOLDER: Your original readKV logic
    // return env.NEWS_STATE.get(key);
    return null;
}
async function writeKV(env, key, value) { 
    // PLACEHOLDER: Your original writeKV logic
    // return env.NEWS_STATE.put(key, value);
    return true;
}
// [getAISentimentSummary, getLatestForexNews, translateText are here]

// =================================================================
// --- CORE NEWS LOGIC ---
// =================================================================

async function fetchForexNews(env) {
    const CHAT_ID = TradingBot.config.TELEGRAM_CHAT_ID; // 🛑 Use shared Channel ID
    try {
        // [Full scraping and AI logic here]
        // ... (Your original logic here)
        
        // Final Post:
        const news = { headline: "Test News", imgUrl: "...", description: "..." };
        const message = `<b>📰 Fundamental News (සිංහල)</b>\n\n...`; // Generated message
        
        // 🛑 Use imported shared function
        await sendRawTelegramMessage(CHAT_ID, message, news.imgUrl, null, null, 'HTML'); 
    } catch (error) {
        console.error("An error occurred during FUNDAMENTAL task:", error.stack);
    }
}

// Handles /fundamental command for the unified webhook
export async function handleNewsCommands(update, env) {
    const text = update.message.text.trim();
    const command = text.split(' ')[0].toLowerCase();
    const userId = update.message.from.id;
    const chatId = update.message.chat.id; 
    const messageId = update.message.message_id; 
    
    // This handler will be called ONLY for /fundamental and /start

    if (command === '/fundamental') { 
        // 🛑 Use imported shared function
        const isMember = await checkChannelMembership(userId); 

        if (!isMember) {
             // [Membership denial logic]
             const denialMessage = `⛔ <b>Access Denied</b>...`;
             await sendRawTelegramMessage(chatId, denialMessage);
             return true; 
        }
        
        // [Retrieve and send last news post logic]
        const lastFullMessage = await readKV(env, LAST_FULL_MESSAGE_KEY);
        const lastImageUrl = await readKV(env, LAST_IMAGE_URL_KEY);
        
        if (lastFullMessage) {
            // 🛑 Use imported shared function
            await sendRawTelegramMessage(chatId, lastFullMessage, lastImageUrl, null, messageId, 'HTML'); 
        }
    }
    
    // Handle /start (for welcome message only)
    if (command === '/start') {
        // [News Bot's /start welcome message logic here]
        const replyText = `<b>👋 Hello There! Welcome to the Unified Trading Bot!</b>...`;
        await sendRawTelegramMessage(chatId, replyText, null, null, messageId, 'HTML'); 
    }

    return true;
}


// --- EXPORTED HANDLERS ---
export const NewsBot = {
    // Scheduled Handler (News Fetching)
    async scheduled(env, ctx) {
        ctx.waitUntil(fetchForexNews(env));
    },
    
    // Fetch Handler (Handles manual triggers internally)
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/trigger-manual') {
            await fetchForexNews(env);
            return new Response("✅ News Manual Fetch Triggered.", { status: 200 });
        }
        return new Response('News Endpoint.', { status: 200 });
    }
};
