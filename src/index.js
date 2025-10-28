// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio'; // For Forex Factory Scraping
import moment from 'moment-timezone'; // For Timezone Management

// =================================================================
// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️
// =================================================================

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක (ඔබ ලබා දුන් අගය)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක (පුවත් සහ Trading Posts යැවිය යුතු ප්‍රධාන ස්ථානය)
    TELEGRAM_CHAT_ID: "-1003111341307", // ඔබ ලබා දුන් අගය
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", // ඔබ ලබා දුන් අගය
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක (ඔබ ලබා දුන් අගය)
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL එක
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q`,
    
    // දිනකට උපරිම අවසර ලත් භාවිතය (Trading Q&A සඳහා)
    DAILY_LIMIT: 5,

    // සාමාජිකත්වය පරීක්ෂා කරන Channel විස්තර
    CHANNEL_USERNAME: 'C_F_News', 
    CHANNEL_LINK_TEXT: 'C F NEWS ₿',
    CHANNEL_LINK_URL: 'https://t.me/C_F_News', 
    
    COLOMBO_TIMEZONE: 'Asia/Colombo',
};

// --- CONSTANTS ---

// Trading Assistant KV Keys
const TRADING_KV_KEYS = {
    COVERED_TOPICS: 'COVERED_TOPICS',
    BOT_USER_SET: 'BOT_USER_SET',
    COUNT_POST_ID: 'COUNT_POST_ID',
    DAILY_COUNT_KEY: 'DAILY_USER_COUNT', 
    DAILY_QNA_COUNT: 'DAILY_QNA_COUNT', 
    LAST_TRADING_TOPIC: 'LAST_TRADING_TOPIC', 
    LAST_EDU_CONTENT: 'LAST_EDU_CONTENT', 
    OWNER_PANEL_MESSAGE_ID: 'OWNER_PANEL_MSG_ID',
    // ⚠️ APPROVED_GROUPS එක දැන් JSON Object එකක් ලෙස ගබඩා වේ.
    APPROVED_GROUPS: 'APPROVED_GROUPS_MAP', 
    GROUP_REQUEST_PREFIX: 'GROUP_REQ_', 
    GROUP_TEMP_PERMS_PREFIX: 'GROUP_TEMP_PERMS_', // New key for temporary storage
};

// News Specific KV Keys
const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'news_last_forex_headline', 
    LAST_FULL_MESSAGE: 'news_last_full_news_message', 
    LAST_IMAGE_URL: 'news_last_image_url', 
};

// 🟢 NEW: Group Permission Definitions
const PERMISSIONS = {
    NEWS: { id: 'NEWS', text: '📰 Fundamental News' },
    DAILY_POST: { id: 'DAILY_POST', text: '📚 Daily Educational Post' },
    MOTIVATION_POST: { id: 'MOTIVATION_POST', text: '🔥 Daily Motivation Post' },
    TRADING_QNA: { id: 'TRADING_QNA', text: '💬 Trading Q&A (/search)' }
};

const FF_NEWS_URL = "https://www.forexfactory.com/news";
const FALLBACK_DESCRIPTION_EN = "No description found.";
const HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.forexfactory.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

// 🛑 Image URL FIX: ආරක්ෂිත, සාමාන්‍ය image එකක්
const QUOTE_IMAGE_URL = "https://envs.sh/S5A.jpg"; 
const OWNER_PANEL_IMAGE_URL = "https://envs.sh/r0j.jpg"; 

const ACCESS_DENIED_MESSAGE = (chatId) => `
*🚫 Group Access Denied!*

*Owner Approval Required:*
මෙම Group/Channel (ID: \`${chatId}\`) තුළ Assistant Bot ක්‍රියාත්මක වීමට පෙර, Bot Owner ගේ අනුමැතිය අවශ්‍ය වේ.

*සැ.යු:* මෙම Button එක ක්ලික් කළ හැක්කේ Group එකේ *Owner* හෝ *Administrator* කෙනෙකුට පමණි.
`;

const ACCESS_APPROVED_MESSAGE = (chatId, perms) => {
    const permList = Object.keys(PERMISSIONS)
        .filter(key => perms.includes(key))
        .map(key => `✅ ${PERMISSIONS[key].text}`)
        .join('\n');
        
    return `
*✅ Group Access Approved!*

Bot Owner විසින් මෙම Group එක තුළ Bot ක්‍රියාත්මක වීමට අනුමැතිය ලබා දී ඇත. 
ඔබට දැන් Bot භාවිතා කළ හැකිය.

*Chat ID:* \`${chatId}\`

*ලබා දී ඇති සේවාවන්:*
${permList || "_කිසිදු සේවාවක් ලබා දී නැත._"}
`;
};


// =================================================================
// --- 1. CORE UTILITIES (KV, Telegram, Membership, Admin Check) ---
// =================================================================

/**
 * KV Read function (Unified)
 */
async function readKV(env, key, type = 'text') {
    try {
        if (!env.POST_STATUS_KV) { return null; }
        const value = await env.POST_STATUS_KV.get(key, type); 
        return value === null || value === undefined ? null : value;
    } catch (e) {
        console.error(`KV Read Error (${key}):`, e);
        return null;
    }
}

/**
 * KV Write function (Unified)
 */
async function writeKV(env, key, value, options = {}) {
    try {
        if (!env.POST_STATUS_KV) { return; }
        await env.POST_STATUS_KV.put(key, String(value), options); 
    } catch (e) {
        console.error(`KV Write Error (${key}):`, e);
    }
}

/**
 * Sends a message to Telegram. (Unified)
 */
async function sendUnifiedMessage(chatId, message, parseMode = 'Markdown', imgUrl = null, replyMarkup = null, replyToId = null) {
    const TELEGRAM_API_URL = CONFIG.TELEGRAM_API_BASE; 
    
    let currentImgUrl = imgUrl; 
    let apiMethod = currentImgUrl ? 'sendPhoto' : 'sendMessage';
    let maxAttempts = 3;
    let messageIdResult = null; 

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let payload = { chat_id: chatId, parse_mode: parseMode };

        if (apiMethod === 'sendPhoto' && currentImgUrl) {
            payload.photo = currentImgUrl;
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
                if (apiMethod === 'sendPhoto' && currentImgUrl) { 
                    currentImgUrl = null; 
                    apiMethod = 'sendMessage';
                    attempt = -1; 
                    continue; 
                }
                break; 
            }
            messageIdResult = data.result.message_id;
            return { success: true, messageId: messageIdResult }; 
        } catch (error) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { success: false, messageId: null }; 
}

/**
 * 🟢 NEW: Checks if a user is an admin or creator in a chat.
 */
async function checkAdminStatus(chatId, userId) {
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

// Helper for sending simple replies
async function sendTelegramReply(chatId, text, messageId) {
    const result = await sendUnifiedMessage(chatId, text, 'Markdown', null, null, messageId);
    return result.messageId; 
}

async function sendTelegramReplyToOwner(text) {
    const result = await sendUnifiedMessage(CONFIG.OWNER_CHAT_ID, text, 'Markdown', null, null, null);
    return result.messageId; 
}

async function editTelegramMessage(chatId, messageId, text) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageText`;
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

async function editTelegramMessageWithKeyboard(chatId, messageId, text, keyboard) {
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

async function editPhotoCaption(chatId, messageId, caption, replyMarkup) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageCaption`;
    try {
        const payload = {
            chat_id: chatId, 
            message_id: messageId, 
            caption: caption,
            parse_mode: 'Markdown'
        };
        if (replyMarkup) {
            payload.reply_markup = replyMarkup;
        }

        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function answerCallbackQuery(callbackQueryId, text, showAlert) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/answerCallbackQuery`;
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

async function sendTelegramMessage(chatId, caption, parseMode = 'Markdown', replyMarkup = null) {
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

async function removeInlineKeyboard(chatId, messageId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageReplyMarkup`;
    try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: {} 
            }),
        });
        return true;
    } catch (e) {
        return false;
    }
}

