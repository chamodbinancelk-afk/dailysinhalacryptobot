// group_management.js

import { TRADING_KV_KEYS, PERMISSIONS } from './config.js';

// --- In-memory State Simulation for KV Storage ---
// Node.js Bot නැවත ආරම්භ කරන විට මෙම දත්ත නැති වී යයි!
// ස්ථිර ගබඩාවක් අවශ්‍ය නම් File System හෝ DB එකක් යොදන්න.

const globalState = {
    [TRADING_KV_KEYS.APPROVED_GROUPS]: {},
    // ... [other keys from TRADING_KV_KEYS will be stored here]
    'usage:2025-10-28:-123456': '1', // Example usage
};


// --- Simplified KV Utilities (In-Memory) ---

export function readKV(key, type = 'text') {
    const value = globalState[key];
    if (value === undefined || value === null) return null;
    
    if (type === 'json') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return null;
        }
    }
    return value;
}

export function writeKV(key, value, options = {}) {
    globalState[key] = String(value);
    // Note: Node.js in-memory simulation does not handle expirationTtl
}

// --- Group Management Logic ---

export async function getApprovedGroupsMap() {
    const raw = readKV(TRADING_KV_KEYS.APPROVED_GROUPS, 'json');
    return raw && typeof raw === 'object' ? raw : {};
}

export async function isGroupApprovedAndHasPermission(chatId, permission) {
    const approvedGroups = await getApprovedGroupsMap();
    const groupData = approvedGroups[chatId.toString()];
    
    return groupData && groupData.permissions && groupData.permissions.includes(permission);
}

export async function addGroupWithPermissions(chatId, permissions) {
    const approvedGroups = await getApprovedGroupsMap();
    const chatIdString = chatId.toString();
    
    approvedGroups[chatIdString] = {
        permissions: permissions,
        added_timestamp: Date.now(),
    };
    await writeKV(TRADING_KV_KEYS.APPROVED_GROUPS, JSON.stringify(approvedGroups));
    return true;
}

// --- Rate Limiting Logic (Simplified) ---

import moment from 'moment-timezone';
import { CONFIG } from './config.js';

export async function checkAndIncrementUsage(chatId) {
    if (chatId.toString() === CONFIG.OWNER_CHAT_ID.toString()) {
        return { allowed: true, count: 'Unlimited' };
    }

    const today = moment().tz(CONFIG.COLOMBO_TIMEZONE).format('YYYY-MM-DD');
    const KV_KEY = `usage:${today}:${chatId}`;
    
    const currentUsage = parseInt(readKV(KV_KEY) || '0');
    const limit = CONFIG.DAILY_LIMIT;

    if (currentUsage >= limit) {
        return { allowed: false, count: currentUsage, kvKey: KV_KEY };
    }

    writeKV(KV_KEY, (currentUsage + 1).toString());
    
    return { allowed: true, count: currentUsage + 1, kvKey: KV_KEY };
}
