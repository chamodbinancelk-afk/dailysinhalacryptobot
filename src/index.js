// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio';
import moment from 'moment-timezone';

// =================================================================
// --- 🔴 0. HARDCODED CONFIGURATION (UNIFIED KEYS) 🔴 ---
// ⚠️ සියලුම අගයන් එක් Bot Token එකකට සහ Chat ID එකකට යොමු කර ඇත ⚠️
// =================================================================

const CONFIG = {
    // --- 🔴 UNIFIED TELEGRAM & API KEYS 🔴 ---
    // (Trading Bot Token/Chat ID used for BOTH Trading Assistant and Forex News)
    TRADING_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q",
    TRADING_CHAT_ID: "-1002947156921",
    OWNER_CHAT_ID: "1901997764",
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // --- Forex News Config (Overridden to use Trading Bot's credentials) ---
    // These are still used in the logic, but the actual values point to TRADING_
    FOREX_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", // <--- 🔑 Same as TRADING_BOT_TOKEN
    FOREX_CHAT_ID: "-1002947156921", // <--- 🔑 Same as TRADING_CHAT_ID

    // --- Trading Assistant Config:
    DAILY_LIMIT: 5,

    // --- Forex News Display/Scraping Config:
    CHANNEL_USERNAME: 'C_F_News',
    CHANNEL_LINK_TEXT: 'C F NEWS ₿',
    COLOMBO_TIMEZONE: 'Asia/Colombo',
    FF_NEWS_URL: "https://www.forexfactory.com/news",
    FALLBACK_DESCRIPTION_EN: "No description found.",
    CHANNEL_LINK_URL: `https://t.me/C_F_News`,

    // Web Scraping Headers
    HEADERS: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.forexfactory.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    },
};

// --- Telegram API Base URLs (Derived from Hardcoded Config) ---
const TRADING_API_BASE = `https://api.telegram.org/bot${CONFIG.TRADING_BOT_TOKEN}`;
const FOREX_API_BASE = `https://api.telegram.org/bot${CONFIG.FOREX_BOT_TOKEN}`; // Still points to the same API base

// --- KV KEYS ---
const TRADING_STATUS_KEYS = {
    COVERED_TOPICS: 'COVERED_TOPICS',
    LAST_TRADING_TOPIC: 'LAST_TRADING_TOPIC',
    BOT_USER_SET: 'BOT_USER_SET',
    COUNT_POST_ID: 'COUNT_POST_ID',
    DAILY_COUNT_KEY: 'DAILY_USER_COUNT',
};
const FOREX_STATUS_KEYS = {
    LAST_HEADLINE: 'last_forex_headline', 
    LAST_FULL_MESSAGE: 'last_full_news_message', 
    LAST_IMAGE_URL: 'last_image_url', 
};


// =================================================================
// --- 1. TELEGRAM UTILITIES (Simplified: ALL use TRADING_API_BASE) ---
// =================================================================

/**
 * Sends a message using the Unified Bot's credentials. Supports HTML parsing and photos.
 * Note: This replaces both the old 'sendForexNewsMessage' and the basic 'sendTelegramMessage'
 * for consistency in message sending, though 'sendTelegramMessage' will be kept for simplicity
 * for the Trading Assistant's markdown posts.
 */
async function sendUnifiedMessage(chatId, message, parseMode = 'Markdown', imgUrl = null, replyMarkup = null, replyToId = null) {
    const TELEGRAM_API_URL = TRADING_API_BASE; // Use the primary Bot Token
    
    let currentImgUrl = imgUrl; 
    let apiMethod = currentImgUrl ? 'sendPhoto' : 'sendMessage';
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

            if (response.status === 429) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; 
            }

            if (!response.ok) {
                const errorText = await response.text();
                if (apiMethod === 'sendPhoto') {
                    currentImgUrl = null; 
                    apiMethod = 'sendMessage';
                    attempt = -1; // Restart loop as sendMessage
                    console.error(`Unified: SendPhoto failed, retrying as sendMessage: ${errorText}`);
                    continue; 
                }
                console.error(`Unified: Telegram API Error (${apiMethod}): ${response.status} - ${errorText}`);
                break; 
            }
            return true; // Success
        } catch (error) {
            console.error("Unified: Error sending message to Telegram:", error);
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false; 
}

// --- Trading Assistant's Telegram Functions (Retained but using TRADING_API_BASE) ---

async function sendTypingAction(chatId) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/sendChatAction`;
    try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
        return true;
    } catch (e) { return false; }
}

async function sendTelegramReplyToOwner(text, keyboard = null) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/sendMessage`;
    try {
        const ownerChatIdString = CONFIG.OWNER_CHAT_ID.toString();
        const body = { chat_id: ownerChatIdString, text: text, parse_mode: 'Markdown' };
        if (keyboard) { body.reply_markup = { inline_keyboard: keyboard }; }
        
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return response.ok; 
    } catch (e) { return false; }
}

