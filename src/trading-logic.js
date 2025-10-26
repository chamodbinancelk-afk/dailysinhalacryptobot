// =================================================================
// === src/trading-logic.js (AI Q&A, Daily Post, and User/Owner Logic) ===
// =================================================================

// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ මෙම Configuration එක AI Q&A සහ Trading Post සඳහායි ⚠️

const CONFIG = {
    // 🛑 ඔබේ Trading Bot Token එක (කලින් තිබූ අගය)
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Trading Post Channel ID එක (කලින් තිබූ අගය)
    TELEGRAM_CHAT_ID: "-1002947156921",
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL එක
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q`,
    
    // දිනකට උපරිම අවසර ලත් භාවිතය
    DAILY_LIMIT: 5
};

// --- 1. KV KEYS ---
const POST_STATUS_KEY_PREFIX = 'trading_post_posted:';
const LIFETIME_POST_ID_KEY = 'lifetime_post_id';
const USER_COUNT_KEY = 'user_count';

// --- 2. CORE TELEGRAM FUNCTIONS (Trading Logic සඳහා) ---

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

async function sendTelegramReply(chatId, text, messageId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                text: text,
                parse_mode: 'Markdown',
                reply_to_message_id: messageId 
            }),
        });
        const data = await response.json();
        return data.ok ? data.result.message_id : null; 
    } catch (e) {
        return null;
    }
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
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
                reply_markup: replyMarkup
            }),
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function getChatMemberCount() {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/getChatMemberCount`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CONFIG.TELEGRAM_CHAT_ID, 
            }),
        });
        const data = await response.json();
        return data.ok ? data.result : null;
    } catch (e) {
        return null;
    }
}


// --- 3. RATE LIMITING & COUNTING LOGIC ---

async function checkAndIncrementUsage(env, userId, isOwner) {
    const today = new Date().toISOString().slice(0, 10);
    const USAGE_KEY = `usage:${userId}:${today}`;
    
    let currentUsage = parseInt(await env.POST_STATUS_KV.get(USAGE_KEY) || '0');

    if (isOwner) {
        // Owner ට සෑම විටම අවසර දෙයි
        return { allowed: true, remaining: 'Unlimited' };
    }
    
    if (currentUsage < CONFIG.DAILY_LIMIT) {
        // Usage වැඩි කර, TTL (දවස අවසානය) සමඟ ගබඩා කරයි
        const newUsage = currentUsage + 1;
        
        // TTL එක හෙට දවස ආරම්භ වන වේලාවට සකසයි (UTC)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0); 
        const now = new Date();
        const expirationSeconds = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

        await env.POST_STATUS_KV.put(USAGE_KEY, String(newUsage), { expirationTtl: expirationSeconds });

        return { allowed: true, remaining: CONFIG.DAILY_LIMIT - newUsage };
    } else {
        return { allowed: false, remaining: 0 };
    }
}

async function getOrUpdateUserCount(env, userId) {
    const KEY = `user:${userId}`;
    const userExists = await env.POST_STATUS_KV.get(KEY);

    if (!userExists) {
        // නව User කෙනෙක් නම්, KV එකට දමා, ගණන වැඩි කරයි
        await env.POST_STATUS_KV.put(KEY, '1'); 
        
        let currentCount = parseInt(await env.POST_STATUS_KV.get(USER_COUNT_KEY) || '0');
        currentCount += 1;
        await env.POST_STATUS_KV.put(USER_COUNT_KEY, String(currentCount));
        
        return currentCount;
    }
    
    let currentCount = parseInt(await env.POST_STATUS_KV.get(USER_COUNT_KEY) || '0');
    return currentCount;
}

