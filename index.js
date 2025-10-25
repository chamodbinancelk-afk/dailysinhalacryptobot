// =========================================================
// === src/index.js (MAIN ENTRY POINT) ===
// =========================================================

// News Bot Logic එකෙන් Functions මෙහිදී Import කරන්න (ඔබගේ News Logic File එකේ නම අනුව)
import { handleNewsScheduled, handleNewsWebhook } from './news-logic'; // ⚠️ News Logic file path වෙනස් විය හැක

// Trading Bot Logic එකෙන් Functions මෙහිදී Import කරන්න
import { handleTradingWebhook, handleTradingScheduled } from './trading-logic';

// ⚠️ Note: ඔබගේ News Bot Logic එකේ config එක මෙහි නැවත සඳහන් නොකරන්න.

export default {
    
    // 1. 📅 Scheduled Event (දිනපතා News සහ Trading Lesson යැවීම)
    async scheduled(event, env, ctx) {
        
        // 🚨 News Bot Scheduled Post Logic 
        // await handleNewsScheduled(env, ctx); 
        // (ඔබගේ News Bot Logic එකේ Cron logic එක වෙනමම තිබේ නම්)
        
        // 🚨 Trading Bot Scheduled Post Logic 
        await handleTradingScheduled(env); 
    },


    // 2. 🔌 Fetch Event (සියලුම Webhook Requests සහ Endpoints හසුරුවයි)
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // --- A. Endpoints (Manual Triggers) ---
        
        // Trading Bot Manual Trigger
        if (url.pathname === '/trigger-manual') {
            return new Response('Trading Manual Trigger Executed.', { status: 200 }); // සරල කර ඇත
        }
        
        // News Bot Manual Trigger
        if (url.pathname === '/trigger-news') {
            // return handleNewsWebhook(request, env); // (ඔබේ News Logic එක අනුව)
            return new Response('News Manual Trigger Executed.', { status: 200 });
        }
        
        // --- B. Telegram Webhook (POST Request) ---
        if (request.method === 'POST') {
            
            // 🚨 INTEGRATION POINT: 
            // Trading Bot එකට Commands, Questions සහ Callback Queries හසුරුවීමට ප්‍රමුඛතාවය දෙන්න.
            
            const response = await handleTradingWebhook(request, env);
            
            // Trading Bot Logic එක "OK" Response එකක් ලබා දෙයි නම්, එය අවසන් කරන්න.
            if (response && response.status === 200) {
                return response;
            }
            
            // 🛑 Trading Bot එකට හසුරුවීමට නොහැකි වූ Webhooks (උදා: News Update එකක්) News Bot Logic එකට යවන්න.
            // return handleNewsWebhook(request, env); // (ඔබේ News Logic එක අනුව)

            // දැනට සරලව OK යවමු
            return new Response('OK', { status: 200 }); 
        }
        
        return new Response('Worker running.', { status: 200 });
    }
};
