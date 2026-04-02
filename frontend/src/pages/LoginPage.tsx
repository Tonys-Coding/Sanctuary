import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {useAuth } from '../contexts/AuthContext';

const LoginPage = () => {

    //creating state for username & password using useState
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            //calling login function with username and password 
            await login({ username, password });

            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || "Login failed, please try again. ");
        } finally {
            setIsLoading(false);
        }
    };

    return (
    (
    <div className="bg-celestial min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* God rays effect */}
      <div className="god-rays">
        <div className="ray" style={{ transform: 'translateX(-50%) rotate(-45deg)' }}></div>
        <div className="ray" style={{ transform: 'translateX(-50%) rotate(-25deg)', height: '80vh', opacity: 0.7 }}></div>
        <div className="ray" style={{ transform: 'translateX(-50%) rotate(0deg)', width: '300px', opacity: 0.5 }}></div>
        <div className="ray" style={{ transform: 'translateX(-50%) rotate(25deg)', height: '90vh', opacity: 0.6 }}></div>
        <div className="ray" style={{ transform: 'translateX(-50%) rotate(45deg)' }}></div>
      </div>
      <div className="clouds"></div>

      <div className="w-full max-w-md flex flex-col items-center gap-8 relative z-10">
        {/* Logo/Header */}
        <div className="text-center">
          <img 
            src="/assets/logo/logo.png" 
            alt="Sanctuary Logo" 
            className="w-32 h-32 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-black tracking-wider mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
            SANCTUARY
          </h1>
          <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent mb-2"></div>
          <p className="text-xs text-black tracking-wide uppercase">Offering Management</p>
        </div>

        {/* Login Card */}
        <div className="w-full bg-white/75 backdrop-blur-md p-8 rounded-2xl smooth-shadow border-2 border-[#D4AF37]/30 relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#D4AF37]/20 rounded-full blur-3xl pointer-events-none"></div>

          <div className="text-center mb-8 relative z-10">
            <h2 className="text-4xl mb-2 text-black font-bold tracking-tight" style={{ fontFamily: 'Newsreader, serif' }}>
              Welcome Back
            </h2>
            <p className="text-black text-sm font-semibold">
              Please enter your details to sign in.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-800 px-4 py-3 rounded mb-6">
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            <div className="space-y-1">
              <label className="block text-sm text-black font-bold tracking-wide" style={{ fontFamily: 'Newsreader, serif' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full rounded-lg border-2 border-gray-300 bg-white/70 focus:border-[#D4AF37] focus:ring-[#D4AF37] text-sm py-2.5 px-4 transition-shadow text-black placeholder-gray-500 font-medium"
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm text-black font-bold tracking-wide" style={{ fontFamily: 'Newsreader, serif' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border-2 border-gray-300 bg-white/70 focus:border-[#D4AF37] focus:ring-[#D4AF37] text-sm py-2.5 px-4 transition-shadow text-black placeholder-gray-500 font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border-2 border-[#D4AF37] rounded-xl shadow-lg text-sm font-bold text-white bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#9B7506] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D4AF37] transition-all transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Newsreader, serif' }}
            >
              {isLoading ? 'Signing in...' : 'Sign in to Account'}
            </button>
          </form>

          <div className="mt-8 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#D4AF37]/30"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white/60 text-black font-semibold rounded backdrop-blur-sm">
                  Don't have an account?
                </span>
              </div>
            </div>
            <div className="mt-6 text-center">
              
              <a href="/register"
                className="text-sm font-bold text-black border-2 border-[#D4AF37]/50 bg-white/60 px-6 py-2 rounded-lg hover:bg-[#D4AF37] hover:text-white hover:border-[#D4AF37] transition-all shadow-sm inline-block"
                style={{ fontFamily: 'Newsreader, serif' }}
              >
                Register New Account
              </a>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-white/90 mt-4 drop-shadow-md">
          © 2024 Sanctuary Offering Management System. All rights reserved.
        </p>
      </div>
    </div>
  )
);
};


export default LoginPage;