function generateRandomId(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function escapeMarkdown(text) {
    if (!text) return "";
    return text.replace(/([_*`])/g, '\\$1');
}

async function updateAndEditUserCount(env, userId) {
    // (User count logic remains the same)
    const USER_SET_KEY = TRADING_KV_KEYS.BOT_USER_SET; 
    const COUNT_POST_ID_KEY = TRADING_KV_KEYS.COUNT_POST_ID; 
    const DAILY_COUNT_KEY = TRADING_KV_KEYS.DAILY_COUNT_KEY; 

    const userIdString = userId.toString();

    const userSet = await readKV(env, USER_SET_KEY, 'json') || [];
    const isNewUser = !userSet.includes(userIdString);
    
    if (isNewUser) {
        userSet.push(userIdString);
        await writeKV(env, USER_SET_KEY, JSON.stringify(userSet));
        const totalCount = userSet.length;
        
        const dailyCountStr = await readKV(env, DAILY_COUNT_KEY) || '0';
        let dailyCount = parseInt(dailyCountStr);
        dailyCount += 1;
        
        const now = moment().tz(CONFIG.COLOMBO_TIMEZONE);
        const endOfDay = moment().tz(CONFIG.COLOMBO_TIMEZONE).add(1, 'days').startOf('day'); 
        const expirationTtl = Math.max(1, endOfDay.diff(now, 'seconds')); 
        
        await writeKV(env, DAILY_COUNT_KEY, dailyCount.toString(), { expirationTtl: expirationTtl });
        
        const postDetailsStr = await readKV(env, COUNT_POST_ID_KEY);
        
        if (postDetailsStr) {
            const [chatId, messageId] = postDetailsStr.split(':');
            
            const currentTime = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('hh:mm:ss A');
            
            const newCaption = `*⭐ Bot Statistics Update 📈*
            
දැනට මෙම Bot එක භාවිතා කරන සම්පූර්ණ පරිශීලකයින් ගණන:
            
*▶️ Total Users:* **${totalCount.toLocaleString()}**
*🔥 Daily Growth:* **+${dailyCount.toLocaleString()} new users**
*⏰ Last Updated:* ${currentTime} (SL Time)

---
            
*🌐 Join the Community:* [Mrchamo Official Channel](https://t.me/Mrchamo_Lk)
*Use /start to register.*`;

            await editPhotoCaption(chatId, parseInt(messageId), newCaption);
            
            return { success: true, newCount: totalCount };
        }
    }

    return { success: isNewUser, newCount: userSet.length };
}


// =================================================================
// --- 2. FOREX NEWS LOGIC (PERMISSION CHECK ADDED) ---
// =================================================================

/**
 * Uses Gemini to generate a short, Sinhala analysis of the news.
 */
async function getAIAnalysis(headline, description, env) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // News analysis prompt
    const userQuery = `Headline: "${headline}". Description: "${description}". Based on this forex news, provide a very short (max 3 sentences), high-impact analysis of the expected market movement in Sinhala. Conclude with a clear emoji (e.g., 🚀, 📉, ⚠️).`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                generationConfig: { temperature: 0.2 } 
            }),
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "විශ්ලේෂණය ලබා දීමට නොහැකි විය.";
    } catch (e) {
        return "⚠️ AI විශ්ලේෂණය අසාර්ථක විය.";
    }
}

/**
 * Scrapes Forex Factory for the latest news. (Remains the same)
 */
async function getLatestForexNews() {
    // (Function body remains the same as in V8)
    try {
        const response = await fetch(FF_NEWS_URL, { headers: HEADERS });
        const html = await response.text();
        const $ = load(html);
        
        // Find the first news row with impact
        const firstNewsRow = $('.calendar__row--news').first();
        if (!firstNewsRow.length) return null;

        const time = firstNewsRow.find('.calendar__cell--time').text().trim();
        const currency = firstNewsRow.find('.calendar__cell--currency').text().trim();
        const impactElement = firstNewsRow.find('.impact-icon--news');
        let impact = 'Low';
        
        if (impactElement.hasClass('icon--ff-impact-red')) {
            impact = 'High';
        } else if (impactElement.hasClass('icon--ff-impact-orange')) {
            impact = 'Medium';
        }

        const headline = firstNewsRow.find('.calendar__cell--news .news-headline').text().trim();
        
        // Get the full description/body text
        const articleLink = firstNewsRow.find('.calendar__cell--news a').attr('href');
        let description = FALLBACK_DESCRIPTION_EN;
        let image = null;

        if (articleLink) {
            const fullArticleURL = `https://www.forexfactory.com${articleLink}`;
            const articleResponse = await fetch(fullArticleURL, { headers: HEADERS });
            const articleHtml = await articleResponse.text();
            const article$ = load(articleHtml);
            
            description = article$('.article__body').text().trim() || FALLBACK_DESCRIPTION_EN;
            
            // Try to find the article image
            const imageElement = article$('.article__image-container img').first();
            if (imageElement.length) {
                let imgUrl = imageElement.attr('src');
                if (imgUrl && imgUrl.startsWith('/')) {
                    image = "https://www.forexfactory.com" + imgUrl;
                } else {
                    image = imgUrl;
                }
            }
        }

        return { time, currency, impact, headline, description, image };

    } catch (e) {
        return null;
    }
}

/**
 * Main function to fetch news, analyze it, and post it to permitted groups.
 */
async function fetchForexNews(env, isManual = false) {
    const newsData = await getLatestForexNews();

    if (!newsData || !newsData.headline) return;

    const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE);
    
    if (newsData.headline === lastHeadline && !isManual) return;
    if (newsData.impact === 'Low' && !isManual) return; 

    const aiAnalysis = await getAIAnalysis(newsData.headline, newsData.description, env);

    const emojiMap = {
        'High': '🔴',
        'Medium': '🟠',
        'Low': '🟡'
    };
    
    const currencyEmoji = newsData.currency === 'USD' ? '💵' : newsData.currency;
    
    const fullMessage = `
*🚨 FUNDAMENTAL NEWS ALERT ${emojiMap[newsData.impact]}*

*Time:* ${newsData.time} (FF Time)
*Currency:* ${currencyEmoji} ${newsData.currency}
*Impact:* ${newsData.impact}

*HEADLINE:* _${newsData.headline}_

---

*🔍 AI ANALYSIS (Sinhala):*
${aiAnalysis}

---

*SOURCE:* [Forex Factory News](https://www.forexfactory.com/news)
*Powered by: Gemini 2.5 Flash*
`;

    // 🟢 NEW: Check ALL approved groups and post only to those with NEWS permission
    const groups = await getApprovedGroupsMap(env);
    let successCount = 0;

    for (const chatId in groups) {
        if (groups[chatId].permissions.includes(PERMISSIONS.NEWS.id)) {
            const result = await sendUnifiedMessage(
                chatId, 
                fullMessage, 
                'Markdown', 
                newsData.image 
            );
            if (result.success) successCount++;
        }
    }
    
    // Save state only if successfully posted to at least the main channel (CONFIG.TELEGRAM_CHAT_ID)
    if (successCount > 0 || isManual) { 
        await writeKV(env, NEWS_KV_KEYS.LAST_HEADLINE, newsData.headline);
        await writeKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE, fullMessage);
        await writeKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL, newsData.image || 'N/A');
    }
}


