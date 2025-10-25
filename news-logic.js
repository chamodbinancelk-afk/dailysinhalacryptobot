// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio';
import moment from 'moment-timezone';

// =================================================================
// --- 🔴 HARDCODED CONFIGURATION (KEYS INSERTED DIRECTLY) 🔴 ---
// =================================================================

const HARDCODED_CONFIG = {
    // ⚠️ ඔබේ සත්‍ය දත්ත මගින් ප්‍රතිස්ථාපනය කරන්න.
    TELEGRAM_TOKEN: '8299929776:AAEFqh0J0kVqzioFF2ft5okOtQqO_8evviY',        
    CHAT_ID: '-1003177936060',                  
    GEMINI_API_KEY: 'AIzaSyDDmFq7B3gTazrcrI_J4J7VhB9YdFyTCaU',            
};

// --- NEW CONSTANTS FOR MEMBERSHIP CHECK AND BUTTON ---
const CHANNEL_USERNAME = 'C_F_News';
const CHANNEL_LINK_TEXT = 'C F NEWS ₿';
const CHANNEL_LINK_URL = `https://t.me/${CHANNEL_USERNAME}`;

// --- Constants ---
const COLOMBO_TIMEZONE = 'Asia/Colombo';
const HEADERS = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.forexfactory.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

const FF_NEWS_URL = "https://www.forexfactory.com/news";

// --- KV KEYS ---
const LAST_HEADLINE_KEY = 'last_forex_headline'; 
const LAST_FULL_MESSAGE_KEY = 'last_full_news_message'; 
const LAST_IMAGE_URL_KEY = 'last_image_url'; 
// Economic Keys ඉවත් කර ඇත.

// --- CONSTANT FOR MISSING DESCRIPTION CHECK ---
const FALLBACK_DESCRIPTION_EN = "No description found.";


// =================================================================
// --- UTILITY FUNCTIONS ---
// =================================================================

/**
 * Sends a message to Telegram, using the hardcoded TELEGRAM_TOKEN.
 */
async function sendRawTelegramMessage(chatId, message, imgUrl = null, replyMarkup = null, replyToId = null) {
    const TELEGRAM_TOKEN = HARDCODED_CONFIG.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
        console.error("TELEGRAM_TOKEN is missing or placeholder.");
        return false;
    }
    const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
    
    let currentImgUrl = imgUrl; 
    let apiMethod = currentImgUrl ? 'sendPhoto' : 'sendMessage';
    let maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let payload = { chat_id: chatId, parse_mode: 'HTML' };

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
                    console.error(`SendPhoto failed, retrying as sendMessage: ${errorText}`);
                    continue; 
                }
                console.error(`Telegram API Error (${apiMethod}): ${response.status} - ${errorText}`);
                break; 
            }
            return true; // Success
        } catch (error) {
            console.error("Error sending message to Telegram:", error);
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false; 
}


/**
 * Reads data from the KV Namespace, assuming it is bound as env.NEWS_STATE.
 */
async function readKV(env, key) {
    try {
        if (!env.NEWS_STATE) {
            console.error("KV Binding 'NEWS_STATE' is missing in ENV.");
            return null;
        }
        const value = await env.NEWS_STATE.get(key); 
        if (value === null || value === undefined) {
            return null;
        }
        return value;
    } catch (e) {
        console.error(`KV Read Error (${key}):`, e);
        return null;
    }
}

/**
 * Writes data to the KV Namespace, assuming it is bound as env.NEWS_STATE.
 */
async function writeKV(env, key, value) {
    try {
        if (!env.NEWS_STATE) {
            console.error("KV Binding 'NEWS_STATE' is missing in ENV. Write failed.");
            return;
        }
        // Economic Event TTL (2592000) ඉවත් කර ඇත
        await env.NEWS_STATE.put(key, String(value)); 
    } catch (e) {
        console.error(`KV Write Error (${key}):`, e);
    }
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


/**
 * Checks if a user is a member (or admin/creator) of the specified CHAT_ID channel.
 */
async function checkChannelMembership(userId) {
    const TELEGRAM_TOKEN = HARDCODED_CONFIG.TELEGRAM_TOKEN;
    const CHAT_ID = HARDCODED_CONFIG.CHAT_ID;
    const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

    if (!TELEGRAM_TOKEN || !CHAT_ID) return false;

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
        return false; // Default to false on error
    }
}


// =================================================================
// --- GEMINI AI INTEGRATION ---
// =================================================================

/**
 * Uses Gemini to generate a short Sinhala summary and sentiment analysis for the news.
 */
