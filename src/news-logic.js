// =================================================================
// === src/news-logic.js (FINAL BUILD FIX - Correct Exports) ===
// =================================================================

// --- ES MODULE IMPORTS ---
import { load } from 'cheerio';
import moment from 'moment-timezone';
// Trading logic වෙතින් /start command එක සඳහා අවශ්‍ය ශ්‍රිතය Import කරයි.
import { updateAndEditUserCount } from './trading-logic';

// --- CONSTANTS ---
const CHANNEL_LINK_TEXT = "Mrchamo Official Channel";
const CHANNEL_LINK_URL = "https://t.me/Mrchamo_Lk";
const LAST_FULL_MESSAGE_KEY = 'LAST_NEWS_MESSAGE';
const LAST_IMAGE_URL_KEY = 'LAST_NEWS_IMAGE_URL';


// --- UTILITY FUNCTIONS ---

async function readKV(env, key) {
    return env.POST_STATUS_KV.get(key);
}

// --- TELEGRAM API FUNCTIONS ---

async function sendRawTelegramMessage(chatId, text, CONFIG, photoUrl = null, replyMarkup = null, replyToMessageId = null) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/`;
    
    let endpoint = 'sendMessage';
    const body = {
        chat_id: chatId, 
        parse_mode: 'HTML',
        reply_to_message_id: replyToMessageId 
    };

    if (photoUrl) {
        endpoint = 'sendPhoto';
        body.photo = photoUrl;
        body.caption = text;
    } else {
        body.text = text;
    }

    if (replyMarkup) {
        body.reply_markup = replyMarkup;
    }

    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        
        const data = await response.json();
        return data.ok ? { ok: true, result: data.result } : { ok: false, error: data };
    } catch (e) {
        console.error("Send Telegram raw message error:", e);
        return { ok: false, error: e.toString() };
    }
}

async function checkChannelMembership(userId, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/getChatMember`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CONFIG.TELEGRAM_CHAT_ID,
                user_id: userId
            }),
        });
        
        const data = await response.json();
        if (data.ok) {
            const status = data.result.status;
            // 'member', 'creator', 'administrator' හැර අනෙකුත් (left, restricted, kicked) අවස්ථා සඳහා False
            return ['member', 'creator', 'administrator'].includes(status);
        }
        return false;
    } catch (e) {
        console.error("Membership check error:", e);
        return false;
    }
}


// --- GEMINI AI INTEGRATION ---

async function generateNewsPostContent(newsItem, CONFIG) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const inputContent = `
        Headline: ${newsItem.title}
        Description: ${newsItem.description}
        Impact: ${newsItem.impact}
        Time (UTC): ${newsItem.time}
        Currency: ${newsItem.currency}
        Actual: ${newsItem.actual}
        Forecast: ${newsItem.forecast}
        Previous: ${newsItem.previous}
    `;

    const systemPrompt = `
        You are an expert financial and trading news reporter for a Sri Lankan audience.
        
        Your task is to:
        1. **Analyze** the provided Fundamental News data (Headline, Currency, Impact, Actual, Forecast, Previous).
        2. **Determine** the potential *Immediate* impact of the Actual result on the Currency's value (e.g., USD, EUR).
        3. **Generate a brief, high-impact news post** in **Sinhala language (සිංහල අක්ෂර / Unicode)** using Telegram's **HTML** format (bold tags <b>, line breaks <br/>, anchor tags <a>).
        4. The post must be structured as follows:
            - **Line 1:** 💥 {Currency} News Alert!
            - **Line 2:** 🌐 {Headline}
            - **Line 3:** 🔴 *Impact:* {Impact Level}
            - **Line 4:** 📈 *Actual vs Forecast:* {Actual} vs {Forecast} (ප්‍රතිඵලය සහ අපේක්ෂාව)
            - **Line 5:** ✍️ **Sinhala Interpretation:** (ප්‍රතිඵලය නිසා එම මුදල් ඒකකයේ වටිනාකම කෙසේ වෙනස් විය හැකිද යන්න පිළිබඳ පැහැදිලි, කෙටි Sinhala සාරාංශයක්).
            - **Final Line:** ℹ️ *Source:* [Forex Factory](https://www.forexfactory.com/calendar)
        
        The final output must contain ONLY the HTML formatted content.
    `;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: inputContent }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.2 } 
            }),
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        
    } catch (e) {
        console.error("Gemini news content error:", e);
        return null;
    }
}


// --- CORE FOREX NEWS LOGIC ---

