export async function handleTradingWebhook(request, env, CONFIG) { 
    try {
        const update = await request.json();
        
        if (update && update.callback_query) {
            // handleCallbackQuery වෙත CONFIG යවන්න
            return handleCallbackQuery(update.callback_query, env, CONFIG);
        }

        if (update && update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text.trim();
            const userId = message.from.id; 
            
            const userFirstName = message.from.first_name || "N/A";
            const userName = message.from.username ? `@${message.from.username}` : "N/A";


            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/send_count_post')) {
                const result = await sendInitialCountPost(env, chatId, CONFIG); 
                await sendTelegramReply(chatId, result.message, messageId, CONFIG); 
                return new Response('Count post command processed', { status: 200 });
            }

            if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString() && text.startsWith('/unlimit')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    const targetChatId = parts[1].trim();
                    const today = new Date().toISOString().slice(0, 10);
                    const KV_KEY = `usage:${today}:${targetChatId}`;
                    
                    await env.POST_STATUS_KV.delete(KV_KEY);
                    
                    const successMessage = `✅ *User Limit Removed!* \n\nUser ID: \`${targetChatId}\` ගේ දෛනික සීමාව (limit eka) අද දින සඳහා සාර්ථකව ඉවත් කරන ලදී.`;
                    await sendTelegramReply(chatId, successMessage, messageId, CONFIG); 
                    return new Response('Admin command processed', { status: 200 });
                } else {
                    await sendTelegramReply(chatId, "⚠️ *Usage:* /unlimit [User_Chat_ID_Eka]", messageId, CONFIG); 
                    return new Response('Admin command error', { status: 200 });
                }
            }


            if (text.startsWith('/')) {
                const command = text.split(' ')[0].toLowerCase();
                
                // 🛑 FIX: /start සහ /help commands ඉවත් කර ඇත.
                // Trading Logic එකෙන් handled නොවන ඕනෑම command එකක් news-logic.js වෙත යැවීම සඳහා null ආපසු යවනු ලැබේ.
                return null;
            }
            
            // --- NON-COMMAND TRADING QUESTION LOGIC START ---

            // 1. 🚦 Trading Validation
            const validationMessageId = await sendTelegramReply(chatId, "⏳ *ප්‍රශ්නය පරීක්ෂා කරමින්...* (Topic Validating)", messageId, CONFIG); 
            const isTradingTopic = await validateTopic(text, CONFIG); 
            
            if (isTradingTopic) {
                
                // 2. 🛑 Rate Limit Check
                const usageResult = await checkAndIncrementUsage(env, chatId, CONFIG); 
                
                if (!usageResult.allowed) {
                    const limitMessage = `🛑 *Usage Limit Reached!* \n\nSorry, oyage **Trading Questions 5** (limit eka) ada dawasata iwarai. \n\n*Reset wenawa:* Midnight 12.00 AM walata. \n\n*Owner ge Approval one nam, Request karanna!*`;
                    
                    const requestId = `REQ_${generateRandomId()}`;
                    const requestData = {
                        userChatId: chatId,
                        userMessageId: validationMessageId, 
                        targetUserId: userId,
                        userFirstName: userFirstName,
                        userName: userName
                    };
                    await env.POST_STATUS_KV.put(`UNLIMIT_REQUEST_${requestId}`, JSON.stringify(requestData), { expirationTtl: 86400 });

                    const keyboard = [
                        [{ text: "👑 Request Owner Approval", callback_data: `REQUEST_UNLIMIT_${requestId}` }]
                    ];
                    
                    await editTelegramMessageWithKeyboard(chatId, validationMessageId, limitMessage, keyboard, CONFIG); 
                    return new Response('Rate limited with inline request button', { status: 200 });
                }
                
                // 3. 🌐 Searching Status 
                await editTelegramMessage(chatId, validationMessageId, "🌐 *Web එක Search කරමින්...* (Finding up-to-date info)", CONFIG); 
                
                // 4. 🧠 Generation Status 
                await sendTypingAction(chatId, CONFIG); 
                await editTelegramMessage(chatId, validationMessageId, "✍️ *සිංහල Post එකක් සකස් කරමින්...* (Generating detailed reply)", CONFIG); 
                
                // 5. 🔗 Final Content Generation
                const replyText = await generateReplyContent(text, CONFIG); 
                
                // 6. ✅ Final Edit 
                await editTelegramMessage(chatId, validationMessageId, replyText, CONFIG); 
                
            } else {
                // Not a Trading Question - Guardrail Message 
                const guardrailMessage = `⚠️ *Sorry! Mama program karala thiyenne **Trading, Finance, nathnam Crypto** related questions walata witharak answer කරන්න.* \n\n*Oyage Chat ID eka:* \`${chatId}\`\n\nPlease ask karanna: 'What is RSI?' wage ekak. *Anith ewa mata denuma naha.* 😔`;
                await editTelegramMessage(chatId, validationMessageId, guardrailMessage, CONFIG); 
            }
            
        }
    } catch (e) {
        console.error("Error processing trading webhook:", e);
    }
    
    return new Response('OK', { status: 200 });
}


// --- 7. SCHEDULED HANDLER ---
// ... (handleTradingScheduled - No change) ...

// --- 8. FINAL EXPORTS (Named Exports) ---
export { 
    handleTradingWebhook, 
    handleTradingScheduled 
};