async function updateAndEditUserCount(env, userId) {
    const newUserCount = await getOrUpdateUserCount(env, userId);
    const postId = await env.POST_STATUS_KV.get(LIFETIME_POST_ID_KEY);
    
    if (postId) {
        const memberCount = await getChatMemberCount();
        const memberCountText = memberCount ? `(${memberCount} Channel Members)` : '';
        
        const lifetimeMessage = 
            `📊 *Lifetime User Statistics* 📊\n\n` +
            `👤 *Total Unique Users:* \`${newUserCount}\`\n` +
            `👥 *Channel Subscribers:* \`${memberCountText}\`\n\n` +
            `_Updated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}_`;
        
        await editTelegramMessage(CONFIG.TELEGRAM_CHAT_ID, postId, lifetimeMessage);
    }
    return newUserCount;
}


// --- 4. AI LOGIC (Q&A and Scheduled Post) ---

async function generateAIResponse(prompt, isOwner) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // Owner ට වැඩි විස්තර සහිත, පොදු User ට කෙටි පිළිතුරු
    const systemPrompt = isOwner 
        ? "You are an expert Forex and Financial Market analyst. Provide a detailed, accurate, and easy-to-understand explanation to the user's question. Format the output professionally using Markdown."
        : "You are a concise Forex Trading Assistant. Answer the user's question accurately but briefly, focusing only on Trading, Finance, or Crypto topics. If the question is non-financial, politely decline. Format the output using Telegram Markdown.";
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                tools: [{ "google_search": {} }], 
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.5 } 
            }),
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Sorry, I could not generate a response right now. Please try again later.";
    } catch (e) {
        return "Sorry, there was an internal error with the AI service.";
    }
}

async function generateScheduledContent(env) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const userCount = parseInt(await env.POST_STATUS_KV.get(USER_COUNT_KEY) || '0');
    
    const systemPrompt = `
        You are an engaging Forex and Crypto trading educator. Your task is to generate a short, insightful daily post (max 3 paragraphs) for a Telegram channel. The post should focus on one key trading concept, market outlook, or a quick tip. 
        
        Use the following user count: ${userCount} to personalize the introduction, making the post engaging and encouraging community interaction.
        
        Your output must be in clear SINHALA and formatted using Telegram Markdown.
        
        Structure:
        1. Emoji-rich Sinhal Title.
        2. Personalised greeting referencing the user count.
        3. The core trading lesson/tip.
        4. A concluding encouragement or question to promote comments.
    `;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: "Generate today's trading educational post." }] }],
                tools: [{ "google_search": {} }], 
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: 0.7 } 
            }),
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (e) {
        return null;
    }
}


// --- 5. SCHEDULED HANDLER (TRADING LOGIC) ---

async function handleTradingScheduled(event, env) {
    // 1. Update Lifetime User Count Post
    const newCount = await updateAndEditUserCount(env, CONFIG.OWNER_CHAT_ID); 

    // 2. Daily Trading Post (Educational Content)
    const today = new Date().toISOString().slice(0, 10);
    const POST_KEY = `${POST_STATUS_KEY_PREFIX}${today}`;
    const alreadyPosted = await env.POST_STATUS_KV.get(POST_KEY);
    
    if (alreadyPosted === "POSTED") {
        console.log("Trading Post already sent today. Skipping scheduled task.");
        return;
    }
    
    const postContent = await generateScheduledContent(env); 
    
    if (postContent) {
        const success = await sendTelegramMessage(postContent); 
        
        if (success) {
            await env.POST_STATUS_KV.put(POST_KEY, "POSTED");
        } else {
            await env.POST_STATUS_KV.put(POST_KEY, "FAILED");
            // Owner ට Fail වීමට හේතුව දැනුම් දීම (විකල්ප)
            // await sendTelegramReplyToOwner(`❌ Scheduled Daily Post එක අද දින (${today}) යැවීම අසාර්ථක විය. (Check logs)`);
        }
    }
}


// --- 6. WEBHOOK HANDLER (TRADING LOGIC - Q&A, Commands) ---

