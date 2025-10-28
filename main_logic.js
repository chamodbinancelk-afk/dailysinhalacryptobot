// main_logic.js (File E: Core Handlers and Main Bot Logic)

// --- Imports from A. CONFIGURATION ---
import { 
    CONFIG, 
    PERMISSIONS, 
    TRADING_KV_KEYS, 
    NEWS_KV_KEYS, 
    OWNER_PANEL_IMAGE_URL, 
    ACCESS_DENIED_MESSAGE, 
    ACCESS_APPROVED_MESSAGE, 
    QUOTE_IMAGE_URL 
} from './config.js'; 

// --- Imports from B. TELEGRAM UTILITIES (POST_STATUS_KV න්‍යාය පථය හරහා) ---
import { 
    readKV, 
    writeKV, 
    sendUnifiedMessage, 
    checkAdminStatus, 
    sendTelegramReply, 
    editPhotoCaption, 
    editTelegramMessage, 
    editTelegramMessageWithKeyboard, 
    answerCallbackQuery, 
    removeInlineKeyboard, 
    sendTelegramReplyToOwner 
} from './telegram.js'; 

// --- Imports from C. GROUP MANAGEMENT & USAGE ---
import { 
    getApprovedGroupsMap, 
    isGroupApprovedAndHasPermission, 
    addGroupWithPermissions, 
    checkAndIncrementUsage, 
    generateRandomId, 
    updateAndEditUserCount 
} from './group_management.js'; 

// --- Imports from D. AI SERVICES (News Scraping, AI Generation) ---
import { 
    getLatestForexNews, 
    getAIAnalysis, 
    generateDailyQuote, 
    generateScheduledContent, 
    validateTopic, 
    generateReplyContent 
} from './ai_services.js'; 

import moment from 'moment-timezone'; 


// =================================================================
// --- 1. FOREX NEWS LOGIC (EXPORTED) ---
// =================================================================
export async function fetchForexNews(env, isManual = false) {
    const newsData = await getLatestForexNews();

    if (!newsData || !newsData.headline) return;

    const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE);
    
    if (newsData.headline === lastHeadline && !isManual) return;
    if (newsData.impact === 'Low' && !isManual) return; 

    const aiAnalysis = await getAIAnalysis(newsData.headline, newsData.description, env);

    const emojiMap = {
        'High': '🔴',
        'Medium': '🟠',
        'Low': '🟡'
    };
    
    const currencyEmoji = newsData.currency === 'USD' ? '💵' : newsData.currency;
    
    const fullMessage = `
*🚨 FUNDAMENTAL NEWS ALERT ${emojiMap[newsData.impact]}*

*Time:* ${newsData.time} (FF Time)
*Currency:* ${currencyEmoji} ${newsData.currency}
*Impact:* ${newsData.impact}

*HEADLINE:* _${newsData.headline}_

---

*🔍 AI ANALYSIS (Sinhala):*
${aiAnalysis}

---

*SOURCE:* [Forex Factory News](https://www.forexfactory.com/news)
*Powered by: Gemini 2.5 Flash*
`;

    const groups = await getApprovedGroupsMap(env);
    let successCount = 0;

    for (const chatId in groups) {
        if (groups[chatId].permissions.includes(PERMISSIONS.NEWS.id)) {
            const result = await sendUnifiedMessage(
                chatId, 
                fullMessage, 
                'Markdown', 
                newsData.image 
            );
            if (result.success) successCount++;
        }
    }
    
    if (successCount > 0 || isManual) { 
        await writeKV(env, NEWS_KV_KEYS.LAST_HEADLINE, newsData.headline);
        await writeKV(env, NEWS_KV_KEYS.LAST_FULL_MESSAGE, fullMessage);
        await writeKV(env, NEWS_KV_KEYS.LAST_IMAGE_URL, newsData.image || 'N/A');
    }
}


// =================================================================
// --- 2. OWNER PANEL LOGIC (EXPORTED) ---
// =================================================================

function createPermissionKeyboard(chatId, currentPermissions, uniqueKey) {
    const keyboard = [];
    
    for (const key in PERMISSIONS) {
        const perm = PERMISSIONS[key];
        const isSelected = currentPermissions.includes(perm.id);
        const emoji = isSelected ? '✅ ' : '⬜ ';
        
        keyboard.push([{ 
            text: `${emoji}${perm.text}`, 
            callback_data: `TOGGLE_PERM_${perm.id}_${chatId}` 
        }]);
    }
    
    keyboard.push([{ 
        text: '💾 Save Permissions & Approve', 
        callback_data: `SAVE_PERMS_${chatId}` 
    }]);
    
    keyboard.push([{ 
        text: '❌ Reject & Cancel', 
        callback_data: `REJECT_GROUP_FINAL_${chatId}` 
    }]);
    
    return keyboard;
}


