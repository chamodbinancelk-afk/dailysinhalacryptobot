// config.js

export const CONFIG = {
    // 🛑 ඔබේ Bot Token එක (ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක
    TELEGRAM_CHAT_ID: "-1003111341307", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ID)
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක 
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL (Token එක මත සකස් වේ)
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q`, 
    
    // Timezone සහ සීමාවන්
    COLOMBO_TIMEZONE: 'Asia/Colombo',
    DAILY_LIMIT: 5 // Daily Q&A limit per group/user
};

// -------------------------------------------------------------
// PERMISSIONS (Group-based feature access)
// -------------------------------------------------------------
export const PERMISSIONS = {
    NEWS: { id: 'NEWS', text: 'Daily Forex News' },
    DAILY_POST: { id: 'DAILY_POST', text: 'Educational Posts' },
    MOTIVATION_POST: { id: 'MOTIVATION_POST', text: 'Daily Motivation Quote' },
    TRADING_QNA: { id: 'TRADING_QNA', text: 'Trading Q&A Bot' },
};

// -------------------------------------------------------------
// KV STORAGE KEYS
// -------------------------------------------------------------
export const TRADING_KV_KEYS = {
    BOT_USER_SET: 'BOT_USER_SET',
    DAILY_COUNT_KEY: 'DAILY_COUNT',
    DAILY_QNA_COUNT: 'DAILY_QNA_COUNT',
    OWNER_PANEL_MESSAGE_ID: 'OWNER_PANEL_MESSAGE_ID',
    LAST_TRADING_TOPIC: 'LAST_TRADING_TOPIC', 
    LAST_QUOTE_TOPIC: 'LAST_QUOTE_TOPIC',
    GROUP_PERMISSIONS: 'GROUP_PERMISSIONS', 
    GROUP_USAGE: 'GROUP_USAGE', 
};

export const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'LAST_NEWS_HEADLINE',
    LAST_FULL_MESSAGE: 'LAST_NEWS_FULL_MESSAGE',
    LAST_IMAGE_URL: 'LAST_NEWS_IMAGE_URL',
};

// -------------------------------------------------------------
// CONSTANTS & MESSAGE TEMPLATES (All are now exported)
// -------------------------------------------------------------
export const OWNER_PANEL_IMAGE_URL = "https://i.imgur.com/admin_panel_image.png"; 
export const QUOTE_IMAGE_URL = "https://i.imgur.com/motivational_quote_image.png"; 

// Message Templates (Functions)
export const ACCESS_DENIED_MESSAGE = (chatId) => `⚠️ *Access Denied!* ඔබගේ සමූහය/නාලිකාව (${chatId}) තවමත් පරිපාලක විසින් අනුමත කර නොමැත. කරුණාකර අනුමැතිය ඉල්ලා සිටින්න.`; 
export const ACCESS_APPROVED_MESSAGE = (chatId, perms) => `✅ *Access Approved!* Bot is now active in your Group/Channel (${chatId}). Allowed features: ${perms.join(', ')}.`;
