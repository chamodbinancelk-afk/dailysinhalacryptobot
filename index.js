// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---

const CONFIG = {
    // ⚠️ මේවා ඔබේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", // ඔබේ Bot Token
    TELEGRAM_CHAT_ID: "1901997764", // 👈 ඔබේ පුද්ගලික User ID එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", // 👈 ඔබේ නව Key එක මෙහි ඇතුළත් කරන්න
    
    // GitHub Raw URL (https://raw.githubusercontent.com/... format එකෙන්)
    GITHUB_CONTENT_URL: "https://raw.githubusercontent.com/chamodbinancelk-afk/dailysinhalacryptobot/main/crypto_sinhala_template.md" 
};

// --- 1. CORE FUNCTIONS ---

// A. Gemini API call (Sinhala Content Generation) - API Key එක URL Parameter එකක් ලෙස යවනු ලැබේ
async function generateSinhalaContent(githubTemplate, apiKey) {
    // Key එක URL Parameter එකක් ලෙස යවනු ලැබේ
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // සිංහලෙන් Post එකක් සෑදීමට උපදෙස් දෙන Prompt එක
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { temperature: 0.8 } 
            }),
        });
        
        // API Call එක අසාර්ථක වුවහොත් (උදා: 400, 403, 500 දෝෂ) Console එකේ පෙන්වයි
        if (!response.ok) {
             const errorBody = await response.text();
             console.error("Gemini API HTTP Error:", response.status, errorBody);
             return null;
        }

        const data = await response.json();
        
        // ප්‍රතිචාරයේ Content තිබේදැයි පරීක්ෂා කිරීම
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
            const postText = data.candidates[0].content.parts[0].text.trim();
            return postText;
        } else {
            // Content නොමැති නම් (උදා: Safety Block) දෝෂය Console එකේ පෙන්වයි
            console.error("Gemini API Response Missing Content:", JSON.stringify(data));
            return null;
        }

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
                chat_id: CONFIG.TELEGRAM_CHAT_ID, // User ID එකට යැවේ
                text: caption,
                parse_mode: 'Markdown'
            }),
        });
        return response.ok;
    } catch (e) {
        console.error("Telegram Send Error:", e);
        return false;
    }
}

// C. GitHub Content Fetch (Raw File Reading)
async function getGitHubTemplate() {
    try {
        const response = await fetch(CONFIG.GITHUB_CONTENT_URL);
        if (!response.ok) {
            // URL එක Raw Link එකක් නොවේ නම් දෝෂයක් පෙන්වයි
            throw new Error(`GitHub fetch failed with status: ${response.status}. Check if the URL is a RAW link.`);
        }
        return await response.text();
    } catch (e) {
        console.error("GitHub Fetch Error:", e);
        return null;
    }
}

// --- 2. MAIN WORKFLOW ---

// Worker එක ක්‍රියාත්මක වන ප්‍රධාන Logic කොටස
async function runDailyPostWorkflow(env) {
    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const KV_KEY = `posted:${todayKey}`;

    // 1. Duplication Check (Cloudflare KV Store භාවිතයෙන්)
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

    // 3. Generate Sinhala Content using Gemini (Key එක යවනු ලැබේ)
    const postText = await generateSinhalaContent(githubTemplate, CONFIG.GEMINI_API_KEY);
    if (!postText) {
        return { success: false, message: 'Failed to generate content via Gemini.' };
    }
    
    // 4. Send Post to Telegram
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // 5. Set Flag (Cloudflare KV Store එකේ දින සඳහා කොඩියක් තැබීම)
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
    // Cron Trigger එක ක්‍රියාත්මක වන විට
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runDailyPostWorkflow(env));
    },

    // Manual Trigger (test කිරීම සඳහා)
    async fetch(request, env, ctx) {
        if (request.url.includes('/trigger-manual')) {
            const result = await runDailyPostWorkflow(env);
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Worker running. Use the scheduled trigger or /trigger-manual to run the workflow.', { status: 200 });
    }
};