async function sendTelegramMessage(caption) {
    // Used for scheduled posts (Markdown)
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/sendMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.TRADING_CHAT_ID, text: caption, parse_mode: 'Markdown' }),
        });
        return response.ok;
    } catch (e) { return false; }
}

async function sendTelegramReply(chatId, text, messageId) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/sendMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, text: text, parse_mode: 'Markdown', reply_to_message_id: messageId 
            }),
        });
        const data = await response.json();
        return data.ok ? data.result.message_id : null; 
    } catch (e) { return null; }
}

async function editTelegramMessage(chatId, messageId, text) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/editMessageText`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' }),
        });
        return response.ok;
    } catch (e) { return false; }
}

async function editTelegramMessageWithKeyboard(chatId, messageId, text, keyboard) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/editMessageText`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }),
        });
        return response.ok;
    } catch (e) { return false; }
}

async function answerCallbackQuery(callbackQueryId, text, showAlert) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/answerCallbackQuery`;
    try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text: text, show_alert: showAlert }),
        });
        return true;
    } catch (e) { return false; }
}

async function removeInlineKeyboard(chatId, messageId) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/editMessageReplyMarkup`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: {} }),
        });
        return response.ok;
    } catch (e) { return false; }
}

async function sendPhotoWithCaption(chatId, photoUrl, caption, keyboard) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/sendPhoto`;
    try {
        const body = { chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: 'Markdown' };
        if (keyboard) { body.reply_markup = { inline_keyboard: keyboard }; }

        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        
        const data = await response.json();
        return data.ok ? { success: true, messageId: data.result.message_id } : { success: false, error: data };
    } catch (e) { return { success: false, error: e.toString() }; }
}

async function editPhotoCaption(chatId, messageId, caption) {
    const TELEGRAM_API_ENDPOINT = `${TRADING_API_BASE}/editMessageCaption`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, caption: caption, parse_mode: 'Markdown' }),
        });
        return response.ok;
    } catch (e) { return false; }
}


// =================================================================
// --- 2. KV UTILITIES ---
// =================================================================

// KV functions remain the same as they use the environment bindings
async function readTradingKV(env, key) {
    try {
        if (!env.POST_STATUS_KV) { return null; }
        const value = await env.POST_STATUS_KV.get(key); 
        return value === null || value === undefined ? null : value;
    } catch (e) {
        console.error(`Trading KV Read Error (${key}):`, e);
        return null;
    }
}

async function writeTradingKV(env, key, value, options = {}) {
    try {
        if (!env.POST_STATUS_KV) { return; }
        await env.POST_STATUS_KV.put(key, String(value), options); 
    } catch (e) {
        console.error(`Trading KV Write Error (${key}):`, e);
    }
}

async function readForexKV(env, key) {
    try {
        if (!env.NEWS_STATE_KV) { return null; }
        const value = await env.NEWS_STATE_KV.get(key); 
        return value === null || value === undefined ? null : value;
    } catch (e) {
        console.error(`Forex KV Read Error (${key}):`, e);
        return null;
    }
}

async function writeForexKV(env, key, value) {
    try {
        if (!env.NEWS_STATE_KV) { return; }
        await env.NEWS_STATE_KV.put(key, String(value)); 
    } catch (e) {
        console.error(`Forex KV Write Error (${key}):`, e);
    }
}


// =================================================================
// --- 3. COMMON UTILITY FUNCTIONS (AI and Generic Helpers) ---
// =================================================================

function escapeMarkdown(text) {
    if (!text) return "";
    return text.replace(/([_*`])/g, '\\$1');
}

function generateRandomId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function translateText(text) {
    const translationApiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=si&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(translationApiUrl);
        const data = await response.json();
        if (data && data[0] && Array.isArray(data[0])) {
            return data[0].map(item => item[0]).join('');
        }
        throw new Error("Invalid translation response structure.");
    } catch (e) {
        console.error('Translation API Error. Using original text.', e);
        return `[Translation Failed: ${text}]`;
    }
}

// =================================================================
// --- 4. FOREX NEWS BOT LOGIC (Simplified Telegram Usage) ---
// =================================================================

/**
 * Checks if a user is a member (or admin/creator) of the Forex Channel.
 */
async function checkChannelMembership(userId) {
    const TELEGRAM_API_URL = FOREX_API_BASE;
    const CHAT_ID = CONFIG.FOREX_CHAT_ID;

    if (!CONFIG.FOREX_BOT_TOKEN || !CHAT_ID) return false;

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
        console.error(`[Membership Check Error for user ${userId}]:`, error);
        return false;
    }
}


