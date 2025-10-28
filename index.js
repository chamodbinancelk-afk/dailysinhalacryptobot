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
    TELEGRAM_CHAT_ID: "-1003111341307", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", 
    
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
    OWNER_PANEL_MESSAGE_ID: 'OWNER_PANEL_MSG_ID', // 🛑 FIX: This key is now crucial for panel edit
    APPROVED_GROUPS: 'APPROVED_GROUPS_MAP', 
    GROUP_REQUEST_PREFIX: 'GROUP_REQ_', 
    GROUP_TEMP_PERMS_PREFIX: 'GROUP_TEMP_PERMS_', 
};

// News Specific KV Keys
const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'news_last_forex_headline', 
    LAST_FULL_MESSAGE: 'news_last_full_news_message', 
    LAST_IMAGE_URL: 'news_last_image_url', 
};

// 🟢 Group Permission Definitions
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
 * Checks if a user is an admin or creator in a chat.
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

// Helper for sending replies to owner (for command responses)
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
        const data = await response.json();
        if (!data.ok) {
            // 🛑 Telegram API Error එක Log කරන්න
            console.error(`Edit Photo Caption Failed (ID: ${messageId}):`, data.description);
        }
        return data; // Return full data to check `ok` status externally
    } catch (e) {
        console.error("Edit Photo Caption Critical Error:", e.message);
        return { ok: false };
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

function generateRandomId(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

async function updateAndEditUserCount(env, userId) {
    const USER_SET_KEY = TRADING_KV_KEYS.BOT_USER_SET; 
    const COUNT_POST_ID_KEY = TRADING_KV_KEYS.COUNT_POST_ID; 
    const DAILY_COUNT_KEY = TRADING_KV_KEYS.DAILY_COUNT_KEY; 

    const userIdString = userId.toString();

    const userSetRaw = await readKV(env, USER_SET_KEY, 'text');
    const userSet = userSetRaw ? JSON.parse(userSetRaw) : [];
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

            // Use the updated editPhotoCaption that returns data.ok
            const editResult = await editPhotoCaption(chatId, parseInt(messageId), newCaption, null);
            
            return { success: editResult.ok, newCount: totalCount };
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
    try {
        const response = await fetch(FF_NEWS_URL, { headers: HEADERS });
        const html = await response.text();
        const $ = load(html);
        
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
        
        const articleLink = firstNewsRow.find('.calendar__cell--news a').attr('href');
        let description = FALLBACK_DESCRIPTION_EN;
        let image = null;

        if (articleLink) {
            const fullArticleURL = `https://www.forexfactory.com${articleLink}`;
            const articleResponse = await fetch(fullArticleURL, { headers: HEADERS });
            const articleHtml = await articleResponse.text();
            const article$ = load(articleHtml);
            
            description = article$('.article__body').text().trim() || FALLBACK_DESCRIPTION_EN;
            
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

    // 🟢 Check ALL approved groups and post only to those with NEWS permission
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
    
    // Save state only if successfully posted to at least one group or if manually triggered
    if (successCount > 0 || isManual) { 
        await writeKV(env, NEWS_KV_KEYS.LAST_HEADLINE, newsData.headline);
        await writeKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE, fullMessage);
        await writeKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL, newsData.image || 'N/A');
    }
}


// =================================================================
// --- 3. TRADING Q&A LOGIC ---
// =================================================================

/**
 * Generates the content for the Daily Educational Post (5 Paragraphs).
 */
async function generateScheduledContent(env) {
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
// --- 4. DAILY QUOTE/TIP LOGIC ---
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
// --- 5. GROUP MANAGEMENT LOGIC ---
// =================================================================

/**
 * Fetches the approved groups map.
 */
async function getApprovedGroupsMap(env) {
    const raw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS, 'json');
    return raw && typeof raw === 'object' ? raw : {};
}

/**
 * Checks if the given Chat ID is approved and has a specific permission.
 */
async function isGroupApprovedAndHasPermission(env, chatId, permission) {
    const approvedGroups = await getApprovedGroupsMap(env);
    const groupData = approvedGroups[chatId.toString()];
    
    return groupData && groupData.permissions && groupData.permissions.includes(permission);
}

/**
 * Adds a Group Chat ID to the approved whitelist with permissions.
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
// --- 6. OWNER PANEL LOGIC (FIXED TO COMMAND-BASED) ---
// =================================================================

/**
 * Generates and sends/edits the main Admin Panel message to the Owner. (FIXED: No more buttons)
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
    
    // 2. Main Caption (Commands List එක එකතු කරන ලදි)
    const caption = `*👑 Owner Admin Panel 📊*\n\n` +
                    `*⏰ System Time:* ${currentTime} (SL Time)\n\n` +
                    `*👥 Total Users:* ${totalUsers.toLocaleString()}\n` +
                    `*🌐 Approved Groups:* ${totalApprovedGroups}\n` + 
                    `*🔥 Daily New Users:* +${dailyCount.toLocaleString()}\n` +
                    `*💬 Today Q&A Requests:* ${totalQnaRequests.toLocaleString()}\n\n` + 
                    `*📰 Last News Post:* ${lastHeadline.substring(0, 40)}...\n` +
                    `*📚 Last Edu Topic:* ${lastTopic}\n\n` +
                    `--- \n\n*⚙️ Admin Commands (Owner Only):*\n` +
                    `\`/admin\` - Panel Refresh කරන්න.\n` +
                    `\`/news\` - Fundamental News සෘජුවම Trigger කරන්න.\n` +
                    `\`/edu\` - Daily Educational Post Trigger කරන්න.\n` +
                    `\`/quote\` - Daily Motivation Post Trigger කරන්න.\n` +
                    `\`/groups\` - Group Approvals කළමනාකරණය කරන්න.\n` + 
                    `\`/stats\` - KV Stats බලන්න. (Manual response)`;

    // 3. Inline Keyboard: REMOVED (replyMarkup = null)
    const replyMarkup = null; 
    const panelMessageId = await readKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID);

    let result = { success: false, messageId: null };

    if (panelMessageId) {
        // 1. පණිවිඩය තිබේ නම්, එය Edit කරන්න. 
        const editResult = await editPhotoCaption(ownerChatId, parseInt(panelMessageId), caption, replyMarkup);
        
        if (editResult.ok) { 
            result = { success: true, messageId: parseInt(panelMessageId) };
        } else {
            // 🛑 Edit අසමත් වුවහොත් (Telegram error), පැරණි ID එක ඉවත් කර අලුතින් යවන්න.
            console.error(`EDIT FAILED for old message ID ${panelMessageId}. KV ID set to null.`);
            await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, null);
            
            // 3. Edit අසමත් වුවහොත්, අලුතින් යවන්න.
            result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
        }
    } else {
        // 4. කිසිදු ID එකක් KV එකේ නොමැති නම්, අලුතින් යවන්න.
        result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
    }

    if (result.success && result.messageId) {
        // 5. ID එක නැවත Save කරන්න. (KV Save FIX)
        await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, result.messageId.toString());
    } else if (panelMessageId && !result.success) {
        // 6. අලුත් message එකත් යැවීමට බැරි වුනොත්, KV ID එක clear කරන්න.
         await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, null); 
    }
}


// =================================================================
// --- 7. CALLBACK QUERY HANDLER (CLEANED) ---
// =================================================================

async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    
    // 🛑 All Owner Panel Callbacks are now removed.
    
    // Group Access Request Button (ADMIN CHECK ADDED)
    if (data.startsWith('GROUP_REQUEST_START_')) {
        
        // 🟢 NEW: Admin/Owner Check
        if (!await checkAdminStatus(chatId, userId)) {
             // Answer immediately to prevent "too old" error
             await answerCallbackQuery(callbackQueryId, "⛔ ඔබට මෙම ඉල්ලීම යැවීමට අවසර නැත. එය කළ හැක්කේ Group එකේ Owner හෝ Admin කෙනෙකුට පමණි.", true);
             return new Response('User is not admin', { status: 200 });
        }
        
        // ... (Actual logic to send request to owner) ...
        const uniqueKey = data.substring('GROUP_REQUEST_START_'.length);
        const requestDetailsRaw = await readKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey);
        
        if (!requestDetailsRaw) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත.", true);
            return new Response('Group Request Expired', { status: 200 });
        }
        
        const requestDetails = JSON.parse(requestDetailsRaw);
        
        // 🛑 Owner Panel is Command-based, but we still need a keyboard for this specific approval.
        const ownerKeyboard = [
            [{ text: "✅ Approve & All Permissions", callback_data: `GROUP_APPROVE_ALL_${requestDetails.chat_id}` }],
            [{ text: "❌ Reject Access", callback_data: `GROUP_REJECT_${requestDetails.chat_id}` }]
        ];
        
        const ownerMessage = `*🚨 New Group Access Request*\n\n` + 
                             `*Group Name:* ${requestDetails.chat_name}\n` +
                             `*Chat ID:* \`${requestDetails.chat_id}\`\n` +
                             `*Requester ID:* \`${userId}\`` +
                             `\n_මෙම Bot එක යෙදවීමට අනුමැතිය දෙන්න._`;
        
        await sendUnifiedMessage(CONFIG.OWNER_CHAT_ID, ownerMessage, 'Markdown', null, { inline_keyboard: ownerKeyboard });
        
        await answerCallbackQuery(callbackQueryId, "✅ ඔබගේ Group Access Request එක Owner වෙත යවන ලදී. කරුණාකර අනුමැතිය ලැබෙන තෙක් රැඳී සිටින්න.", true);
        
        return new Response('Group Request Sent to Owner', { status: 200 });
    }
    
    // 🛑 OWNER GROUP APPROVAL CALLBACKS (Simplified)
    if (userId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        const targetChatId = data.substring(data.lastIndexOf('_') + 1);
        
        if (data.startsWith('GROUP_APPROVE_ALL_')) {
            const allPerms = Object.keys(PERMISSIONS);
            await addGroupWithPermissions(env, targetChatId, allPerms);

            const finalGroupMessage = ACCESS_APPROVED_MESSAGE(targetChatId, allPerms);
            await sendUnifiedMessage(targetChatId, finalGroupMessage, 'Markdown', null, null);
            await answerCallbackQuery(callbackQueryId, "✅ Group Approved with All Permissions.", true);

            await sendTelegramReplyToOwner(`*✅ Group Approved & Saved!* \n\n*Chat ID:* \`${targetChatId}\`\n*Permissions:* All`);
            return new Response('Owner approved group', { status: 200 });
        }
        
        if (data.startsWith('GROUP_REJECT_')) {
             await answerCallbackQuery(callbackQueryId, "Group Rejected.", true);
             await sendTelegramReplyToOwner(`*❌ Group Request Rejected!* \n\nGroup Access Denied to \`${targetChatId}\``);
             return new Response('Owner rejected group', { status: 200 });
        }
    }


    await answerCallbackQuery(callbackQueryId, "Processing...", false);
    return new Response('Callback query handled', { status: 200 });
}


// =================================================================
// --- 8. WEBHOOK HANDLER (COMMANDS ADDED) ---
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

        // 1. OWNER MANUAL ID REPLY LOGIC (REMOVED: Use /groups command for manual approval)
        
        // 2. COMMANDS HANDLING
        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);
             
            if (command === '/search') {
                if (args.length > 0) {
                    message.text = args.join(' '); 
                } else {
                    await sendTelegramReply(chatId, "*⚠️ Usage:* `/search [Trading Topic]` \n\n*Ex:* `/search Order Block කියන්නෙ මොකද්ද?`", messageId);
                    return new Response('Search command usage error', { status: 200 });
                }
            } else if (command === '/admin') { // Owner Panel Refresh
                 if (isOwner) { 
                     await sendOwnerPanel(env); 
                 }
                 return new Response('Admin panel refresh handled', { status: 200 });
            } else if (command === '/news') { // News Trigger
                 if (isOwner) {
                     await fetchForexNews(env, true);
                     await sendTelegramReplyToOwner("*✅ Fundamental News Triggered!* \n\nCheck the permitted groups.");
                 }
                 return new Response('News trigger handled', { status: 200 });
            } else if (command === '/edu') { // Educational Post Trigger
                 if (isOwner) {
                     const postContent = await generateScheduledContent(env); 
                     if (postContent) {
                         // Post to all groups with permission (Logic from scheduled handler)
                         const groups = await getApprovedGroupsMap(env);
                         for (const groupChatId in groups) {
                             if (groups[groupChatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                                 await sendTelegramMessage(groupChatId, postContent);
                             }
                         }
                         await sendTelegramReplyToOwner("*✅ Daily Educational Post Triggered!*");
                     }
                 }
                 return new Response('Edu post trigger handled', { status: 200 });
            } else if (command === '/quote') { // Quote Trigger
                 if (isOwner) {
                     const quoteContent = await generateDailyQuote(env);
                     if (quoteContent) {
                         // Post to all groups with permission (Logic from scheduled handler)
                         const groups = await getApprovedGroupsMap(env);
                         for (const groupChatId in groups) {
                             if (groups[groupChatId].permissions.includes(PERMISSIONS.MOTIVATION_POST.id)) {
                                 await sendUnifiedMessage(groupChatId, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                             }
                         }
                         await sendTelegramReplyToOwner("*✅ Daily Motivation Post Triggered!*");
                     }
                 }
                 return new Response('Quote trigger handled', { status: 200 });
            } else if (command === '/groups') { // Manage Groups (Manual Response)
                 if (isOwner) {
                      const approvedGroups = await getApprovedGroupsMap(env);
            
                      let groupMessage = `*🌐 Approved Groups (${Object.keys(approvedGroups).length}):*\n\n`;
                      
                      if (Object.keys(approvedGroups).length > 0) {
                          for (const id in approvedGroups) {
                               groupMessage += `\`${id}\` - ${approvedGroups[id].permissions.length} perms\n`;
                          }
                      } else {
                          groupMessage += "_දැනට කිසිදු Group එකක් අනුමත කර නැත._";
                      }
                      
                      await sendTelegramReplyToOwner(groupMessage + "\n\n*Manual Add:* Bot එක Group එකට Add කරන්න, එවිට ඔබට Request එක ලැබෙනු ඇත.");
                 }
                 return new Response('Group list handled', { status: 200 });
            } else if (command === '/stats') { // KV Stats (Manual Response)
                 if (isOwner) {
                     const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE) || 'N/A';
                     const lastTopic = await readKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC) || 'N/A';
                     const lastEdu = (await readKV(env, TRADING_KV_KEYS.LAST_EDU_CONTENT) || 'N/A').substring(0, 150) + '...';
                     
                     let statsMessage = `*📊 Last KV Data Check*\n\n` + 
                                        `*📰 Headline:* ${lastHeadline}\n` +
                                        `*📚 Last Topic:* ${lastTopic}\n` +
                                        `*Content Snippet:* ${lastEdu}`;
                                        
                     await sendTelegramReplyToOwner(statsMessage);
                 }
                 return new Response('Stats command handled', { status: 200 });
            } else if (command === '/start') {
                await updateAndEditUserCount(env, userId);
                 await sendTelegramReply(chatId, `👋 *ආයුබෝවන්, ${userFirstName}!*`, messageId);
                 return new Response('Start command handled', { status: 200 });
            } 
        }
        
        // 3. TRADING QUESTION LOGIC
        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            
            // 3.1 Group/Channel Access Check and Q&A Permission Check
            const isGroupChat = chatId.toString().startsWith('-');
            if (isGroupChat) { 
                const hasPerm = await isGroupApprovedAndHasPermission(env, chatId, PERMISSIONS.TRADING_QNA.id);
                if (!hasPerm) {
                    return new Response('Group Access Denied or Missing QNA Permission - Silent Ignore', { status: 200 });
                }
            }
            
            // 3.2 Trading Validation
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                
                // 3.3 Rate Limit Check
                const usage = await checkAndIncrementUsage(env, chatId);
                
                if (!usage.allowed) {
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
                
                // 3.4 Generation Status 
                await editTelegramMessage(chatId, validationMessageId, `✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed 5-paragraph reply) (Used: ${usage.count}/${CONFIG.DAILY_LIMIT})`);
                
                // 3.5 Final Content Generation
                const replyText = await generateReplyContent(text);
                
                // 3.6 Final Edit
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
// --- 9. WORKER EXPORT (FINAL) ---
// =================================================================

export default {
    /**
     * Handles scheduled events (Cron trigger)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    // Re-run news fetch and post logic for all groups
                    await fetchForexNews(env, false); 
                    
                    const postContent = await generateScheduledContent(env); 
                    const quoteContent = await generateDailyQuote(env);
                    
                    const approvedGroups = await getApprovedGroupsMap(env);

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
        
        // Manual Trigger 
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
        
        return new Response('Unified Trading Bot Worker V10 (Command Panel) running.', { status: 200 });
    }
};