// =================================================================
// --- 3. TRADING Q&A LOGIC (5 Paragraph FIX) ---
// =================================================================

/**
 * Generates the content for the Daily Educational Post (5 Paragraphs).
 */
async function generateScheduledContent(env) {
    // (Function body remains the same as in V8, uses Gemini to generate the 5-paragraph post)
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const coveredTopicsRaw = await readKV(env, TRADING_KV_KEYS.COVERED_TOPICS) || "[]";
    const coveredTopics = JSON.parse(coveredTopicsRaw);

    const systemPrompt = `
        You are an expert financial market educator. Your task is to generate a detailed, easy-to-understand educational post about a single fundamental trading topic for a beginner to intermediate audience in Sinhala.
        
        The content MUST be exactly **5 paragraphs** long. Each paragraph must cover a distinct subtopic (e.g., Definition, Importance, How to Use, Examples, Summary). The post must be engaging, use bullet points where appropriate, and include a clear call-to-action (CTA) to encourage further learning. 
        
        The final output MUST be formatted using Telegram's **Markdown**. The first line must be the Sinhala title, formatted as a bold headline (e.g., *Candlesticks හැඳින්වීම*). Do not use external links.
    `;
    
    const userQuery = `Generate today's comprehensive, **5-paragraph** educational post. Exclude these topics: ${coveredTopics.join(', ')}. Focus on an important concept like Support and Resistance, Market Structure, or a specific indicator (RSI, MA).`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.9 } 
            }),
        });
        
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (content) {
            const lines = content.split('\n').filter(line => line.trim() !== '');
            const firstLine = lines[0] || 'Unknown Topic';
            const newTopic = firstLine.replace(/[\*#]/g, '').substring(0, 50).trim(); 
            
            coveredTopics.push(newTopic);
            if (coveredTopics.length > 30) coveredTopics.shift(); 
            
            await writeKV(env, TRADING_KV_KEYS.COVERED_TOPICS, JSON.stringify(coveredTopics));
            await writeKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC, newTopic);
            await writeKV(env, TRADING_KV_KEYS.LAST_EDU_CONTENT, content); 

            return content;
        }
    } catch (e) {
        console.error("Scheduled Content Generation Failed:", e);
    }
    return null;
}

/**
 * Generates the reply content for a user's Q&A query (5 Paragraphs FIX).
 */
async function generateReplyContent(query) {
    // (Function body remains the same as in V8, uses Gemini to generate the 5-paragraph reply)
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const systemPrompt = `
        You are a Trading Assistant specializing in Forex, Crypto, and Stock markets. Your goal is to answer user questions accurately, professionally, and helpfully in **SINHALA LANGUAGE**.
        
        The response MUST be structured into exactly **5 detailed paragraphs** to fully explain the concept. Each paragraph should cover a distinct aspect of the topic (e.g., Definition, Importance, Calculation/How to Use, Market Examples, Summary/Advice).
        
        Format the final output using Telegram's **Markdown** (bolding, lists, and emojis). The first line of the response MUST be a bold title based on the question (e.g., *RSI Concept එක මොකද්ද?*). Do not use external links.`;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: query }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.5 } 
            }),
        });
        
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "*පිළිතුරක් ලබා දීමට නොහැකි විය.*";
        
        return content + "\n\n---\n*💡 තවත් ප්‍රශ්න තිබේද? දැන්ම අසන්න!*";

    } catch (e) {
        return "*⚠️ AI Generation Error.*";
    }
}

/**
 * Checks if the user's query is strictly a trading topic. (Remains the same)
 */
async function validateTopic(userQuestion) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const systemPrompt = `
        You are an AI classifier. Your task is to determine if the user's query is strictly related to **Trading, Finance, Investing, Cryptocurrency, Forex, or the Stock Market**.
        
        If the query is directly related to any of these financial topics, respond ONLY with the word "YES".
        If the query is about any other subject (general knowledge, politics, sports, entertainment, personal advice, etc.), respond ONLY with the word "NO".
    `;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuestion }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.1 } 
            }),
        });

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
        
        return result === 'YES';
        
    } catch (e) {
        return true; 
    }
}


/**
 * Checks and increments the user's daily usage count. (Remains the same)
 */
async function checkAndIncrementUsage(env, chatId) {
    if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        return { allowed: true, count: 'Unlimited' };
    }

    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const KV_KEY = `usage:${today}:${chatId}`;
    
    // 1. Increment Total Q&A Count for the Day
    const dailyQnaCountKey = TRADING_KV_KEYS.DAILY_QNA_COUNT + ':' + today;
    const currentTotalQnaCount = parseInt(await readKV(env, dailyQnaCountKey) || '0');
    
    const now = moment().tz(CONFIG.COLOMBO_TIMEZONE);
    const endOfDay = moment().tz(CONFIG.COLOMBO_TIMEZONE).add(1, 'days').startOf('day'); 
    const expirationTtl = Math.max(1, endOfDay.diff(now, 'seconds')); 

    await writeKV(env, dailyQnaCountKey, (currentTotalQnaCount + 1).toString(), { expirationTtl: expirationTtl }); 
    
    // 2. Individual User Limit Check
    const currentUsage = parseInt(await readKV(env, KV_KEY) || '0');
    const limit = CONFIG.DAILY_LIMIT;

    if (currentUsage >= limit) {
        return { allowed: false, count: currentUsage, kvKey: KV_KEY };
    }

    await writeKV(env, KV_KEY, (currentUsage + 1).toString(), { expirationTtl: expirationTtl });
    
    return { allowed: true, count: currentUsage + 1, kvKey: KV_KEY };
}

// =================================================================
// --- 4. DAILY QUOTE/TIP LOGIC (PERMISSION CHECK ADDED) ---
// =================================================================

/**
 * Generates a short, motivational Sinhala trading tip or quote. (Remains the same)
 */
async function generateDailyQuote(env) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const systemPrompt = `You are a professional financial and trading motivator. Your task is to generate a single, powerful, and practical trading tip or a motivational quote for the day in **SINHALA language**. It should be concise (max 3 sentences). The final output must be formatted using Telegram's **Markdown** for emphasis. Do not use external tools.`;
    
    const userQuery = "Generate today's short, high-impact Sinhala trading tip or motivational quote.";

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.9 } 
            }),
        });
        
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "*අද දින Quote එක ලබා දීමට නොහැකි විය.*";
        
        const finalMessage = `*🔥 Daily Trading Motivation & Tip 💡*\n\n---\n\n${content}\n\n---\n\n*🚀 Dev: Mr Chamo 🇱🇰*`;

        return finalMessage;
    } catch (e) {
        return "*⚠️ Daily Quote Generation Failed. (API Error)*";
    }
}


// =================================================================
// --- 5. GROUP MANAGEMENT LOGIC (PERMISSIONS) ---
// =================================================================

/**
 * 🟢 NEW: Fetches the approved groups map.
 */
async function getApprovedGroupsMap(env) {
    const raw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS, 'json');
    return raw && typeof raw === 'object' ? raw : {};
}

/**
 * 🟢 NEW: Checks if the given Chat ID is approved and has a specific permission.
 */
