// index.js (Main Entry File for Node.js)

import { CONFIG, PERMISSIONS } from './config.js';
import { handleWebhook, fetchForexNews } from './main_logic.js';
import { generateScheduledContent } from './ai_services.js';
import { sendTelegramMessage } from './telegram.js';

// --- (Optionally: Use an HTTP server like Express to receive webhooks) ---
/*
import express from 'express';
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
    const result = await handleWebhook(req.body); 
    res.status(result.status).send(result.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT}`);
});
*/

// --- Option 2: Simulation for Scheduled Task (GitHub Actions) ---

async function runScheduledTask() {
    console.log("Starting scheduled tasks...");

    const groups = await getApprovedGroupsMap(); // Assumes getApprovedGroupsMap is imported/accessible

    // 1. News Posting
    console.log("Fetching and posting Forex News...");
    await fetchForexNews(false);

    // 2. Educational Post Generation & Posting
    const postContent = await generateScheduledContent(); 
    if (postContent) {
        console.log("Posting Daily Educational Content...");
        for (const chatId in groups) {
            if (groups[chatId].permissions.includes(PERMISSIONS.DAILY_POST.id)) {
                await sendTelegramMessage(chatId, postContent);
            }
        }
    }
    
    // 3. (You can add Daily Quote posting here too)
    
    console.log("Scheduled tasks finished.");
}

// ඔබ Node.js සරලව run කිරීමට නම්:
// runScheduledTask(); 

// --- Webhook Simulation (Manual Test) ---
async function manualWebhookTest() {
    const testMessage = {
        message: {
            text: "/search What is Liquidity in Forex?",
            chat: { id: CONFIG.OWNER_CHAT_ID, type: 'private' },
            message_id: 12345,
            from: { id: CONFIG.OWNER_CHAT_ID, first_name: "Owner" }
        }
    };
    console.log("\n--- Running Manual Q&A Test ---");
    await handleWebhook(testMessage);
}

// manualWebhookTest();
