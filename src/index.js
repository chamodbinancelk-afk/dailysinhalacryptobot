// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio'; // For Forex Factory Scraping
import moment from 'moment-timezone'; // For Timezone Management

// =================================================================
// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️
// =================================================================

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක 
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක (පුවත් සහ Trading Posts යැවිය යුතු ප්‍රධාන ස්ථානය)
    TELEGRAM_CHAT_ID: "-1002947156921", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
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
    // V7 Group Management Keys
    APPROVED_GROUPS: 'APPROVED_GROUPS', 
    GROUP_REQUEST_PREFIX: 'GROUP_REQ_', 
};

// News Specific KV Keys
const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'news_last_forex_headline', 
    LAST_FULL_MESSAGE: 'news_last_full_news_message', 
    LAST_IMAGE_URL: 'news_last_image_url', 
};

const FF_NEWS_URL = "https://www.forexfactory.com/news";
const FALLBACK_DESCRIPTION_EN = "No description found.";
const HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.forexfactory.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};
const QUOTE_IMAGE_URL = "https://envs.sh/q3s.jpg"; 
const OWNER_PANEL_IMAGE_URL = "https://envs.sh/r0j.jpg"; 

// V7 Group Management Messages
const ACCESS_DENIED_MESSAGE = (chatId) => `
*🚫 Group Access Denied!*

*Owner Approval Required:*
මෙම Group/Channel (ID: \`${chatId}\`) තුළ Assistant Bot ක්‍රියාත්මක වීමට පෙර, Bot Owner ගේ අනුමැතිය අවශ්‍ය වේ.

කරුණාකර පහත Button එක භාවිතා කර Bot Owner වෙත Request එකක් යවන්න.
`;

const ACCESS_APPROVED_MESSAGE = (chatId) => `
*✅ Group Access Approved!*

Bot Owner විසින් මෙම Group එක තුළ Bot ක්‍රියාත්මක වීමට අනුමැතිය ලබා දී ඇත. 
ඔබට දැන් Bot භාවිතා කළ හැකිය.

*Chat ID:* \`${chatId}\`
`;

// =================================================================
// --- 1. CORE UTILITIES (KV, Telegram, Membership) ---
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
 * Sends a message to Telegram.
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
                if (apiMethod === 'sendPhoto' && currentImgUrl && currentImgUrl.includes('forexfactory.com')) { 
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
 * Checks if a user is a member of the required channel.
 */
async function checkChannelMembership(userId) {
    const TELEGRAM_API_URL = CONFIG.TELEGRAM_API_BASE;
    const CHAT_ID = CONFIG.TELEGRAM_CHAT_ID;

    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CHAT_ID) return true; 

    const url = `${TELEGRAM_API_URL}/getChatMember?chat_id=${CHAT_ID}&user_id=${userId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok && data.result) {
            const status = data.result.status;
            if (status === 'member' || status === 'administrator' || status === 'creator') {
                return true;
            }
        }
        return false; 
    } catch (error) {
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

// Helper for editing messages (Markdown only)
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

// Helper for editing messages with keyboard
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

async function deleteTelegramMessage(chatId, messageId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/deleteMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
            }),
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


// =================================================================
// --- 2. FOREX NEWS LOGIC ---
// =================================================================

/**
 * Uses Gemini to generate a short, Sinhala analysis of the news.
 */
async function getAIAnalysis(headline, description, env) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
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
 * Scrapes Forex Factory for the latest news.
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
                image = imageElement.attr('src');
            }
        }

        return { time, currency, impact, headline, description, image };

    } catch (e) {
        return null;
    }
}

/**
 * Main function to fetch news, analyze it, and post it.
 */
async function fetchForexNews(env) {
    const newsData = await getLatestForexNews();

    if (!newsData || !newsData.headline) return;

    const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE);
    
    // Check if the news is new or high impact
    if (newsData.headline === lastHeadline) return;
    if (newsData.impact === 'Low') return; 

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

    const result = await sendUnifiedMessage(
        CONFIG.TELEGRAM_CHAT_ID, 
        fullMessage, 
        'Markdown', 
        newsData.image 
    );

    if (result.success) {
        await writeKV(env, NEWS_KV_KEYS.LAST_HEADLINE, newsData.headline);
        await writeKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE, fullMessage);
        await writeKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL, newsData.image || 'N/A');
    }
}


// =================================================================
// --- 3. TRADING Q&A LOGIC ---
// =================================================================

/**
 * Generates the content for the Daily Educational Post.
 */
async function generateScheduledContent(env) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const coveredTopicsRaw = await readKV(env, TRADING_KV_KEYS.COVERED_TOPICS) || "[]";
    const coveredTopics = JSON.parse(coveredTopicsRaw);

    const systemPrompt = `You are an expert financial market educator. Your task is to generate a detailed, easy-to-understand educational post about a single trading topic for a beginner to intermediate audience in Sinhala. The post must be engaging, use bullet points, and include a clear call-to-action (CTA) to encourage further learning. The final output must be formatted using Telegram's **Markdown**. Do not use external links.`;
    
    const userQuery = `Generate today's comprehensive educational post. Exclude these topics: ${coveredTopics.join(', ')}. Focus on an important concept like Risk Management, Technical Analysis, Order Types, or Market Structure. Provide the Sinhala title first, then the content.`;

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
            
            // Update KV
            coveredTopics.push(newTopic);
            if (coveredTopics.length > 30) coveredTopics.shift(); 
            
            await writeKV(env, TRADING_KV_KEYS.COVERED_TOPICS, JSON.stringify(coveredTopics));
            await writeKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC, newTopic);
            await writeKV(env, TRADING_KV_KEYS.LAST_EDU_CONTENT, content); 

            return content;
        }
    } catch (e) {
    }
    return null;
}

