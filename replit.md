# Forex News Bot

## Overview
A Telegram bot that automatically scrapes the latest news from ForexFactory, translates it to Sinhala, and posts it to a Telegram channel or group.

## Recent Changes
- **2025-10-09**: Initial setup on Replit
  - Installed all required Python dependencies
  - Configured project structure and .gitignore
  - Set up workflow for continuous bot operation

## Features
- Scrapes news headlines from ForexFactory news page
- Fetches detailed news content and images
- Translates headlines and descriptions to Sinhala (සිංහල)
- Posts formatted messages to Telegram with images
- Runs continuously, checking for new headlines
- Timestamps in Sri Lanka timezone (Asia/Colombo)

## Dependencies
- beautifulsoup4 - Web scraping
- googletrans==4.0.0rc1 - Translation service
- python-dotenv - Environment variable management
- python-telegram-bot==13.15 - Telegram bot API
- requests - HTTP requests
- pytz - Timezone handling

## Configuration
Required environment variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token from @BotFather
- `TELEGRAM_CHAT_ID` - The Telegram chat/channel ID to post to
- `FOREXFACTORY_NEWS_URL` (optional) - Defaults to https://www.forexfactory.com/news
- `FETCH_INTERVAL_SEC` (optional) - Check interval in seconds, defaults to 1

## How It Works
1. Bot fetches the latest news from ForexFactory
2. Compares with last posted headline to avoid duplicates
3. If new, fetches full article details and image
4. Translates content to Sinhala
5. Posts to Telegram with formatted message
6. Repeats continuously

## User Preferences
- Default language: Sinhala (සිංහල) for translations
- Timezone: Asia/Colombo (Sri Lanka)
- Developer signature: Mr Chamo 🇱🇰
