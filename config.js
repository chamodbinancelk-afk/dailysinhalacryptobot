// config.js

import moment from 'moment-timezone';

// =================================================================
// --- 0. CONFIGURATION (Keys සහ IDs) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️
// =================================================================

export const CONFIG = {
    // 🛑 ඔබේ Bot Token එක (මෙම Token එකෙන් Telegram API Base URL එක ගොඩනගයි)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක (පුවත් සහ Trading Posts යැවිය යුතු ප්‍රධාන ස්ථානය)
    TELEGRAM_CHAT_ID: "-1003111341307", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක)
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL එක (Token එක භාවිතයෙන්)
    get TELEGRAM_API_BASE() {
        return `https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}`;
    },
    
    DAILY_LIMIT: 5,
    COLOMBO_TIMEZONE: 'Asia/Colombo',
};

// --- CONSTANTS ---

export const TRADING_KV_KEYS = {
    // KV Storage වෙනුවට මෙය සරල JS Object එකක භාවිත කළ හැක.
    APPROVED_GROUPS: 'APPROVED_GROUPS_MAP', // Group Permissions Map
    // ... අනෙකුත් Keys
    DAILY_QNA_COUNT: 'DAILY_QNA_COUNT', 
    LAST_TRADING_TOPIC: 'LAST_TRADING_TOPIC', 
    LAST_EDU_CONTENT: 'LAST_EDU_CONTENT', 
};

export const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'news_last_forex_headline', 
};

export const PERMISSIONS = {
    NEWS: { id: 'NEWS', text: '📰 Fundamental News' },
    DAILY_POST: { id: 'DAILY_POST', text: '📚 Daily Educational Post' },
    MOTIVATION_POST: { id: 'MOTIVATION_POST', text: '🔥 Daily Motivation Post' },
    TRADING_QNA: { id: 'TRADING_QNA', text: '💬 Trading Q&A (/search)' }
};

export const FF_NEWS_URL = "https://www.forexfactory.com/news";
export const HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
};

// අනෙකුත් Utility Functions
export function escapeMarkdown(text) {
    if (!text) return "";
    return text.replace(/([_*`])/g, '\\$1');
}

export function generateRandomId(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