/**
 * Generates and sends/edits the main Admin Panel message to the Owner.
 * FIX: Stronger logic to ensure editing instead of double posting.
 */
export async function sendOwnerPanel(env) {
    const ownerChatId = CONFIG.OWNER_CHAT_ID;
    const timeZone = CONFIG.COLOMBO_TIMEZONE;
    const currentTime = moment().tz(timeZone).format('YYYY-MM-DD hh:mm:ss A');
    
    // 1. Get Stats for Caption
    const userSetRaw = await readKV(env, TRADING_KV_KEYS.BOT_USER_SET, 'text');
    const userSet = userSetRaw ? JSON.parse(userSetRaw) : [];
    const totalUsers = Array.isArray(userSet) ? userSet.length : 0;
    
    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const dailyCountStr = await readKV(env, TRADING_KV_KEYS.DAILY_COUNT_KEY) || '0';
    const dailyCount = parseInt(dailyCountStr);

    const dailyQnaCountKey = TRADING_KV_KEYS.DAILY_QNA_COUNT + ':' + today;
    const totalQnaRequests = parseInt(await readKV(env, dailyQnaCountKey) || '0'); 
    
    const approvedGroups = await getApprovedGroupsMap(env);
    const totalApprovedGroups = Object.keys(approvedGroups).length;
    
    const lastHeadline = await readKV(env, NEWS_KV_KEYS.LAST_HEADLINE) || 'N/A';
    const lastTopic = await readKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC) || 'N/A';
    
    // 2. Main Caption
    const caption = `*👑 Owner Admin Panel 📊*\n\n` +
                    `*⏰ System Time:* ${currentTime} (SL Time)\n\n` +
                    `*👥 Total Users:* ${totalUsers.toLocaleString()}\n` +
                    `*🌐 Approved Groups:* ${totalApprovedGroups}\n` + 
                    `*🔥 Daily New Users:* +${dailyCount.toLocaleString()}\n` +
                    `*💬 Today Q&A Requests:* ${totalQnaRequests.toLocaleString()}\n\n` + 
                    `*📰 Last News Post:* ${lastHeadline.substring(0, 40)}...\n` +
                    `*📚 Last Edu Topic:* ${lastTopic}\n\n` +
                    `---`;

    // 3. Inline Keyboard
    const keyboard = [
        [{ text: "📊 All KV Stats", callback_data: 'GET_STATS' }, { text: "💬 Today Usage", callback_data: 'GET_DAILY_USAGE' }], 
        [{ text: "⚙️ Bot Commands", callback_data: 'GET_COMMANDS' }, { text: "🌐 Manage Groups", callback_data: 'MANAGE_GROUPS' }], 
        [{ text: "🗑️ Clear Topics", callback_data: 'CLEAR_TOPICS' }, { text: "👁️ Last Edu Content", callback_data: 'VIEW_LAST_EDU' }],
        [{ text: "📰 Trigger News", callback_data: 'TRIGGER_NEWS' }, { text: "📚 Trigger Edu Post", callback_data: 'TRIGGER_EDU' }, { text: "🔥 Trigger Quote", callback_data: 'TRIGGER_QUOTE' }],
        [{ text: "🔄 Refresh Panel", callback_data: 'REFRESH_PANEL' }],
    ];

    const replyMarkup = { inline_keyboard: keyboard };
    const panelMessageId = await readKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID);

    let result = { success: false, messageId: null };

    if (panelMessageId) {
        // 1. පණිවිඩය තිබේ නම්, එය Edit කරන්න.
        const editResult = await editPhotoCaption(ownerChatId, parseInt(panelMessageId), caption, replyMarkup);
        
        // 2. Edit සාර්ථක නම් (Telegram API returns {ok: true})
        if (editResult && editResult.ok) { 
            result = { success: true, messageId: parseInt(panelMessageId) };
        } else {
            // 3. Edit අසමත් වුවහොත් (පරණ ID, Message Deleted), අලුතින් යවන්න.
            result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
        }
    } else {
        // 4. කිසිදු ID එකක් KV එකේ නොමැති නම්, අලුතින් යවන්න.
        result = await sendUnifiedMessage(ownerChatId, caption, 'Markdown', OWNER_PANEL_IMAGE_URL, replyMarkup);
    }

    if (result.success && result.messageId) {
        // 5. අලුතින් යැවූ හෝ සාර්ථකව Edit වූ පසු ID එක නැවත Save කරන්න.
        await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, result.messageId.toString());
    } else if (panelMessageId && !result.success) {
        // 6. Edit කිරීමට හෝ අලුතින් යැවීමට නොහැකි වුවහොත්, ID එක Clear කරන්න.
         await writeKV(env, TRADING_KV_KEYS.OWNER_PANEL_MESSAGE_ID, null); 
    }
}