async function handleTradingWebhook(update, env) {
    if (update && update.message) {
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text ? message.text.trim() : '';
        const userId = message.from.id; 
        const isOwner = String(userId) === CONFIG.OWNER_CHAT_ID;

        // --- Q&A Logic (Only for text messages or non-handled commands) ---
        if (text && !text.startsWith('/')) {
            // 1. Usage Check & Increment
            const usage = await checkAndIncrementUsage(env, userId, isOwner);
            
            if (!usage.allowed) {
                const limitMessage = `⚠️ *Usage Limit Reached!* \n\nඔබට අද දිනට අවසර දී ඇති ප්‍රශ්න (5) ප්‍රමාණය අවසන් වී ඇත. කරුණාකර හෙට නැවත උත්සාහ කරන්න.`;
                await sendTelegramReply(chatId, limitMessage, messageId);
                return new Response('Usage limit reached', { status: 200 });
            }
            
            // 2. Typing action and initial reply
            const replyMessageId = await sendTelegramReply(chatId, "⏳ *ඔබගේ ප්‍රශ්නය විශ්ලේෂණය කරමින්...*", messageId);
            
            // 3. Generate AI Response
            const aiResponse = await generateAIResponse(text, isOwner);
            
            // 4. Append remaining count and format
            const remainingText = isOwner ? '*(Owner: Unlimited)*' : `*(Remaining: ${usage.remaining})*`;
            const finalResponse = `${aiResponse}\n\n---\n${remainingText}`;
            
            // 5. Edit the initial reply with the final response
            if (replyMessageId) {
                await editTelegramMessage(chatId, replyMessageId, finalResponse);
            }
            
            // 6. Update User Count (for Q&A interactions)
            await updateAndEditUserCount(env, userId);
            
            return new Response('Handled Q&A', { status: 200 });
        }
        
        // --- REGULAR COMMANDS (/start, /help) ---
        if (text.startsWith('/')) {
            const command = text.split(' ')[0].toLowerCase();
            
            // Note: /start is mostly handled by news-logic for counting, but this provides the Welcome Message if needed
            if (command === '/start' || command === '/help') {
                
                // Welcome Message (Only sends if news-logic did not handle and stop the flow)
                const welcomeMessage = "👋 *Welcome to the Trading Assistant Bot!* \n\nMata answer karanna puluwan **Trading, Finance, saha Crypto** related questions walata witharai. \n\n*Limit:* Dawasakata *Trading Questions 5* k withirai. (Owner ta unlimited). \n\nTry karanna: 'Order Flow කියන්නේ මොකද්ද?' wage prashnayak ahanna.";
                await sendTelegramReply(chatId, welcomeMessage, messageId);
                
                return new Response('Handled Trading Commands', { status: 200 }); 
            }

            // --- OWNER COMMANDS (Optional) ---
            if (isOwner && command === '/postlifetime') {
                const currentCount = await updateAndEditUserCount(env, userId);
                const memberCount = await getChatMemberCount();
                const memberCountText = memberCount ? `(${memberCount} Channel Members)` : '';
                
                const lifetimeMessage = 
                    `📊 *Lifetime User Statistics* 📊\n\n` +
                    `👤 *Total Unique Users:* \`${currentCount}\`\n` +
                    `👥 *Channel Subscribers:* \`${memberCountText}\`\n\n` +
                    `_Updated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}_`;
                
                const postedMessage = await sendTelegramReply(CONFIG.TELEGRAM_CHAT_ID, lifetimeMessage, null);
                
                if (postedMessage) {
                    await env.POST_STATUS_KV.put(LIFETIME_POST_ID_KEY, String(postedMessage));
                    await sendTelegramReply(chatId, `✅ Lifetime Post Updated and ID saved: \`${postedMessage}\``, messageId);
                } else {
                    await sendTelegramReply(chatId, `❌ Lifetime Post failed to send.`, messageId);
                }
                return new Response('Handled Owner Command /postlifetime', { status: 200 });
            }
        }

        // --- Other message types (e.g., Photos, Stickers) are ignored ---
    }
    return new Response('Message not processed by trading logic', { status: 200 });
}


// --- 7. FINAL EXPORTS (Named Exports for index.js) ---
export {
    updateAndEditUserCount, // News logic for user count update
    handleTradingWebhook,
    handleTradingScheduled
};
