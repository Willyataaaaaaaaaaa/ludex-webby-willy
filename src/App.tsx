import React, { useState, useEffect } from 'react';
import { Send, Trash2, ShieldCheck, Gamepad2, AlertCircle, RefreshCw, Clock, Bot, Lock, LogIn, Plus, Users, User } from 'lucide-react';

interface Account {
  name: string;
  type: 'auto' | 'manual';
  value: string;
  currentCode: string;
}

interface Status {
  botStatus: 'offline' | 'online' | 'error';
  hasToken: boolean;
}

export default function App() {
  // Auth State
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Dashboard State
  const [status, setStatus] = useState<Status>({ botStatus: 'offline', hasToken: false });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [localTimer, setLocalTimer] = useState<number>(30);
  const [loading, setLoading] = useState(false);

  // Form State
  const [newAccName, setNewAccName] = useState('');
  const [newAccValue, setNewAccValue] = useState('');
  const [inputType, setInputType] = useState<'manual' | 'auto'>('auto');

  // Fetch functions
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch (err) { console.error('Failed to fetch status:', err); }
  };

  const fetchAccounts = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/accounts', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts);
        if (data.timeRemaining !== undefined) setLocalTimer(data.timeRemaining);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchStatus();
    if (authToken) {
      fetchAccounts();
      const interval = setInterval(fetchAccounts, 3000);
      return () => clearInterval(interval);
    }
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    const timerInterval = setInterval(() => {
      setLocalTimer((prev) => (prev > 0 ? prev - 1 : 29));
    }, 1000);
    return () => clearInterval(timerInterval);
  }, [authToken]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Allow messages from the same origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
         return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data.token) {
        setAuthToken(event.data.token);
        localStorage.setItem('admin_token', event.data.token);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setLoginError(`تفاصيل الخطأ من جوجل: ${event.data.error}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handlers
  const handleGoogleLogin = async () => {
    try {
      setLoginError(''); // مسح الأخطاء
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(errData.error || `خطأ في الخادم: ${response.status}`);
      }
      const { url } = await response.json();
      const authWindow = window.open(url, 'google_oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        setLoginError('تم حظر النافذة المنبثقة! يرجى السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع من إعدادات المتصفح.');
      }
    } catch (err: any) {
      console.error(err);
      setLoginError(`يوجد مشكلة: ${err.message}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();

      if (res.ok && data.success) {
        setAuthToken(data.token);
        localStorage.setItem('admin_token', data.token);
        setUsername('');
        setPassword('');
      } else {
        setLoginError(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err: any) {
      console.error(err);
      setLoginError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
    }
    
    setLoading(false);
  };

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('admin_token');
    setAccounts([]);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccValue.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ 
          name: newAccName.trim(), 
          value: newAccValue.trim(), 
          type: inputType 
        }),
      });
      if (res.ok) {
        setNewAccName('');
        setNewAccValue('');
        fetchAccounts();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`هل أنت متأكد من حذف الحساب ${name}؟`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${name}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) fetchAccounts();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // --- LOGIN SCREEN ---
  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-4 rounded-full shadow-lg shadow-blue-500/30">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-2">تسجيل الدخول</h1>
          <p className="text-slate-400 text-center mb-8 text-sm">أدخل اسم المستخدم وكلمة المرور للوصول إلى لوحة تحكم الحسابات</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder="اسم المستخدم"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                  required
                />
              </div>
            </div>
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                   <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                  required
                />
              </div>
            </div>
            {loginError && <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg">{loginError}</div>}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition flex justify-center items-center space-x-2 space-x-reverse"
            >
              <LogIn className="w-5 h-5" />
              <span>{loading ? 'جاري الدخول...' : 'تسجيل الدخول'}</span>
            </button>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">أو</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 rounded-xl transition flex justify-center items-center space-x-2 space-x-reverse border border-gray-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>تسجيل الدخول عبر Google</span>
            </button>
          </form>
        </div>
      </div>
    );
  }


  // --- DASHBOARD SCREEN ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-500/20 ml-3">
              <Gamepad2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ستيم جارد بوت</h1>
              <p className="text-slate-400 text-sm">قاعدة بيانات الحسابات - التحكم بالأوامر</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm transition self-start md:self-auto"
          >
            تسجيل الخروج
          </button>
        </div>

        {/* Telegram Alert */}
        {!status.hasToken && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 ml-2" />
            <div className="text-sm text-amber-200/90">
              <strong className="block font-semibold text-amber-500 mb-1">تيليجرام غير مفعل</strong>
              الرجاء إضافة <code className="bg-amber-950/50 px-1.5 py-0.5 rounded text-amber-300">TELEGRAM_BOT_TOKEN</code> في قسم الأسرار لكي يتمكن البوت من الرد على أوامر المستخدمين.
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          
          {/* Main Content (Accounts List) */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold flex items-center">
                  <Users className="w-5 h-5 ml-2 text-blue-400" />
                  الحسابات المسجلة ({accounts.length})
                </h2>
                <div className="text-sm font-mono text-slate-400 flex items-center bg-slate-900 px-3 py-1 rounded-full">
                  <Clock className="w-4 h-4 ml-2" />
                  التحديث بعد: <span className="mr-2 text-blue-400 font-bold">{localTimer}</span>ث
                </div>
              </div>

              {accounts.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-700/50 border-dashed">
                  <p className="text-slate-500 text-sm">لا يوجد حسابات مسجلة حالياً.<br/>أضف حساباً لتبدأ.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {accounts.map(acc => (
                    <div key={acc.name} className="bg-slate-900/80 p-5 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      
                      <div>
                         <div className="flex items-center space-x-2">
                           <span className="font-bold text-lg font-mono ml-2 text-white">/{acc.name}</span>
                           {acc.type === 'auto' ? (
                             <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded flex items-center border border-blue-500/30">
                               <RefreshCw className="w-3 h-3 ml-1 animate-spin-slow" /> تلقائي
                             </span>
                           ) : (
                             <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded border border-slate-600">
                               يدوي
                             </span>
                           )}
                         </div>
                         <p className="text-xs text-slate-500 mt-2 truncate max-w-[200px]" dir="ltr">{acc.value.substring(0,6)}********</p>
                      </div>

                      <div className="flex items-center space-x-4 space-x-reverse w-full sm:w-auto">
                        <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-800 text-emerald-400 font-mono text-xl tracking-widest text-center flex-1 sm:flex-none">
                          {acc.currentCode || '------'}
                        </div>
                        <button
                          onClick={() => handleDelete(acc.name)}
                          className="text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 p-2.5 rounded-lg transition"
                          title="حذف الحساب"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar (Add Account & Status) */}
          <div className="space-y-6">
            
            {/* Status */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700/50 flex justify-between items-center">
              <div className="flex items-center">
                <Bot className={`w-8 h-8 ml-3 ${status.botStatus === 'online' ? 'text-green-500' : 'text-slate-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-300">حالة التيليجرام</p>
                  <p className="text-xs text-slate-500">{status.botStatus === 'online' ? 'يعمل ويستقبل الأوامر' : 'متوقف عن العمل'}</p>
                </div>
              </div>
              <span className={`relative flex h-3 w-3`}>
                {status.botStatus === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${status.botStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'}`}></span>
              </span>
            </div>

            {/* Add New Account Form */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700/50">
              <h3 className="font-semibold mb-4 border-b border-slate-700 pb-2">إضافة حساب جديد</h3>
              
              <div className="flex mb-4 bg-slate-900 p-1 rounded-lg">
                <button
                  onClick={() => setInputType('auto')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition ${inputType === 'auto' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                >توليد تلقائي</button>
                <button
                  onClick={() => setInputType('manual')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition ${inputType === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                >كود يدوي</button>
              </div>

              <form onSubmit={handleAddAccount} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">اسم الحساب (الأمر الخاص به)</label>
                  <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg">
                    <span className="pl-2 pr-3 text-slate-500 font-mono">/</span>
                    <input
                      type="text"
                      required
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="ahmed"
                      className="w-full bg-transparent py-2.5 text-sm text-white focus:outline-none font-mono"
                      dir="ltr"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">حروف إنجليزية وأرقام فقط (مثال: ahmed)</p>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    {inputType === 'auto' ? 'المفتاح السري (Shared Secret)' : 'كود الدخول الثابت'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccValue}
                    onChange={(e) => setNewAccValue(e.target.value)}
                    placeholder={inputType === 'auto' ? "y+xxxxxx...=" : "A1B2C"}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                    dir="ltr"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !newAccName || !newAccValue}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium transition flex justify-center items-center space-x-2 space-x-reverse"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة الحساب للحماية</span>
                </button>
              </form>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
