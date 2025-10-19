// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---
// ⚠️ ඔබගේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (User ID එක)
    TELEGRAM_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
    
    // 🛑 ඔබේ GitHub Raw Template URL එක
    GITHUB_CONTENT_URL: "https://raw.githubusercontent.com/chamodbinancelk-afk/dailysinhalacryptobot/main/crypto_sinhala_template.md"
};

// --- 1. CORE FUNCTIONS ---

// C. GitHub Content Fetch (Raw File Reading)
async function getGitHubTemplate() {
    try {
        const response = await fetch(CONFIG.GITHUB_CONTENT_URL);
        if (!response.ok) {
            throw new Error(`GitHub fetch failed with status: ${response.status}. Check if the URL is a RAW link.`);
        }
        return await response.text();
    } catch (e) {
        console.error("GitHub Fetch Error:", e);
        return null;
    }
}

// A. Gemini API call (Sinhala Content Generation) - generationConfig නිවැරදි කර ඇත
async function generateSinhalaContent(githubTemplate) {
    // API Key එක URL Parameter එකක් ලෙස යවනු ලැබේ
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const prompt = `
        You are an expert Crypto Currency Education Specialist. Your task is to generate a high-quality, 5-paragraph educational post in **SINHALA LANGUAGE** suitable for a Telegram audience. 
        The post must be well-formatted using Telegram's Markdown (titles, bold text, lists, and emojis) and should be based on the provided topic/template. 
        Focus on providing value and current market relevance.

        Your final output must contain ONLY the content of the post. DO NOT include any English wrappers like "POST_TEXT:", "---START_OUTPUT---", etc.

        Topic/Template from GitHub:
        ---
        ${githubTemplate}
        ---
    `;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                
                // 🛑 දෝෂය නිවැරදි කරන ලදි: 'config' වෙනුවට 'generationConfig' භාවිත කරයි
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
                chat_id: CONFIG.TELEGRAM_CHAT_ID, // 👈 ඔබේ Chat ID එකට යැවේ
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
    // KV Binding එකේ නම 'POST_STATUS_KV' ලෙස තිබිය යුතුය
    if (!env.POST_STATUS_KV) {
        console.error("KV Binding 'POST_STATUS_KV' is missing in environment variables.");
        return { success: false, message: 'KV Binding is missing.' };
    }

    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const KV_KEY = `crypto_post_posted:${todayKey}`;

    // 1. Duplication Check 
    const status = await env.POST_STATUS_KV.get(KV_KEY);
    if (status === 'POSTED') {
        console.log(`[${todayKey}] Post already sent. Exiting.`);
        return { success: true, message: 'Post already sent.' };
    }

    // 2. Get Template from GitHub
    const githubTemplate = await getGitHubTemplate();
    if (!githubTemplate) {
        return { success: false, message: 'Failed to fetch GitHub template.' };
    }

    // 3. Generate Sinhala Content
    const postText = await generateSinhalaContent(githubTemplate);
    if (!postText) {
        // Log එකේ දෝෂය දැන් නිශ්චිතව පෙන්විය යුතුය
        return { success: false, message: 'Failed to generate content via Gemini.' }; 
    }
    
    // 4. Send Post to Telegram
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // 5. Set Flag 
        await env.POST_STATUS_KV.put(KV_KEY, 'POSTED', { expirationTtl: 86400 }); 
        console.log(`[${todayKey}] Post sent successfully and KV flag set.`);
        return { success: true, message: 'Daily text post completed successfully.' };
    } else {
        console.log(`[${todayKey}] Telegram post failed. KV flag NOT set.`);
        return { success: false, message: 'Telegram post failed.' };
    }
}

// --- 3. WORKER ENTRY POINT ---

export default {
    // Cron Trigger
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runDailyPostWorkflow(env));
    },

    // Manual Trigger
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/trigger-manual') {
            const result = await runDailyPostWorkflow(env);
            // JSON.stringify(null, 2) මගින් ප්‍රතිචාරය වඩාත් පිරිසිදුව පෙන්වයි
            return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } }); 
        }
        return new Response('Worker running. Use the scheduled trigger or /trigger-manual to run the workflow.', { status: 200 });
    }
};
