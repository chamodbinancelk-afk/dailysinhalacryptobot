// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio'; // For Forex Factory Scraping
import moment from 'moment-timezone'; // For Timezone Management

// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක (trading_assistant.js එකෙන් ලබා ගත්)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක (පුවත් සහ Trading Posts යැවිය යුතු ප්‍රධාන ස්ථානය)
    TELEGRAM_CHAT_ID: "-1002947156921", // trading_assistant.js එකේ ID
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක (trading_assistant.js එකෙන් ලබා ගත්)
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL එක
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q`,
    
    // දිනකට උපරිම අවසර ලත් භාවිතය (Trading Q&A සඳහා)
    DAILY_LIMIT: 5,

    // සාමාජිකත්වය පරීක්ෂා කරන Channel විස්තර
    CHANNEL_USERNAME: 'C_F_News', 
    CHANNEL_LINK_TEXT: 'C F NEWS ₿',
    CHANNEL_LINK_URL: 'https://t.me/C_F_News', // URL එක සෘජුවම ඇතුළත් කර ඇත
    
    COLOMBO_TIMEZONE: 'Asia/Colombo',
};

// --- CONSTANTS ---

// Trading Assistant KV Keys
const TRADING_KV_KEYS = {
    COVERED_TOPICS: 'COVERED_TOPICS',
    BOT_USER_SET: 'BOT_USER_SET',
    COUNT_POST_ID: 'COUNT_POST_ID',
    DAILY_COUNT_KEY: 'DAILY_USER_COUNT',
    LAST_TRADING_TOPIC: 'LAST_TRADING_TOPIC', // for scheduled content
};

// News Specific KV Keys
const NEWS_KV_KEYS = {
    LAST_HEADLINE: 'news_last_forex_headline', // 'last_forex_headline' වෙනුවට
    LAST_FULL_MESSAGE: 'news_last_full_news_message', // 'last_full_news_message' වෙනුවට
    LAST_IMAGE_URL: 'news_last_image_url', // 'last_image_url' වෙනුවට
};

const FF_NEWS_URL = "https://www.forexfactory.com/news";
const FALLBACK_DESCRIPTION_EN = "No description found.";
const HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.forexfactory.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};
const STATS_PHOTO_URL = "https://envs.sh/7R4.jpg"; // Placeholder URL for stats post


// =================================================================
// --- 1. CORE UTILITIES (KV, Telegram, Membership) ---
// =================================================================

/**
 * KV Read function (Unified) - Assumes env.POST_STATUS_KV
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
 * KV Write function (Unified) - Assumes env.POST_STATUS_KV
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
 * Sends a message to Telegram. Supports Markdown, HTML, photos, and reply_markup.
 * The core sender is unified to support all message types.
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
                    attempt = -1; // Restart loop as sendMessage
                    console.error(`SendPhoto failed (Forex image), retrying as sendMessage: ${JSON.stringify(data)}`);
                    continue; 
                }
                console.error(`Telegram API Error (${apiMethod}): ${data.error_code} - ${data.description}`);
                break; 
            }
            messageIdResult = data.result.message_id;
            return { success: true, messageId: messageIdResult }; 
        } catch (error) {
            console.error("Error sending message to Telegram:", error);
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

    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CHAT_ID) return true; // Failsafe

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

// Helper for sending simple replies
async function sendTelegramReply(chatId, text, messageId) {
    const result = await sendUnifiedMessage(chatId, text, 'Markdown', null, null, messageId);
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
// Helper for sending typing action
async function sendTypingAction(chatId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendChatAction`;
    try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
        return true;
    } catch (e) { return false; }
}

