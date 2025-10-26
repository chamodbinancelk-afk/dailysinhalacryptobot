// =================================================================
// === src/index.js (Worker Entry Point - FIXED) ===
// =================================================================

// 1. Logic ගොනු වලින් අවශ්‍ය Named Exports ආයාත කිරීම
// මෙමගින් index.js වෙත Logic ශ්‍රිත ලබා ගනී
import { handleTradingWebhook, handleTradingScheduled } from './trading-logic';
import { handleNewsWebhook, handleNewsScheduled } from './news-logic';

// 2. ගෝලීය CONFIGURATION (Logic ගොනු වල තිබූ Hardcoded Configs දැන් මෙහි නැත)
// ⚠️ මෙම CONFIG එක ඔබේ සියලුම Logic Functions වෙත යවනු ලැබේ.
const CONFIG = {
    // 🛑 ඔබේ Bot Token එක
    TELEGRAM_BOT_TOKEN: "5100305269:AAEHxCE1z9jCFZl4b0-yoRfVfojKBRKSL0Q", 
    
    // 🛑 ඔබේ Channel/Group Chat ID එක
    TELEGRAM_CHAT_ID: "-1002947156921",
    
    // 🛑 ඔබේ පුද්ගලික Chat ID එක (Owner ගේ ID එක)
    OWNER_CHAT_ID: "1901997764",
    
    // 🛑 ඔබේ Gemini API Key එක
    GEMINI_API_KEY: "AIzaSyDXf3cIysV1nsyX4vuNrBrhi2WCxV44pwA", 
};


// 3. Worker Entry Point Object (Default Export)
export default {
    
    // ⏰ Scheduled Trigger Handler
    async scheduled(event, env, ctx) {
        // News Logic එකේ Scheduled task ක්‍රියාත්මක කිරීම
        ctx.waitUntil(handleNewsScheduled(env, CONFIG)); 
        
        // Trading Logic එකේ Scheduled task ක්‍රියාත්මක කිරීම
        ctx.waitUntil(handleTradingScheduled(event, env, ctx)); 
    },

    // 🌐 Webhook (HTTP Request) Handler
    async fetch(request, env) {
        const url = new URL(request.url);

        // Manual Daily Post Trigger for Testing (Trading Logic)
        if (url.pathname === '/trigger-manual') {
            // Trading Logic එකේ Manual Trigger එක භාවිතා කිරීම
            const postContent = await handleTradingScheduled({ type: 'manual' }, env, null); 
            
            // response එක trading-logic එකේ handler එකෙන් ලබා ගනී
            if (postContent.status === 200) {
                 return new Response('✅ Manual Daily Post Triggered Successfully.', { status: 200 });
            }
            return new Response('❌ Manual Daily Post Failed. (Check logs)', { status: 500 });
        }
        
        if (request.method !== 'POST') {
            return new Response('Worker running. Use the scheduled trigger or Telegram webhook.', { status: 200 });
        }

        try {
            const update = await request.json();

            // 1. Trading Logic Webhook Handle කරන්නට උත්සාහ කිරීම
            let response = await handleTradingWebhook(update, env, CONFIG);
            if (response && response.status === 200) {
                return response; // Trading Logic එකෙන් handled නම්, නවතින්න
            }
            
            // 2. News Logic Webhook Handle කරන්නට උත්සාහ කිරීම
            // handleNewsWebhook එකෙන් 'null' ලැබෙන්නේ එය handle නොකළොත් පමණයි.
            response = await handleNewsWebhook(update, env, CONFIG);
            if (response && response.status === 200) {
                return response; // News Logic එකෙන් handled නම්, නවතින්න
            }
            
            // 3. කිසිදු Logic එකකින් handle නොකළේ නම් (e.g., sticker, photo, unhandled command)
            return new Response('OK - Unhandled message type.', { status: 200 });

        } catch (e) {
            console.error("Critical Webhook Error in Index.js:", e.stack);
            return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
        }
    },
};
