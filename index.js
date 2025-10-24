// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Manual Post සඳහා)
    TELEGRAM_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // Telegram API Endpoint Base URL එක (Token එක config එකෙන් auto ගන්නවා)
    TELEGRAM_API_BASE: `https://api.telegram.org/bot5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q` 
};

// --- 1. CORE AI FUNCTIONS ---

// A. Gemini API call for Daily Scheduled Posts (මාතෘකා පුනරාවර්තනය වළක්වයි)
async function generateScheduledContent(coveredTopics) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const excludedTopicsString = coveredTopics.join(', ');
    
    const systemPrompt = `
        You are an expert financial and trading educator. Your primary goal is to provide daily, **step-by-step** foundational trading education for absolute beginners.
        The topics covered so far and MUST BE AVOIDED are: [${excludedTopicsString}].
        
        Your task is to:
        1. **Systematic Topic Selection:** Use the 'google_search' tool to select a fundamental trading topic from the beginner's curriculum. Topics MUST include core elements like: **Candlesticks, Support and Resistance, Money Management, Chart Patterns, Fibonacci Tools, and basic Indicators (RSI, Moving Averages)**. Ensure the selected topic is *different* from ALL previous topics to maintain a progressive learning path.
        2. **Content Generation:** Generate a high-quality, 5-paragraph educational post in **SINHALA-ENGLISH MIXED LANGUAGE (SINGLISH)** based on that concept. The post must explain the concept simply, provide a practical example, and encourage the beginner.
        3. The post must be well-formatted using Telegram's **Markdown**. The first line must be a clear title indicating the topic.
        
        Your final output must contain ONLY the content of the post.
    `;
    
    const userQuery = "Generate today's new, progressive, and engaging Singlish educational trading post for beginners.";

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

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini Scheduled API HTTP Error: Status ${response.status} - ${errorBody}`);
            return null;
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    } catch (e) {
        console.error("Gemini Scheduled Generation Exception:", e);
        return null;
    }
}

// B. Gemini API call for Live Chatbot Replies (Full Post Format)
async function generateReplyContent(userQuestion) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const systemPrompt = `
        You are a detailed, expert financial and trading assistant. A user has asked you a specific question about a trading concept (e.g., Order Flow, Liquidity).
        
        Your task is to:
        1. Use the 'google_search' tool to get the most accurate and educational information for the user's question.
        2. Generate a **DETAILED, EDUCATIONAL RESPONSE**. The response must be **5 PARAGRAPHS** long to cover the concept fully (Definition, Importance, How to Use, Examples, and Summary).
        3. Use **SINHALA-ENGLISH MIXED LANGUAGE (SINGLISH)** throughout the response.
        4. The response must be well-formatted using Telegram's **Markdown** (bolding key terms, using lists, and emojis).
        5. The first line of the response MUST be a clear title based on the question (e.g., "*Order Flow Concept eka Mokadda?*").

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

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini Reply API HTTP Error: Status ${response.status} - ${errorBody}`);
            return "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න. (API Error)";
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. (Content Missing)";

    } catch (e) {
        console.error("Gemini Reply Generation Exception:", e);
        return "මට එම ප්‍රශ්නයට පිළිතුරු දීමට නොහැකි විය. (Exception)";
    }
}

// --- 2. CORE TELEGRAM FUNCTIONS ---

// C. Telegram API call (Send Text Message - Manual Post)
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
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram Send Error: Status ${response.status} - ${errorText}`);
        }

        return response.ok;
    } catch (e) {
        console.error("Telegram Send Exception:", e);
        return false;
    }
}