/**
 * Uses Gemini to generate a short Sinhala summary and sentiment analysis for the news.
 */
async function getAISentimentSummary(headline, description) {
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    if (!CONFIG.GEMINI_API_KEY) {
        return "⚠️ <b>AI විශ්ලේෂණ සේවාව ක්‍රියාත්මක නොවේ (API Key නැත).</b>";
    }

    const maxRetries = 3;
    const initialDelay = 1000;

    const systemPrompt = `Act as a world-class Forex and Crypto market fundamental analyst. Your task is to provide a very brief analysis of the following news, focusing on the sentiment (Bullish, Bearish, or Neutral) and the potential impact on the primary currency mentioned. Use Google Search to ensure the analysis is based on up-to-date market context. The final output MUST be only text in the following exact format: 
Sentiment: [Bullish/Bearish/Neutral]
Sinhala Summary: [Sinhala translation of the analysis (very brief, max 2 sentences). Start this summary directly with a capital letter.]`;
    
    const userQuery = `Analyze the potential market impact of this news and provide a brief summary in Sinhala. Headline: "${headline}". Description: "${description}"`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) {
                const delay = initialDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                throw new Error("Gemini API call failed with non-OK status.");
            }

            const result = await response.json();
            const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!textResponse) { throw new Error("Gemini response was empty or malformed."); }
            
            const lines = textResponse.split('\n');
            let sentiment = 'Neutral';
            let summarySi = 'AI විශ්ලේෂණයක් සැපයීමට නොහැකි විය.';

            lines.forEach(line => {
                if (line.startsWith('Sentiment:')) {
                    sentiment = line.replace('Sentiment:', '').trim();
                } else if (line.startsWith('Sinhala Summary:')) {
                    summarySi = line.replace('Sinhala Summary:', '').trim();
                }
            });
            
            let sentimentEmoji = '⚪';
            if (sentiment.toLowerCase().includes('bullish')) sentimentEmoji = '🟢 Bullish 🐂';
            else if (sentiment.toLowerCase().includes('bearish')) sentimentEmoji = '🔴 Bearish 🐻';
            else sentimentEmoji = '🟡 Neutral ⚖️';

            return `\n\n✨ <b>AI වෙළඳපොළ විශ්ලේෂණය</b> ✨\n\n` +
                   `<b>📈 බලපෑම:</b> ${sentimentEmoji}\n\n` +
                   `<b>📝 සාරාංශය:</b> ${summarySi}`;
        } catch (error) {
            if (attempt === maxRetries - 1) {
                return "\n\n⚠️ <b>AI විශ්ලේෂණය ලබා ගැනීමට නොහැකි විය.</b>";
            }
            const delay = initialDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function getLatestForexNews() {
    const resp = await fetch(CONFIG.FF_NEWS_URL, { headers: CONFIG.HEADERS });
    if (!resp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${resp.status} on news page.`);

    const html = await resp.text();
    const $ = load(html);
    const newsLinkTag = $('a[href^="/news/"]').not('a[href$="/hit"]').first();

    if (newsLinkTag.length === 0) return null;

    const headline = newsLinkTag.text().trim();
    const newsUrl = "https://www.forexfactory.com" + newsLinkTag.attr('href');
    
    const newsResp = await fetch(newsUrl, { headers: CONFIG.HEADERS });
    if (!newsResp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${newsResp.status} on detail page`);

    const newsHtml = await newsResp.text();
    const $detail = load(newsHtml);
    
    let imgUrl = $detail('img.attach').attr('src'); 
    
    const description = $detail('p.news__copy').text().trim() || CONFIG.FALLBACK_DESCRIPTION_EN;

    if (imgUrl && imgUrl.startsWith('/')) {
        imgUrl = "https://www.forexfactory.com" + imgUrl;
    } else if (!imgUrl || !imgUrl.startsWith('http')) {
        imgUrl = null;
    }
    
    return { headline, newsUrl, imgUrl, description };
}

async function fetchForexNews(env) {
    try {
        const news = await getLatestForexNews();
        if (!news) return;

        const lastHeadline = await readForexKV(env, FOREX_STATUS_KEYS.LAST_HEADLINE);
        const currentHeadline = news.headline;
        const cleanLastHeadline = lastHeadline ? lastHeadline.trim() : null; 

        if (currentHeadline === cleanLastHeadline) {
            console.info(`Forex: No new headline. Last: ${currentHeadline}`);
            return; 
        }
        
        await writeForexKV(env, FOREX_STATUS_KEYS.LAST_HEADLINE, currentHeadline);

        const date_time = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD hh:mm A');

        let description_si;
        if (news.description === CONFIG.FALLBACK_DESCRIPTION_EN) {
            description_si = "ℹ️ විස්තරයක් නොමැත.";
        } else {
            description_si = await translateText(news.description);
        }
        
        const newsForAI = (news.description !== CONFIG.FALLBACK_DESCRIPTION_EN) ? news.description : news.headline;
        const aiSummary = await getAISentimentSummary(news.headline, newsForAI);
        
        // Note: Using <b> and </b> for HTML parse mode for the Forex Post
        const message = `<b>📰 Fundamental News (සිංහල)</b>\n\n` +
                         `<b>⏰ Date & Time:</b> ${date_time}\n\n` +
                         `<b>🌎 Headline (English):</b> ${news.headline}\n\n` +
                         
                         `${aiSummary}\n\n` + 
                         
                         `<b>🚀 Dev: Mr Chamo 🇱🇰</b>`;

        await writeForexKV(env, FOREX_STATUS_KEYS.LAST_FULL_MESSAGE, message);
        await writeForexKV(env, FOREX_STATUS_KEYS.LAST_IMAGE_URL, news.imgUrl || ''); 

        // Use the unified sender (HTML mode)
        await sendUnifiedMessage(CONFIG.FOREX_CHAT_ID, message, 'HTML', news.imgUrl);
    } catch (error) {
        console.error("An error occurred during FUNDAMENTAL task:", error.stack);
    }
}


// =================================================================
// --- 5. TRADING ASSISTANT AI LOGIC ---
// =================================================================

async function generateScheduledContent(env) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const coveredTopicsString = await readTradingKV(env, TRADING_STATUS_KEYS.COVERED_TOPICS) || "[]";
    let coveredTopics = JSON.parse(coveredTopicsString);
    
    const excludedTopicsString = coveredTopics.join(', ');
    
    const systemPrompt = `
        You are an expert financial and trading educator. Your primary goal is to provide daily, **step-by-step** foundational trading education for absolute beginners.
        The topics covered so far and MUST BE AVOIDED are: [${excludedTopicsString}].
        
        Your task is to:
        1. **Systematic Topic Selection:** Use the 'google_search' tool to select a fundamental trading topic from the beginner's curriculum. Topics MUST include core elements like: **Candlesticks, Support and Resistance, Money Management, Chart Patterns, Fibonacci Tools, and basic Indicators (RSI, Moving Averages)**.
        2. **Content Generation:** Generate a high-quality, 5-paragraph educational post using **clear SINHALA language (සිංහල අක්ෂර / Unicode)** mixed with necessary English trading terms.
        3. The post must be well-formatted using Telegram's **Markdown**. The first line must be a clear title indicating the topic.
        
        Your final output must contain ONLY the content of the post.
    `;
    const userQuery = "Generate today's new, progressive, and engaging Sinhala educational trading post for beginners.";

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                tools: [{ "google_search": {} }], 
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.8 } 
            }),
        });
        
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        
        if (content) {
            const newTopicMatch = content.match(/\*([^*]+)\*/);
            const newTopic = newTopicMatch ? newTopicMatch[1].trim() : "Untitled Post";
            
            coveredTopics.push(newTopic);
            
            await writeTradingKV(env, TRADING_STATUS_KEYS.COVERED_TOPICS, JSON.stringify(coveredTopics));
            await writeTradingKV(env, TRADING_STATUS_KEYS.LAST_TRADING_TOPIC, newTopic);
            
            return content;
        }

        return null;
        
    } catch (e) {
        return null;
    }
}

