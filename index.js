// index.js

// --- A. CONFIGURATION (config.js) වෙතින් අවශ්‍ය ස්ථිර අගයන් Import කිරීම ---
// මෙහිදී CONFIG, PERMISSIONS වැනි ස්ථිර අගයන් ලැබේ.
import { CONFIG, PERMISSIONS } from './config.js'; 

// --- B. TELEGRAM සහ C. GROUP_MANAGEMENT වෙතින් අවශ්‍ය Utilities Import කිරීම ---
// sendUnifiedMessage: Telegram API calls සඳහා.
// getApprovedGroupsMap: Group Permissions කියවීමට.
// checkAndIncrementUsage: Rate Limiting සඳහා.
import { sendUnifiedMessage } from './telegram.js'; 
import { getApprovedGroupsMap, checkAndIncrementUsage } from './group_management.js'; 

// --- D. AI_SERVICES වෙතින් අවශ්‍ය AI Functions Import කිරීම ---
// generateScheduledContent: දෛනික Post එක සැකසීමට.
import { generateScheduledContent } from './ai_services.js'; 

// --- E. MAIN_LOGIC වෙතින් ප්‍රධාන Handlers Import කිරීම ---
// fetchForexNews: News Scraping සහ Posting සඳහා.
// handleWebhook: සියලුම Message/Command/Group Add/Reply/Search logic සඳහා.
// handleCallbackQuery: Inline Button presses සඳහා.
// sendOwnerPanel: Admin Panel එක Update කිරීමට.
import { 
    fetchForexNews, 
    handleWebhook, 
    handleCallbackQuery, // handleWebhook තුළ භාවිත වේ 
    sendOwnerPanel
} from './main_logic.js'; 

// 🛑 වැදගත්: Worker එකක් ලෙස ක්‍රියාත්මක වීමට අනිවාර්යයෙන්ම අවශ්‍ය ES Module Export එක.

/**
 * Cloudflare Worker හි ප්‍රධාන Handlers නිරාවරණය කිරීම.
 */
export default {
    
    /**
     * 1. ⏰ Scheduled Handler (Cron Trigger)
     * GitHub Actions මඟින් Deploy කළ පසු Cloudflare Workers Cron Trigger මඟින් කැඳවනු ලැබේ.
     */
    async scheduled(event, env, ctx) {
        // ctx.waitUntil මඟින් Worker එක Time-out වීම වළක්වයි.
        ctx.waitUntil(
            (async () => {
                console.log("Starting Scheduled Tasks (Cron Job)...");
                
                // Note: env වස්තුව (KV bindings) සියලුම imported functions වලට ලබා දීමට 
                // අවශ්‍ය නම්, එම functions වලට 'env' parameter එකක් එකතු කළ යුතුය. 
                
                // 1. News Post කිරීම (main_logic.js මඟින්)
                await fetchForexNews(env, false); 
                
                // 2. Educational Post Generate කිරීම සහ Approved Groups වලට යැවීම.
                const postContent = await generateScheduledContent(env); 
                if (postContent) {
                    const groups = await getApprovedGroupsMap(env);
                    for (const chatId in groups) {
                        if (groups[chatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                            // sendUnifiedMessage (telegram.js) භාවිත කරමින් යවයි.
                            await sendUnifiedMessage(chatId, postContent, 'Markdown', null); 
                        }
                    }
                }
                
                // 3. Owner Panel එක Update කිරීම (main_logic.js මඟින්)
                await sendOwnerPanel(env); 

                console.log("Scheduled tasks finished.");
            })()
        );
    },

    /**
     * 2. 🌐 Fetch Handler (Webhook / HTTP Requests)
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Manual Trigger/Status Check
        if (url.pathname === '/status' || url.pathname === '/trigger-manual') {
             if (url.pathname === '/trigger-manual') {
                try {
                     // Scheduled logic එකම Manual Trigger කිරීමට.
                     await this.scheduled(null, env, ctx); 
                     return new Response('✅ Manual Triggered Successfully.', { status: 200 });
                } catch (e) {
                    return new Response(`Error in Manual Trigger: ${e.message}`, { status: 500 });
                }
             }
             return new Response('Unified Trading Bot Worker V9 is Active.', { status: 200 });
        }
        
        // Telegram Webhook Requests (POST)
        if (request.method === 'POST') {
            // handleWebhook ශ්‍රිතය (main_logic.js) මඟින් සියලුම incoming updates හසුරුවයි.
            return handleWebhook(request, env);
        }
        
        return new Response('404 Not Found', { status: 404 });
    }
};
