// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q",
    
    // 🛑 ඔබේ Channel/Group Chat ID එක (Lifetime Post එක යැවිය යුතු ස්ථානය)
    TELEGRAM_CHAT_ID: "-1002947156921", // ඔබ ලබා දුන් Channel ID එක
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ Private ID එක - String ලෙස තබන්න)
    OWNER_CHAT_ID: "1901997764", // ඔබේ Owner ID එක මෙය නොවේ නම් වෙනස් කරන්න
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA",
    
    // Telegram API Endpoint Base URL එක (Token එකෙන් සෑදී ඇත)
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q`,
    
    // දිනකට උපරිම අවසර ලත් භාවිතය
    DAILY_LIMIT: 5
};

// --- 1. CORE AI FUNCTIONS ---

async function generateScheduledContent(env) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // 1. KV එකෙන් කලින් Post කළ Topics ලැයිස්තුව ලබා ගැනීම.
    const coveredTopicsString = await env.POST_STATUS_KV.get('COVERED_TOPICS') || "[]";
    let coveredTopics = JSON.parse(coveredTopicsString);
    
    // 2. දැනටමත් Post කර ඇති topics.
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
            // 3. Topic එක අලුතින් Post කළ Topics ලැයිස්තුවට එකතු කිරීම
            const newTopicMatch = content.match(/\*([^*]+)\*/); // පළමු බෝල්ඩ් කර ඇති මාතෘකාව ලබා ගනී
            const newTopic = newTopicMatch ? newTopicMatch[1].trim() : "Untitled Post";
            
            coveredTopics.push(newTopic);
            
            // KV එක යාවත්කාලීන කරන්න (Topic ලැයිස්තුව)
            await env.POST_STATUS_KV.put('COVERED_TOPICS', JSON.stringify(coveredTopics));
            
            // අද Post කළ මාතෘකාව ද ගබඩා කරන්න
            await env.POST_STATUS_KV.put('LAST_TRADING_TOPIC', newTopic);
            
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


// --- 2. CORE TELEGRAM FUNCTIONS ---

async function sendTypingAction(chatId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/sendChatAction`;
    try {
        await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                action: 'typing' 
            }),
        });
        return true;
    } catch (e) {
        return false;
    }
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

// Buttons ඉවත් නොකර, Text පමණක් Edit කරන function එක
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
                reply_markup: {
                    inline_keyboard: keyboard
                }
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

// Buttons පමණක් ඉවත් කිරීම සඳහා නව function එක
async function removeInlineKeyboard(chatId, messageId) {
    const TELEGRAM_API_ENDPOINT = `${CONFIG.TELEGRAM_API_BASE}/editMessageReplyMarkup`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: {} // හිස් reply_markup යවයි
            }),
        });
        return response.ok;
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


// --- 3. HELPER FUNCTIONS ---

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

async function checkAndIncrementUsage(env, chatId) {
    if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        return { allowed: true, count: 'Unlimited' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const KV_KEY = `usage:${today}:${chatId}`;

    const currentUsageStr = await env.POST_STATUS_KV.get(KV_KEY);
    let currentUsage = parseInt(currentUsageStr) || 0;

    if (currentUsage >= CONFIG.DAILY_LIMIT) {
        return { allowed: false, count: currentUsage, kvKey: KV_KEY }; 
    }

    currentUsage += 1;
    
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0); 
    const expirationTtl = Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 1000)); 
    
    await env.POST_STATUS_KV.put(KV_KEY, currentUsage.toString(), { expirationTtl: expirationTtl });

    return { allowed: true, count: currentUsage, kvKey: KV_KEY };
}

async function updateAndEditUserCount(env, userId) {
    const USER_SET_KEY = 'BOT_USER_SET'; 
    const COUNT_POST_ID_KEY = 'COUNT_POST_ID'; 
    const DAILY_COUNT_KEY = 'DAILY_USER_COUNT'; 

    const userIdString = userId.toString();

    const userSet = await env.POST_STATUS_KV.get(USER_SET_KEY, 'json') || [];
    const isNewUser = !userSet.includes(userIdString);
    
    if (isNewUser) {
        userSet.push(userIdString);
        await env.POST_STATUS_KV.put(USER_SET_KEY, JSON.stringify(userSet));
        const totalCount = userSet.length;
        
        const dailyCountStr = await env.POST_STATUS_KV.get(DAILY_COUNT_KEY) || '0';
        let dailyCount = parseInt(dailyCountStr);
        dailyCount += 1;
        
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0); 
        const expirationTtl = Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 1000)); 
        await env.POST_STATUS_KV.put(DAILY_COUNT_KEY, dailyCount.toString(), { expirationTtl: expirationTtl });
        
        const postDetailsStr = await env.POST_STATUS_KV.get(COUNT_POST_ID_KEY);
        
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
            