async function generateReplyContent(userQuestion) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const systemPrompt = `
        You are a detailed, expert financial and trading assistant. A user has asked you a specific question or a short trading concept (e.g., RSI, Order Flow, Slippage).
        
        Your task is to:
        1. Use the 'google_search' tool to get the most accurate and educational information for the user's question.
        2. Generate a **DETAILED, EDUCATIONAL RESPONSE**. The response must be **5 PARAGRAPHS** long to cover the concept fully (Definition, Importance, How to Use, Examples, and Summary).
        3. Use **clear SINHALA language (සිංහල අක්ෂර / Unicode)** mixed with necessary English trading terms throughout the response.
        4. The response must be well-formatted using Telegram's **Markdown** (bolding key terms, using lists, and emojis).
        5. The first line of the response MUST be a clear title based on the question (e.g., "*Order Flow Concept එක මොකද්ද?*").

        Your final output must contain ONLY the content of the response. DO NOT include any English wrappers.
    `;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuestion }] }],
                tools: [{ "google_search": {} }], 
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.7 } 
            }),
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න. (Content Missing)";
    } catch (e) {
        return "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. (Exception)";
    }
}

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


// --- 5.1 Trading Assistant Rate Limit and User Count Logic ---

async function checkAndIncrementUsage(env, chatId) {
    if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        return { allowed: true, count: 'Unlimited' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const KV_KEY = `usage:${today}:${chatId}`;

    const currentUsageStr = await readTradingKV(env, KV_KEY);
    let currentUsage = parseInt(currentUsageStr) || 0;

    if (currentUsage >= CONFIG.DAILY_LIMIT) {
        return { allowed: false, count: currentUsage, kvKey: KV_KEY }; 
    }

    currentUsage += 1;
    
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0); 
    const expirationTtl = Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 1000)); 
    
    await writeTradingKV(env, KV_KEY, currentUsage.toString(), { expirationTtl: expirationTtl });

    return { allowed: true, count: currentUsage, kvKey: KV_KEY };
}

