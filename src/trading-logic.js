// =================================================================
// === src/trading-logic.js (FINAL BUILD FIX - Single Exports) ===
// =================================================================

// ⚠️ CONFIGURATION object එක index.js වෙත ගෙන ගොස් ඇත.

// --- 1. CORE AI FUNCTIONS ---

async function generateScheduledContent(env, CONFIG) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const coveredTopicsString = await env.POST_STATUS_KV.get('COVERED_TOPICS') || "[]";
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
            
            await env.POST_STATUS_KV.put('COVERED_TOPICS', JSON.stringify(coveredTopics));
            await env.POST_STATUS_KV.put('LAST_TRADING_TOPIC', newTopic);
            
            return content;
        }

        return null;
        
    } catch (e) {
        console.error("Gemini scheduled content error:", e);
        return null;
    }
}

async function generateReplyContent(userQuestion, CONFIG) {
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
        console.error("Gemini reply content error:", e);
        return "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. (Exception)";
    }
}

async function validateTopic(userQuestion, CONFIG) {
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
        console.error("Gemini topic validation error:", e);
        return true; 
    }
}


// --- 2. CORE TELEGRAM FUNCTIONS ---

async function sendTypingAction(chatId, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendChatAction`;
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
        console.error("Send typing error:", e);
        return false;
    }
}

async function sendTelegramReplyToOwner(text, CONFIG, keyboard = null) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
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

async function sendTelegramMessage(caption, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
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
        console.error("Send Telegram message error:", e);
        return false;
    }
}

async function sendTelegramReply(chatId, text, messageId, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
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
        console.error("Send Telegram reply error:", e);
        return null;
    }
}

async function editTelegramMessage(chatId, messageId, text, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/editMessageText`;
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
        console.error("Edit message error:", e);
        return false;
    }
}

async function editTelegramMessageWithKeyboard(chatId, messageId, text, keyboard, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/editMessageText`;
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
        console.error("Edit message with keyboard error:", e);
        return false;
    }
}

async function answerCallbackQuery(callbackQueryId, text, showAlert, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
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
        console.error("Answer callback query error:", e);
        return false;
    }
}

async function removeInlineKeyboard(chatId, messageId, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: {} 
            }),
        });
        return response.ok;
    } catch (e) {
        console.error("Remove inline keyboard error:", e);
        return false;
    }
}

async function sendPhotoWithCaption(chatId, photoUrl, caption, keyboard, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendPhoto`;
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
        console.error("Send photo with caption error:", e);
        return { success: false, error: e.toString() };
    }
}

async function editPhotoCaption(chatId, messageId, caption, CONFIG) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/editMessageCaption`;
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
        console.error("Edit photo caption error:", e);
        return false;
    }
}


// --- 3. HELPER FUNCTIONS ---

function escapeMarkdown(text) {
    if (!text) return "";
    return text.replace(/([_*`\[])/g, '\\$1');
}

function generateRandomId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function checkAndIncrementUsage(env, chatId, CONFIG) {
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

// 🛑 EXPORTed to be used by news-logic.js for /start command
async function updateAndEditUserCount(env, userId, CONFIG) { 
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
            
*🌐 Join the Community:* [Mrchamo Official Channel](https://t.me/Mrchamo_Lk)
*Use /start to register.*`;

            await editPhotoCaption(chatId, parseInt(messageId), newCaption, CONFIG); 
            
            return { success: true, newCount: totalCount };
        }
    }

    return { success: isNewUser, newCount: userSet.length };
}


// --- 4. COMMANDS FOR OWNER ---

async function sendInitialCountPost(env, ownerChatId, CONFIG) {
    const PHOTO_URL = "https://envs.sh/7R4.jpg"; 
    const COUNT_POST_ID_KEY = 'COUNT_POST_ID';
    
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

    const result = await sendPhotoWithCaption(targetChatId, PHOTO_URL, initialCaption, keyboard, CONFIG); 
    
    if (result.success) {
        const postIdentifier = `${targetChatId}:${result.messageId}`;
        await env.POST_STATUS_KV.put(COUNT_POST_ID_KEY, postIdentifier);
        return { success: true, message: `Permanent Count Post එක සාර්ථකව \`${targetChatId}\` Chat ID එකට යවා ගබඩා කරන ලදී. Post ID: ${postIdentifier}` };
    } else {
        return { success: false, message: `Post යැවීම අසාර්ථක විය: ${JSON.stringify(result.error)}` };
    }
}