// Owner වෙත Message යැවීම සඳහා (Callback Query වෙතින් ලැබෙන)
async function sendTelegramReplyToOwner(text, keyboard = null) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendMessage`;
    try {
        const ownerChatIdString = CONFIG.OWNER_CHAT_ID.toString();
        
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

        const data = await response.json();
        
        if (!data.ok) {
            console.error("TELEGRAM SEND ERROR (Owner Final Check):", JSON.stringify(data));
        }
        
        return data.ok; 
    } catch (e) {
        console.error("TELEGRAM FETCH ERROR (Owner Final Check):", e);
        return false;
    }
}
async function removeInlineKeyboard(chatId, messageId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageReplyMarkup`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: {} // Remove keyboard
            }),
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
async function sendPhotoWithCaption(chatId, photoUrl, caption, keyboard) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendPhoto`;
    try {
        const body = {
            chat_id: chatId, 
            photo: photoUrl,
            caption: caption,
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
        
        const data = await response.json();
        return data.ok ? { success: true, messageId: data.result.message_id } : { success: false, error: data };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

async function editPhotoCaption(chatId, messageId, caption) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageCaption`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                caption: caption,
                parse_mode: 'Markdown'
            }),
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}
async function sendTelegramMessage(caption) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CONFIG.TELEGRAM_CHAT_ID, 
                text: caption,
                parse_mode: 'Markdown' 
            }),
        });
        
        return response.ok;
    } catch (e) {
        return false;
    }
}