async function updateAndEditUserCount(env, userId) {
    const userIdString = userId.toString();

    const userSet = await readTradingKV(env, TRADING_STATUS_KEYS.BOT_USER_SET, 'json') || [];
    const isNewUser = !userSet.includes(userIdString);
    
    if (isNewUser) {
        userSet.push(userIdString);
        await writeTradingKV(env, TRADING_STATUS_KEYS.BOT_USER_SET, JSON.stringify(userSet));
        const totalCount = userSet.length;
        
        const dailyCountStr = await readTradingKV(env, TRADING_STATUS_KEYS.DAILY_COUNT_KEY) || '0';
        let dailyCount = parseInt(dailyCountStr);
        dailyCount += 1;
        
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0); 
        const expirationTtl = Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 1000)); 
        await writeTradingKV(env, TRADING_STATUS_KEYS.DAILY_COUNT_KEY, dailyCount.toString(), { expirationTtl: expirationTtl });
        
        const postDetailsStr = await readTradingKV(env, TRADING_STATUS_KEYS.COUNT_POST_ID);
        
        if (postDetailsStr) {
            const [chatId, messageId] = postDetailsStr.split(':');
            
            const timeZone = 'Asia/Colombo';
            const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
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

async function sendInitialCountPost(env, ownerChatId) {
    const PHOTO_URL = "https://envs.sh/7R4.jpg";
    const targetChatId = CONFIG.TRADING_CHAT_ID;

    const existingPost = await readTradingKV(env, TRADING_STATUS_KEYS.COUNT_POST_ID);
    if (existingPost) {
        return { success: false, message: `Permanent Count Post එක දැනටමත් පවතී. Post ID: ${existingPost}` };
    }

    const userSet = await readTradingKV(env, TRADING_STATUS_KEYS.BOT_USER_SET, 'json') || [];
    const dailyCountStr = await readTradingKV(env, TRADING_STATUS_KEYS.DAILY_COUNT_KEY) || '0';
    const totalCount = userSet.length;
    
    const timeZone = 'Asia/Colombo';
    const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const initialCaption = `*⭐ Bot Statistics Update 📈*
            
දැනට මෙම Bot එක භාවිතා කරන සම්පූර්ණ පරිශීලකයින් ගණන:
            
*▶️ Total Users:* **${totalCount.toLocaleString()}**
*🔥 Daily Growth:* **+${dailyCountStr} new users**
*⏰ Last Updated:* ${currentTime} (SL Time)

---
            
*🌐 Join the Community:* [Mrchamo Official Channel](https://t.me/Mrchamo_Lk)
*Use /start to register.*`;

    const keyboard = [
        [{ text: "Click for Private Info", callback_data: 'SHOW_PRIVATE_INFO' }]
    ];

    const result = await sendPhotoWithCaption(targetChatId, PHOTO_URL, initialCaption, keyboard);
    
    if (result.success) {
        const postIdentifier = `${targetChatId}:${result.messageId}`;
        await writeTradingKV(env, TRADING_STATUS_KEYS.COUNT_POST_ID, postIdentifier);
        return { success: true, message: `Permanent Count Post එක සාර්ථකව \`${targetChatId}\` Chat ID එකට යවා ගබඩා කරන ලදී. Post ID: ${postIdentifier}` };
    } else {
        return { success: false, message: `Post යැවීම අසාර්ථක විය: ${JSON.stringify(result.error)}` };
    }
}


// =================================================================
// --- 6. COMMAND AND WEBHOOK HANDLERS (Delegation) ---
// =================================================================

async function handleTelegramUpdate(update, env) {

    if (!update.message || !update.message.text) {
        return; 
    }
    
    const text = update.message.text.trim();
    const command = text.split(' ')[0].toLowerCase();
    const userId = update.message.from.id;
    const chatId = update.message.chat.id; 
    const messageId = update.message.message_id; 
    const username = update.message.from.username || update.message.from.first_name;

    // --- Forex News Bot's /fundamental command ---
    // Note: Since both bots use the same token/chat ID, this command may work in both contexts.
    if (command === '/fundamental') { 
        const isMember = await checkChannelMembership(userId);

        if (!isMember) {
            const denialMessage = 
                `⛔ <b>Access Denied</b> ⛔\n\n` +
                `Hey There <a href="tg://user?id=${userId}">${username}</a>,\n` +
                `You Must Join <b>${CONFIG.CHANNEL_LINK_TEXT}</b> Channel To Use This BOT.\n` +
                `So, Please Join it & Try Again.👀 Thank You ✍️`;
            
            const replyMarkup = {
                inline_keyboard: [
                    [{ 
                        text: `🔥 ${CONFIG.CHANNEL_LINK_TEXT} < / >`, 
                        url: CONFIG.CHANNEL_LINK_URL 
                    }]
                ]
            };

            await sendUnifiedMessage(chatId, denialMessage, 'HTML', null, replyMarkup, messageId); 
            return; 
        }

        const messageKey = FOREX_STATUS_KEYS.LAST_FULL_MESSAGE;
        const lastImageUrl = await readForexKV(env, FOREX_STATUS_KEYS.LAST_IMAGE_URL);
        
        const lastFullMessage = await readForexKV(env, messageKey);
        
        if (lastFullMessage) {
            // Use unified sender with HTML mode
            await sendUnifiedMessage(chatId, lastFullMessage, 'HTML', lastImageUrl, null, messageId); 
        } else {
            const fallbackText = "Sorry, no recent fundamental news has been processed yet. Please wait for the next update.";
            await sendUnifiedMessage(chatId, fallbackText, 'Markdown', null, null, messageId); 
        }
        return;
    }
    
    // --- Forex News Bot's /start command (only replies if in the main chat) ---
    // Note: Both bots reply to /start. We let the Trading Assistant logic handle it generally for user tracking.
    
    // --- All other commands/messages go to the Trading Assistant handler ---
    return await handleTradingWebhookLogic(update, env);
}

async function handleTradingWebhookLogic(update, env) {
    if (update && update.message && update.message.text) {
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text.trim();
        const userId = message.from.id; 
        
        const userFirstName = message.from.first_name || "N/A";
        const userName = message.from.username ? `@${message.from.username}` : "N/A";

        // --- NEW: Owner Command to Send Initial Count Post ---
        if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/send_count_post')) {
            const result = await sendInitialCountPost(env, chatId); 
            await sendTelegramReply(chatId, result.message, messageId);
            return new Response('Count post command processed', { status: 200 });
        }

        // --- ADMIN COMMANDS (Owner Only) ---
        if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/unlimit')) {
            const parts = text.split(' ');
            if (parts.length === 2) {
                const targetChatId = parts[1].trim();
                const today = new Date().toISOString().slice(0, 10);
                const KV_KEY = `usage:${today}:${targetChatId}`;
                
                await env.POST_STATUS_KV.delete(KV_KEY);
                
                const successMessage = `✅ *User Limit Removed!* \n\nUser ID: \`${targetChatId}\` ගේ දෛනික සීමාව (limit) අද දින සඳහා සාර්ථකව ඉවත් කරන ලදී.`;
                await sendTelegramReply(chatId, successMessage, messageId);
                return new Response('Admin command processed', { status: 200 });
            } else {
                await sendTelegramReply(chatId, "⚠️ *Usage:* /unlimit [User_Chat_ID_Eka]", messageId);
                return new Response('Admin command error', { status: 200 });
            }
        }

        // --- REGULAR COMMANDS (/start, /help) ---
        if (text.startsWith('/')) {
            const command = text.split(' ')[0].toLowerCase();
            
            if (command === '/start' || command === '/help') {
                await updateAndEditUserCount(env, userId);
                
                const welcomeMessage = "👋 *Welcome to the Trading Assistant Bot!* \n\nMata answer karanna puluwan **Trading, Finance, saha Crypto** related questions walata witharai. \n\n*Limit:* Dawasakata *Trading Questions 5* k withirai. (Owner ta unlimited). \n\nTry karanna: 'Order Flow කියන්නේ මොකද්ද?' wage prashnayak ahanna.";
                await sendTelegramReply(chatId, welcomeMessage, messageId);
                return new Response('Command processed', { status: 200 });
            }
        }
        
        // --- TRADING QUESTION LOGIC ---
        
        const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId);
        const isTradingTopic = await validateTopic(text); 
        
        if (isTradingTopic) {
            
            const usageResult = await checkAndIncrementUsage(env, chatId);
            
            if (!usageResult.allowed) {
                const limitMessage = `🛑 *Usage Limit Reached!* \n\nSorry, oyage **Trading Questions 5** (limit eka) ada dawasata iwarai. \n\n*Reset wenawa:* Midnight 12.00 AM walata. \n\n*Owner ge Approval one nam, Request karanna!*`;
                
                const requestId = `REQ_${generateRandomId()}`;
                const requestData = {
                    userChatId: chatId, userMessageId: validationMessageId, targetUserId: userId, userFirstName: userFirstName, userName: userName
                };
                await writeTradingKV(env, `UNLIMIT_REQUEST_${requestId}`, JSON.stringify(requestData), { expirationTtl: 86400 });

                const keyboard = [
                    [{ text: "👑 Request Owner Approval", callback_data: `REQUEST_UNLIMIT_${requestId}` }]
                ];
                
                await editTelegramMessageWithKeyboard(chatId, validationMessageId, limitMessage, keyboard);
                return new Response('Rate limited with inline request button', { status: 200 });
            }
            
            await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...* (Finding up-to-date info)");
            
            await sendTypingAction(chatId); 
            await editTelegramMessage(chatId, validationMessageId, "✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed reply)");
            
            const replyText = await generateReplyContent(text);
            
            await editTelegramMessage(chatId, validationMessageId, replyText);
            
        } else {
            const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer karanna.* \n\n*Oyage Chat ID eka:* \`${chatId}\`\n\nPlease ask karanna: 'What is RSI?' wage ekak. *Anith ewa mata denuma naha.* 😔`;
            await editTelegramMessage(chatId, validationMessageId, guardrailMessage);
        }
    }
    
    return new Response('OK', { status: 200 });
}


