// =================================================================
// === src/index.js (FINAL UNIFIED FIX) ===
// =================================================================

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

// --- 1. IMPORT HANDLERS ---
import { handleTradingWebhook, handleTradingScheduled } from './trading-logic';
import { handleNewsWebhook, handleNewsScheduled } from './news-logic';

// --- 2. WORKER EXPORT (MAIN ENTRY POINT) ---
export default {
    async scheduled(event, env, ctx) {
        // News සහ Trading Logic දෙකම ක්‍රියාත්මක කරයි
        
        try {
            // Trading Post එක (AI Educational Post)
            ctx.waitUntil(handleTradingScheduled(event, env, ctx, CONFIG));
            
            // News Post එක (Forex Fundamental News)
            ctx.waitUntil(handleNewsScheduled(event, env, ctx, CONFIG)); 

        } catch (e) {
            console.error("Error in scheduled handler:", e);
        }
    },

    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            const url = new URL(request.url);
            
            // Manual Daily Post Trigger for Testing (Trading Post)
            if (url.pathname === '/trigger-trading-manual') {
                try {
                     const result = await handleTradingScheduled({type: 'manual'}, env, ctx, CONFIG);
                     if (result && result.status === 200) {
                        return new Response('✅ Manual Trading Post Triggered Successfully.', { status: 200 });
                     }
                     return new Response(`❌ Manual Trading Post Failed: ${result?.content || 'Unknown Error'}`, { status: 500 });
                } catch (e) {
                     return new Response(`Error in Manual Trading Trigger: ${e.message}`, { status: 500 });
                }
            }

            // Manual Daily Post Trigger for Testing (News Post)
            if (url.pathname === '/trigger-news-manual') {
                try {
                     await handleNewsScheduled({type: 'manual'}, env, ctx, CONFIG);
                     return new Response('✅ Manual News Post Triggered Successfully. (Check Channel)', { status: 200 });
                } catch (e) {
                     return new Response(`Error in Manual News Trigger: ${e.message}`, { status: 500 });
                }
            }

            return new Response('Worker running. Set up Telegram webhook to POST here.', { status: 200 });
        }
        
        // --- 3. INCOMING TELEGRAM WEBHOOK (POST REQUEST) ---
        try {
            const update = await request.json();
            
            // --- 3.1. News Bot Handler (Membership check and /fundamental, /start, /help) ---
            // news-logic එකෙන් message එකක් handle කළේ නම්, response එක ලැබෙනු ඇත.
            const newsResponse = await handleNewsWebhook(update, env, CONFIG);
            if (newsResponse) {
                return newsResponse; // News Logic විසින්ම response එක ආපසු යවනු ඇත.
            }
            
            // --- 3.2. Trading Bot Handler (AI Q&A, Owner Commands, Callback Queries) ---
            // news-logic වෙතින් handle නොකළ commands හෝ සරල text message/callback queries trading-logic වෙත යවනු ලැබේ.
            return handleTradingWebhook(update, env, CONFIG);

        } catch (e) {
            console.error("Error processing fetch request:", e);
            // If the JSON parsing fails (e.g., image_986c67.png), return a descriptive error.
            return new Response(`Error processing webhook: ${e.message}`, { status: 200 });
        }
    }
};