*🌐 Join the Community:* [Mrchamo Official Channel](https...`; // Truncated URL in the original code snippet
            await editPhotoCaption(chatId, parseInt(messageId), newCaption);
            return { success: true, newCount: totalCount };
        }
    }
    return { success: isNewUser, newCount: userSet.length };
}


// --- 4. COMMANDS FOR OWNER ---

async function sendInitialCountPost(env, ownerChatId) {
    const PHOTO_URL = "https://envs.sh/7R4.jpg"; // Placeholder URL
    const COUNT_POST_ID_KEY = 'COUNT_POST_ID'; 
    
    // Channel ID එක ලබා ගැනීම (CONFIG එකෙන්)
    const targetChatId = CONFIG.TELEGRAM_CHAT_ID;

    const existingPost = await env.POST_STATUS_KV.get(COUNT_POST_ID_KEY);
    if (existingPost) {
        return { success: false, message: `Permanent Count Post එක දැනටමත් පවතී. Post ID: ${existingPost}` };
    }

    const userSet = await env.POST_STATUS_KV.get('BOT_USER_SET', 'json') || [];
    const dailyCountStr = await env.POST_STATUS_KV.get('DAILY_USER_COUNT') || '0';
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

    // FIX: Post එක Channel ID එකට යැවීම
    const result = await sendPhotoWithCaption(targetChatId, PHOTO_URL, initialCaption, keyboard);

    if (result.success) {
        const postIdentifier = `${targetChatId}:${result.messageId}`;
        await env.POST_STATUS_KV.put(COUNT_POST_ID_KEY, postIdentifier);
        return { success: true, message: `Permanent Count Post එක සාර්ථකව \`${targetChatId}\` Chat ID එකට යවා ගබඩා කරන ලදී. Post ID: ${postIdentifier}` };
    } else {
        return { success: false, message: `Post යැවීම අසාර්ථක විය: ${JSON.stringify(result.error)}` };
    }
}

async function handleUnlimitCommand(env, userId, targetUserId) {
    const KV_KEY_PREFIX = `usage:`;
    const today = new Date().toISOString().slice(0, 10);
    const KV_KEY_TODAY = `${KV_KEY_PREFIX}${today}:${targetUserId}`;
    
    // 1. අද දින Limit එක ඉවත් කිරීම
    const currentUsageStr = await env.POST_STATUS_KV.get(KV_KEY_TODAY);
    
    if (currentUsageStr === null) {
        return `✅ User ID \`${targetUserId}\` අද දින සීමාවට පැමිණ නැත.`;
    }

    // 2. Limit එක 0 කිරීමට හෝ key එක ඉවත් කිරීමට. (0 යනු අද දින අලුත් Limit එක)
    await env.POST_STATUS_KV.put(KV_KEY_TODAY, '0', { expirationTtl: 86400 }); 
    
    return `✅ User ID \`${targetUserId}\` ගේ අද දින (Usage: ${currentUsageStr}) Limit එක සාර්ථකව ඉවත් කරන ලදී.`;
}

// --- 5. CALLBACK QUERY HANDLER ---

async function handleCallbackQuery(query, env) {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const fromId = query.from.id;
    const isOwner = fromId.toString() === CONFIG.OWNER_CHAT_ID.toString();

    if (data === 'SHOW_PRIVATE_INFO') {
        // Private Info Button (Channel Post එකේ ඇති)
        if (isOwner) {
            // [Owner Only]: Private Info message to owner
            await answerCallbackQuery(query.id, "Private Info sent to your private chat.", true);
            const privateInfo = `*Private Bot Details*:\n- Bot Token: \`${CONFIG.TELEGRAM_BOT_TOKEN}\`\n- Gemini Key: \`${CONFIG.GEMINI_API_KEY}\`\n- Channel ID: \`${CONFIG.TELEGRAM_CHAT_ID}\``;
            await sendTelegramReplyToOwner(privateInfo);
        } else {
            // [Non-Owner]: Deny access and give channel link
            const channelKeyboard = [[{ text: "Join Channel", url: "https://t.me/Mrchamo_Lk" }]];
            await answerCallbackQuery(query.id, "This is for the bot owner only. Please join our channel.", true);
            // Optional: send a message to the user's private chat
        }
        return true;
    }
    
    // Logic for APPROVE/REJECT (if implemented) goes here...
    
    return true;
}


// --- 6. WORKER ENTRY POINT (Handles Webhook) ---

