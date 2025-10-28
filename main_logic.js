// main_logic.js

import { load } from 'cheerio';
import { CONFIG, FF_NEWS_URL, HEADERS, NEWS_KV_KEYS, PERMISSIONS } from './config.js';
import { sendUnifiedMessage, sendTelegramReply, editTelegramMessage, editTelegramMessageWithKeyboard, checkAdminStatus } from './telegram.js';
import { readKV, writeKV, getApprovedGroupsMap, isGroupApprovedAndHasPermission, checkAndIncrementUsage } from './group_management.js';
import { getAIAnalysis, generateReplyContent, validateTopic } from './ai_services.js';
import { generateRandomId } from './config.js'; // Helper function

// --- News Scraping ---

export async function getLatestForexNews() {
    // (Original Scraping logic using fetch and cheerio remains the same)
    try {
        const response = await fetch(FF_NEWS_URL, { headers: HEADERS });
        const html = await response.text();
        const $ = load(html);
        
        // ... [Scraping Logic] ...

        // Example return structure (simplified for brevity)
        return { 
            time: '08:30am', currency: 'USD', impact: 'High', 
            headline: $('.news-headline').first().text().trim(), 
            description: 'Full description...', image: null 
        };

    } catch (e) {
        console.error("Forex News Scraping Failed:", e);
        return null;
    }
}

// --- News Posting Logic ---

export async function fetchForexNews(isManual = false) {
    const newsData = await getLatestForexNews();

    if (!newsData || !newsData.headline) return;

    const lastHeadline = await readKV(NEWS_KV_KEYS.LAST_HEADLINE);
    if (newsData.headline === lastHeadline && !isManual) return;
    if (newsData.impact === 'Low' && !isManual) return; 

    const aiAnalysis = await getAIAnalysis(newsData.headline, newsData.description);
    
    // ... [Message formatting logic] ...
    const fullMessage = `*🚨 FUNDAMENTAL NEWS ALERT...* \n\n*HEADLINE:* _${newsData.headline}_\n\n*🔍 AI ANALYSIS (Sinhala):*\n${aiAnalysis}`;

    // Check ALL approved groups and post only to those with NEWS permission
    const groups = await getApprovedGroupsMap();
    let successCount = 0;

    for (const chatId in groups) {
        if (groups[chatId].permissions.includes(PERMISSIONS.NEWS.id)) {
            const result = await sendUnifiedMessage(chatId, fullMessage, 'Markdown', newsData.image);
            if (result.success) successCount++;
        }
    }
    
    if (successCount > 0 || isManual) { 
        await writeKV(NEWS_KV_KEYS.LAST_HEADLINE, newsData.headline);
    }
}


// --- Main Webhook Handler ---

export async function handleWebhook(request) {
    // Node.js server එකකදී, request.json() වෙනුවට body-parser වැනි දෙයක් යොදාගත හැක.
    // සරල බව සඳහා, අපි request එකක body එක parse වූ වස්තුවක් ලෙස සලකමු.
    
    // (Real implementation would need to parse the request body from your Node.js/Express server)
    const update = request; 

    // Handle incoming message (Simplified logic from original index.js)
    if (update.message && update.message.text) {
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text.trim();
        const isGroupChat = chatId.toString().startsWith('-');

        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);
            
            if (command === '/search') {
                 if (args.length === 0) return sendTelegramReply(chatId, "*⚠️ Usage:* `/search [Trading Topic]`", messageId);
                 message.text = args.join(' '); // Treat as Q&A
            } 
            // ... [Handle other commands: /start, /admin, etc.] ...
        }

        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            
            if (isGroupChat && !(await isGroupApprovedAndHasPermission(chatId, PERMISSIONS.TRADING_QNA.id))) {
                return { status: 200, body: 'Group Access Denied - Silent Ignore' };
            }
            
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...*", messageId);
            const isTradingTopic = await validateTopic(text); 
            
            if (isTradingTopic) {
                const usage = await checkAndIncrementUsage(chatId);
                
                if (!usage.allowed) {
                    const limitMessage = `🛑 *Usage Limit Reached!* \n\nSorry, oyage **Trading Questions 5** (limit eka) ada dawasata iwarai.`;
                    // ... [Generate and send unlimit request button logic] ...
                    await editTelegramMessage(chatId, validationMessageId, limitMessage);
                    return { status: 200, body: 'Rate Limited' };
                }
                
                await editTelegramMessage(chatId, validationMessageId, `✍️ *සිංහල Post එකක් සකස් කරමින්...* (Used: ${usage.count}/${CONFIG.DAILY_LIMIT})`);
                const replyText = await generateReplyContent(text);
                await editTelegramMessage(chatId, validationMessageId, replyText);
                
            } else {
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance** related questions walata witharak answer karanna.*`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage);
            }
            
        }
        
        return { status: 200, body: 'OK' };
    }
    
    // ... [Handle callback_query logic here, simplified for this example] ...
    
    return { status: 200, body: 'Not a relevant update' };
}
