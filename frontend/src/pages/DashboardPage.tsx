import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI } from '../utils/api';
import type { DashboardStats } from '../utils/types';
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { giversAPI } from '../utils/api';
import type { Giver } from '../utils/types';


const DashboardPage = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [givers, setGivers] = useState<Giver[]>([]);


    useEffect(() => {
        loadStats();
        loadGivers();
    }, []);

    const loadStats = async () => {
        try 
        {
            setIsLoading(true);
            const data = await dashboardAPI.getStats();
            setStats(data);
            setError('');
        } 
          catch(err: any) 
        {
            setError('Failed to load dashboard stats');
            console.error(err);
        } 
          finally 
        {
            setIsLoading(false);
        }
    };

    const loadGivers = async () => {
      try {
        const data = await giversAPI.getAll();
        setGivers(data);
      }
      catch(err) {
        console.error('Failed to load givers', err);
      }
    };

  const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };


//Chart colors
//const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

const getMethodColor = (method: string) => {
    switch(method) {
        case 'cash': return '#10b981';
        case 'check': return '#3b82f6';
        case 'card': return '#8b5cf6';
        case 'transfer': return '#f59e0b';

        default: return '#6b7280'
    }
};

if (isLoading) {
    return ( 
    <div className="min-h-screen bg-celestial flex items-center justify-center">
        <div className="text-2xl text-black font-bold" style={{ fontFamily: 'Newsreader, serif' }}>
          Loading Dashboard...
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-celestial flex items-center justify-center">
        <div className="text-black-600">Failed to load dashboard</div>
      </div>
    );
  }

  return (
  <div className="p-8">
    <div className="max-w-7xl mx-auto">


      {/* Header - Simplified */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-black mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
          Dashboard
        </h1>
        <p className="text-black text-sm">Welcome back, {user?.username}!</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 px-4 py-3 mb-6">
          {error}
        </div>
      )}
  </div>
      {/* Summary Stats Cards */}

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
  {/* Total Givers */}
  <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] transition-all">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-black-600 font-semibold">Total Givers</p>
      <img src="/assets/icons/members.png" alt="Members" className="w-6 h-6 opacity-60" />
    </div>
    <p className="text-4xl font-bold text-black-500" style={{ fontFamily: 'Newsreader, serif' }}>
      {stats.summary.total_givers}
    </p>
  </div>

  {/* Total Offerings */}
  <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] transition-all">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-black-600 font-semibold">Total Offerings</p>
      <img src="/assets/icons/offerings.png" alt="Offerings" className="w-6 h-6 opacity-60" />
    </div>
    <p className="flex-1 text-3xl text-black-500 font-bold" style={{ fontFamily: 'Newsreader, serif' }}>
      ${stats.summary.total_offerings_amount.toFixed(2)}
    </p>
    <p className="text-xs text-gray-500 mt-1">{stats.summary.total_offerings_count} offerings</p>
  </div>

  {/* This Month */}
  <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] transition-all">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-black-600 font-semibold">This Month</p>
      <span className="text-2xl">📅</span>
    </div>
    <p className="text-3xl font-bold text-black-500" style={{ fontFamily: 'Newsreader, serif' }}>
      ${stats.summary.this_month_amount.toFixed(2)}
    </p>
    <p className="text-xs text-gray-500 mt-1">{stats.summary.this_month_count} offerings</p>
  </div>

  {/* Last 30 Days */}
  <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] transition-all">
    <div className="flex items-center justify-between mb-2">
      <p className="text-sm text-black-600 font-semibold">Last 30 Days</p>
      <span className="text-2xl">⏱️</span>
    </div>
    <p className="text-3xl font-bold text-black-500" style={{ fontFamily: 'Newsreader, serif' }}>
      ${stats.summary.recent_amount.toFixed(2)}
    </p>
    <p className="text-xs text-black-500 mt-1">{stats.summary.recent_count} offerings</p>
  </div>
</div>

      {/* Charts Row */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
  {/* Offerings Over Time */}
  <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30">
    <h2 className="text-xl font-bold text-black mb-4 flex items-center gap-2" style={{ fontFamily: 'Newsreader, serif' }}>
      <img src="/assets/icons/reports.png" alt="Chart" className="w-5 h-5" />
      Offerings Over Time
    </h2>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={stats.offerings_over_time}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="total" stroke="#B8860B" strokeWidth={3} name="Total Amount" />
      </LineChart>
    </ResponsiveContainer>
  </div>

        {/* Offerings by Method */}
        <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30">
          <h2 className="text-xl font-bold text-black mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
            Offerings by Method
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.offerings_by_method}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry: any) => {
                  const method = entry.method ?? entry.payload?.method ?? 'Unknown';
                  const total = entry.total ?? entry.payload?.total ?? 0;
                  return `${method}: $${Number(total).toFixed(0)}`;
                }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total"
              >
                {stats.offerings_by_method.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getMethodColor(entry.method)} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Givers and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">



        {/* Keep all your existing charts - no changes */}
        {/* Top Givers */}
        <div className="bg-white/75 backdrop-blur-md p-6 shadow-lg border border-white/40">
          <h2 className="text-xl font-bold text-black mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
            Top Givers
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.top_givers} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="total_amount" fill="#3b82f6" name="Total Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30">
  <h2 className="text-xl font-bold text-black mb-4 flex items-center gap-2" style={{ fontFamily: 'Newsreader, serif' }}>
    <span className="text-2xl">📋</span>
    Recent Activity
  </h2>
  <div className="space-y-3 max-h-[300px] overflow-y-auto">
    {stats.recent_activity.map((activity) => {
      // Get giver data for avatar
      const giver = givers.find(g => g.id === activity.id);
      
      return (
        <div key={activity.id} className="flex items-center gap-3 border-b border-gray-200 pb-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {giver?.profile_picture ? (
              <img
                src={`http://localhost:5001${giver.profile_picture}`}
                alt={activity.giver_name}
                className="w-10 h-10 rounded-full object-cover border-2 border-[#D4AF37]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold text-sm border-2 border-[#D4AF37]">
                {activity.giver_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
            )}
          </div>
          
          {/* Activity Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-black truncate">{activity.giver_name}</p>
            <p className="text-xs text-gray-500">{formatDate(activity.date)} • {activity.method}</p>
          </div>
          
          {/* Amount */}
          <p className="text-lg font-bold text-[#B8860B] flex-shrink-0">${activity.amount.toFixed(2)}</p>
        </div>
      );
    })}
  </div>
</div>
      {/* Quick Actions - Updated with Link */}
      {/* Quick Actions */}
<div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30">
  <h2 className="text-xl font-bold text-black mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
    Quick Actions
  </h2>
  
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <button
      onClick={loadStats}
      className="bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#9B7506] text-white font-bold py-3 px-6 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
      style={{ fontFamily: 'Newsreader, serif' }}
    >
      🔄 Refresh Data
    </button>
    <Link
      to="/offerings"
      className="bg-gradient-to-r from-black to-gray-800 hover:from-gray-800 hover:to-black text-white font-bold py-3 px-6 text-center transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
      style={{ fontFamily: 'Newsreader, serif' }}
    >
      ➕ Quick Add Offering
    </Link>
      </div>
      </div>
    </div>
  </div>
  );  
};
export default DashboardPage;