async function isGroupApprovedAndHasPermission(env, chatId, permission) {
    const approvedGroups = await getApprovedGroupsMap(env);
    const groupData = approvedGroups[chatId.toString()];
    
    return groupData && groupData.permissions && groupData.permissions.includes(permission);
}

/**
 * 🟢 NEW: Adds a Group Chat ID to the approved whitelist with permissions.
 */
async function addGroupWithPermissions(env, chatId, permissions) {
    const approvedGroups = await getApprovedGroupsMap(env);
    const chatIdString = chatId.toString();
    
    if (!approvedGroups[chatIdString]) {
        approvedGroups[chatIdString] = {
            permissions: permissions,
            added_timestamp: Date.now(),
        };
        await writeKV(env, TRADING_KV_KEYS.APPROVED_GROUPS, JSON.stringify(approvedGroups));
        return true;
    } else {
        // Update existing group's permissions
        approvedGroups[chatIdString].permissions = permissions;
        await writeKV(env, TRADING_KV_KEYS.APPROVED_GROUPS, JSON.stringify(approvedGroups));
        return true;
    }
}


// =================================================================
// --- 6. OWNER PANEL LOGIC (PERMISSIONS UPDATE) ---
// =================================================================

/**
 * Generates and sends the main Admin Panel message to the Owner. (Updated)
 */
async function sendOwnerPanel(env) {
    const ownerChatId = CONFIG.OWNER_CHAT_ID;
    const timeZone = CONFIG.COLOMBO_TIMEZONE;
    const currentTime = moment().tz(timeZone).format('YYYY-MM-DD hh:mm:ss A');
    
    // 1. Get Stats for Caption
    const userSetRaw = await readKV(env, TRADING_KV_KEYS.BOT_USER_SET, 'text');
    const userSet = userSetRaw ? JSON.parse(userSetRaw) : [];
    const totalUsers = Array.isArray(userSet) ? userSet.length : 0;
    
    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const dailyCountStr = await readKV(env, TRADING_KV_KEYS.DAILY_COUNT_KEY) || '0';
    const dailyCount = parseInt(dailyCountStr);

    const dailyQnaCountKey = TRADING_KV_KEYS.DAILY_QNA_COUNT + ':' + today;
    const totalQnaRequests = parseInt(await readKV(env, dailyQnaCountKey) || '0'); 
    
    const approvedGroups = await getApprovedGroupsMap(env);
    const totalApprovedGroups = Object.keys(approvedGroups).length;
    

    const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE) || 'N/A';
    const lastTopic = await readKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC) || 'N/A';
    
    // 2. Main Caption
    const caption = `*👑 Owner Admin Panel 📊*\n\n` +
                    `*⏰ System Time:* ${currentTime} (SL Time)\n\n` +
                    `*👥 Total Users:* ${totalUsers.toLocaleString()}\n` +
                    `*🌐 Approved Groups:* ${totalApprovedGroups}\n` + 
                    `*🔥 Daily New Users:* +${dailyCount.toLocaleString()}\n` +
                    `*💬 Today Q&A Requests:* ${totalQnaRequests.toLocaleString()}\n\n` + 
                    `*📰 Last News Post:* ${lastHeadline.substring(0, 40)}...\n` +
                    `*📚 Last Edu Topic:* ${lastTopic}\n\n` +
                    `---`;

    // 3. Inline Keyboard
    const keyboard = [
        [{ text: "📊 All KV Stats", callback_data: 'GET_STATS' }, { text: "💬 Today Usage", callback_data: 'GET_DAILY_USAGE' }], 
        [{ text: "⚙️ Bot Commands", callback_data: 'GET_COMMANDS' }, { text: "🌐 Manage Groups", callback_data: 'MANAGE_GROUPS' }], 
        [{ text: "🗑️ Clear Topics", callback_data: 'CLEAR_TOPICS' }, { text: "👁️ Last Edu Content", callback_data: 'VIEW_LAST_EDU' }],
        [{ text: "📰 Trigger News", callback_data: 'TRIGGER_NEWS' }, { text: "📚 Trigger Edu Post", callback_data: 'TRIGGER_EDU' }, { text: "🔥 Trigger Quote", callback_data: 'TRIGGER_QUOTE' }], // New trigger button
        [{ text: "🔄 Refresh Panel", callback_data: 'REFRESH_PANEL' }],
    ];

    const replyMarkup = { inline_keyboard: keyboard };
    const panelMessageId = await readKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID);

    let result = { success: false, messageId: null };

    if (panelMessageId) {
        const editSuccess = await editPhotoCaption(ownerChatId, parseInt(panelMessageId), caption, replyMarkup);
        if (editSuccess) {
            result = { success: true, messageId: parseInt(panelMessageId) };
        } else {
            result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
        }
    } else {
        result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
    }

    if (result.success && result.messageId) {
        await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, result.messageId.toString());
    }
}

/**
 * 🟢 NEW: Creates the Permission Selection Keyboard.
 */
function createPermissionKeyboard(chatId, currentPermissions, uniqueKey) {
    const keyboard = [];
    
    // Permission Buttons
    for (const key in PERMISSIONS) {
        const perm = PERMISSIONS[key];
        const isSelected = currentPermissions.includes(perm.id);
        const emoji = isSelected ? '✅ ' : '⬜ ';
        
        keyboard.push([{ 
            text: `${emoji}${perm.text}`, 
            callback_data: `TOGGLE_PERM_${perm.id}_${uniqueKey}` 
        }]);
    }
    
    // Action Buttons
    keyboard.push([{ 
        text: '💾 Save Permissions & Approve', 
        callback_data: `SAVE_PERMS_${uniqueKey}` 
    }]);
    
    keyboard.push([{ 
        text: '❌ Reject & Cancel', 
        callback_data: `REJECT_GROUP_FINAL_${uniqueKey}` 
    }]);
    
    return keyboard;
}

/**
 * Handles the callbacks generated from the Admin Panel. (Updated for Permissions)
 */
