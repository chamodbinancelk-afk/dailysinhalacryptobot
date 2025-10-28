// ai_services.js

import { CONFIG, TRADING_KV_KEYS } from './config.js';
import { readKV, writeKV } from './group_management.js'; // Use the in-memory KV sim

// --- Gemini API Call Base ---

async function callGeminiAPI(systemPrompt, userQuery, temperature = 0.5) {
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature: temperature } 
            }),
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
    } catch (e) {
        console.error("Gemini API Call Failed:", e);
        return null;
    }
}

// --- Specific AI Functions ---

export async function getAIAnalysis(headline, description) {
    const userQuery = `Headline: "${headline}". Description: "${description}". Based on this forex news, provide a very short (max 3 sentences), high-impact analysis of the expected market movement in Sinhala. Conclude with a clear emoji (e.g., 🚀, 📉, ⚠️).`;
    const systemPrompt = `You are a financial market analyst.`;
    
    const result = await callGeminiAPI(systemPrompt, userQuery, 0.2);
    return result || "⚠️ AI විශ්ලේෂණය අසාර්ථක විය.";
}

export async function generateReplyContent(query) {
    const systemPrompt = `
        You are a Trading Assistant specializing in Forex, Crypto, and Stock markets. Your goal is to answer user questions accurately, professionally, and helpfully in **SINHALA LANGUAGE**.
        The response MUST be structured into exactly **5 detailed paragraphs** to fully explain the concept. Format the final output using Telegram's **Markdown**.`;
    
    const content = await callGeminiAPI(systemPrompt, query, 0.5);
    
    return content 
        ? content + "\n\n---\n*💡 තවත් ප්‍රශ්න තිබේද? දැන්ම අසන්න!*"
        : "*⚠️ AI Generation Error.*";
}

export async function validateTopic(userQuestion) {
    const systemPrompt = `You are an AI classifier. Your task is to determine if the user's query is strictly related to **Trading, Finance, Investing, Cryptocurrency, Forex, or the Stock Market**. Respond ONLY with the word "YES" or "NO".`;
    
    const result = await callGeminiAPI(systemPrompt, userQuestion, 0.1);
    
    return result?.toUpperCase() === 'YES';
}

export async function generateScheduledContent() {
    // Logic remains mostly the same, but uses the simulated KV
    const coveredTopicsRaw = readKV(TRADING_KV_KEYS.COVERED_TOPICS) || "[]";
    const coveredTopics = JSON.parse(coveredTopicsRaw);

    const systemPrompt = `You are an expert financial market educator. Your task is to generate a detailed, easy-to-understand educational post about a single fundamental trading topic for a beginner to intermediate audience in Sinhala. The content MUST be exactly **5 paragraphs** long. ...`;
    
    const userQuery = `Generate today's comprehensive, **5-paragraph** educational post. Exclude these topics: ${coveredTopics.join(', ')}. Focus on an important concept...`;

    const content = await callGeminiAPI(systemPrompt, userQuery, 0.9);

    if (content) {
        // ... [Update KV logic as in original file] ...
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const firstLine = lines[0] || 'Unknown Topic';
        const newTopic = firstLine.replace(/[\*#]/g, '').substring(0, 50).trim(); 
        
        coveredTopics.push(newTopic);
        if (coveredTopics.length > 30) coveredTopics.shift(); 
        
        await writeKV(TRADING_KV_KEYS.COVERED_TOPICS, JSON.stringify(coveredTopics));
        await writeKV(TRADING_KV_KEYS.LAST_TRADING_TOPIC, newTopic);
        await writeKV(TRADING_KV_KEYS.LAST_EDU_CONTENT, content); 
        return content;
    }
    return null;
}