// D. Telegram API call (User Reply Send කිරීමට)
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
                reply_to_message_id: messageId // Reply කිරීමට යොදා ගනී
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram Reply Error: Status ${response.status} - ${errorText}`);
        }

        return response.ok;
    } catch (e) {
        console.error("Telegram Reply Exception:", e);
        return false;
    }
}

// --- 3. HELPER FUNCTIONS ---

function extractTopicFromPost(postText) {
    if (!postText) return 'Unknown Topic';
    const titleLine = postText.split('\n')[0].trim();
    // Markdown symbols ඉවත් කර, මුල් අකුරු 50 ගනී
    return titleLine.substring(0, 50).replace(/[*_]/g, '').trim(); 
}

// --- 4. MAIN WORKFLOW (FOR SCHEDULED POSTS) ---

async function runDailyPostWorkflow(env) {
    if (!env.POST_STATUS_KV) return { success: false, message: 'KV Binding is missing.' };

    const todayKey = new Date().toISOString().slice(0, 10); 
    const DAILY_POST_KV_KEY = `trading_post_posted:${todayKey}`; 
    const TOPICS_COVERED_KV_KEY = `TRADING_TOPICS_COVERED`; 

    const status = await env.POST_STATUS_KV.get(DAILY_POST_KV_KEY);
    if (status === 'POSTED') return { success: true, message: 'Trading Post already sent.' };
    
    // ආවරණය කළ මාතෘකා ලැයිස්තුව ලබා ගැනීම
    // Default topics: පෙර ඇති වූ දෝෂ නිවැරදි කිරීම සඳහා යොදා ඇත.
    const coveredTopicsJson = await env.POST_STATUS_KV.get(TOPICS_COVERED_KV_KEY) || '["Support and Resistance", "Candlesticks", "Money Management"]'; 
    let coveredTopics;
    try {
        coveredTopics = JSON.parse(coveredTopicsJson);
    } catch (e) {
        coveredTopics = ["Support and Resistance", "Candlesticks", "Money Management"];
    }

    // Generate Sinhala Content (Scheduled)
    const postText = await generateScheduledContent(coveredTopics); 
    if (!postText) return { success: false, message: 'Failed to generate content via Gemini.' }; 
    
    // Send Post to Telegram (Scheduled)
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // Set Daily Flag (පැය 24 කට)
        await env.POST_STATUS_KV.put(DAILY_POST_KV_KEY, 'POSTED', { expirationTtl: 86400 }); 
        
        // නව මාතෘකාව Array එකට එකතු කර සදහටම Save කිරීම (No TTL)
        const newTopic = extractTopicFromPost(postText);
        // අලුත් මාතෘකාව කලින් ආවරණය කර ඇත්දැයි පරීක්ෂා කර එකතු කරයි (Duplicate වළක්වයි)
        if (!coveredTopics.includes(newTopic)) {
            coveredTopics.push(newTopic);
        }
        await env.POST_STATUS_KV.put(TOPICS_COVERED_KV_KEY, JSON.stringify(coveredTopics)); 
        
        return { success: true, message: 'Daily trading education post completed successfully.' };
    } else {
        return { success: false, message: 'Telegram post failed.' };
    }
}

// --- 5. WORKER ENTRY POINT (Handles Webhook) ---

async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        if (update && update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text.trim();
            
            // Command (e.g., /start)
            if (text.startsWith('/')) {
                const command = text.split(' ')[0].toLowerCase();
                if (command === '/start' || command === '/help') {
                    const welcomeMessage = "👋 *Welcome to the Trading Assistant Bot!* \n\nI am here to answer your trading and crypto questions in a detailed Sinhala-English mix format (like a full post!). \n\nTry asking me: 'Order Flow කියන්නේ මොකද්ද?'";
                    await sendTelegramReply(chatId, welcomeMessage, messageId);
                }
                return new Response('Command processed', { status: 200 });
            }

            // Trading Question (Text Message)
            if (text.length > 5) {
                // Gemini හරහා Full Post එකක් generate කිරීම
                const replyText = await generateReplyContent(text);
                await sendTelegramReply(chatId, replyText, messageId);
            }
        }
    } catch (e) {
        console.error("Error processing webhook:", e);
    }
    
    // Telegram API එකට අවශ්‍යය පරිදි 200 OK එකක් ආපසු එවයි
    return new Response('OK', { status: 200 });
}

export default {
    // Cron Trigger (ස්වයංක්‍රීය ක්‍රියාත්මක වීම)
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runDailyPostWorkflow(env));
    },

    // Manual Trigger / Webhook Handler
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // 1. Manual Trigger for Daily Post
        if (url.pathname === '/trigger-manual') {
            const result = await runDailyPostWorkflow(env);
            return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } }); 
        }

        // 2. Telegram Webhook Handler (POST Request)
        if (request.method === 'POST') {
            return handleWebhook(request, env);
        }
        
        // Default response
        return new Response('Worker running. Use the scheduled trigger, /trigger-manual, or set up the Telegram webhook.', { status: 200 });
    }
};
