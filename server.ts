import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf } from 'telegraf';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';
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
      return next();
    }
    
    const jwtSecret = process.env.JWT_SECRET || 'super-secret-key';
    try {
       jwt.verify(token, jwtSecret);
       return next();
    } catch(err) {
       return res.status(403).json({ error: 'Forbidden' });
    }
  };

  // --- API Routes ---

  // Google OAuth Endpoints
  app.get('/api/auth/google/url', (req, res) => {
    // Prevent caching 404s or stale URLs
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'مفتاح GOOGLE_CLIENT_ID مفقود! لم تقم بإضافته في الأسرار (Secrets).' });
    }
    const origin = req.headers.origin || req.headers.referer || `https://${req.headers.host}`;
    const redirectUri = `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent'
    });

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get(['/api/auth/google/callback', '/api/auth/google/callback/'], async (req, res) => {
    const { code } = req.query;
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

    if (!GOOGLE_CLIENT_SECRET) {
      return res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'مفتاح GOOGLE_CLIENT_SECRET مفقود من الأسرار' }, '*');
            window.close();
          }
        </script></body></html>
      `);
    }
    
    // We get the origin from the request or provide a fallback. In an iframe, referer might be useful if origin is null.
    // However, for proxy setups, we will pass the redirect_uri that was used.
    // The exact redirect_uri must match. Best is to use the host.
    const redirectUri = `https://${req.get('host')}/api/auth/google/callback`;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID || '',
          client_secret: GOOGLE_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenRes.json();
      
      if (!tokenData.id_token) {
         throw new Error('No id_token received');
      }

      // decode the id_token to get email
      const decoded = jwt.decode(tokenData.id_token) as any;
      
      if (!decoded || !decoded.email) {
         throw new Error('Could not decode email');
      }

      if (ADMIN_EMAIL && decoded.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
         throw new Error('Unauthorized email');
      }

      // Generate app token
      const jwtSecret = process.env.JWT_SECRET || 'super-secret-key';
      const appToken = jwt.sign({ email: decoded.email }, jwtSecret, { expiresIn: '7d' });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${appToken}' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch(err: any) {
      console.error(err);
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${err.message}' }, '*');
                window.close();
              }
            </script>
            <p>Authentication failed: ${err.message}</p>
          </body>
        </html>
      `);
    }
  });

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