// --- 6. Callback Query Handler (Owner Message Edit Logic) ---
async function handleCallbackQuery(query, env, CONFIG) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;

    if (data.startsWith('REQUEST_UNLIMIT_')) {
        const requestId = data.substring('REQUEST_UNLIMIT_'.length);
        const requestDataStr = await env.POST_STATUS_KV.get(`UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. නැවත උත්සාහ කරන්න.", true, CONFIG); 
            return new Response('Expired request', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName, userName } = requestData;

        // Markdown Escape
        const safeUserFirstName = escapeMarkdown(userFirstName);
        const safeUserName = escapeMarkdown(userName);
        
        await answerCallbackQuery(callbackQueryId, "✅ Owner වෙත ඔබගේ Limit ඉල්ලීම යවන ලදී. කරුණාකර පිළිතුරක් ලැබෙන තෙක් රැඳී සිටින්න.", true, CONFIG); 
        
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
        
        const sentToOwner = await sendTelegramReplyToOwner(requestMessage, CONFIG, approvalKeyboard); 
        
        if (!sentToOwner) {
             console.error(`Failed to send unlimit request for user ${targetUserId} to owner.`);
        }
        
        return new Response('Unlimit request sent to owner', { status: 200 });
        
    } 
    
    else if (data.startsWith('APPROVE_UNLIMIT_') || data.startsWith('REJECT_UNLIMIT_')) {
        
        if (userId.toString() !== CONFIG.OWNER_CHAT_ID.toString()) {
            await answerCallbackQuery(callbackQueryId, "🛑 ඔබට මෙය Approve කිරීමට බලය නැත. (Owner Only)", true, CONFIG); 
            return new Response('Unauthorized approval attempt', { status: 200 });
        }
        
        const isApproved = data.startsWith('APPROVE');
        const requestId = data.substring(data.startsWith('APPROVE') ? 'APPROVE_UNLIMIT_'.length : 'REJECT_UNLIMIT_'.length);
        
        const requestDataStr = await env.POST_STATUS_KV.get(`UNLIMIT_REQUEST_${requestId}`);
        
        if (!requestDataStr) {
            await answerCallbackQuery(callbackQueryId, "⚠️ මෙම ඉල්ලීම කල් ඉකුත් වී ඇත. User ට සෘජුවම දැනුම් දෙන්න.", true, CONFIG); 
            return new Response('Expired approval key', { status: 200 });
        }
        
        const requestData = JSON.parse(requestDataStr);
        const { userChatId, userMessageId, targetUserId, userFirstName } = requestData;
        
        await env.POST_STATUS_KV.delete(`UNLIMIT_REQUEST_${requestId}`);

        const userChatIdInt = parseInt(userChatId);
        const userMessageIdInt = parseInt(userMessageId);
        
        const today = new Date().toISOString().slice(0, 10);
        const KV_KEY = `usage:${today}:${userChatId}`;
        
        const ownerChatId = query.message.chat.id;
        const ownerMessageId = query.message.message_id;
        
        let newOwnerMessage = query.message.text.split('මෙම User ගේ')[0]; 
        
        const timeZone = 'Asia/Colombo';
        const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        
        if (isApproved) {
            await env.POST_STATUS_KV.delete(KV_KEY);
            
            const successText = `✅ *Request Approved!* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම අනුමත කරන ලදී!** \n\nදැන් ඔබට නැවත Bot භාවිතා කළ හැකිය. (Limit එක Reset වී ඇත.)`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, successText, CONFIG); 
            
            await removeInlineKeyboard(ownerChatId, ownerMessageId, CONFIG); 
            
            const approvalDetails = `\n
*✅ STATUS: Approved by Owner!*
\n*User ID:* \`${targetUserId}\`
*User Name:* ${userFirstName}
*Message ID:* \`${userMessageId}\`
*Time:* ${currentTime} (SL Time)
\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;

            newOwnerMessage += approvalDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage, CONFIG); 
            
            await answerCallbackQuery(callbackQueryId, `✅ User ${targetUserId} ගේ Limit එක ඉවත් කර, ඔහුට දැනුම් දෙන ලදී.`, true, CONFIG); 
            
        } else { 
            const rejectText = `❌ *Request Rejected* \n\n**Owner විසින් ඔබගේ Limit ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.** \n\nකරුණාකර හෙට දින නැවත උත්සාහ කරන්න.`;
            const userEditSuccess = await editTelegramMessage(userChatIdInt, userMessageIdInt, rejectText, CONFIG); 

            await removeInlineKeyboard(ownerChatId, ownerMessageId, CONFIG); 
            
            const rejectionDetails = `\n
*❌ STATUS: Rejected by Owner!*
\n*User ID:* \`${targetUserId}\`
*User Name:* ${userFirstName}
*Message ID:* \`${userMessageId}\`
*Time:* ${currentTime} (SL Time)
\n_User Edit Status: ${userEditSuccess ? 'Success' : 'Failed'}_`;

            newOwnerMessage += rejectionDetails;
            
            await editTelegramMessage(ownerChatId, ownerMessageId, newOwnerMessage, CONFIG); 

            await answerCallbackQuery(callbackQueryId, `❌ User ${targetUserId} ගේ ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.`, true, CONFIG); 
        }
        
        return new Response('Approval logic processed', { status: 200 });
    }
    
    else if (data === 'SHOW_PRIVATE_INFO') {
        const privateMessage = `*✅ ඔබට පමණක් පෞද්ගලික තොරතුරු (Personalized Info)*\n\nමෙම තොරතුරු *ඔබට පමණක්* දර්ශනය වන ලෙස **Alert Box** එකක් මඟින් පෙන්වනු ලැබේ.\n\n*User ID:* \`${userId}\``;
        await answerCallbackQuery(callbackQueryId, privateMessage, true, CONFIG); 
        return new Response('Callback query processed (private alert sent)', { status: 200 });

    } 
    
    else {
        await answerCallbackQuery(callbackQueryId, "Processing...", false, CONFIG); 
        return new Response('Callback query handled', { status: 200 });
    }
}