// =================================================================
// --- 3. CALLBACK QUERY HANDLER (EXPORTED) ---
// =================================================================

export async function handleCallbackQuery(query, env) {
    const data = query.data;
    const callbackQueryId = query.id;
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // 1. Owner Panel Callbacks 
    if (userId.toString() === CONFIG.OWNER_CHAT_ID.toString()) 
    {
        await answerCallbackQuery(callbackQueryId, "Processing...", false);
        const backKeyboard = [[{ text: "⬅️ Back to Panel", callback_data: 'REFRESH_PANEL' }]];
        
        // --- Owner Panel/Group Approval Callbacks ---
        if (data === 'REFRESH_PANEL') {
            await sendOwnerPanel(env);
            return;
        }
        
        // --- Trigger Commands ---
        if (data === 'TRIGGER_NEWS' || data === 'TRIGGER_EDU' || data === 'TRIGGER_QUOTE') {
            let messageText = "*✅ Triggered!*";
            if (data === 'TRIGGER_NEWS') await fetchForexNews(env, true);
            else if (data === 'TRIGGER_EDU') {
                const postContent = await generateScheduledContent(env); 
                 if (postContent) {
                    const groups = await getApprovedGroupsMap(env);
                    for (const groupChatId in groups) {
                        if (groups[groupChatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                            await sendUnifiedMessage(groupChatId, postContent, 'Markdown', null);
                        }
                    }
                    messageText = "*✅ Educational Post Triggered!*";
                } else messageText = "*❌ Educational Post Generation Failed!*";
            }
            else if (data === 'TRIGGER_QUOTE') {
                const quoteContent = await generateDailyQuote(env);
                 if (quoteContent) {
                    const groups = await getApprovedGroupsMap(env);
                    for (const groupChatId in groups) {
                        if (groups[groupChatId].permissions.includes(PERMISSIONS.MOTIVATION_POST.id)) {
                             await sendUnifiedMessage(groupChatId, quoteContent, 'Markdown', QUOTE_IMAGE_URL);
                        }
                    }
                    messageText = "*✅ Motivation Post Triggered!*";
                } else messageText = "*❌ Quote Generation Failed!*";
            }
            await editTelegramMessageWithKeyboard(chatId, messageId, messageText, backKeyboard);
            return;
        }
        
        // --- Group Approval Flow (Simplified) ---
        if (data.startsWith('GROUP_APPROVE_') || data.startsWith('TOGGLE_PERM_') || data.startsWith('SAVE_PERMS_') || data.startsWith('REJECT_GROUP_FINAL_') || data.startsWith('GROUP_REJECT_')) {
            
            if (data.startsWith('GROUP_APPROVE_')) {
                 const targetChatId = data.substring('GROUP_APPROVE_'.length);
                 const initialPermissions = Object.keys(PERMISSIONS);
                 const selectionMessage = `*🌐 Permission Selection for Group: ${targetChatId}*...`;
                 const permKeyboard = createPermissionKeyboard(targetChatId, initialPermissions, targetChatId);
                 await editTelegramMessageWithKeyboard(chatId, messageId, selectionMessage, permKeyboard);
                 return;
            }
            
             if (data.startsWith('SAVE_PERMS_')) {
                 const targetChatId = data.substring('SAVE_PERMS_'.length);
                 await addGroupWithPermissions(env, targetChatId, Object.keys(PERMISSIONS));
                 const ownerFinalMessage = `*✅ Group Approved & Saved!* \n\n*Group ID:* \`${targetChatId}\``;
                 await editTelegramMessageWithKeyboard(chatId, messageId, ownerFinalMessage, backKeyboard);
                 return;
            }
            
            if (data.startsWith('GROUP_REJECT_') || data.startsWith('REJECT_GROUP_FINAL_')) {
                 const ownerFinalMessage = `*❌ Group Request Rejected!*`;
                 await editTelegramMessageWithKeyboard(chatId, messageId, ownerFinalMessage, backKeyboard);
                 return;
            }

        }
        
    }
    
    // 2. User's Request Button Logic (Placeholder)
    if (data.startsWith('REQUEST_UNLIMIT_')) {
    }
    
    // 3. Group Access Request Button (Placeholder)
    if (data.startsWith('GROUP_REQUEST_START_')) {
    }
    
    return new Response('Callback query handled', { status: 200 });
}


// =================================================================
// --- 4. WEBHOOK HANDLER (EXPORTED) ---
// FIX: sendOwnerPanel is only called via /admin command
// =================================================================

export async function handleWebhook(request, env) {
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            return handleCallbackQuery(update.callback_query, env); 
        }

        // Handle bot added to a group/channel
        if (update.my_chat_member) {
            const memberUpdate = update.my_chat_member;
            
            if (memberUpdate.new_chat_member.status === 'member' || memberUpdate.new_chat_member.status === 'administrator') {
                const chatId = memberUpdate.chat.id;
                const chatType = memberUpdate.chat.type;

                if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
                    const approvedGroups = await getApprovedGroupsMap(env);
                    const groupData = approvedGroups[chatId.toString()];
                    
                    if (groupData) {
                        await sendUnifiedMessage(chatId, ACCESS_APPROVED_MESSAGE(chatId, groupData.permissions), 'Markdown', null);
                    } else {
                        const uniqueKey = generateRandomId(15);
                        const requestKeyboard = [[{ text: "➡️ Request Owner Approval", callback_data: `GROUP_REQUEST_START_${uniqueKey}` }]];
                        const result = await sendUnifiedMessage(chatId, ACCESS_DENIED_MESSAGE(chatId), 'Markdown', null, { inline_keyboard: requestKeyboard });
                    }
                }
            }
            return new Response('My Chat Member Update Handled', { status: 200 });
        }

        if (!update.message || !update.message.text) {
            return new Response('Not a text message or callback', { status: 200 }); 
        }
        
        const message = update.message;
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text.trim();
        const userId = message.from.id; 
        const isOwner = userId.toString() === CONFIG.OWNER_CHAT_ID.toString();
        
        const userFirstName = message.from.first_name || "User";
        
        // 1. OWNER MANUAL ID REPLY LOGIC (Placeholder)
        if (isOwner && message.reply_to_message && 
            message.reply_to_message.text && 
            message.reply_to_message.text.includes('Group ID එකක් එක් කරන්න')) 
        {
            return new Response('Owner manual ID processed', { status: 200 });
        }
        
        // 2. COMMANDS HANDLING
        const isCommand = text.startsWith('/');
        
        if (isCommand) {
            const command = text.split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);
             
            if (command === '/search') {
                if (args.length > 0) {
                    message.text = args.join(' ');
                } else {
                    await sendTelegramReply(chatId, "*⚠️ Usage:* `/search [Trading Topic]`", messageId);
                    return new Response('Search command usage error', { status: 200 });
                }
            } else if (command === '/admin') {
                 if (isOwner) { // Owner පමණක් විය යුතුය
                     await sendOwnerPanel(env);
                 }
                 return new Response('Admin command handled', { status: 200 });
            } else if (command === '/start') {
                await updateAndEditUserCount(env, userId);
                 await sendTelegramReply(chatId, `👋 *ආයුබෝවන්, ${userFirstName}!*`, messageId);
                 return new Response('Start command handled', { status: 200 });
            } 
             else {
                return new Response('Other command processed', { status: 200 });
            }
        }
        
        // 3. TRADING QUESTION LOGIC
        const isQuestion = !isCommand && text.length > 5;

        if (isQuestion) {
            
            // 3.1 Group/Channel Access Check and Q&A Permission Check
            const isGroupChat = chatId.toString().startsWith('-');
            if (isGroupChat) { 
                const hasPerm = await isGroupApprovedAndHasPermission(env, chatId, PERMISSIONS.TRADING_QNA.id);
                if (!hasPerm) {
                    return new Response('Group Access Denied - Silent Ignore', { status: 200 });
                }
            }
            
            // 3.2 Trading Validation
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...*", messageId);
            const isTradingTopic = await validateTopic(text);
            
            if (isTradingTopic) {
                const usage = await checkAndIncrementUsage(env, chatId);
                
                if (!usage.allowed) {
                     await editTelegramMessage(chatId, validationMessageId, `🚫 *Usage Limit Reached!* අද දිනට ඔබගේ සමූහයේ/පුද්ගලික ප්‍රශ්න ඇසීමේ සීමාව (${CONFIG.DAILY_LIMIT}) අවසන් වී ඇත.`);
                    return new Response('Rate limited', { status: 200 });
                }
                
                await editTelegramMessage(chatId, validationMessageId, `✍️ *සිංහල Post එකක් සකස් කරමින්...* (Used: ${usage.count}/${CONFIG.DAILY_LIMIT})`);
                const replyText = await generateReplyContent(text);
                await editTelegramMessage(chatId, validationMessageId, replyText);
                
            } else {
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer karanna.*`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage);
            }
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (e) {
        console.error("Critical Webhook Error:", e.stack);
        await sendTelegramReplyToOwner(`🚨 CRITICAL WEBHOOK ERROR: ${e.message}`);
        return new Response('Internal Server Error', { status: 500 });
    }
}
