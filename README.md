ForexNewsBot

A Telegram bot that fetches latest news from ForexFactory and posts Sinhala translations to your Telegram group/channel.

Features

- Scrapes news headlines from ForexFactory calendar  
- Translates headlines using Google Translate  
- Posts to Telegram channel or group  

Setup

1. Clone this repo.  
2. cd ForexNewsBot  
3. pip install -r requirements.txt  
4. Edit bot.py with your BOT_TOKEN and CHAT_ID.  
5. Run python bot.py  

Deployment

- Use a cloud service (e.g., Render, Railway) or a VPS  
- Make sure the script runs continuously (use screen, pm2, or service config)  
- Ensure your Telegram bot is admin in the channel or group  

Notes

- ForexFactory site structure may change; selectors might need updating  
- Translation quality depends on Google Translate
```