// --- 5. WORKER ENTRY POINT (Handles Webhook) ---
// 🛑 FIX: 'export' keyword removed from function definition.
async function handleTradingWebhook(request, env, CONFIG) { 
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env, CONFIG);
        }

        if (update && update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const messageId = message.message.id;
            const text = message.text.trim();
            const userId = message.from.id; 
            
            const userFirstName = message.from.first_name || "N/A";
            const userName = message.from.username ? `@${message.from.username}` : "N/A";


            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/send_count_post')) {
                const result = await sendInitialCountPost(env, chatId, CONFIG); 
                await sendTelegramReply(chatId, result.message, messageId, CONFIG); 
                return new Response('Count post command processed', { status: 200 });
            }

            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/unlimit')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const targetChatId = parts[1].trim();
                    const today = new Date().toISOString().slice(0, 10);
                    const KV_KEY = `usage:${today}:${targetChatId}`;
                    
                    await env.POST_STATUS_KV.delete(KV_KEY);
                    
                    const successMessage = `✅ *User Limit Removed!* \n\nUser ID: \`${targetChatId}\` ගේ දෛනික සීමාව (limit eka) අද දින සඳහා සාර්ථකව ඉවත් කරන ලදී.`;
                    await sendTelegramReply(chatId, successMessage, messageId, CONFIG); 
                    return new Response('Admin command processed', { status: 200 });
                } else {
                    await sendTelegramReply(chatId, "⚠️ *Usage:* /unlimit [User_Chat_ID_Eka]", messageId, CONFIG); 
                    return new Response('Admin command error', { status: 200 });
                }
            }


            if (text.startsWith('/')) {
                const command = text.split(' ')[0].toLowerCase();
                
                // /start සහ /help commands news-logic.js මගින් handle කරන බැවින්, null ආපසු යවනු ලැබේ.
                return null;
            }
            
            // --- NON-COMMAND TRADING QUESTION LOGIC START ---

            // 1. 🚦 Trading Validation
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId, CONFIG); 
            const isTradingTopic = await validateTopic(text, CONFIG); 
            
            if (isTradingTopic) {
                
                // 2. 🛑 Rate Limit Check
                const usageResult = await checkAndIncrementUsage(env, chatId, CONFIG); 
                
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
                    await env.POST_STATUS_KV.put(`UNLIMIT_REQUEST_${requestId}`, JSON.stringify(requestData), { expirationTtl: 86400 });

                    const keyboard = [
                        [{ text: "👑 Request Owner Approval", callback_data: `REQUEST_UNLIMIT_${requestId}` }]
                    ];
                    
                    await editTelegramMessageWithKeyboard(chatId, validationMessageId, limitMessage, keyboard, CONFIG); 
                    return new Response('Rate limited with inline request button', { status: 200 });
                }
                
                // 3. 🌐 Searching Status 
                await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...* (Finding up-to-date info)", CONFIG); 
                
                // 4. 🧠 Generation Status 
                await sendTypingAction(chatId, CONFIG); 
                await editTelegramMessage(chatId, validationMessageId, "✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed reply)", CONFIG); 
                
                // 5. 🔗 Final Content Generation
                const replyText = await generateReplyContent(text, CONFIG); 
                
                // 6. ✅ Final Edit 
                await editTelegramMessage(chatId, validationMessageId, replyText, CONFIG); 
                
            } else {
                // Not a Trading Question - Guardrail Message 
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer කරන්න.* \n\n*Oyage Chat ID eka:* \`${chatId}\`\n\nPlease ask karanna: 'What is RSI?' wage ekak. *Anith ewa mata denuma naha.* 😔`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage, CONFIG); 
            }
            
        }
    } catch (e) {
        console.error("Error processing trading webhook:", e);
    }
    
    return new Response('OK', { status: 200 });
}