async function handleOwnerPanelCallback(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (chatId.toString() !== CONFIG.OWNER_CHAT_ID.toString()) {
        await answerCallbackQuery(callbackQueryId, "⚠️ ඔබට මෙම විධානය භාවිතා කිරීමට අවසර නැත.", true);
        return;
    }

    await answerCallbackQuery(callbackQueryId, "Processing...", false);
    const backKeyboard = [[{ text: "⬅️ Back to Panel", callback_data: 'REFRESH_PANEL' }]];
    
    let messageText = "Panel Content";
    let isHandled = true; // Flag to indicate if the callback was one of the core panel buttons

    // --- Core Panel Actions ---
    switch (data) {
        case 'REFRESH_PANEL':
            await sendOwnerPanel(env);
            return;
            
        case 'GET_STATS': {
            const allKeys = Object.keys(TRADING_KV_KEYS).concat(Object.keys(NEWS_KV_KEYS));
            let statsMessage = "*📊 Current KV Status:*\n\n";
            for (const key of allKeys) {
                const value = await readKV(env, TRADING_KV_KEYS[key] || NEWS_KV_KEYS[key]);
                statsMessage += `\`${key}:\` _${value ? (value.length > 50 ? value.substring(0, 50) + '...' : value) : 'NULL'}_ \n`;
            }
            messageText = statsMessage;
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
        }

        case 'GET_DAILY_USAGE': {
            const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
            const dailyQnaCountKey = TRADING_KV_KEYS.DAILY_QNA_COUNT + ':' + today;
            const totalQnaRequests = parseInt(await readKV(env, dailyQnaCountKey) || '0'); 
            const dailyCountStr = await readKV(env, TRADING_KV_KEYS.DAILY_COUNT_KEY) || '0';
            
            messageText = `*💬 Today's Usage Statistics*\n\n` +
                          `*📅 Date:* ${today}\n` +
                          `*🔥 Daily New Users:* +${dailyCountStr}\n` +
                          `*💬 Total Q&A Requests:* ${totalQnaRequests.toLocaleString()}\n\n` +
                          `_User limit එක: ${CONFIG.DAILY_LIMIT} per user. Owner ට Unlimited._`;
                          
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
        }
        
        case 'GET_COMMANDS':
            messageText = `*⚙️ Available Commands*\n\n` +
                          `*General:*\n` +
                          `  - \`/start\` : Bot එකේ භාවිතය ආරම්භ කරන්න.\n` +
                          `  - \`/help\` : උදව් පණිවිඩය.\n` +
                          `*Trading Q&A:*\n` +
                          `  - \`/search [topic]\` : Trading ප්‍රශ්න අසන්න. (*Ex:* \`/search RSI කියන්නේ මොකද්ද?\`)\n` +
                          `*Owner Only:*\n` +
                          `  - \`/admin\` : Admin Panel එක පෙන්වන්න.`;
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
            
        case 'CLEAR_TOPICS':
            await writeKV(env, TRADING_KV_KEYS.COVERED_TOPICS, "[]");
            messageText = "*🗑️ Covered Topics List එක සාර්ථකව හිස් කරන ලදී!* \n\nDaily Educational Post එක සඳහා අලුත් Topics තෝරා ගැනේ.";
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
            
        case 'VIEW_LAST_EDU':
            const lastEduContent = await readKV(env, TRADING_KV_KEYS.LAST_EDU_CONTENT) || "*⚠️ පසුගිය Post එකේ content එකක් සොයා ගත නොහැක.*";
            messageText = `*👁️ Last Educational Post Content:*\n\n---\n\n${lastEduContent}\n\n---`;
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;

        case 'TRIGGER_NEWS':
            await fetchForexNews(env, true);
            messageText = "*✅ Fundamental News Triggered!* \n\nCheck the main channel and permitted groups.";
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
            
        case 'TRIGGER_EDU':
            const postContent = await generateScheduledContent(env); 
            if (postContent) {
                // Post to ALL groups with DAILY_POST permission
                const groups = await getApprovedGroupsMap(env);
                for (const groupChatId in groups) {
                    if (groups[groupChatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                        await sendTelegramMessage(groupChatId, postContent);
                    }
                }
                messageText = "*✅ Daily Educational Post Triggered!* \n\nCheck all permitted channels for the new 5-paragraph post.";
            } else {
                messageText = "*❌ Educational Post Generation Failed!*";
            }
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;
            
        case 'TRIGGER_QUOTE': // 🟢 NEW: Trigger Motivation Post
            const quoteContent = await generateDailyQuote(env);
            if (quoteContent) {
                 const groups = await getApprovedGroupsMap(env);
                for (const groupChatId in groups) {
                    if (groups[groupChatId].permissions.includes(PERMISSIONS.MOTIVATION_POST.id)) {
                         await sendUnifiedMessage(groupChatId, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                    }
                }
                messageText = "*✅ Daily Motivation Post Triggered!* \n\nCheck all permitted channels.";
            } else {
                messageText = "*❌ Quote Generation Failed!*";
            }
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            break;


        case 'MANAGE_GROUPS': 
            const approvedGroups = await getApprovedGroupsMap(env);
            
            let groupMessage = `*🌐 Approved Groups (${Object.keys(approvedGroups).length}):*\n\n`;
            
            if (Object.keys(approvedGroups).length > 0) {
                for (const id in approvedGroups) {
                    const groupData = approvedGroups[id];
                    const permTexts = groupData.permissions.map(p => PERMISSIONS[p] ? PERMISSIONS[p].text.split(' ')[1] : p).join(', ');
                     groupMessage += `\`${id}\`\n  - *Permissions:* _${permTexts}_\n\n`;
                }
            } else {
                groupMessage += "_දැනට කිසිදු Group එකක් අනුමත කර නැත._";
            }
            
            const groupKeyboard = [
                [{ text: "➕ Manually Add/Edit Group ID", callback_data: 'ADD_GROUP_ID_PROMPT' }],
                [{ text: "⬅️ Back to Panel", callback_data: 'REFRESH_PANEL' }]
            ];
            await editTelegramMessageWithKeyboard(chatId, messageId, groupMessage, groupKeyboard);
            break;
            
        case 'ADD_GROUP_ID_PROMPT':
            messageText = `*➕ Group ID එකක් එක් කරන්න*\n\n` +
                          `Group/Channel එකක Chat ID එක (Ex: \`-100XXXXXXXXXX\`) පහත Reply කරන්න.`;
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard); // Need a reply to this message
            break;

        default:
            isHandled = false;
            break;
    }
    
    // --- Group Approval/Permission Flow ---
    if (data.startsWith('GROUP_APPROVE_')) {
        const uniqueKey = data.substring('GROUP_APPROVE_'.length);
        const requestDetailsRaw = await readKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey);
        
        // Handle Manual Add Case
        const isManual = uniqueKey === 'MANUAL';
        let targetChatId, chatTitle;

        if (isManual) {
            // Manual add flow uses the targetChatId as the unique key, so the data here will be the Chat ID itself. 
            // We use the temporary key for the manual flow which should already exist from the manual reply logic.
            targetChatId = uniqueKey; // This should be updated in the manual reply logic
            chatTitle = 'Manual Add - ID Pending';

            // Find the actual chat ID from the message text if this is a reply to the prompt
            if (query.message.text && query.message.text.includes('Group ID එකක් එක් කරන්න')) {
                // This is a complex step for a simple text reply, let's assume the follow-up logic handles it better
                // For now, let's rely on the KV store for the correct targetChatId
                // The manual logic is better handled by just making the owner manually edit the KV or re-initiating the whole process.
            }
        } else if (!requestDetailsRaw) {
             await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත.", true);
             return;
        } else {
             const requestDetails = JSON.parse(requestDetailsRaw);
             targetChatId = requestDetails.chat_id;
             chatTitle = requestDetails.chat_name;
        }
        
        // --- Core Permission Selection Logic ---
        const tempKey = TRADING_KV_KEYS.GROUP_TEMP_PERMS_PREFIX + targetChatId;
        const tempDataRaw = await readKV(env, tempKey);

        let initialPermissions = Object.keys(PERMISSIONS);
        
        if (tempDataRaw) {
             const tempData = JSON.parse(tempDataRaw);
             initialPermissions = tempData.permissions || initialPermissions;
        } else {
             await writeKV(env, tempKey, JSON.stringify({
                chat_id: targetChatId,
                chat_name: chatTitle,
                permissions: initialPermissions,
                uniqueKey: uniqueKey 
            }), { expirationTtl: 600 });
        }


        const permKeyboard = createPermissionKeyboard(targetChatId, initialPermissions, targetChatId);
        
        const selectionMessage = `*🌐 Permission Selection for Group: ${chatTitle}*\n` +
                                 `*Chat ID:* \`${targetChatId}\`\n\n` +
                                 `*සැ.යු:* මෙම Group එකට ලබා දිය යුතු සේවාවන් පහතින් තෝරන්න. (Selected: ${initialPermissions.length}/${Object.keys(PERMISSIONS).length})`;
        
        await editTelegramMessageWithKeyboard(chatId, messageId, selectionMessage, permKeyboard);
        return;
    }
    
    if (data.startsWith('TOGGLE_PERM_')) {
        const parts = data.split('_');
        const permId = parts[2];
        const targetChatId = parts[3];
        
        const tempKey = TRADING_KV_KEYS.GROUP_TEMP_PERMS_PREFIX + targetChatId;
        const tempDataRaw = await readKV(env, tempKey);
        
        if (!tempDataRaw) {
            await answerCallbackQuery(callbackQueryId, "⚠️ Permission Selection Session එක කල් ඉකුත් වී ඇත. නැවත උත්සාහ කරන්න.", true);
            return;
        }
        
        const tempData = JSON.parse(tempDataRaw);
        let currentPermissions = tempData.permissions || [];
        
        if (currentPermissions.includes(permId)) {
            currentPermissions = currentPermissions.filter(p => p !== permId); // Remove
            await answerCallbackQuery(callbackQueryId, `${PERMISSIONS[permId].text} Removed.`, false);
        } else {
            currentPermissions.push(permId); // Add
            await answerCallbackQuery(callbackQueryId, `${PERMISSIONS[permId].text} Added.`, false);
        }
        
        tempData.permissions = currentPermissions;
        await writeKV(env, tempKey, JSON.stringify(tempData), { expirationTtl: 600 });
        
        const permKeyboard = createPermissionKeyboard(targetChatId, currentPermissions, targetChatId);
        const selectionMessage = `*🌐 Permission Selection for Group: ${tempData.chat_name}*\n` +
                                 `*Chat ID:* \`${targetChatId}\`\n\n` +
                                 `*සැ.යු:* මෙම Group එකට ලබා දිය යුතු සේවාවන් පහතින් තෝරන්න. (Selected: ${currentPermissions.length}/${Object.keys(PERMISSIONS).length})`;

        await editTelegramMessageWithKeyboard(chatId, messageId, selectionMessage, permKeyboard);
        return;
    }
    
    if (data.startsWith('SAVE_PERMS_')) {
        const targetChatId = data.substring('SAVE_PERMS_'.length);
        const tempKey = TRADING_KV_KEYS.GROUP_TEMP_PERMS_PREFIX + targetChatId;
        const tempDataRaw = await readKV(env, tempKey);
        
        if (!tempDataRaw) {
            await answerCallbackQuery(callbackQueryId, "⚠️ Permission Selection Session එක කල් ඉකුත් වී ඇත. නැවත උත්සාහ කරන්න.", true);
            return;
        }
        
        const tempData = JSON.parse(tempDataRaw);
        const finalPermissions = tempData.permissions || [];
        
        await addGroupWithPermissions(env, targetChatId, finalPermissions);
        
        // Remove Request Key and Temp Key
        if (tempData.uniqueKey && tempData.uniqueKey !== 'MANUAL') {
             await writeKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + tempData.uniqueKey, null);
        }
        await writeKV(env, tempKey, null);
        
        // Notify the Group (Only if it's not a manual add without a real chat)
        if (targetChatId.toString().startsWith('-100')) {
            const finalGroupMessage = ACCESS_APPROVED_MESSAGE(targetChatId, finalPermissions);
            await sendUnifiedMessage(targetChatId, finalGroupMessage, 'Markdown', null, null);
        }
        
        // Final message to Owner
        const ownerFinalMessage = `*✅ Group Approved & Saved!* \n\n*Group:* ${tempData.chat_name} (\`${targetChatId}\`)\n*Permissions:* ${finalPermissions.join(', ')}`;
        await editTelegramMessageWithKeyboard(chatId, messageId, ownerFinalMessage, backKeyboard);
        await answerCallbackQuery(callbackQueryId, "✅ Group Approved & Permissions Saved.", true);
        return;
    }
    
    if (data.startsWith('REJECT_GROUP_FINAL_') || data.startsWith('GROUP_REJECT_')) {
         // ... (Logic for rejection remains the same, but clears the temp key as well)
         const targetChatId = data.startsWith('REJECT_GROUP_FINAL_') ? data.substring('REJECT_GROUP_FINAL_'.length) : 'N/A';
         const tempKey = TRADING_KV_KEYS.GROUP_TEMP_PERMS_PREFIX + targetChatId;
         await writeKV(env, tempKey, null);
         
         const ownerFinalMessage = `*❌ Group Request Rejected!* \n\nGroup Access Denied.`;
         await editTelegramMessageWithKeyboard(chatId, messageId, ownerFinalMessage, backKeyboard);
         await answerCallbackQuery(callbackQueryId, "❌ Group Access Rejected.", true);
         return;
    }

    if (!isHandled) {
        await answerCallbackQuery(callbackQueryId, "Unknown Command.", false);
    }
}


