// --- 0. CONFIGURATION (Keys සහ IDs සෘජුවම කේතයේ) ---

const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (User ID එක)
    TELEGRAM_CHAT_ID: "1901997764", 
    
    // 🛑 ඔබේ අලුත්ම Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
};

// --- 1. CORE FUNCTIONS ---

// A. Gemini API call (Sinhala Content Generation) - මාතෘකා ලැයිස්තුව මගින් පුනරාවර්තනය වීම වළක්වයි.
async function generateSinhalaContent(coveredTopics) { 
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    // ආවරණය කළ මාතෘකා string එකක් බවට පත් කරයි
    const excludedTopicsString = coveredTopics.join(', ');
    
    // System Prompt: ආවරණය කළ සියලුම මාතෘකා ලැයිස්තුවක් ලෙස ලබා දී ඒවා මඟහරින්නැයි උපදෙස් දෙයි.
    const systemPrompt = `
        You are an expert financial and trading educator. Your primary goal is to provide daily, **step-by-step** foundational trading education for absolute beginners.
        
        The topics covered so far and MUST BE AVOIDED are: [${excludedTopicsString}].
        
        Your task is to:
        1. **Systematic Topic Selection:** Use the 'google_search' tool to select a fundamental trading topic from the beginner's curriculum. Topics MUST include core elements like: **Candlesticks, Support and Resistance, Money Management, Chart Patterns, Fibonacci Tools, and basic Indicators (RSI, Moving Averages)**. Ensure the selected topic is *different* from ALL previous topics to maintain a progressive learning path.
        2. **Content Generation:** Generate a high-quality, 5-paragraph educational post in **SINHALA-ENGLISH MIXED LANGUAGE (SINGLISH)** based on that chosen concept. The post must explain the concept simply, provide a practical example, and encourage the beginner. Use Sinhala as the base language but incorporate common English trading terms (e.g., "market eke", "buy karanna", "take profit").
        3. The post must be well-formatted using Telegram's **Markdown**. The first line must be a clear title indicating the topic.
        
        Your final output must contain ONLY the content of the post. DO NOT include any English wrappers like "POST_TEXT:", "---START_OUTPUT---", etc.
    `;
    
    const userQuery = "Generate today's new, progressive, and engaging Singlish educational trading post for beginners.";

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                
                tools: [{ "google_search": {} }], 
                
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

// උපකාරක ශ්‍රිතය: Post එකෙන් මාතෘකාව උපුටා ගැනීමට
function extractTopicFromPost(postText) {
    if (!postText) return 'Unknown Topic';
    
    // Post එකේ පළමු පේළිය මාතෘකාව ලෙස ගනී
    const titleLine = postText.split('\n')[0].trim();
    
    // මාතෘකාවේ මුල් අකුරු 50 පමණක් ගබඩා කරයි
    return titleLine.substring(0, 50).replace(/[*_]/g, '').trim(); 
}

// --- 2. MAIN WORKFLOW ---

async function runDailyPostWorkflow(env) {
    if (!env.POST_STATUS_KV) {
        console.error("KV Binding 'POST_STATUS_KV' is missing in environment variables.");
        return { success: false, message: 'KV Binding is missing.' };
    }

    const todayKey = new Date().toISOString().slice(0, 10); 
    const DAILY_POST_KV_KEY = `trading_post_posted:${todayKey}`; 
    const TOPICS_COVERED_KV_KEY = `TRADING_TOPICS_COVERED`; 

    // 1. Duplication Check 
    const status = await env.POST_STATUS_KV.get(DAILY_POST_KV_KEY);
    if (status === 'POSTED') {
        console.log(`[${todayKey}] Trading Post already sent. Exiting.`);
        return { success: true, message: 'Trading Post already sent.' };
    }
    
    // 2. ආවරණය කළ මාතෘකා ලැයිස්තුව ලබා ගැනීම
    // මූලික මාතෘකා Default කර ඇත.
    const coveredTopicsJson = await env.POST_STATUS_KV.get(TOPICS_COVERED_KV_KEY) || '["Support and Resistance", "Candlesticks", "Money Management"]'; 
    let coveredTopics;
    try {
        coveredTopics = JSON.parse(coveredTopicsJson);
    } catch (e) {
        console.error("Error parsing covered topics from KV:", e);
        coveredTopics = ["Support and Resistance", "Candlesticks", "Money Management"];
    }

    // 3. Generate Sinhala Content (ආවරණය කළ මාතෘකා ලැයිස්තුව යවයි)
    console.log(`Instructing Gemini: Do not repeat topics: ${coveredTopics.join(', ')}`);
    const postText = await generateSinhalaContent(coveredTopics); 
    if (!postText) {
        return { success: false, message: 'Failed to generate content via Gemini.' }; 
    }
    
    // 4. Send Post to Telegram
    const postSuccess = await sendTelegramMessage(postText);

    if (postSuccess) {
        // 5. Set Flag & Store New Topic
        
        // 🛑 දිනපතා Post කළ බවට වූ Flag එක පැය 24 කට තබයි.
        await env.POST_STATUS_KV.put(DAILY_POST_KV_KEY, 'POSTED', { expirationTtl: 86400 }); 
        
        // නව මාතෘකාව Array එකට එකතු කර නැවත Save කිරීම
        const newTopic = extractTopicFromPost(postText);
        coveredTopics.push(newTopic);
        
        // 🛑 ආවරණය කළ මාතෘකා ලැයිස්තුව 'සදහටම' ගබඩා කරයි (No TTL).
        await env.POST_STATUS_KV.put(TOPICS_COVERED_KV_KEY, JSON.stringify(coveredTopics)); 
        
        console.log(`[${todayKey}] Post sent successfully. New topic stored: ${newTopic}. Total covered: ${coveredTopics.length}`);
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
