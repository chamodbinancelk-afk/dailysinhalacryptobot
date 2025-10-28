// group_management.js

import { readKV, writeKV } from './telegram.js'; 
import { CONFIG, TRADING_KV_KEYS, PERMISSIONS } from './config.js';
import moment from 'moment-timezone'; 

// -------------------------------------------------------------
// ID GENERATION & UTILITIES (Exported)
// -------------------------------------------------------------

export function generateRandomId(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// -------------------------------------------------------------
// GROUP PERMISSIONS & ACCESS
// -------------------------------------------------------------

export async function getApprovedGroupsMap(env) {
    const groups = await readKV(env, TRADING_KV_KEYS.GROUP_PERMISSIONS);
    return groups || {};
}

export async function isGroupApprovedAndHasPermission(env, chatId, permissionId) {
    const groups = await getApprovedGroupsMap(env);
    const groupData = groups[chatId.toString()];
    return groupData && groupData.permissions.includes(permissionId);
}

export async function addGroupWithPermissions(env, chatId, permissionIds) {
    const groups = await getApprovedGroupsMap(env);
    groups[chatId.toString()] = { 
        id: chatId.toString(), 
        permissions: permissionIds 
    };
    await writeKV(env, TRADING_KV_KEYS.GROUP_PERMISSIONS, groups);
}

// -------------------------------------------------------------
// RATE LIMITING
// -------------------------------------------------------------

export async function checkAndIncrementUsage(env, chatId) {
    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const usageKey = TRADING_KV_KEYS.GROUP_USAGE + ':' + today;
    
    const usageMap = await readKV(env, usageKey) || {};
    const chatUsage = usageMap[chatId.toString()] || 0;
    
    const allowed = chatUsage < CONFIG.DAILY_LIMIT;
    
    if (allowed) {
        usageMap[chatId.toString()] = chatUsage + 1;
        await writeKV(env, usageKey, usageMap);
        
        // Also increment global QNA count
        const globalQnaCountKey = TRADING_KV_KEYS.DAILY_QNA_COUNT + ':' + today;
        const totalQnaRequests = parseInt(await readKV(env, globalQnaCountKey) || '0');
        await writeKV(env, globalQnaCountKey, (totalQnaRequests + 1).toString());
    }
    
    return { allowed, count: chatUsage + 1 };
}

// -------------------------------------------------------------
// USER TRACKING (Exported)
// -------------------------------------------------------------

export async function updateAndEditUserCount(env, userId) {
    const userSetRaw = await readKV(env, TRADING_KV_KEYS.BOT_USER_SET, 'text');
    let userSet = userSetRaw ? JSON.parse(userSetRaw) : [];

    if (!Array.isArray(userSet)) userSet = [];
    
    const userIdStr = userId.toString();
    
    if (!userSet.includes(userIdStr)) {
        userSet.push(userIdStr);
        await writeKV(env, TRADING_KV_KEYS.BOT_USER_SET, userSet);

        // Increment daily count
        const dailyCount = parseInt(await readKV(env, TRADING_KV_KEYS.DAILY_COUNT_KEY) || '0');
        await writeKV(env, TRADING_KV_KEYS.DAILY_COUNT_KEY, (dailyCount + 1).toString());
    }
}
