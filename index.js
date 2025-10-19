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

// A. Gemini API call (Sinhala Content Generation) - Trading Education සඳහා යාවත්කාලීන කර ඇත.
async function generateSinhalaContent() {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // 🛑 අලුත් System Prompt එක: Trading ගැන මුල සිට කියා දෙන අලුත් මාතෘකාවක් තෝරා ගන්න
    const systemPrompt = `
        You are an expert financial and trading educator. Your primary goal is to provide daily, foundational trading education for beginners.
        Your task is to:
        1. Use the 'google_search' tool to find a different, fundamental trading concept each day (e.g., Candlesticks, Support and Resistance, RSI, Stop-Loss, or Risk Management). DO NOT repeat the same topic frequently.
        2. Generate a high-quality, 5-paragraph educational post in **SINHALA LANGUAGE** based on that chosen fundamental trading concept. The post must explain the concept simply, provide practical usage, and be encouraging for beginners.
        3. The post must be well-formatted using Telegram's **Markdown** (titles, bold text, lists, and emojis).
        
        Your final output must contain ONLY the content of the post. DO NOT include any English wrappers like "POST_TEXT:", "---START_OUTPUT---", etc.
    `;
    
    const userQuery = "Generate today's new and engaging Sinhala educational trading post for beginners.";

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                
                // Google Search Tool එක
                tools: [{ "google_search": {} }], 
                
                // System Instruction එක මගින් AI එකට මාතෘකාව තීරණය කරන්න උපදෙස් දෙයි
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
    const KV_KEY = `trading_post_posted:${todayKey}`; // 🛑 Key එක 'trading' ලෙස වෙනස් කර ඇත.

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
    // Cron Trigger
    async scheduled(event, env, ctx) {
        // Cron Schedule අනුව දිනපතා ස්වයංක්‍රීයව ක්‍රියාත්මක වේ
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
