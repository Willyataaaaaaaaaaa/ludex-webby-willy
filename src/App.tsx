import React, { useState, useEffect } from 'react';
import { Send, Trash2, ShieldCheck, Gamepad2, AlertCircle, RefreshCw, Clock, Bot, Lock, LogIn, Plus, Users } from 'lucide-react';
import { supabase, hasSupabaseConfig } from './lib/supabase';

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
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
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

  // Load Initial Session using Supabase
  useEffect(() => {
    if (!hasSupabaseConfig) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null);
    }).catch(err => console.error("Supabase Session Error:", err));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  // Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    
    if (!hasSupabaseConfig) {
      setLoginError('قاعدة بيانات Supabase غير متصلة. يرجى إضافة SUPABASE_URL و SUPABASE_ANON_KEY في الإعدادات.');
      setLoading(false);
      return;
    }

    try {
      // Login using Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoginError(error.message === 'Invalid login credentials' ? 'البريد أو كلمة المرور غير صحيحة' : error.message);
      } // Token comes automatically via onAuthStateChange
    } catch (err: any) {
      console.error(err);
      setLoginError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت ومن إعدادات Supabase.');
    }
    
    setLoading(false);
  };

  const handleLogout = async () => {
    if (hasSupabaseConfig) {
      await supabase.auth.signOut();
    }
    setAuthToken(null);
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
            <div className="bg-emerald-600 p-4 rounded-full shadow-lg shadow-emerald-500/30">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-2">تسجيل الدخول (Supabase)</h1>
          <p className="text-slate-400 text-center mb-8 text-sm">أدخل البريد وكلمة المرور للولوج للوحة الحسابات</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                dir="ltr"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                dir="ltr"
                required
              />
            </div>
            {loginError && <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg">{loginError}</div>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition flex justify-center items-center space-x-2 space-x-reverse"
            >
              <LogIn className="w-5 h-5 ml-2" />
              <span>{loading ? 'جاري الدخول...' : 'تسجيل الدخول'}</span>
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
