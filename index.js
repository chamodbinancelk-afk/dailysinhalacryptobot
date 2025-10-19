// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---

const CONFIG = {
    // ⚠️ මේවා ඔබේ සැබෑ අගයන් සමඟ යාවත්කාලීන කරන්න ⚠️
    TELEGRAM_BOT_TOKEN: "5389567211:AAG0ksuNyQ1AN0JpcZjBhQQya9-jftany2A",
    TELEGRAM_CHAT_ID: "1901997764", // ඔබේ Channel/Group ID
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA",
    
    // GitHub Raw URL එකක් මෙහි ඇතුළත් කරන්න (https://raw.githubusercontent.com/... format එකෙන්)
    GITHUB_CONTENT_URL: "https://github.com/chamodbinancelk-afk/cfnewseconomic2000/blob/main/crypto_sinhala_template.md"
};

// --- 1. CORE FUNCTIONS ---

// A. Gemini API call (Sinhala Content Generation)
async function generateSinhalaContent(githubTemplate) {
    const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    
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
                'x-goog-api-key': CONFIG.GEMINI_API_KEY,
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { temperature: 0.8 } 
            }),
        });

        const data = await response.json();
        const postText = data.candidates[0].content.parts[0].text.trim();
        
        return postText;

    } catch (e) {
        console.error("Gemini Generation Error:", e);
        return null;
    }
}

// B. Telegram API call (Send Text Message)
async function sendTelegramMessage(caption) {
    // Telegram API එකට text එක යැවීමට sendMessage method එක භාවිත කෙරේ.
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
        console.error("Telegram Send Error:", e);
        return false;
    }
}

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

// --- 2. MAIN WORKFLOW ---

// Worker එක ක්‍රියාත්මක වන ප්‍රධාන Logic කොටස
async function runDailyPostWorkflow(env) {
    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const KV_KEY = `posted:${todayKey}`;

    // 1. Duplication Check (Cloudflare KV Store භාවිතයෙන්)
    // env.POST_STATUS_KV යනු Dashboard එකෙන් Binding කළ Variable එකයි
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

    // 3. Generate Sinhala Content using Gemini
    const postText = await generateSinhalaContent(githubTemplate);
    if (!postText) {
        return { success: false, message: 'Failed to generate content via Gemini.' };
    }
    
    // 4. Send Post to Telegram
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // 5. Set Flag (Cloudflare KV Store එකේ දින සඳහා කොඩියක් තැබීම)
        // TTL (Time-To-Live): 86400 seconds = 24 hours
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