async function fetchForexNewsData(CONFIG) {
    const FOREX_FACTORY_URL = "https://www.forexfactory.com/calendar";
    
    try {
        // Cloudflare Worker එක හරහා fetch කිරීම
        const response = await fetch(FOREX_FACTORY_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cf: {
                // Cloudflare Cache මඟහරින්න
                cacheTtl: 60,
                cacheEverything: false
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Forex Factory data: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = load(html);
        const upcomingNews = [];
        const timeZone = 'Asia/Colombo';

        // 'data-eventid' සහිත row සොයයි
        $('.calendar__row').each((i, row) => {
            const eventId = $(row).attr('data-eventid');
            if (!eventId) return; // News event row එකක් නොවේ නම් skip කරයි

            const impactElement = $(row).find('.impact');
            const impactClass = impactElement.find('span').attr('class');
            
            let impact;
            if (impactClass.includes('high')) {
                impact = 'High Impact (🔴)';
            } else if (impactClass.includes('med')) {
                impact = 'Medium Impact (🟡)';
            } else if (impactClass.includes('low')) {
                impact = 'Low Impact (⚪)';
            } else {
                return; // High, Med, Low නැතිනම් අදාළ නොවේ (e.g., Non-Impact)
            }

            // News row වලින් දත්ත එකතු කිරීම
            const timeRaw = $(row).find('.time').text().trim();
            const time = timeRaw.includes('Today') ? moment().tz(timeZone).format('YYYY-MM-DD') : timeRaw;
            
            const currency = $(row).find('.currency').text().trim();
            const title = $(row).find('.event').text().trim();
            const actual = $(row).find('.actual').text().trim() || 'N/A';
            const forecast = $(row).find('.forecast').text().trim() || 'N/A';
            const previous = $(row).find('.previous').text().trim() || 'N/A';
            
            // Image URL ලබා ගැනීම (අදාළ නම්)
            const iconUrlMatch = impactElement.find('span').css('background-image')?.match(/url\(['"]?(.*?)['"]?\)/i);
            const imageUrl = iconUrlMatch ? iconUrlMatch[1] : null;

            // දැනටමත් සිදු වූ (Actual value එකක් ඇති) High/Med Impact News පමණක් පෙරීම
            if (impactClass.includes('high') || impactClass.includes('med')) {
                 if (actual !== 'N/A' && actual !== '') {
                     upcomingNews.push({
                        eventId,
                        time,
                        currency,
                        title,
                        impact,
                        actual,
                        forecast,
                        previous,
                        imageUrl: imageUrl || "https://envs.sh/i0q.png", // Fallback image
                        timestamp: `${time.replace(/[^0-9]/g, '')}-${eventId}`
                     });
                 }
            }
        });

        return { upcomingNews };

    } catch (e) {
        console.error("Forex news fetching error:", e);
        return { upcomingNews: [] };
    }
}


// --- WEBHOOK HANDLER ---

// 🛑 FIX: 'export' keyword removed from function definition.
async function handleNewsWebhook(update, env, CONFIG) { 
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
                `⛔ <b>Access Denied</b> ⛔<br/><br/>` +
                `Hey There <a href="tg://user?id=${userId}">${username}</a>,<br/>` +
                `You Must Join <b>${CHANNEL_LINK_TEXT}</b> Channel To Use This BOT.<br/>` +
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
        case '/help':
            
            // Trading Logic වෙතින් User Count Update කිරීම
            await updateAndEditUserCount(env, userId, CONFIG); 
            
            const replyText =
                `<b>👋 Welcome to the Trading & News Assistant Bot!</b><br/><br/>` +
                `✨ <b>Assistant Features (AI Trading Q&A)</b><br/><br/>` +
                `💁‍♂️ ඔබට <b>Trading, Finance, Crypto</b> සම්බන්ධ ඕනෑම ප්‍රශ්නයක් සිංහලෙන් ඇසිය හැක.<br/><br/>` +
                `උදා: <code>Order Flow Concept එක මොකද්ද?</code><br/><br/>` +
                `*⚠️ Limit:* ඔබට දිනකට <i>Trading Questions 5</i> ක් පමණක් ඇසිය හැක. Owner හට Unlimited.<br/><br/>` +
                `◇───────────────◇<br/><br/>` +
                `📰 <b>News Feature</b><br/><br/>` +
                `🙋‍♂️ Commands වල Usage එක මෙහෙමයි👇<br/><br/>` +
                `◇ <code>/fundamental</code> :- 📰 Last Fundamental News<br/><br/>` +
                `🎯 මේ BOT පැය 24ම Active එකේ තියෙනවා.🔔.. ✍️<br/><br/>` +
                `🚀 <b>Developer :</b> <a href="https://t.me/chamoddeshan">@chamoddeshan</a><br/>` +
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
            // news-logic එකෙන් handle නොවන command හෝ Text Trading logic වෙත යැවීමට null ආපසු යවයි.
            return null;
    }
}


// --- SCHEDULED HANDLER ---
// 🛑 FIX: 'export' keyword removed from function definition.
async function handleNewsScheduled(event, env, ctx, CONFIG) {
    const CHAT_ID = CONFIG.TELEGRAM_CHAT_ID;
    const POST_STATUS_KV = env.POST_STATUS_KV;
    
    // 1. Fetch News Data
    const newsData = await fetchForexNewsData(CONFIG);

    if (!newsData || newsData.upcomingNews.length === 0) {
        console.log("No news data fetched or relevant high/med impact news found.");
        return;
    }

    const { upcomingNews } = newsData;

    // 2. Process News and Generate Post
    for (const newsItem of upcomingNews) {
        // Prevent duplicate processing
        const kvKey = `news_processed:${newsItem.timestamp}`;
        const processed = await POST_STATUS_KV.get(kvKey);

        if (processed) {
            continue;
        }

        // Generate Sinhala post content
        const newsPostContent = await generateNewsPostContent(newsItem, CONFIG);
        
        if (newsPostContent) {
            // 3. Send Telegram Post
            // Note: sendRawTelegramMessage uses HTML parse mode, but the content generation uses HTML tags.
            const result = await sendRawTelegramMessage(CHAT_ID, newsPostContent, CONFIG, newsItem.imageUrl);
            
            if (result.ok) {
                // 4. Update KV store to prevent reposting and update last post data
                await POST_STATUS_KV.put(kvKey, "POSTED", { expirationTtl: 86400 }); // Expires in 24 hours
                await POST_STATUS_KV.put(LAST_FULL_MESSAGE_KEY, newsPostContent, { expirationTtl: 86400 }); 
                await POST_STATUS_KV.put(LAST_IMAGE_URL_KEY, newsItem.imageUrl, { expirationTtl: 86400 }); 
            } else {
                console.error("Failed to send scheduled news post:", result.error);
            }
        }
    }
}


// --- FINAL EXPORTS (Named Exports) ---
export {
    handleNewsWebhook,
    handleNewsScheduled
};