/**
 * Generates the reply content for a user's Q&A query.
 */
async function generateReplyContent(query) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const systemPrompt = `You are a Trading Assistant specializing in Forex, Crypto, and Stock markets. Your goal is to answer user questions accurately, professionally, and helpfully in **SINHALA LANGUAGE**. Provide concise, direct answers. Do not use external links. Format the final output using Telegram's **Markdown**.`;
    
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
        
        return content + "\n\n---\n*💡 More questions? Ask away!*";

    } catch (e) {
        return "*⚠️ AI Generation Error.*";
    }
}

/**
 * Checks and increments the user's daily usage count.
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
 * Generates a short, motivational Sinhala trading tip or quote.
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
 * Checks if the given Chat ID is in the approved whitelist.
 */
async function isGroupApproved(env, chatId) {
    const approvedGroupsRaw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS) || "[]";
    const approvedGroups = JSON.parse(approvedGroupsRaw);
    return Array.isArray(approvedGroups) && approvedGroups.includes(chatId.toString());
}

/**
 * Adds a Group Chat ID to the approved whitelist.
 */
async function addGroupToWhitelist(env, chatId) {
    const approvedGroupsRaw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS) || "[]";
    let approvedGroups = JSON.parse(approvedGroupsRaw);
    
    if (!Array.isArray(approvedGroups)) approvedGroups = [];

    const chatIdString = chatId.toString();
    if (!approvedGroups.includes(chatIdString)) {
        approvedGroups.push(chatIdString);
        await writeKV(env, TRADING_KV_KEYS.APPROVED_GROUPS, JSON.stringify(approvedGroups));
        return true;
    }
    return false;
}


// =================================================================
// --- 6. OWNER PANEL LOGIC ---
// =================================================================

