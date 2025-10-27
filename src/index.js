// =================================================================
// 🚀 UNIFIED CLOUDFLARE WORKER ROUTER (SINGLE BOT / SINGLE CHAT ID)
// =================================================================

// --- 1. IMPORT LOGIC MODULES ---
import { TradingBot, handleTradingLogic, sendTelegramReplyToOwner } from './trading_assistant.js';
import { NewsBot, handleNewsCommands } from './forex_news.js';

// --- 2. UNIFIED WEBHOOK HANDLER (MAIN LOGIC SWITCH) ---

async function handleUnifiedWebhook(request, env) {
    try {
        const update = await request.json();
        
        // 1. CALLBACK QUERY (Always handled by Trading Bot)
        if (update && update.callback_query) {
            await handleTradingLogic(update, env);
            return new Response('Callback Query Processed', { status: 200 });
        }
        
        if (update && update.message && update.message.text) {
            const text = update.message.text.trim();
            const command = text.split(' ')[0].toLowerCase();
            
            // 2. NEWS BOT COMMANDS (/fundamental, /start)
            if (command === '/fundamental' || command === '/start') {
                // News Bot handles the response (membership check, news post, welcome message)
                await handleNewsCommands(update, env);
                return new Response('News Command Processed', { status: 200 });
            }

            // 3. TRADING BOT LOGIC (AI Questions, Owner Commands, /help)
            // All other messages go to the Trading Bot's main handler
            await handleTradingLogic(update, env);
            return new Response('Trading Logic Processed', { status: 200 });

        } 
        
    } catch (e) {
        console.error("Unified Webhook Error:", e.stack);
        await sendTelegramReplyToOwner(`❌ UNIFIED WEBHOOK ERROR: ${e.message}`);
    }
    
    return new Response('OK', { status: 200 });
}


// --- 3. WORKER EXPORT ---

export default {
    /**
     * Handles scheduled events (Cron trigger).
     * Runs both bots' scheduled tasks.
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(TradingBot.scheduled(env, ctx)); // Daily Educational Post
        ctx.waitUntil(NewsBot.scheduled(env, ctx));    // Fundamental News Fetch
    },

    /**
     * Handles Fetch requests (Webhook and Manual Trigger).
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // --- MANUAL TRIGGER ROUTES (Unified) ---
        if (path === '/trigger/trading') {
            const tradingRequest = new Request(url.origin + '/trigger-manual' + url.search, request);
            return TradingBot.fetch(tradingRequest, env, ctx);
        }
        
        if (path === '/trigger/news') {
             const newsRequest = new Request(url.origin + '/trigger-manual' + url.search, request);
             return NewsBot.fetch(newsRequest, env, ctx);
        }

        // --- UNIFIED WEBHOOK (The Single Endpoint) ---
        if (path === '/webhook' && request.method === 'POST') {
            return handleUnifiedWebhook(request, env);
        }
        
        // --- DEFAULT ROUTE ---
        return new Response('Unified Worker Running. Webhook: /webhook. Triggers: /trigger/trading, /trigger/news', { status: 200 });
    }
};
