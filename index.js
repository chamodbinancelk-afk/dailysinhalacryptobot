// index.js

// --- ES MODULE IMPORTS (Required for Cloudflare Workers) ---
import { load } from 'cheerio'; 
import moment from 'moment-timezone'; 

// --- A. CONFIGURATION වෙතින් Import ---
import { CONFIG, PERMISSIONS, QUOTE_IMAGE_URL } from './config.js'; 

// --- B. TELEGRAM වෙතින් Import ---
import { sendUnifiedMessage } from './telegram.js';

// --- C. GROUP_MANAGEMENT වෙතින් Import ---
import { getApprovedGroupsMap } from './group_management.js';

// --- D. AI_SERVICES වෙතින් Import ---
import { 
    generateScheduledContent, 
    generateDailyQuote 
} from './ai_services.js'; 

// --- E. MAIN_LOGIC වෙතින් ප්‍රධාන Handlers Import කිරීම ---
import { 
    fetchForexNews, 
    handleWebhook, 
    sendOwnerPanel
} from './main_logic.js'; 


/**
 * Cloudflare Worker හි ප්‍රධාන Handlers නිරාවරණය කිරීම.
 */
export default {
    
    /**
     * 1. ⏰ Scheduled Handler (Cron Trigger)
     */
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    console.log("Starting Scheduled Tasks (Cron Job)...");
                    
                    const groups = await getApprovedGroupsMap(env); 

                    // 1. 📰 Fundamental News Fetch කර, අදාළ Groups වලට යැවීම.
                    await fetchForexNews(env, false); 

                    // 2. 📚 Daily Educational Post එක Generate කර යැවීම.
                    const postContent = await generateScheduledContent(env); 
                    if (postContent) {
                        for (const chatId in groups) {
                            if (groups[chatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                                await sendUnifiedMessage(chatId, postContent, 'Markdown', null);
                            }
                        }
                    } 
                    
                    // 3. 🔥 Daily Motivation Post Generate කර යැවීම.
                    const quoteContent = await generateDailyQuote(env);
                    for (const chatId in groups) {
                        if (groups[chatId].permissions.includes(PERMISSIONS.MOTIVATION_POST.id) && quoteContent) {
                            await sendUnifiedMessage(chatId, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                        }
                        
                    }
                    
                    // 4. Refresh Owner Panel (Always run)
                    await sendOwnerPanel(env); 

                } catch (error) {
                    console.error("[CRITICAL CRON FAILURE]: ", error.stack);
                }
            })()
        );
    },

    /**
     * 2. 🌐 Fetch Handler (Webhook / HTTP Requests)
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Manual Trigger 
        if (url.pathname === '/trigger-manual' || url.pathname === '/trigger-all') {
             try {
                 await this.scheduled(null, env, ctx); 
                 return new Response('✅ Manual Daily Post, News, and Quote Triggered Successfully to permitted groups.', { status: 200 });
             } catch (e) {
                 return new Response(`Error in Manual Trigger: ${e.message}`, { status: 500 });
             }
        }
        
        if (request.method === 'POST') {
            return handleWebhook(request, env);
        }
        
        return new Response('Unified Trading Bot Worker V9 running. All features & commands are integrated and fixed.', { status: 200 });
    }
};