// Markdown Escape Function
function escapeMarkdown(text) {
    if (!text) return "";
    return text.replace(/([_*`])/g, '\\$1');
}

// Helper function to generate a short, random ID (for KV Key)
function generateRandomId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}


// =================================================================
// --- 2. FOREX NEWS LOGIC (Scraping + AI Impact Filter) ---
// =================================================================

/**
 * Uses Gemini to determine impact, generate a short Sinhala summary, and sentiment analysis.
 * *MODIFIED to include a filter check*
 */
async function getAIAnalysis(headline, description) {
    const GEMINI_API_KEY = CONFIG.GEMINI_API_KEY;
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    if (!GEMINI_API_KEY) {
        return { impact: 'Unknown', summary: "⚠️ <b>AI විශ්ලේෂණ සේවාව ක්‍රියාත්මක නොවේ (API Key නැත).</b>", sentiment: 'Neutral' };
    }

    // --- SYSTEM PROMPT: MUST DETERMINE IMPACT FIRST ---
    const systemPrompt = `Act as a world-class Forex and Crypto market fundamental analyst. Your task is to:
1. **IMPACT Assessment:** Determine the impact level of the news. The impact level MUST be one of: **HIGH, MEDIUM, LOW**.
2. **Sentiment Analysis:** Determine the sentiment (Bullish, Bearish, or Neutral).
3. **Summary:** Provide a very brief analysis (max 2 sentences) in **Sinhala**.
4. **Format:** The final output MUST be only text in the following exact format: 
Impact: [HIGH/MEDIUM/LOW]
Sentiment: [Bullish/Bearish/Neutral]
Sinhala Summary: [Sinhala translation of the analysis. Start this summary directly with a capital letter.]`;
    
    const userQuery = `Analyze the potential market impact and sentiment of this news and provide a brief summary in Sinhala. Headline: "${headline}". Description: "${description}"`;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userQuery }] }],
                tools: [{ "google_search": {} }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
            })
        });

        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) { throw new Error("Gemini response was empty or malformed."); }
        
        // Parsing the text response
        const lines = textResponse.split('\n');
        let impact = 'Unknown';
        let sentiment = 'Neutral';
        let summarySi = 'AI විශ්ලේෂණයක් සැපයීමට නොහැකි විය.';

        lines.forEach(line => {
            if (line.startsWith('Impact:')) {
                impact = line.replace('Impact:', '').trim().toUpperCase();
            } else if (line.startsWith('Sentiment:')) {
                sentiment = line.replace('Sentiment:', '').trim();
            } else if (line.startsWith('Sinhala Summary:')) {
                summarySi = line.replace('Sinhala Summary:', '').trim();
            }
        });
        
        // Format for final post output (HTML used for Telegram post)
        let sentimentEmoji = '⚪';
        if (sentiment.toLowerCase().includes('bullish')) sentimentEmoji = '🟢 Bullish 🐂';
        else if (sentiment.toLowerCase().includes('bearish')) sentimentEmoji = '🔴 Bearish 🐻';
        else sentimentEmoji = '🟡 Neutral ⚖️';
        
        const formattedSummary = `\n\n✨ <b>AI වෙළඳපොළ විශ්ලේෂණය</b> ✨\n\n` +
               `<b>📈 බලපෑම:</b> ${sentimentEmoji}\n\n` +
               `<b>📝 සාරාංශය:</b> ${summarySi}`;


        return { impact, summary: formattedSummary, sentiment };
    } catch (error) {
        console.error(`Gemini AI analysis failed:`, error.message);
        return {
            impact: 'Unknown',
            summary: "\n\n⚠️ <b>AI විශ්ලේෂණය ලබා ගැනීමට නොහැකි විය.</b>",
            sentiment: 'Neutral'
        };
    }
}

/**
 * Scrapes the latest news headline, URL, description, and image URL from Forex Factory.
 */
async function getLatestForexNews() {
    const resp = await fetch(FF_NEWS_URL, { headers: HEADERS });
    if (!resp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${resp.status} on news page.`);

    const html = await resp.text();
    const $ = load(html);
    
    // Find the latest news item.
    const newsLinkTag = $('a[href^="/news/"]').not('a[href$="/hit"]').first();

    if (newsLinkTag.length === 0) return null;
    
    const headline = newsLinkTag.text().trim();
    const newsUrl = "https://www.forexfactory.com" + newsLinkTag.attr('href');
    
    // Fetch the detail page for description and image
    const newsResp = await fetch(newsUrl, { headers: HEADERS });
    if (!newsResp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${newsResp.status} on detail page`);

    const newsHtml = await newsResp.text();
    const $detail = load(newsHtml);
    
    let imgUrl = $detail('img.attach').attr('src'); 
    
    // Scrape main description copy. Use the fallback text if no description is found.
    const description = $detail('p.news__copy').text().trim() || FALLBACK_DESCRIPTION_EN;

    if (imgUrl && imgUrl.startsWith('/')) {
        imgUrl = "https://www.forexfactory.com" + imgUrl;
    } else if (!imgUrl || !imgUrl.startsWith('http')) {
        imgUrl = null;
    }
    
    return { headline, newsUrl, imgUrl, description };
}

/**
 * Core function to fetch news, filter by AI impact, and post to Telegram.
 */
async function fetchForexNews(env) {
    const CHAT_ID = CONFIG.TELEGRAM_CHAT_ID;
    try {
        const news = await getLatestForexNews();
        if (!news) return;
        
        const currentHeadline = news.headline;
        const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE);
        const cleanLastHeadline = lastHeadline ? lastHeadline.trim() : null; 

        if (currentHeadline === cleanLastHeadline) {
            console.info(`Forex: No new headline. Last: ${currentHeadline}. Skipping post.`);
            return; 
        }

        // --- 🚨 NEW STEP: Get AI Impact and Analysis ---
        const newsForAI = (news.description !== FALLBACK_DESCRIPTION_EN) ? news.description : news.headline;
        const aiResult = await getAIAnalysis(news.headline, newsForAI);
        
        // --- 🚨 NEW FILTERING LOGIC: AI MUST DECLARE 'HIGH' IMPACT 🚨 ---
        if (aiResult.impact !== 'HIGH') {
            console.info(`Forex: Skipping post. AI determined Impact is ${aiResult.impact}. Headline: ${news.headline}`);
            return; // HIGH Impact නොවේ නම්, කිසිවක් Post කිරීමකින් තොරව නවතී.
        }
        // --- END AI FILTERING LOGIC ---
        
        // KV Update only happens if it's a new, high-impact headline
        await writeKV(env, NEWS_KV_KEYS.LAST_HEADLINE, currentHeadline);

        const date_time = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD hh:mm A');
        
        // --- Construct the final message using AI result (using HTML parse mode) ---
        const message = `<b>🚨 HIGH IMPACT NEWS (සිංහල) 🚨</b>\n\n` +
                         `<b>⏰ Date & Time:</b> ${date_time}\n\n` +
                         `<b>🌎 Headline (English):</b> ${news.headline}\n\n` +
                         
                         // Inject the AI Summary here (uses HTML from getAIAnalysis)
                         `${aiResult.summary}\n\n` + 
                         
                         `<b>🚀 Dev: Mr Chamo 🇱🇰</b>`;

        // Store the final HTML message and image URL
        await writeKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE, message);
        await writeKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL, news.imgUrl || ''); 

        // Send the message, using sendPhoto if imgUrl is available (using HTML parse mode)
        await sendUnifiedMessage(CHAT_ID, message, 'HTML', news.imgUrl);
        
        console.log(`Forex: Successfully posted High Impact news (AI Filtered): ${currentHeadline}`);
        
    } catch (error) {
        console.error("An error occurred during FUNDAMENTAL task:", error.stack);
    }
}


// =================================================================
// --- 3. TRADING Q&A LOGIC (with Rate Limiting) ---
// =================================================================

// Functions imported from trading_assistant.js

async function generateScheduledContent(env) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const coveredTopicsString = await readKV(env, TRADING_KV_KEYS.COVERED_TOPICS) || "[]";
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
            const newTopicMatch = content.match(/\*([^*]+)\*/); // පළමු බෝල්ඩ් කර ඇති මාතෘකාව ලබා ගනී
            const newTopic = newTopicMatch ? newTopicMatch[1].trim() : "Untitled Post";
            
            coveredTopics.push(newTopic);
            
            await writeKV(env, TRADING_KV_KEYS.COVERED_TOPICS, JSON.stringify(coveredTopics));
            await writeKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC, newTopic);
            
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

async function checkAndIncrementUsage(env, chatId) {
    if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        return { allowed: true, count: 'Unlimited' };
    }

    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const KV_KEY = `usage:${today}:${chatId}`;

    const currentUsageStr = await readKV(env, KV_KEY);
    let currentUsage = parseInt(currentUsageStr) || 0;

    if (currentUsage >= CONFIG.DAILY_LIMIT) {
        return { allowed: false, count: currentUsage, kvKey: KV_KEY }; 
    }

    currentUsage += 1;
    
    // Calculate TTL until next midnight in Colombo time
    const now = moment().tz(CONFIG.COLOMBO_TIMEZONE);
    const endOfDay = moment().tz(CONFIG.COLOMBO_TIMEZONE).add(1, 'days').startOf('day'); 
    const expirationTtl = Math.max(1, endOfDay.diff(now, 'seconds')); 
    
    await writeKV(env, KV_KEY, currentUsage.toString(), { expirationTtl: expirationTtl });

    return { allowed: true, count: currentUsage, kvKey: KV_KEY };
}

// FIX: 'userSet.push is not a function' දෝෂය නිරාකරණය කර ඇත
async function updateAndEditUserCount(env, userId) {
    const USER_SET_KEY = TRADING_KV_KEYS.BOT_USER_SET; 
    const COUNT_POST_ID_KEY = TRADING_KV_KEYS.COUNT_POST_ID; 
    const DAILY_COUNT_KEY = TRADING_KV_KEYS.DAILY_USER_COUNT; 

    const userIdString = userId.toString();

    // KV එකෙන් JSON ලෙස කියවන්න (නිවැරදි කරන ලද readKV)
    const userSetRaw = await readKV(env, USER_SET_KEY, 'text');
    let userSet = userSetRaw ? JSON.parse(userSetRaw) : [];

    // Array එකක් නොවේ නම් හිස් Array එකක් භාවිතා කරන්න (Failsafe)
    if (!Array.isArray(userSet)) { userSet = []; }

    const isNewUser = !userSet.includes(userIdString);
    
    if (isNewUser) {
        userSet.push(userIdString); // දැන් මෙය Array එකක් බැවින් දෝෂයක් නැත
        await writeKV(env, USER_SET_KEY, JSON.stringify(userSet));
        const totalCount = userSet.length;
        
        const dailyCountStr = await readKV(env, DAILY_COUNT_KEY) || '0';
        let dailyCount = parseInt(dailyCountStr);
        dailyCount += 1;
        
        // Calculate TTL until next midnight in Colombo time
        const now = moment().tz(CONFIG.COLOMBO_TIMEZONE);
        const endOfDay = moment().tz(CONFIG.COLOMBO_TIMEZONE).add(1, 'days').startOf('day'); 
        const expirationTtl = Math.max(1, endOfDay.diff(now, 'seconds')); 

        await writeKV(env, DAILY_COUNT_KEY, dailyCount.toString(), { expirationTtl: expirationTtl });
        
        const postDetailsStr = await readKV(env, COUNT_POST_ID_KEY);
        
        if (postDetailsStr) {
            const [chatId, messageId] = postDetailsStr.split(':');
            
            const timeZone = CONFIG.COLOMBO_TIMEZONE;
            const currentTime = moment().tz(timeZone).format('hh:mm:ss A');
            
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

    return { success: isNewUser, newCount: Array.isArray(userSet) ? userSet.length : 0 };
}

// =================================================================
// --- 4. OWNER COMMANDS ---
// =================================================================

async function sendInitialCountPost(env, ownerChatId) {
    const COUNT_POST_ID_KEY = TRADING_KV_KEYS.COUNT_POST_ID;
    const targetChatId = CONFIG.TELEGRAM_CHAT_ID;

    const existingPost = await readKV(env, COUNT_POST_ID_KEY);
    if (existingPost) {
        return { success: false, message: `Permanent Count Post එක දැනටමත් පවතී. Post ID: ${existingPost}` };
    }

    const userSetRaw = await readKV(env, TRADING_KV_KEYS.BOT_USER_SET, 'text');
    const userSet = userSetRaw ? JSON.parse(userSetRaw) : [];
    const dailyCountStr = await readKV(env, TRADING_KV_KEYS.DAILY_USER_COUNT) || '0';
    const totalCount = Array.isArray(userSet) ? userSet.length : 0;
    
    const timeZone = CONFIG.COLOMBO_TIMEZONE;
    const currentTime = moment().tz(timeZone).format('hh:mm:ss A');

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

    const result = await sendPhotoWithCaption(targetChatId, STATS_PHOTO_URL, initialCaption, keyboard);
    
    if (result.success) {
        const postIdentifier = `${targetChatId}:${result.messageId}`;
        await writeKV(env, COUNT_POST_ID_KEY, postIdentifier);
        return { success: true, message: `Permanent Count Post එක සාර්ථකව \`${targetChatId}\` Chat ID එකට යවා ගබඩා කරන ලදී. Post ID: ${postIdentifier}` };
    } else {
        return { success: false, message: `Post යැවීම අසාර්ථක විය: ${JSON.stringify(result.error)}` };
    }
}


// =================================================================
// --- 5. CALLBACK QUERY HANDLER (Owner Limit Approval) ---
// =================================================================

async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;

    // 1. 🛑 UNLIMIT REQUEST LOGIC 
    if (data.startsWith('REQUEST_UNLIMIT_')) {
        const requestId = data.substring('REQUEST_UNLIMIT_'.length);
        const requestDataStr = await readKV(env, `UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. නැවත උත්සාහ කරන්න.", true);
            return new Response('Expired request', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName, userName } = requestData;

        const safeUserFirstName = escapeMarkdown(userFirstName);
        const safeUserName = escapeMarkdown(userName);
        
        await answerCallbackQuery(callbackQueryId, "✅ Owner වෙත ඔබගේ Limit ඉල්ලීම යවන ලදී. කරුණාකර පිළිතුරක් ලැබෙන තෙක් රැඳී සිටින්න.", true);
        
        const requestMessage = `*👑 UNLIMIT REQUEST* \n
*User Name:* ${safeUserFirstName} (${safeUserName})
*User ID:* \`${targetUserId}\`
*User Chat ID:* \`${userChatId}\`
*Original Message ID:* \`${userMessageId}\`
\n\nමෙම User ගේ අද දින Limit එක ඉවත් කර, ඔහුට සාර්ථක ලෙස දැනුම් දීමට පහත Button භාවිතා කරන්න.`;

        const approvalKeyboard = [
            [{ text: "✅ Approve Request", callback_data: `APPROVE_UNLIMIT_${requestId}` }],
            [{ text: "❌ Reject Request", callback_data: `REJECT_UNLIMIT_${requestId}` }]
        ];
        
        const sentToOwner = await sendTelegramReplyToOwner(requestMessage, approvalKeyboard);
        
        if (!sentToOwner) {
             console.error(`Failed to send unlimit request for user ${targetUserId} to owner.`);
        }
        
        return new Response('Unlimit request sent to owner', { status: 200 });
        
    } 
    
    // 2. 👑 APPROVAL / REJECTION LOGIC
    else if (data.startsWith('APPROVE_UNLIMIT_') || data.startsWith('REJECT_UNLIMIT_')) {
        
        if (userId.toString() !== CONFIG.OWNER_CHAT_ID.toString()) {
            await answerCallbackQuery(callbackQueryId, "🛑 ඔබට මෙය Approve කිරීමට බලය නැත. (Owner Only)", true);
            return new Response('Unauthorized approval attempt', { status: 200 });
        }
        
        const isApproved = data.startsWith('APPROVE');
        const requestId = data.substring(data.startsWith('APPROVE') ? 'APPROVE_UNLIMIT_'.length : 'REJECT_UNLIMIT_'.length);
        
        const requestDataStr = await readKV(env, `UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. User ට සෘජුවම දැනුම් දෙන්න.", true);
            return new Response('Expired approval key', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName } = requestData;
        
        await env.POST_STATUS_KV.delete(`UNLIMIT_REQUEST_${requestId}`);

        const userChatIdInt = parseInt(userChatId);
        const userMessageIdInt = parseInt(userMessageId);
        
        const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
        const KV_KEY = `usage:${today}:${userChatId}`;
        
        const ownerChatId = query.message.chat.id;
        const ownerMessageId = query.message.message_id;
        
        let newOwnerMessage = query.message.text.split('මෙම User ගේ')[0]; 
        
        const timeZone = CONFIG.COLOMBO_TIMEZONE;
        const currentTime = moment().tz(timeZone).format('hh:mm:ss A');
        
        
        if (isApproved) {
            await env.POST_STATUS_KV.delete(KV_KEY);
            
            const successText = `✅ *Request Approved!* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම අනුමත කරන ලදී!** \n\nදැන් ඔබට නැවත Bot භාවිතා කළ හැකිය. (Limit එක Reset වී ඇත.)`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, successText);
            
            await removeInlineKeyboard(ownerChatId, ownerMessageId); 
            
            const approvalDetails = `\n
*✅ STATUS: Approved by Owner!*
\n*User ID:* \`${targetUserId}\`
*User Name:* ${userFirstName}
*Message ID:* \`${userMessageId}\`
*Time:* ${currentTime} (SL Time)
\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;

            newOwnerMessage += approvalDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage); 
            
            await answerCallbackQuery(callbackQueryId, `✅ User ${targetUserId} ගේ Limit එක ඉවත් කර, ඔහුට දැනුම් දෙන ලදී.`, true);
            
        } else { // Rejected
            
            const rejectText = `❌ *Request Rejected* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.** \n\nකරුණාකර හෙට දින නැවත උත්සාහ කරන්න.`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, rejectText);

            await removeInlineKeyboard(ownerChatId, ownerMessageId);
            
            const rejectionDetails = `\n
*❌ STATUS: Rejected by Owner!*
\n*User ID:* \`${targetUserId}\`
*User Name:* ${userFirstName}
*Message ID:* \`${userMessageId}\`
*Time:* ${currentTime} (SL Time)
\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;

            newOwnerMessage += rejectionDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage);

            await answerCallbackQuery(callbackQueryId, `❌ User ${targetUserId} ගේ ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.`, true);
        }
        
        return new Response('Approval logic processed', { status: 200 });
    }
    
    // 3. Private Info Button
    else if (data === 'SHOW_PRIVATE_INFO') {
        const privateMessage = `*✅ ඔබට පමණක් පෞද්ගලික තොරතුරු (Personalized Info)*\n\nමෙම තොරතුරු *ඔබට පමණක්* දර්ශනය වන ලෙස **Alert Box** එකක් මඟින් පෙන්වනු ලැබේ.\n\n*User ID:* \`${userId}\``;
        await answerCallbackQuery(callbackQueryId, privateMessage, true);
        return new Response('Callback query processed (private alert sent)', { status: 200 });

    } 
    
    else {
        await answerCallbackQuery(callbackQueryId, "Processing...", false);
        return new Response('Callback query handled', { status: 200 });
    }
}


// =================================================================
// --- 6. WEBHOOK HANDLER (UNIFIED COMMANDS) ---
// =================================================================

async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env);
        }

        if (!update.message || !update.message.text) {
            return new Response('Not a text message or callback', { status: 200 }); 
        }
        
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text.trim();
        const userId = message.from.id; 
        const userFirstName = message.from.first_name || "N/A";
        const userName = message.from.username ? `@${message.from.username}` : userFirstName;

        // --- COMMANDS HANDLING ---
        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();

            // --- Owner Command to Send Initial Count Post ---
            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && command === '/send_count_post') {
                const result = await sendInitialCountPost(env, chatId); 
                await sendTelegramReply(chatId, result.message, messageId);
                return new Response('Count post command processed', { status: 200 });
            }
            // --- ADMIN COMMANDS (Owner Only) ---
            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && command === '/unlimit') {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const targetChatId = parts[1].trim();
                    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
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


            // --- /start and /help ---
            if (command === '/start' || command === '/help') {
                const isMember = await checkChannelMembership(userId);
                if (isMember) {
                    await updateAndEditUserCount(env, userId);
                }

                const welcomeMessage = "👋 *Welcome to the Trading Assistant Bot!* \n\nMata answer karanna puluwan **Trading, Finance, saha Crypto** related questions walata witharai. \n\n*Limit:* Dawasakata *Trading Questions 5* k withirai. (Owner ta unlimited). \n\nCommands: \n\n◇ `/fundamental` :- 📰 Last Fundamental News\n◇ `/help` :- 🤝 Show this menu\n\nTry karanna: 'Order Flow කියන්නේ මොකද්ද?' wage prashnayak ahanna.";
                await sendTelegramReply(chatId, welcomeMessage, messageId);
                return new Response('Command processed', { status: 200 });
            } 
            
            // --- 🚨 NEWS COMMAND: /fundamental ---
            else if (command === '/fundamental') {
                // Universal Membership Check (News)
                const isMember = await checkChannelMembership(userId);
                if (!isMember) {
                    const denialMessage = 
                        `⛔ <b>Access Denied</b> ⛔\n\n` +
                        `Hey There <a href="tg://user?id=${userId}">${userName}</a>,\n` +
                        `ඔබට මෙම BOT එක භාවිතා කිරීමට නම්, අපගේ <b>${CONFIG.CHANNEL_LINK_TEXT}</b> Channel එකට Join විය යුතුය.\n` +
                        `කරුණාකර Join වී නැවත උත්සාහ කරන්න.👀 Thank You ✍️`;
                    
                    const replyMarkup = {
                        inline_keyboard: [
                            [{ text: `🔥 ${CONFIG.CHANNEL_LINK_TEXT} < / >`, url: CONFIG.CHANNEL_LINK_URL }]
                        ]
                    };

                    await sendUnifiedMessage(chatId, denialMessage, 'HTML', null, replyMarkup, messageId); 
                    return new Response('Membership Denied (News)', { status: 200 });
                }

                const messageKey = NEWS_KV_KEYS.LAST_FULL_MESSAGE;
                const lastImageUrl = await readKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL);
                const lastFullMessage = await readKV(env, messageKey);
                
                if (lastFullMessage) {
                    // Send the last stored High Impact News Post (using HTML parse mode)
                    await sendUnifiedMessage(chatId, lastFullMessage, 'HTML', lastImageUrl, null, messageId); 
                } else {
                    const fallbackText = "Sorry, no recent **HIGH IMPACT** fundamental news has been processed yet. Please wait for the next update.";
                    await sendTelegramReply(chatId, fallbackText, messageId); 
                }
                return new Response('Fundamental command processed', { status: 200 });
            }
        }
        
        // --- TRADING QUESTION LOGIC ---
        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            // 1. 🚦 Universal Membership Check (Q&A)
            const isMember = await checkChannelMembership(userId);
            if (!isMember) {
                const denialMessage = 
                    `⛔ <b>Access Denied</b> ⛔\n\n` +
                    `Hey There <a href="tg://user?id=${userId}">${userName}</a>,\n` +
                    `ඔබට මෙම BOT එක භාවිතා කිරීමට නම්, අපගේ <b>${CONFIG.CHANNEL_LINK_TEXT}</b> Channel එකට Join විය යුතුය.\n` +
                    `කරුණාකර Join වී නැවත උත්සාහ කරන්න.👀 Thank You ✍️`;
                
                const replyMarkup = {
                    inline_keyboard: [
                        [{ text: `🔥 ${CONFIG.CHANNEL_LINK_TEXT} < / >`, url: CONFIG.CHANNEL_LINK_URL }]
                    ]
                };

                await sendUnifiedMessage(chatId, denialMessage, 'HTML', null, replyMarkup, messageId); 
                return new Response('Membership Denied (Q&A)', { status: 200 });
            }
            
            // 2. ⏳ Trading Validation - ආරම්භක පරීක්ෂාව 
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                
                // 3. 🛑 Rate Limit Check
                const usageResult = await checkAndIncrementUsage(env, chatId);
                
                if (!usageResult.allowed) {
                    const limitMessage = `🛑 *Usage Limit Reached!* \n\nSorry, oyage **Trading Questions 5** (limit eka) ada dawasata iwarai. \n\n*Reset wenawa:* Midnight 12.00 AM walata. \n\n*Owner ge Approval one nam, Request karanna!*`;
                    
                    const requestId = `REQ_${generateRandomId()}`;
                    const requestData = {
                        userChatId: chatId,
                        userMessageId: validationMessageId, 
                        targetUserId: userId,
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
                
                // 4. 🌐 Searching Status 
                await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...* (Finding up-to-date info)");
                
                // 5. 🧠 Generation Status 
                await sendTypingAction(chatId); 
                await editTelegramMessage(chatId, validationMessageId, "✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed reply)");
                
                // 6. 🔗 Final Content Generation
                const replyText = await generateReplyContent(text);
                
                // 7. ✅ Final Edit - සම්පූර්ණ පිළිතුර Message එකට යැවීම
                await editTelegramMessage(chatId, validationMessageId, replyText);
                
            } else {
                // Not a Trading Question - Guardrail Message 
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer karanna.* \n\n*Oyage Chat ID eka:* \`${chatId}\`\n\nPlease ask karanna: 'What is RSI?' wage ekak. *Anith ewa mata denuma naha.* 😔`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage);
            }
            
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (e) {
        console.error("Error processing webhook:", e.stack);
        return new Response('Error', { status: 500 });
    }
}