async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;

    if (data.startsWith('REQUEST_UNLIMIT_')) {
        const requestId = data.substring('REQUEST_UNLIMIT_'.length);
        const requestDataStr = await env.POST_STATUS_KV.get(`UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. නැවත උත්සාහ කරන්න.", true);
            return new Response('Expired request', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName, userName } = requestData;
        const safeUserFirstName = escapeMarkdown(userFirstName);
        const safeUserName = escapeMarkdown(userName);
        
        await answerCallbackQuery(callbackQueryId, "✅ Owner වෙත ඔබගේ Limit ඉල්ලීම යවන ලදී. කරුණාකර පිළිතුරක් ලැබෙන තෙක් රැඳී සිටින්න.", true);
        
        const requestMessage = `*👑 UNLIMIT REQUEST* \n\n*User Name:* ${safeUserFirstName} (${safeUserName})\n*User ID:* \`${targetUserId}\`\n*User Chat ID:* \`${userChatId}\`\n*Original Message ID:* \`${userMessageId}\`\n\nමෙම User ගේ අද දින Limit එක ඉවත් කර, ඔහුට සාර්ථක ලෙස දැනුම් දීමට පහත Button භාවිතා කරන්න.`;

        const approvalKeyboard = [
            [{ text: "✅ Approve Request", callback_data: `APPROVE_UNLIMIT_${requestId}` }],
            [{ text: "❌ Reject Request", callback_data: `REJECT_UNLIMIT_${requestId}` }]
        ];
        
        await sendTelegramReplyToOwner(requestMessage, approvalKeyboard);
        
        return new Response('Unlimit request sent to owner', { status: 200 });
        
    } else if (data.startsWith('APPROVE_UNLIMIT_') || data.startsWith('REJECT_UNLIMIT_')) {
        
        if (userId.toString() !== CONFIG.OWNER_CHAT_ID.toString()) {
            await answerCallbackQuery(callbackQueryId, "🛑 ඔබට මෙය Approve කිරීමට බලය නැත. (Owner Only)", true);
            return new Response('Unauthorized approval attempt', { status: 200 });
        }
        
        const isApproved = data.startsWith('APPROVE');
        const requestId = data.substring(data.startsWith('APPROVE') ? 'APPROVE_UNLIMIT_'.length : 'REJECT_UNLIMIT_'.length);
        
        const requestDataStr = await env.POST_STATUS_KV.get(`UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. User ට සෘජුවම දැනුම් දෙන්න.", true);
            return new Response('Expired approval key', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName } = requestData;
        
        await env.POST_STATUS_KV.delete(`UNLIMIT_REQUEST_${requestId}`);

        const userChatIdInt = parseInt(userChatId);
        const userMessageIdInt = parseInt(userMessageId);
        const KV_KEY = `usage:${new Date().toISOString().slice(0, 10)}:${userChatId}`;
        const ownerChatId = query.message.chat.id;
        const ownerMessageId = query.message.message_id;
        let newOwnerMessage = query.message.text.split('මෙම User ගේ')[0]; 
        const timeZone = 'Asia/Colombo';
        const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        if (isApproved) {
            await env.POST_STATUS_KV.delete(KV_KEY);
            const successText = `✅ *Request Approved!* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම අනුමත කරන ලදී!** \n\nදැන් ඔබට නැවත Bot භාවිතා කළ හැකිය. (Limit එක Reset වී ඇත.)`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, successText);
            
            await removeInlineKeyboard(ownerChatId, ownerMessageId);
            
            const approvalDetails = `\n\n*✅ STATUS: Approved by Owner!*\n\n*User ID:* \`${targetUserId}\`\n*User Name:* ${userFirstName}\n*Message ID:* \`${userMessageId}\`\n*Time:* ${currentTime} (SL Time)\n\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;
            newOwnerMessage += approvalDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage); 
            await answerCallbackQuery(callbackQueryId, `✅ User ${targetUserId} ගේ Limit එක ඉවත් කර, ඔහුට දැනුම් දෙන ලදී.`, true);
            
        } else {
            const rejectText = `❌ *Request Rejected* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.** \n\nකරුණාකර හෙට දින නැවත උත්සාහ කරන්න.`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, rejectText);

            await removeInlineKeyboard(ownerChatId, ownerMessageId);
            
            const rejectionDetails = `\n\n*❌ STATUS: Rejected by Owner!*\n\n*User ID:* \`${targetUserId}\`\n*User Name:* ${userFirstName}\n*Message ID:* \`${userMessageId}\`\n*Time:* ${currentTime} (SL Time)\n\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;
            newOwnerMessage += rejectionDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage);
            await answerCallbackQuery(callbackQueryId, `❌ User ${targetUserId} ගේ ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.`, true);
        }
        
        return new Response('Approval logic processed', { status: 200 });
    } else if (data === 'SHOW_PRIVATE_INFO') {
        const privateMessage = `*✅ ඔබට පමණක් පෞද්ගලික තොරතුරු (Personalized Info)*\n\nමෙම තොරතුරු *ඔබට පමණක්* දර්ශනය වන ලෙස **Alert Box** එකක් මඟින් පෙන්වනු ලැබේ.\n\n*User ID:* \`${userId}\``;
        await answerCallbackQuery(callbackQueryId, privateMessage, true);
        return new Response('Callback query processed (private alert sent)', { status: 200 });

    } else {
        await answerCallbackQuery(callbackQueryId, "Processing...", false);
        return new Response('Callback query handled', { status: 200 });
    }
}


// =================================================================
// --- 7. WORKER EXPORT (Combined Entry Point) ---
// =================================================================

async function handleScheduledTasks(env) {
    // 1. Trading Assistant Daily Content Post
    const postContent = await generateScheduledContent(env); 
    if (postContent) {
        const success = await sendTelegramMessage(postContent);
        const today = new Date().toISOString().slice(0, 10);
        if (!success) {
            await sendTelegramReplyToOwner(`❌ Scheduled Daily Post එක අද දින (${today}) යැවීම අසාර්ථක විය. (Check logs)`);
        }
    }
    
    // 2. Forex News Fetch and Post
    await fetchForexNews(env);
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(handleScheduledTasks(env));
    },

    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            // Manual triggers for both bots
            if (url.pathname === '/trigger-forex') {
                await fetchForexNews(env);
                return new Response('✅ Manual Forex News Triggered Successfully.', { status: 200 });
            }
            if (url.pathname === '/trigger-trading') {
                const postContent = await generateScheduledContent(env);
                 if (postContent) {
                    const success = await sendTelegramMessage(postContent); 
                    if (success) { return new Response('✅ Manual Trading Post Triggered Successfully.', { status: 200 }); }
                    return new Response('❌ Manual Trading Post Failed to Send to Telegram. (Check logs)', { status: 500 });
                 }
                 return new Response('❌ Manual Trading Post Failed: Content Generation Failed. (Check logs)', { status: 500 });
            }
            
            // Status check
            if (url.pathname === '/status') {
                const lastForex = await readForexKV(env, FOREX_STATUS_KEYS.LAST_HEADLINE);
                const lastTrading = await readTradingKV(env, TRADING_STATUS_KEYS.LAST_TRADING_TOPIC);
                
                const statusMessage = 
                    `Bot Workers are active.\n` + 
                    `Last Trading Topic: ${lastTrading || 'N/A'}\n` +
                    `Last Forex Headline: ${lastForex || 'N/A'}`;
                
                return new Response(statusMessage, { status: 200 });
            }


            // Webhook Handling (for Telegram commands/updates)
            if (request.method === 'POST') {
                const update = await request.json();
                
                if (update && update.callback_query) {
                    return handleCallbackQuery(update.callback_query, env);
                }
                
                await handleTelegramUpdate(update, env); 
                return new Response('OK', { status: 200 });
            }

            return new Response('Combined Trading and Forex Bot is ready. Use /trigger-forex or /trigger-trading to test.', { status: 200 });
            
        } catch (e) {
            console.error('[CRITICAL FETCH FAILURE]:', e.stack);
            return new Response(`Worker threw an unhandled exception: ${e.message}. Check Cloudflare Worker Logs.`, { status: 500 });
        }
    }
};