async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        // 1. Callback Query Handling
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env);
        }

        // 2. Message Handling
        if (update && update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text.trim();
            const userId = message.from.id;
            const userFirstName = message.from.first_name || "N/A";
            const userName = message.from.username ? `@${message.from.username}` : "N/A";

            // --- Owner Commands ---
            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
                
                if (text.startsWith('/send_count_post')) {
                    const result = await sendInitialCountPost(env, chatId);
                    await sendTelegramReply(chatId, `\`${result.message}\``, messageId);
                    return new Response('Owner Command Processed', { status: 200 });
                }

                if (text.startsWith('/unlimit')) {
                    const parts = text.split(' ');
                    const targetUserId = parts.length > 1 ? parts[1].trim() : null;
                    if (targetUserId) {
                        const resultMessage = await handleUnlimitCommand(env, userId, targetUserId);
                        await sendTelegramReply(chatId, resultMessage, messageId);
                    } else {
                        await sendTelegramReply(chatId, `⚠️ Usage: /unlimit [UserID]`, messageId);
                    }
                    return new Response('Owner Command Processed', { status: 200 });
                }
            }

            // --- User Registration and Daily Count Update (for all messages) ---
            await updateAndEditUserCount(env, userId); 

            // --- AI Question Logic ---

            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...*", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                const usageResult = await checkAndIncrementUsage(env, chatId);
                
                if (!usageResult.allowed) {
                    const limitMessage = `🛑 *ඔබේ දෛනික ප්‍රශ්න ඇසීමේ සීමාව (${CONFIG.DAILY_LIMIT}) අවසන් වී ඇත.* කරුණාකර හෙට නැවත උත්සාහ කරන්න. (Usage: ${usageResult.count}/${CONFIG.DAILY_LIMIT})`;
                    await editTelegramMessage(chatId, validationMessageId, limitMessage);
                    return new Response('Rate Limited', { status: 200 });
                }
                
                // --- Start AI Response Process ---
                await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...*");
                await sendTypingAction(chatId); 
                const replyText = await generateReplyContent(text);

                const countUpdate = usageResult.allowed && usageResult.count !== 'Unlimited' 
                    ? `\n\n_(${usageResult.count}/${CONFIG.DAILY_LIMIT} Used Today)_`
                    : '';

                await editTelegramMessage(chatId, validationMessageId, replyText + countUpdate);
                
            } else {
                await editTelegramMessage(chatId, validationMessageId, `⚠️ *Sorry! Mama **Trading** questions walata witharak answer karanawa.* \n\nඔබේ ප්‍රශ්නය **Trading** හෝ **Finance** සම්බන්ධ නම්, කරුණාකර වඩාත් පැහැදිලිව අසන්න.`);
            }
            
            return new Response('Message Processed', { status: 200 });
        }
        
    } catch (e) {
        console.error('[CRITICAL FETCH FAILURE - 1001 ERROR CAUGHT]:', e.stack);
        // Owner ට Notification එකක් යැවීම
        const errorText = `❌ UNHANDLED ERROR IN WEBHOOK:\nUser: ${userName} (${userId})\nError: ${e.message}`;
        await sendTelegramReplyToOwner(errorText);
        return new Response(`Worker threw an unhandled exception: ${e.message}.`, { status: 500 });
    }
    
    return new Response('OK', { status: 200 });
}


// --- 7. WORKER EXPORT (Cloudflare Main Handler) ---

export default {
    /**
     * Scheduled handler runs daily for the educational post.
     */
    async scheduled(event, env, ctx) {
        // [Safety Check] Ensure post hasn't been posted today (in case of re-runs)
        const today = new Date().toISOString().slice(0, 10);
        const postStatus = await env.POST_STATUS_KV.get(`trading_post_posted:${today}`);
        
        if (postStatus !== 'SUCCESS') {
            const postContent = await generateScheduledContent(env);
            
            if (postContent) {
                const success = await sendTelegramMessage(postContent); 
                
                if (success) {
                    ctx.waitUntil(env.POST_STATUS_KV.put(`trading_post_posted:${today}`, "SUCCESS", { expirationTtl: 86400 }));
                } else {
                    ctx.waitUntil(env.POST_STATUS_KV.put(`trading_post_posted:${today}`, "FAILED"));
                    // Owner ට Fail වීමට හේතුව දැනුම් දීම (විකල්ප)
                    await sendTelegramReplyToOwner(`❌ Scheduled Daily Post එක අද දින (${today}) යැවීම අසාර්ථක විය. (Check logs)`);
                }
            } else {
                ctx.waitUntil(env.POST_STATUS_KV.put(`trading_post_posted:${today}`, "FAILED"));
                // Owner ට Fail වීමට හේතුව දැනුම් දීම (විකල්ප)
                await sendTelegramReplyToOwner(`❌ Scheduled Daily Post එක අද දින (${today}) යැවීම අසාර්ථක විය. (Check logs)`);
            }
        }
    },

    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
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
        
        return new Response('Worker running. Use the scheduled trigger, /trigger-manual, or set up the Telegram webhook.', { status: 200 });
    }
};