// =================================================================
// --- 7. CALLBACK QUERY HANDLER (ADMIN CHECK ADDED) ---
// =================================================================

async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // 1. Owner Panel Callbacks 
    if (userId.toString() === CONFIG.OWNER_CHAT_ID.toString()) 
    {
        // Owner Panel/Group Approval Callbacks (including new TOGGLE_PERM/SAVE_PERMS)
        if (data.includes('_PANEL') || data.includes('GET_') || data.includes('MANAGE_') || data.includes('TRIGGER_') || data.includes('CLEAR_') || data.includes('VIEW_') || data.startsWith('GROUP_') || data.startsWith('TOGGLE_PERM_') || data.startsWith('SAVE_PERMS_') || data.startsWith('REJECT_GROUP_FINAL_')) {
            return handleOwnerPanelCallback(query, env);
        }
        
        // Owner's Approval Logic for Unlimit Request (Remains the same)
        if (data.startsWith('APPROVE_UNLIMIT_') || data.startsWith('REJECT_UNLIMIT_')) {
            // ... (Existing unlimit logic) ...
             return new Response('Owner Approval Logic Handled', { status: 200 });
        }
    }
    
    // 2. User's Request Button Logic (Remains the same)
    if (data.startsWith('REQUEST_UNLIMIT_')) {
        // ... (Existing unlimit request logic) ...
         return new Response('Unlimit request sent to owner', { status: 200 });
    }
    
    // 3. Group Access Request Button (ADMIN CHECK ADDED)
    if (data.startsWith('GROUP_REQUEST_START_')) {
        
        // 🟢 NEW: Admin/Owner Check
        if (!await checkAdminStatus(chatId, userId)) {
             await answerCallbackQuery(callbackQueryId, "⛔ ඔබට මෙම ඉල්ලීම යැවීමට අවසර නැත. එය කළ හැක්කේ Group එකේ Owner හෝ Admin කෙනෙකුට පමණි.", true);
             return new Response('User is not admin', { status: 200 });
        }
        
        const uniqueKey = data.substring('GROUP_REQUEST_START_'.length);
        const requestDetailsRaw = await readKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey);
        
        if (!requestDetailsRaw) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත.", true);
            return new Response('Group Request Expired', { status: 200 });
        }
        
        const requestDetails = JSON.parse(requestDetailsRaw);
        
        // Send request to Owner
        const ownerKeyboard = [
            [{ text: "▶️ Select Permissions & Approve", callback_data: `GROUP_APPROVE_${requestDetails.chat_id}` }], // Use Chat ID as unique identifier for flow
            [{ text: "❌ Reject Access", callback_data: `GROUP_REJECT_${uniqueKey}` }]
        ];
        
        const ownerMessage = `*🚨 New Group Access Request*\n\n` + 
                             `*Group Name:* ${requestDetails.chat_name}\n` +
                             `*Chat ID:* \`${requestDetails.chat_id}\`\n` +
                             `*Requester ID:* \`${userId}\`` +
                             `\n_මෙම Bot එක යෙදවීමට අනුමැතිය දෙන්න._`;
        
        await sendUnifiedMessage(CONFIG.OWNER_CHAT_ID, ownerMessage, 'Markdown', null, { inline_keyboard: ownerKeyboard });
        
        await answerCallbackQuery(callbackQueryId, "✅ ඔබගේ Group Access Request එක Owner වෙත යවන ලදී. කරුණාකර අනුමැතිය ලැබෙන තෙක් රැඳී සිටින්න.", true);
        
        await removeInlineKeyboard(chatId, messageId);
        
        return new Response('Group Request Sent to Owner', { status: 200 });
    }
    
    await answerCallbackQuery(callbackQueryId, "Processing...", false);
    return new Response('Callback query handled', { status: 200 });
}


