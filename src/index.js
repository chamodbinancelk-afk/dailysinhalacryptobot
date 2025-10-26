// =================================================================
// === src/index.js (FINAL ENTRY POINT AND FLOW CONTROL) ===
// =================================================================

// --- 1. IMPORT MODULES ---

// Forex Factory Scraping, /fundamental, and News Scheduled Task
import { handleNewsScheduled, handleNewsWebhook } from './news-logic';

// Trading AI Q&A, Daily Trading Post, and User Counting
import { handleTradingScheduled, handleTradingWebhook } from './trading-logic';


// =================================================================
// --- CLOUDFLARE WORKER HANDLERS ---
// =================================================================

export default {
    /**
     * Handles scheduled events (Cron trigger).
     * Runs both News Scraping and Trading Post tasks.
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                console.log("--- SCHEDULED TASK STARTED ---");
                
                // 1. Run Forex Factory News Scraper and Post (uses env.NEWS_STATE)
                await handleNewsScheduled(env); 
                
                // 2. Run Trading Post and User Count Update (uses env.POST_STATUS_KV)
                await handleTradingScheduled(env);
                
                console.log("--- SCHEDULED TASK FINISHED ---");
            })()
        );
    },

    /**
     * Handles Fetch requests (Telegram Webhook and Manual Triggers)
     */
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            // --- Manual Triggers for Testing ---
            if (url.pathname === '/trigger-trading') {
                await handleTradingScheduled(env);
                return new Response("Trading Scheduled Tasks manually triggered.", { status: 200 });
            }
            if (url.pathname === '/trigger-news') {
                await handleNewsScheduled(env);
                return new Response("Forex Factory News Scraper manually triggered.", { status: 200 });
            }

            // --- Webhook Handling (Telegram POST) ---
            if (request.method === 'POST') {
                console.log("--- WEBHOOK REQUEST RECEIVED ---");
                const update = await request.json();
                
                // 1. Try News Logic First (/start, /fundamental commands, and membership checks)
                // If news-logic handles it (returns a Response object), the flow stops here.
                const newsResult = await handleNewsWebhook(update, env);
                
                if (newsResult && newsResult instanceof Response) {
                    return newsResult;
                }
                
                // 2. If News Logic did NOT handle it (returned null), fall through to Trading Logic
                // This handles Q&A (plain text), /help, and other trading commands.
                console.log("Falling through to Trading Logic for Q&A...");
                const tradingResult = await handleTradingWebhook(update, env);
                
                // trading-logic.js always returns a Response, so we return it.
                return tradingResult;
            }

            // --- Default Response ---
            return new Response('Forex Trading Bot Worker is Active. Use Telegram webhook or manual triggers.', { status: 200 });
            
        } catch (e) {
            console.error('[CRITICAL FETCH FAILURE]:', e.stack);
            return new Response(`Worker threw an unhandled exception: ${e.message}. Check Logs.`, { status: 500 });
        }
    }
};