async function getAISentimentSummary(headline, description) {
    const GEMINI_API_KEY = HARDCODED_CONFIG.GEMINI_API_KEY;
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    // 1. Initial Key Check
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        console.error("Gemini AI: API Key is missing or placeholder. Skipping analysis.");
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
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
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
                console.warn(`Gemini API: Rate limit hit (429). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Gemini API Error (Attempt ${attempt + 1}): HTTP Status ${response.status} - Response: ${errorText}`);
                throw new Error("Gemini API call failed with non-OK status.");
            }

            const result = await response.json();
            const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!textResponse) {
                 console.error("Gemini API Error: Response was empty or malformed.");
                 throw new Error("Gemini response was empty or malformed.");
            }
            
            // Parsing the text response
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
            
            // Format the final output string
            let sentimentEmoji = '⚪';
            if (sentiment.toLowerCase().includes('bullish')) sentimentEmoji = '🟢 Bullish 🐂';
            else if (sentiment.toLowerCase().includes('bearish')) sentimentEmoji = '🔴 Bearish 🐻';
            else sentimentEmoji = '🟡 Neutral ⚖️';

            return `\n\n✨ <b>AI වෙළඳපොළ විශ්ලේෂණය</b> ✨\n\n` +
                   `<b>📈 බලපෑම:</b> ${sentimentEmoji}\n\n` +
                   `<b>📝 සාරාංශය:</b> ${summarySi}`;
        } catch (error) {
            console.error(`Gemini API attempt ${attempt + 1} failed:`, error.message);
            if (attempt === maxRetries - 1) {
                return "\n\n⚠️ <b>AI විශ්ලේෂණය ලබා ගැනීමට නොහැකි විය.</b>";
            }
            const delay = initialDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}


// =================================================================
// --- CORE FOREX NEWS LOGIC (Fundamental) ---
// =================================================================

