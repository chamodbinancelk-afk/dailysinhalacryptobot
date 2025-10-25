// =========================================================
// === src/index.js (FINAL COMPLETED INTEGRATION) ===
// =========================================================

// ... (CONFIG Block එක ඉහළින් තිබිය යුතුය) ...

// 2. Trading Bot Logic Imports
import { handleTradingWebhook, handleTradingScheduled } from './trading-logic.js'; 

// 🚨 News Bot Logic Imports (Comment ඉවත් කරන ලදී)
import { handleNewsWebhook, handleNewsScheduled } from './news-logic.js'; // ⚠️ ඔබගේ ගොනුවේ නම නිවැරදිදැයි බලන්න


export default {
    
    // 1. 📅 Scheduled Event 
    async scheduled(event, env, ctx) {
        
        // 🚨 Trading Bot Daily Post Logic
        await handleTradingScheduled(env, CONFIG); 
        
        // 🚨 News Bot Daily Post Logic (Comment ඉවත් කරන ලදී)
        await handleNewsScheduled(env, CONFIG, ctx); 
    },


    // 2. 🔌 Fetch Event 
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // ... (Manual Triggers) ...
        
        // --- B. Telegram Webhook (POST Request) ---
        if (request.method === 'POST') {
            
            // 1. Trading Bot Logic වෙත යැවීම - CONFIG යවන්න!
            const tradingResponse = await handleTradingWebhook(request, env, CONFIG);
            
            // Trading Bot Logic එකට එය හසුරුවිය හැකි නම්, එය return කරන්න.
            if (tradingResponse) { 
                return tradingResponse;
            }
            
            // 2. Trading Bot එකට අදාළ නැතිනම් News Bot Logic වෙත යැවීම - CONFIG යවන්න!
            const newsResponse = await handleNewsWebhook(request, env, CONFIG);
            
            // News Bot Logic එක එය හසුරුවන්නේ නම්, එය return කරන්න.
            if (newsResponse) {
                 return newsResponse;
            }

            // 3. කිසිම Logic එකකට හසු නොවුවහොත්, default OK යවන්න
            return new Response('OK (Message received but not handled)', { status: 200 }); 
        }
        
        return new Response('Worker running.', { status: 200 });
    }
};