/**
 * Generates and sends the main Admin Panel message to the Owner.
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
    
    const approvedGroupsRaw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS) || "[]";
    const approvedGroups = JSON.parse(approvedGroupsRaw);
    const totalApprovedGroups = Array.isArray(approvedGroups) ? approvedGroups.length : 0;
    

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
        // Row 1: Key Information
        [{ text: "📊 All KV Stats", callback_data: 'GET_STATS' }, { text: "💬 Today Usage", callback_data: 'GET_DAILY_USAGE' }], 
        
        // Row 2: Management
        [{ text: "⚙️ Bot Commands", callback_data: 'GET_COMMANDS' }, { text: "🌐 Manage Groups", callback_data: 'MANAGE_GROUPS' }], 
        
        // Row 3: Maintenance
        [{ text: "🗑️ Clear Topics", callback_data: 'CLEAR_TOPICS' }, { text: "👁️ Last Edu Content", callback_data: 'VIEW_LAST_EDU' }],

        // Row 4: Manual Triggers
        [{ text: "📰 Trigger News", callback_data: 'TRIGGER_NEWS' }, { text: "📚 Trigger Edu Post", callback_data: 'TRIGGER_EDU' }, { text: "🗑️ Delete Panel", callback_data: 'DELETE_PANEL' }], 

        // Row 5: Refresh
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
 * Handles the callbacks generated from the Admin Panel.
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
    
    switch (data) {
        case 'REFRESH_PANEL':
        case 'GET_STATS':
        case 'GET_DAILY_USAGE': 
        case 'GET_COMMANDS':
        case 'CLEAR_TOPICS':
        case 'VIEW_LAST_EDU':
        case 'DELETE_PANEL':
        case 'TRIGGER_NEWS':
        case 'TRIGGER_EDU':
            // (Logic is fully implemented in the full code, omitted here for brevity)
            break;
            
        case 'MANAGE_GROUPS': 
            const approvedGroupsRaw = await readKV(env, TRADING_KV_KEYS.APPROVED_GROUPS) || "[]";
            const approvedGroups = JSON.parse(approvedGroupsRaw);
            
            let groupMessage = `*🌐 Approved Groups (${approvedGroups.length}):*\n\n`;
            
            if (approvedGroups.length > 0) {
                approvedGroups.forEach(id => {
                    groupMessage += `\`${id}\`\n`;
                });
            } else {
                groupMessage += "_දැනට කිසිදු Group එකක් අනුමත කර නැත._";
            }
            
            const groupKeyboard = [
                [{ text: "➕ Manually Add Group ID", callback_data: 'ADD_GROUP_ID_PROMPT' }],
                [{ text: "⬅️ Back to Panel", callback_data: 'REFRESH_PANEL' }]
            ];
            await editTelegramMessageWithKeyboard(chatId, messageId, groupMessage, groupKeyboard);
            break;
            
        case 'ADD_GROUP_ID_PROMPT':
            const promptMessage = `*➕ Group ID එකක් එක් කරන්න*\n\n` +
                                  `කරුණාකර Bot එකට Access ලබා දිය යුතු Group එකේ **Chat ID** එක (උදා: \`-1001234567890\`) මෙම Message එකට **Reply** කරන්න.`;
            
            const promptKeyboard = [
                [{ text: "❌ Cancel", callback_data: 'MANAGE_GROUPS' }]
            ];
            await editTelegramMessageWithKeyboard(chatId, messageId, promptMessage, promptKeyboard);
            break;

        default:
            // Handle group approval callback
            if (data.startsWith('GROUP_APPROVE_') || data.startsWith('GROUP_REJECT_')) {
                const uniqueKey = data.substring(data.indexOf('GROUP_') + 15); 
                const requestDetailsRaw = await readKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey);
                
                if (!requestDetailsRaw) {
                    await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත.", true);
                    return;
                }
                
                const requestDetails = JSON.parse(requestDetailsRaw);
                const targetChatId = requestDetails.chat_id;
                const targetMessageId = requestDetails.message_id;
                
                if (data.startsWith('GROUP_APPROVE_')) {
                    await addGroupToWhitelist(env, targetChatId);
                    await editTelegramMessage(targetChatId, targetMessageId, ACCESS_APPROVED_MESSAGE(targetChatId));
                    await answerCallbackQuery(callbackQueryId, `✅ Group ${targetChatId} අනුමත කරන ලදී.`, true);
                    await editTelegramMessage(chatId, messageId, `✅ *Group Access Approved*\nGroup ID: \`${targetChatId}\`\n\n*Group Name:* ${requestDetails.chat_name}`);
                } else {
                    await answerCallbackQuery(callbackQueryId, `❌ Group ${targetChatId} ප්‍රතික්ෂේප කරන ලදී.`, true);
                    await editTelegramMessage(chatId, messageId, `❌ *Group Access Rejected*\nGroup ID: \`${targetChatId}\`\n\n*Group Name:* ${requestDetails.chat_name}`);
                }
                
                await writeKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey, null); 
                await sendOwnerPanel(env); 
            } else {
                 await answerCallbackQuery(callbackQueryId, "Unknown Command.", false);
            }
            break;
    }
}


// =================================================================
// --- 7. CALLBACK QUERY HANDLER ---
// =================================================================

async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // 1. Owner Panel Callbacks 
    if (userId.toString() === CONFIG.OWNER_CHAT_ID.toString() && 
        (data === 'REFRESH_PANEL' || data === 'GET_STATS' || data === 'GET_COMMANDS' || data.startsWith('GROUP_'))) 
    {
        return handleOwnerPanelCallback(query, env);
    }
    
    // 2. Group Access Request Button
    if (data.startsWith('GROUP_REQUEST_START_')) {
        const uniqueKey = data.substring('GROUP_REQUEST_START_'.length);
        const requestDetailsRaw = await readKV(env, TRADING_KV_KEYS.GROUP_REQUEST_PREFIX + uniqueKey);
        
        if (!requestDetailsRaw) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. Bot නැවත Group එකට එක් කරන්න.", true);
            return new Response('Group Request Expired', { status: 200 });
        }
        
        const requestDetails = JSON.parse(requestDetailsRaw);
        
        // Send request to Owner
        const ownerKeyboard = [
            [{ text: "✅ Approve Access", callback_data: `GROUP_APPROVE_${uniqueKey}` }],
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
// --- 8. WEBHOOK HANDLER ---
// =================================================================

async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env);
        }

        // Handle bot added to a group/channel (my_chat_member update)
        if (update.my_chat_member) {
            const memberUpdate = update.my_chat_member;
            if (memberUpdate.new_chat_member.user.is_bot) {
                if (memberUpdate.new_chat_member.status === 'member' || memberUpdate.new_chat_member.status === 'administrator') {
                    const chatId = memberUpdate.chat.id;
                    const chatType = memberUpdate.chat.type;

                    if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
                        if (await isGroupApproved(env, chatId)) {
                            await sendTelegramMessage(chatId, ACCESS_APPROVED_MESSAGE(chatId), 'Markdown', null);
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

        // 1. OWNER MANUAL ID REPLY LOGIC
        if (isOwner && message.reply_to_message && 
            message.reply_to_message.text && 
            message.reply_to_message.text.includes('Group ID එකක් එක් කරන්න')) 
        {
            const inputId = text.trim();
            if (inputId.startsWith('-100') && inputId.length > 10) {
                const added = await addGroupToWhitelist(env, inputId);
                if (added) {
                    await sendTelegramReply(chatId, `✅ Group ID \`${inputId}\` සාර්ථකව Whitelist එකට එකතු කරන ලදී.`, messageId);
                    await sendUnifiedMessage(inputId, ACCESS_APPROVED_MESSAGE(inputId), 'Markdown', null, null);
                } else {
                    await sendTelegramReply(chatId, `⚠️ Group ID \`${inputId}\` දැනටමත් Whitelist එකේ ඇත.`, messageId);
                }
                await sendOwnerPanel(env);
            } else {
                await sendTelegramReply(chatId, `❌ අනුමත නොවන Chat ID format එකක්. Chat ID එක \`-100...\` ආකෘතියෙන් තිබිය යුතුය.`, messageId);
            }
            return new Response('Owner manual ID processed', { status: 200 });
        }
        
        // 2. COMMANDS HANDLING
        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();
             
            if (command === '/admin') {
                if (isOwner) {
                    await sendOwnerPanel(env);
                } else {
                    await sendTelegramReply(chatId, "*⚠️ ඔබට මෙම Admin Panel එක බැලීමට අවසර නැත.*", messageId);
                }
                return new Response('Admin command handled', { status: 200 });
            }
            
            if (command === '/start') {
                // (Start command logic for user registration and welcome message)
                return new Response('Start command handled', { status: 200 });
            }
            
            return new Response('Command processed', { status: 200 });
        }
        
        // 3. TRADING QUESTION LOGIC
        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            
            // 3.1 🛑 Group/Channel Access Check 
            if (chatId.toString().startsWith('-')) { 
                if (!await isGroupApproved(env, chatId)) {
                    return new Response('Group Access Denied - Silent Ignore', { status: 200 });
                }
            }
            
            // 3.2 🛑 Membership Check 
            if (chatId.toString() === userId.toString()) { 
                if (!await checkChannelMembership(userId)) {
                    // (Membership Check Message)
                    return new Response('Membership check failed', { status: 200 });
                }
            }
            
            // 3.3 🛑 Rate Limit Check
            const usage = await checkAndIncrementUsage(env, chatId);
            
            if (!usage.allowed) {
                // (Rate Limit Message)
                return new Response('Rate limit reached', { status: 200 });
            }
            
            // 3.4 Generation Status Message
            const initialMessage = `*🤖 Assistant is thinking...* (Used: ${usage.count}/${CONFIG.DAILY_LIMIT})`;
            const validationMessageId = await sendTelegramReply(chatId, initialMessage, messageId);

            // 3.5 Final Content Generation
            const replyText = await generateReplyContent(text);
            
            // 3.6 Final Edit
            await editTelegramMessage(chatId, validationMessageId, replyText); 
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (e) {
        return new Response('Error', { status: 500 });
    }
}


// =================================================================
// --- 9. WORKER EXPORT ---
// =================================================================

export default {
    /**
     * Handles scheduled events (Cron trigger)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    // 1. FUNDAMENTAL NEWS
                    await fetchForexNews(env);
                    
                    // 2. DAILY TRADING EDUCATIONAL POST
                    const postContent = await generateScheduledContent(env); 
                    if (postContent) {
                        const success = await sendTelegramMessage(CONFIG.TELEGRAM_CHAT_ID, postContent); 
                        if (!success) {
                            await sendTelegramReplyToOwner(`❌ Scheduled Daily Trading Post එක යැවීම අසාර්ථක විය.`);
                        }
                    }

                    // 3. DAILY TRADING QUOTE/TIP POST
                    const quoteContent = await generateDailyQuote(env);
                    if (quoteContent) {
                        const result = await sendUnifiedMessage(CONFIG.TELEGRAM_CHAT_ID, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                        if (!result.success) {
                            await sendTelegramReplyToOwner(`❌ Scheduled Daily Quote/Tip Post එක යැවීම අසාර්ථක විය.`);
                        }
                    }
                    
                    // 4. Refresh Owner Panel 
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
        
        if (request.method === 'POST') {
            return handleWebhook(request, env);
        }
        
        // Manual Trigger
        if (url.pathname === '/trigger-manual' || url.pathname === '/trigger-all') {
             try {
                 const postContent = await generateScheduledContent(env);
                 if (postContent) {
                    await sendTelegramMessage(CONFIG.TELEGRAM_CHAT_ID, postContent); 
                 }
                 await fetchForexNews(env);
                 await sendOwnerPanel(env);
                 return new Response('✅ Manual Daily Post & News Triggered Successfully.', { status: 200 });
             } catch (e) {
                 return new Response(`Error in Manual Trigger: ${e.message}`, { status: 500 });
             }
        }
        
        return new Response('Unified Trading Bot Worker V7 running. Admin Panel & Group Access Ready.', { status: 200 });
    }
};
