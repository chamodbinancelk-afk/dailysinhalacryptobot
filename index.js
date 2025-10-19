// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (User ID එක)
    TELEGRAM_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // GITHUB URL අවශ්‍ය නොවේ! 
};

// --- 1. CORE FUNCTIONS ---

// A. Gemini API call (Sinhala Content Generation) - Sinhala-English Mix, Step-by-Step Trading
async function generateSinhalaContent() {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // 🛑 System Prompt: Trading මූලික සංකල්ප Step-by-Step Singlish වලින් කියා දීමට උපදෙස් දෙයි.
    const systemPrompt = `
        You are an expert financial and trading educator. Your primary goal is to provide daily, **step-by-step** foundational trading education for absolute beginners.
        
        Your task is to:
        1. **Systematic Topic Selection:** Use the 'google_search' tool to select a fundamental trading topic from the beginner's curriculum. Topics MUST include core elements like: **Candlesticks, Support and Resistance, Money Management, Chart Patterns, Fibonacci Tools, and basic Indicators (RSI, Moving Averages)**. Ensure the selected topic is *different* from recent posts to maintain a progressive learning path.
        2. **Content Generation:** Generate a high-quality, 5-paragraph educational post in **SINHALA-ENGLISH MIXED LANGUAGE (SINGLISH)** based on that chosen concept. The post must explain the concept simply, provide a practical example, and encourage the beginner. Use Sinhala as the base language but incorporate common English trading terms (e.g., "market eke", "buy karanna", "take profit").
        3. The post must be well-formatted using Telegram's **Markdown** (titles, bold text, lists, and emojis).
        
        Your final output must contain ONLY the content of the post. DO NOT include any English wrappers like "POST_TEXT:", "---START_OUTPUT---", etc.
    `;
    
    const userQuery = "Generate today's new, progressive, and engaging Singlish educational trading post for beginners.";

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                
                // Google Search Tool එක
                tools: [{ "google_search": {} }], 
                
                // System Instruction එක
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },

                generationConfig: { 
                    temperature: 0.8 
                } 
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini API HTTP Error: Status ${response.status} - ${errorBody}`);
            return null;
        }

        const data = await response.json();
        const postText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        if (!postText) {
             console.error("Gemini API Response Missing Content:", JSON.stringify(data));
        }

        return postText || null;

    } catch (e) {
        console.error("Gemini Generation Exception:", e);
        return null;
    }
}

// B. Telegram API call (Send Text Message)
async function sendTelegramMessage(caption) {
    const TELEGRAM_API_ENDPOINT = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(TELEGRAM_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CONFIG.TELEGRAM_CHAT_ID, 
                text: caption,
                parse_mode: 'Markdown' // Telegram Markdown භාවිත කරයි
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

// --- 2. MAIN WORKFLOW ---

async function runDailyPostWorkflow(env) {
    // KV Binding 'POST_STATUS_KV' අත්‍යවශ්‍යයි
    if (!env.POST_STATUS_KV) {
        console.error("KV Binding 'POST_STATUS_KV' is missing in environment variables.");
        return { success: false, message: 'KV Binding is missing.' };
    }

    const todayKey = new Date().toISOString().slice(0, 10); 
    const KV_KEY = `trading_post_posted:${todayKey}`; // Key එක 'trading' ලෙස තබා ඇත.

    // 1. Duplication Check 
    const status = await env.POST_STATUS_KV.get(KV_KEY);
    if (status === 'POSTED') {
        console.log(`[${todayKey}] Trading Post already sent. Exiting.`);
        return { success: true, message: 'Trading Post already sent.' };
    }

    // 2. Generate Sinhala Content 
    const postText = await generateSinhalaContent(); 
    if (!postText) {
        return { success: false, message: 'Failed to generate content via Gemini.' }; 
    }
    
    // 3. Send Post to Telegram
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // 4. Set Flag 
        await env.POST_STATUS_KV.put(KV_KEY, 'POSTED', { expirationTtl: 86400 }); 
        console.log(`[${todayKey}] Trading Post sent successfully and KV flag set.`);
        return { success: true, message: 'Daily trading education post completed successfully.' };
    } else {
        console.log(`[${todayKey}] Telegram post failed. KV flag NOT set.`);
        return { success: false, message: 'Telegram post failed.' };
    }
}

// --- 3. WORKER ENTRY POINT ---

export default {
    // Cron Trigger (ස්වයංක්‍රීය ක්‍රියාත්මක වීම)
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runDailyPostWorkflow(env));
    },

    // Manual Trigger
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/trigger-manual') {
            const result = await runDailyPostWorkflow(env);
            return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } }); 
        }
        return new Response('Worker running. Use the scheduled trigger or /trigger-manual to run the workflow.', { status: 200 });
    }
};