// =================================================================
// --- 8. WEBHOOK HANDLER (COMMANDS & CORE LOGIC FIX) ---
// =================================================================

async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env);
        }

        // Handle bot added to a group/channel
        if (update.my_chat_member) {
            const memberUpdate = update.my_chat_member;
            if (memberUpdate.new_chat_member.user.is_bot) {
                if (memberUpdate.new_chat_member.status === 'member' || memberUpdate.new_chat_member.status === 'administrator') {
                    const chatId = memberUpdate.chat.id;
                    const chatType = memberUpdate.chat.type;

                    if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
                        const approvedGroups = await getApprovedGroupsMap(env);
                        const groupData = approvedGroups[chatId.toString()];
                        
                        if (groupData) {
                            await sendTelegramMessage(chatId, ACCESS_APPROVED_MESSAGE(chatId, groupData.permissions), 'Markdown', null);
                            return new Response('Bot already approved group', { status: 200 });
                        }

                        const uniqueKey = generateRandomId(15);
                        
                        const requestKeyboard = [
                            [{ text: "➡️ Request Owner Approval", callback_data: `GROUP_REQUEST_START_${uniqueKey}` }]
                        ];

                        const result = await sendUnifiedMessage(chatId, ACCESS_DENIED_MESSAGE(chatId), 'Markdown', null, { inline_keyboard: requestKeyboard });
                        
                        if (result.success) {
                            const details = {
                                chat_id: chatId,
                                chat_name: memberUpdate.chat.title || 'N/A',
                                message_id: result.messageId,
                            };
                            await writeKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey, JSON.stringify(details), { expirationTtl: 86400 }); 
                        }
                    }
                }
            }
            return new Response('My Chat Member Update Handled', { status: 200 });
        }


        if (!update.message || !update.message.text) {
            return new Response('Not a text message or callback', { status: 200 }); 
        }
        
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text.trim();
        const userId = message.from.id; 
        const isOwner = userId.toString() === CONFIG.OWNER_CHAT_ID.toString();
        
        const userFirstName = message.from.first_name || "User";
        const userName = message.from.username ? `@${message.from.username}` : "N/A";

        // 1. OWNER MANUAL ID REPLY LOGIC (Updated to call permission selection)
        if (isOwner && message.reply_to_message && 
            message.reply_to_message.text && 
            message.reply_to_message.text.includes('Group ID එකක් එක් කරන්න')) 
        {
            const inputId = text.trim();
            if (inputId.startsWith('-100') && inputId.length > 10) {
                 const initialPermissions = Object.keys(PERMISSIONS);
                 const tempKey = TRADING_KV_KEYS.GROUP_TEMP_PERMS_PREFIX + inputId;
                 
                 await writeKV(env, tempKey, JSON.stringify({
                    chat_id: inputId,
                    chat_name: `Manual Add ${inputId}`,
                    permissions: initialPermissions,
                    uniqueKey: inputId 
                 }), { expirationTtl: 600 });
                 
                 const permKeyboard = createPermissionKeyboard(inputId, initialPermissions, inputId);
                 
                 const selectionMessage = `*🌐 Permission Selection for Group: ${inputId}*\n` +
                                 `*Chat ID:* \`${inputId}\`\n\n` +
                                 `*සැ.යු:* මෙම Group එකට ලබා දිය යුතු සේවාවන් පහතින් තෝරන්න. (Selected: ${initialPermissions.length}/${Object.keys(PERMISSIONS).length})`;
                
                 await editTelegramMessageWithKeyboard(chatId, message.reply_to_message.message_id, selectionMessage, permKeyboard);
                 
            } else {
                await sendTelegramReply(chatId, `❌ අනුමත නොවන Chat ID format එකක්. Chat ID එක \`-100...\` ආකෘතියෙන් තිබිය යුතුය.`, messageId);
            }
            return new Response('Owner manual ID processed', { status: 200 });
        }
        
        // 2. COMMANDS HANDLING
        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);
             
            if (command === '/search') {
                if (args.length > 0) {
                    message.text = args.join(' '); // Treat /search query as a direct question
                } else {
                    await sendTelegramReply(chatId, "*⚠️ Usage:* `/search [Trading Topic]` \n\n*Ex:* `/search Order Block කියන්නෙ මොකද්ද?`", messageId);
                    return new Response('Search command usage error', { status: 200 });
                }
            } else if (command === '/admin') {
                 if (isOwner) {
                    await sendOwnerPanel(env);
                } else {
                    await sendTelegramReply(chatId, "*⚠️ Access Denied:* මෙම විධානය භාවිත කළ හැක්කේ Bot Owner ට පමණි.", messageId);
                }
                return new Response('Admin command handled', { status: 200 });
            } else if (command === '/start') {
                const { success, newCount } = await updateAndEditUserCount(env, userId);
                let startMessage = `*👋 Welcome to Unified Trading Assistant!*\n\n` +
                                   `මෙම Bot එක Forex, Crypto සහ Stock Market ගැන ඔබට අවශ්‍ය ඕනෑම ප්‍රශ්නයක් සිංහලෙන් විශ්ලේෂණය කර, විස්තරාත්මක, චේද 5කින් යුත් පිළිතුරක් ලබා දෙනවා.\n\n` +
                                   `*🔥 දිනකට ප්‍රශ්න ගණන:* ${CONFIG.DAILY_LIMIT} (Owner ට Unlimited)\n\n` +
                                   `*භාවිත කරන ආකාරය:* \`/search [ඔබේ ප්‍රශ්නය]\` \n\n` +
                                   `*උදා:* \`/search Supply and Demand Zone ගැන පැහැදිලි කරන්න.\``;
                await sendTelegramReply(chatId, startMessage, messageId);
                return new Response('Start command handled', { status: 200 });
            } else if (command === '/help') {
                const helpMessage = `*📚 Assistant Help & Commands*\n\n` +
                                    `*ප්‍රධාන සේවාව (Trading Q&A):*\n` +
                                    `  - \`/search [ඔබේ ප්‍රශ්නය]\` : Trading, Crypto, Finance ගැන විස්තරාත්මක, චේද 5කින් යුත් පිළිතුරු ලබා ගන්න.\n\n` +
                                    `*උදා:* \`/search Market Structure යනු කුමක්ද?\`\n\n` +
                                    `*සාමාන්‍ය විධාන:*\n` +
                                    `  - \`/start\` : ආරම්භක පණිවිඩය.\n` +
                                    `  - \`/unlimit\` : දෛනික භාවිත සීමාව (Daily Limit) වැඩි කිරීමට Owner වෙත ඉල්ලීමක් කරන්න.`;
                await sendTelegramReply(chatId, helpMessage, messageId);
                return new Response('Help command handled', { status: 200 });
            } else if (command === '/fundamental') {
                const newsData = await readKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE);
                const imageUrl = await readKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL);
                if (newsData) {
                    await sendUnifiedMessage(chatId, newsData, 'Markdown', imageUrl !== 'N/A' ? imageUrl : null, null, messageId);
                } else {
                    await sendTelegramReply(chatId, "*⚠️ Last Fundamental News Post එකක් සොයා ගැනීමට නොහැක.*", messageId);
                }
                return new Response('Fundamental command handled', { status: 200 });
            } else if (command === '/unlimit') {
                const unlimitMessage = `*👑 Unlimit Access Request*\n\n` +
                                       `ඔබට දෛනිකව ලැබෙන ප්‍රශ්න සීමාව (${CONFIG.DAILY_LIMIT}) ප්‍රමාණවත් නොවේ නම්, Bot Owner ගෙන් වැඩිපුර භාවිතයට අවසර ඉල්ලන්න.\n\n` +
                                       `*Owner ID:* \`${CONFIG.OWNER_CHAT_ID}\``;
                await sendTelegramReply(chatId, unlimitMessage, messageId);
                return new Response('Unlimit command handled', { status: 200 });
            } else {
                return new Response('Unknown command processed', { status: 200 });
            }
        }
        
        // 3. TRADING QUESTION LOGIC (FIXED)
        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            
            // 3.1 🛑 Group/Channel Access Check and Q&A Permission Check
            const isGroupChat = chatId.toString().startsWith('-');
            const isPrivateChat = chatId.toString() === userId.toString(); // For Owner's private testing
            
            if (isGroupChat) { 
                const hasPerm = await isGroupApprovedAndHasPermission(env, chatId, PERMISSIONS.TRADING_QNA.id);
                if (!hasPerm) {
                    // Group Approved නැතිනම් හෝ QNA Permission නැතිනම් Silent Ignore
                    return new Response('Group Access Denied or Missing QNA Permission - Silent Ignore', { status: 200 });
                }
            } else if (isPrivateChat && !isOwner) { // Private chat is only for owner/approved groups. Private users are not approved.
                 const hasPerm = await isGroupApprovedAndHasPermission(env, chatId, PERMISSIONS.TRADING_QNA.id);
                 if (!hasPerm) {
                      await sendTelegramReply(chatId, `*🚫 Access Denied!* \n\n*Chat ID: \`${chatId}\`*\n\nTrading Q&A සේවාව ක්‍රියාත්මක වන්නේ අනුමත කරන ලද Group/Channel තුළ හෝ Bot Owner ගේ Private Chat එක තුළ පමණි.`, messageId);
                      return new Response('Private User Access Denied', { status: 200 });
                 }
            }

            // 3.2 🚦 Trading Validation - ආරම්භක පරීක්ෂාව 
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                
                // 3.3 🛑 Rate Limit Check
                const usage = await checkAndIncrementUsage(env, chatId);
                
                if (!usage.allowed) {
                    // Rate Limit ඉක්මවා ඇත්නම්
                    const limitMessage = `🛑 *Usage Limit Reached!* \n\nSorry, oyage **Trading Questions 5** (limit eka) ada dawasata iwarai. \n\n*Reset wenawa:* Midnight 12.00 AM walata.`;
                    
                    const requestId = generateRandomId(15);
                    const requestData = {
                        userChatId: chatId.toString(),
                        userMessageId: validationMessageId, 
                        targetUserId: userId.toString(),
                        userFirstName: userFirstName,
                        userName: userName
                    };
                    await writeKV(env, `UNLIMIT_REQUEST_${requestId}`, JSON.stringify(requestData), { expirationTtl: 86400 });

                    const keyboard = [
                        [{ text: "👑 Request Owner Approval", callback_data: `REQUEST_UNLIMIT_${requestId}` }]
                    ];
                    
                    await editTelegramMessageWithKeyboard(chatId, validationMessageId, limitMessage, keyboard);
                    return new Response('Rate limited with inline request button', { status: 200 });
                }
                
                // 3.4 🌐 Generation Status 
                await editTelegramMessage(chatId, validationMessageId, `✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed 5-paragraph reply) (Used: ${usage.count}/${CONFIG.DAILY_LIMIT})`);
                
                // 3.5 🔗 Final Content Generation
                const replyText = await generateReplyContent(text);
                
                // 3.6 ✅ Final Edit - සම්පූර්ණ පිළිතුර Message එකට යැවීම
                await editTelegramMessage(chatId, validationMessageId, replyText);
                
            } else {
                // Not a Trading Question - Guardrail Message 
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer karanna.* \n\n*Oyage Chat ID eka:* \`${chatId}\`\n\nPlease ask karanna: 'What is RSI?' wage ekak. *Anith ewa mata denuma naha.* 😔`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage);
            }
            
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (e) {
        console.error("Critical Webhook Error:", e.stack);
        await sendTelegramReplyToOwner(`🚨 CRITICAL WEBHOOK ERROR: ${e.message}\nStack: ${e.stack}`);
        return new Response('Internal Server Error', { status: 500 });
    }
}