// =================================================================
// --- 7. WORKER EXPORT (FINAL UNIFIED HANDLERS) ---
// =================================================================

export default {
    /**
     * Handles scheduled events (Cron trigger)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    // 1. FUNDAMENTAL NEWS (AI High Impact Filter)
                    await fetchForexNews(env);
                    
                    // 2. DAILY TRADING EDUCATIONAL POST
                    const postContent = await generateScheduledContent(env); 
                    if (postContent) {
                        const success = await sendTelegramMessage(postContent); 
                        if (success) {
                            await writeKV(env, `trading_post_posted:${moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD')}`, "POSTED");
                        } else {
                            await writeKV(env, `trading_post_posted:${moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD')}`, "FAILED");
                            await sendTelegramReplyToOwner(`❌ Scheduled Daily Trading Post එක යැවීම අසාර්ථක විය.`);
                        }
                    }
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
        
        // Manual Trigger for BOTH tasks
        if (url.pathname === '/trigger-all') {
            await fetchForexNews(env);
            const postContent = await generateScheduledContent(env); 
            if (postContent) {
                await sendTelegramMessage(postContent);
            }
            return new Response("✅ All scheduled tasks (News and Trading Post) manually triggered. Check your Telegram channel and Worker Logs.", { status: 200 });
        }
        
        // Manual News Trigger
        if (url.pathname === '/trigger-news') {
            await fetchForexNews(env);
            return new Response("✅ Fundamental News task manually triggered. AI High Impact Filter is Active. Check logs.", { status: 200 });
        }

        // Manual Daily Post Trigger for Testing
        if (url.pathname === '/trigger-manual') {
            try {
                 const postContent = await generateScheduledContent(env);
                 if (postContent) {
                    const success = await sendTelegramMessage(postContent); 
                    if (success) {
                        return new Response('✅ Manual Daily Post Triggered Successfully.', { status: 200 });
                    }
                    return new Response('❌ Manual Daily Post Failed to Send to Telegram. (Check logs)', { status: 500 });
                 }
                 return new Response('❌ Manual Daily Post Failed: Content Generation Failed. (Check logs)', { status: 500 });
            } catch (e) {
                 return new Response(`Error in Manual Trigger: ${e.message}`, { status: 500 });
            }
        }


        if (request.method === 'POST') {
            return handleWebhook(request, env);
        }
        
        return new Response('Unified Trading Bot Worker running. Use the scheduled trigger or /trigger-all.', { status: 200 });
    }
};