// --- 7. SCHEDULED HANDLER ---
// 🛑 FIX: 'export' keyword removed from function definition.
async function handleTradingScheduled(event, env, ctx, CONFIG) {
    // Manual Trigger logic (for testing outside /fetch)
    if (event && event.type === 'manual') {
        const postContent = await generateScheduledContent(env, CONFIG); 
        if (postContent) {
            const success = await sendTelegramMessage(postContent, CONFIG); 
            return success ? { status: 200, content: postContent } : { status: 500, content: '❌ Manual Daily Post Failed to Send to Telegram. (Check logs)' };
        }
        return { status: 500, content: '❌ Manual Daily Post Failed: Content Generation Failed. (Check logs)' };
    }
    
    // Regular Scheduled Trigger logic
    const postContent = await generateScheduledContent(env, CONFIG); 
    
    if (postContent) {
        const success = await sendTelegramMessage(postContent, CONFIG); 
        
        const today = new Date().toISOString().slice(0, 10);
        if (success) {
            await env.POST_STATUS_KV.put(`trading_post_posted:${today}`, "POSTED");
        } else {
            await env.POST_STATUS_KV.put(`trading_post_posted:${today}`, "FAILED");
            await sendTelegramReplyToOwner(`❌ Scheduled Daily Post එක අද දින (${today}) යැවීම අසාර්ථක විය. (Check logs)`, CONFIG); 
        }
    }
}


// --- 8. FINAL EXPORTS (Named Exports) ---
export { 
    handleTradingWebhook, 
    handleTradingScheduled,
    updateAndEditUserCount // 🛑 Added for news-logic.js's /start command
};