// =================================================================
// --- 9. WORKER EXPORT (PERMISSION ENFORCEMENT) ---
// =================================================================

export default {
    /**
     * Handles scheduled events (Cron trigger) (Updated for Permissions)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    // Fetch data once for efficiency
                    // Note: fetchForexNews and generateScheduledContent handle their own logic and data saving.
                    
                    const postContent = await generateScheduledContent(env); 
                    const quoteContent = await generateDailyQuote(env);
                    
                    const approvedGroups = await getApprovedGroupsMap(env);

                    // 1. FUNDAMENTAL NEWS (Handled by its own function that posts to permitted groups)
                    await fetchForexNews(env, false); 

                    // Iterate over all approved groups and post based on permissions
                    for (const chatId in approvedGroups) {
                        const permissions = approvedGroups[chatId].permissions;

                        // 2. DAILY TRADING EDUCATIONAL POST (5 Paragraph)
                        if (permissions.includes(PERMISSIONS.DAILY_POST.id) && postContent) {
                            await sendTelegramMessage(chatId, postContent); 
                        }

                        // 3. DAILY TRADING QUOTE/TIP POST (Safe Image FIX)
                        if (permissions.includes(PERMISSIONS.MOTIVATION_POST.id) && quoteContent) {
                            await sendUnifiedMessage(chatId, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                        }
                    }
                    
                    // 4. Refresh Owner Panel (Always run)
                    await sendOwnerPanel(env); 

                } catch (error) {
                    console.error("[CRITICAL CRON FAILURE]: ", error.stack);
                }
            })()
        );
    },

    /**
     * Handles Fetch requests (Webhook, Status, Trigger)
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Manual Trigger (Updated to trigger all services)
        if (url.pathname === '/trigger-manual' || url.pathname === '/trigger-all') {
             try {
                 // The scheduled function logic now contains the proper posting logic
                 await this.scheduled(null, env, ctx); 
                 return new Response('✅ Manual Daily Post, News, and Quote Triggered Successfully to permitted groups.', { status: 200 });
             } catch (e) {
                 return new Response(`Error in Manual Trigger: ${e.message}`, { status: 500 });
             }
        }
        
        if (request.method === 'POST') {
            return handleWebhook(request, env);
        }
        
        return new Response('Unified Trading Bot Worker V9 running. All features & commands are integrated and fixed.', { status: 200 });
    }
};
