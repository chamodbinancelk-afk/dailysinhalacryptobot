// ai_services.js

import { CONFIG, TRADING_KV_KEYS } from './config.js';
import { readKV, writeKV } from './telegram.js'; 
import { load } from 'cheerio'; 
import moment from 'moment-timezone'; 

// -------------------------------------------------------------
// GEMINI API UTILITY
// -------------------------------------------------------------
async function generateContent(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        })
    });
    
    const data = await response.json();
    
    if (data.error) {
        console.error("Gemini API Error:", data.error.message);
        return null;
    }

    try {
        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("Failed to parse Gemini response:", e.message);
        return null;
    }
}

// -------------------------------------------------------------
// NEWS SCRAPING (Exported)
// -------------------------------------------------------------

export async function getLatestForexNews() {
    const url = 'https://www.forexfactory.com/calendar';
    
    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = load(html);
        
        // Simplified selector for demonstration
        const nextEventRow = $('.calendar__row--holiday .calendar__row--grey'); 
        
        if (nextEventRow.length === 0) return null;
        
        const event = {
            time: nextEventRow.find('.calendar__cell--time').text().trim(),
            currency: nextEventRow.find('.calendar__cell--currency').text().trim(),
            impact: nextEventRow.find('.calendar__cell--impact .impact-icon--high').length ? 'High' : (nextEventRow.find('.impact-icon--medium').length ? 'Medium' : 'Low'),
            headline: nextEventRow.find('.calendar__cell--event a').text().trim(),
            description: nextEventRow.find('.calendar__cell--notes .calendar__note-placeholder').attr('data-content') || '',
            image: 'https://i.imgur.com/forex_news_placeholder.png' 
        };
        
        if (!event.headline) return null;
        return event;
    } catch (e) {
        console.error("Scraping failed:", e.message);
        return null;
    }
}

// -------------------------------------------------------------
// AI ANALYSIS & QNA
// -------------------------------------------------------------

export async function getAIAnalysis(headline, description, env) {
    const prompt = `You are an expert forex and crypto market analyst. Analyze the following news event and provide a concise, neutral analysis (around 150 words) in **Sinhala**. Focus on the potential impact on ${headline}'s currency/asset. ...`; // Full prompt omitted for brevity
    return generateContent(prompt);
}

export async function validateTopic(text) {
    const prompt = `Is the following user input primarily about Trading, Finance, or Cryptocurrency? Answer only 'YES' or 'NO'. Input: "${text}"`;
    const response = await generateContent(prompt);
    return response && response.trim().toUpperCase().includes('YES');
}

export async function generateReplyContent(text) {
    const prompt = `The user asked: "${text}". You are a highly knowledgeable Sinhala Trading, Finance, and Crypto Expert. Provide a detailed, easy-to-understand explanation (around 200-300 words) in **Sinhala**...`; // Full prompt omitted for brevity
    return generateContent(prompt);
}


// -------------------------------------------------------------
// SCHEDULED CONTENT (Exported)
// -------------------------------------------------------------

export async function generateScheduledContent(env) {
    const lastTopic = await readKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC) || 'Risk Management';
    const newTopic = 'Forex Market Basics: Understanding Pips and Lots'; 
    await writeKV(env, TRADING_KV_KEYS.LAST_TRADING_TOPIC, newTopic);

    const prompt = `You are a professional Sinhala Trading Educator. Write a 5-paragraph educational post in **Sinhala** on the topic: "${newTopic}"...`; // Full prompt omitted for brevity
    
    const content = await generateContent(prompt);
    
    if (content) {
        return `📚 *DAILY TRADING EDUCATIONAL POST*\n\n${content}\n\n*#SinhalaTrading #ForexEducation*`;
    }
    return null;
}

export async function generateDailyQuote(env) {
     const lastTopic = await readKV(env, TRADING_KV_KEYS.LAST_QUOTE_TOPIC) || 'Patience in Trading';
    const newTopic = 'Discipline in Trading'; 
    await writeKV(env, TRADING_KV_KEYS.LAST_QUOTE_TOPIC, newTopic);

    const prompt = `You are a motivational speaker specializing in financial discipline. Create a short, high-impact motivational quote (2-3 sentences max) in **Sinhala** focusing on: "${newTopic}". Include the Sinhala quote and its English translation. Use bold text.`;
    
    const content = await generateContent(prompt);
    
    if (content) {
        return `🔥 *DAILY MOTIVATIONAL QUOTE*\n\n${content}\n\n_Stay disciplined!_`;
    }
    return null;
}