async function getLatestForexNews() {
    const resp = await fetch(FF_NEWS_URL, { headers: HEADERS });
    if (!resp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${resp.status} on news page.`);

    const html = await resp.text();
    const $ = load(html);
    const newsLinkTag = $('a[href^="/news/"]').not('a[href$="/hit"]').first();

    if (newsLinkTag.length === 0) return null;

    const headline = newsLinkTag.text().trim();
    const newsUrl = "https://www.forexfactory.com" + newsLinkTag.attr('href');
    
    const newsResp = await fetch(newsUrl, { headers: HEADERS });
    if (!newsResp.ok) throw new Error(`[SCRAPING ERROR] HTTP error! status: ${resp.status} on detail page`);

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

async function fetchForexNews(env) {
    const CHAT_ID = HARDCODED_CONFIG.CHAT_ID;
    try {
        const news = await getLatestForexNews();
        if (!news) return;

        const lastHeadline = await readKV(env, LAST_HEADLINE_KEY);
        const currentHeadline = news.headline;
        const cleanLastHeadline = lastHeadline ? lastHeadline.trim() : null; 

        if (currentHeadline === cleanLastHeadline) {
            console.info(`Forex: No new headline. Last: ${currentHeadline}`);
            return; 
        }
        
        await writeKV(env, LAST_HEADLINE_KEY, currentHeadline);

        const date_time = moment().tz(COLOMBO_TIMEZONE).format('YYYY-MM-DD hh:mm A');

        // --- STEP 1: Handle Missing Description ---
        let description_si;
        if (news.description === FALLBACK_DESCRIPTION_EN) {
            description_si = "ℹ️ විස්තරයක් නොමැත.";
        } else {
            description_si = await translateText(news.description);
        }
        
        // --- STEP 2: Get AI Sentiment Summary (NEW) ---
        const newsForAI = (news.description !== FALLBACK_DESCRIPTION_EN) ? news.description : news.headline;
        const aiSummary = await getAISentimentSummary(news.headline, newsForAI);
        
        // --- STEP 3: Construct the final message ---
        const message = `<b>📰 Fundamental News (සිංහල)</b>\n\n` +
                         `<b>⏰ Date & Time:</b> ${date_time}\n\n` +
                         `<b>🌎 Headline (English):</b> ${news.headline}\n\n` +
                         
                         // Inject the AI Summary here
                         `${aiSummary}\n\n` + 
                         
                         `<b>🚀 Dev: Mr Chamo 🇱🇰</b>`;

        await writeKV(env, LAST_FULL_MESSAGE_KEY, message);
        await writeKV(env, LAST_IMAGE_URL_KEY, news.imgUrl || ''); 

        // Send the message, using sendPhoto if imgUrl is available
        await sendRawTelegramMessage(CHAT_ID, message, news.imgUrl);
    } catch (error) {
        console.error("An error occurred during FUNDAMENTAL task:", error.stack);
    }
}


// =================================================================
// --- TELEGRAM WEBHOOK HANDLER (Only for /fundamental command) ---
// =================================================================

async function handleTelegramUpdate(update, env) {
    const CHAT_ID = HARDCODED_CONFIG.CHAT_ID; 

    if (!update.message || !update.message.text) {
        return; 
    }
    
    const text = update.message.text.trim();
    const command = text.split(' ')[0].toLowerCase();
    const userId = update.message.from.id;
    const chatId = update.message.chat.id; 
    const messageId = update.message.message_id; 
    const username = update.message.from.username || update.message.from.first_name;

    // --- 1. MANDATORY MEMBERSHIP CHECK ---
    if (command === '/fundamental') { // Economic command ඉවත් කර ඇත
        const isMember = await checkChannelMembership(userId);

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

            await sendRawTelegramMessage(chatId, denialMessage, null, replyMarkup, messageId); 
            return; 
        }
    }

    // --- 2. COMMAND EXECUTION ---
    switch (command) {
        case '/start':
            const replyText = 
                `<b>👋 Hello There !</b>\n\n` +
                `💁‍♂️ මේ BOT ගෙන් පුළුවන් ඔයාට <b>Fundamental News</b> සිංහලෙන් දැන ගන්න. News Update වෙද්දීම <b>C F NEWS MAIN CHANNEL</b> එකට යවනවා.\n\n` +
                `🙋‍♂️ Commands වල Usage එක මෙහෙමයි👇\n\n` +
                `◇ <code>/fundamental</code> :- 📰 Last Fundamental News\n\n` +
                `🎯 මේ BOT පැය 24ම Active එකේ තියෙනවා.🔔.. ✍️\n\n` +
                `◇───────────────◇\n\n` +
                `🚀 <b>Developer :</b> @chamoddeshan\n` +
                `🔥 <b>Mr Chamo Corporation ©</b>\n\n` +
                `◇───────────────◇`;
            await sendRawTelegramMessage(chatId, replyText, null, null, messageId); 
            break;

        case '/fundamental':
            const messageKey = LAST_FULL_MESSAGE_KEY;
            const lastImageUrl = await readKV(env, LAST_IMAGE_URL_KEY);
            
            const lastFullMessage = await readKV(env, messageKey);
            
            if (lastFullMessage) {
                await sendRawTelegramMessage(chatId, lastFullMessage, lastImageUrl, null, messageId); 
            } else {
                const fallbackText = "Sorry, no recent fundamental news has been processed yet. Please wait for the next update.";
                await sendRawTelegramMessage(chatId, fallbackText, null, null, messageId); 
            }
            break;

        default:
            const defaultReplyText = `ඔබට ස්වයංක්‍රීයව පුවත් ලැබෙනු ඇත. වැඩි විස්තර සහ Commands සඳහා <b>/start</b> යොදන්න.`;
            await sendRawTelegramMessage(chatId, defaultReplyText, null, null, messageId); 
            break;
    }
}


// =================================================================
// --- CLOUDFLARE WORKER HANDLERS ---
// =================================================================

async function handleScheduledTasks(env) {
    // 1. FUNDAMENTAL NEWS HEADLINES පමණක්
    await fetchForexNews(env); 
}

export default {
    /**
     * Handles scheduled events (Cron trigger)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    await handleScheduledTasks(env);
                } catch (error) {
                    console.error("[CRITICAL CRON FAILURE]: ", error.stack);
                }
            })()
        );
    },

    /**
     * Handles Fetch requests (Webhook and Status/Trigger)
     */
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            // Manual trigger
            if (url.pathname === '/trigger') {
                // Run the main scheduled tasks to fetch actual data
                await handleScheduledTasks(env);
                
                return new Response("Scheduled task (Fundamental News) manually triggered. Check your Telegram channel and Worker Logs.", { status: 200 });
            }
            
            // Status check
            if (url.pathname === '/status') {
                const lastForex = await readKV(env, LAST_HEADLINE_KEY);
                
                const statusMessage = 
                    `Fundamental News Bot Worker is active.\n` + 
                    `KV Binding Check: ${env.NEWS_STATE ? 'OK (Bound)' : 'FAIL (Missing Binding)'}\n` +
                    `Last Fundamental Headline: ${lastForex || 'N/A'}`;
                
                return new Response(statusMessage, { status: 200 });
            }

            // Webhook Handling (for Telegram commands)
            if (request.method === 'POST') {
                console.log("--- WEBHOOK REQUEST RECEIVED (POST) ---");
                const update = await request.json();
                await handleTelegramUpdate(update, env); 
                return new Response('OK', { status: 200 });
            }

            return new Response('Fundamental News Bot is ready. Use /trigger to test manually.', { status: 200 });
            
        } catch (e) {
            console.error('[CRITICAL FETCH FAILURE - 1101 ERROR CAUGHT]:', e.stack);
            return new Response(`Worker threw an unhandled exception: ${e.message}. Check Cloudflare Worker Logs for Stack Trace.`, { status: 500 });
        }
    }
};
