import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf } from 'telegraf';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
// @ts-ignore
import steamTotp from 'steam-totp';

const DATA_FILE = path.join(process.cwd(), 'data.json');

interface Account {
  name: string;
  type: 'auto' | 'manual';
  value: string;
}

let telegramBot: Telegraf | null = null;
let telegramBotStatus: 'offline' | 'online' | 'error' = 'offline';

// Helper functions for Database
async function getAccounts(): Promise<Account[]> {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function saveAccounts(accounts: Account[]) {
  await fs.writeFile(DATA_FILE, JSON.stringify(accounts, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Simple Auth Middleware
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || 'admin';
    const expectedToken = Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64');
    
    if (token === expectedToken) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  };

  // --- API Routes ---

  // Login Endpoint
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || 'admin';
    
    if (username === expectedUser && password === expectedPass) {
       const token = Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64');
       res.json({ success: true, token });
    } else {
       res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  });

  app.get('/api/status', (req, res) => {
    res.json({
        botStatus: telegramBotStatus,
        hasToken: !!process.env.TELEGRAM_BOT_TOKEN
    });
  });

  app.get('/api/accounts', requireAuth, async (req, res) => {
     const accounts = await getAccounts();
     
     // Calculate current codes if 'auto'
     const enrichedAccounts = accounts.map(acc => {
        let currentCode = acc.value;
        if (acc.type === 'auto') {
          try {
             currentCode = steamTotp.generateAuthCode(acc.value);
          } catch(e) {
             console.error("Error generating code for", acc.name, e);
          }
        }
        return { ...acc, currentCode }
     });

     // Calculate time remaining for next 30s interval
     const timeRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
     res.json({ accounts: enrichedAccounts, timeRemaining });
  });

  app.post('/api/accounts', requireAuth, async (req, res) => {
     const { name, value, type } = req.body;
     if (!name || !value) return res.status(400).json({ error: 'Missing name or value' });
     
     const accounts = await getAccounts();
     const safeName = name.trim().replace(/\\s+/g, '_').toLowerCase(); // sanitize
     
     const existingIndex = accounts.findIndex(a => a.name === safeName);
     if (existingIndex >= 0) {
        accounts[existingIndex] = { name: safeName, value: value.trim(), type };
     } else {
        accounts.push({ name: safeName, value: value.trim(), type });
     }
     
     await saveAccounts(accounts);
     res.json({ success: true });
  });

  app.delete('/api/accounts/:name', requireAuth, async (req, res) => {
     const { name } = req.params;
     let accounts = await getAccounts();
     accounts = accounts.filter(a => a.name !== name.toLowerCase());
     await saveAccounts(accounts);
     res.json({ success: true });
  });


  // --- Initialize Telegram Bot ---
  const initTelegramBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      try {
        if (telegramBot) telegramBot.stop();
        telegramBot = new Telegraf(token);
        
        telegramBot.command('start', async (ctx) => {
           const accounts = await getAccounts();
           const names = accounts.map(a => `\\/${a.name}`).join('\n');
           const msg = accounts.length > 0
              ? `مرحباً! الحسابات المتوفرة بالمخدم حالياً:\n\n${names}\n\nأرسل التوجيه الخاص بالحساب للحصول على كود ستيم جارد الخاص به.`
              : 'مرحباً! لا يوجد حسابات مسجلة بعد في قاعدة البيانات.';
           
           ctx.reply(msg);
        });

        // Listen to any text to check if it matches an account name
        telegramBot.on('text', async (ctx) => {
           const text = ctx.message.text.trim();
           if (!text.startsWith('/')) return;
           
           const command = text.substring(1).toLowerCase();
           if (command === 'start') return; // Handled above

           const accounts = await getAccounts();
           const account = accounts.find(a => a.name.toLowerCase() === command);
           
           if (account) {
             let codeStr = account.value;
             if (account.type === 'auto') {
               try {
                 codeStr = steamTotp.generateAuthCode(account.value);
               } catch (e) {
                 return ctx.reply('حدث خطأ أثناء توليد الكود التلقائي لهذا الحساب. تأكد من صحة المفتاح (Shared Secret).');
               }
             }
             ctx.reply(`كود ستيم لحساب (${account.name}) هو: \n\n\`${codeStr}\``, { parse_mode: 'Markdown' });
           } else {
             ctx.reply('لم يتم العثور على هذا الحساب بالتوجيه المذكور.');
           }
        });

        telegramBot.launch();
        telegramBotStatus = 'online';
        console.log('Telegram bot started successfully!');
      } catch (err) {
        console.error('Failed to start Telegram bot:', err);
        telegramBotStatus = 'error';
      }
    } else {
      console.log('No TELEGRAM_BOT_TOKEN provided. Telegram features disabled.');
      telegramBotStatus = 'offline';
    }
  };

  initTelegramBot();


  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful stop
  process.once('SIGINT', () => telegramBot?.stop('SIGINT'));
  process.once('SIGTERM', () => telegramBot?.stop('SIGTERM'));
}

startServer();
