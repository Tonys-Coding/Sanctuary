import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';


const Sidebar = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const location = useLocation();
    const { user, logout } = useAuth();

    const toggleSideBar = () => {
        setIsCollapsed(!isCollapsed);
    };

    const navigation = [
        { name: 'Dashboard', path: '/dashboard' , icon: '/assets/icons/overview.png'},
        { name: 'Givers', path: '/givers', icon:'/assets/icons/members.png'},
        { name: 'Offerings', path: '/offerings', icon: '/assets/icons/offerings.png' },
    ];

    const isActive = (path: string) => location.pathname === path;

    
return (
    <div 
      className={`bg-white border-r-2 border-[#D4AF37] min-h-screen flex flex-col shadow-2xl transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Logo/Header */}
      <div className="p-6 border-b-2 border-[#D4AF37]/30">
        {!isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <img 
              src="/assets/logo/logo.png" 
              alt="Sanctuary Logo" 
              className="w-24 h-24 object-contain"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-black tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                SANCTUARY
              </h1>
              <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent mt-1"></div>
              <p className="text-xs text-gray-600 mt-1 tracking-wide uppercase">Offering Management</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center max-width: 200% min-width: 200%">
            <img 
              src="/assets/logo/logo.png" 
              alt="Sanctuary" 
              className="w-12 h-12 object-contain"
            />
          </div>
        )}
      </div>

      {/* Collapse/Expand Button */}
      <div className="px-4 py-3 border-b border-[#D4AF37]/20">
        <button
          onClick={toggleSideBar}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white hover:from-[#B8860B] hover:to-[#9B7506] transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <span className="text-lg">▶</span>
          ) : (
            <>
              <span className="text-lg">◀</span>
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-4 py-3 font-semibold transition-all duration-300 ${
              isActive(item.path)
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
                : 'text-gray-700 hover:bg-[#D4AF37]/10 hover:text-[#B8860B]'
            }`}
            title={isCollapsed ? item.name : ''}
          >
            <img 
              src={item.icon} 
              alt={item.name}
              className={`w-6 h-6 object-contain transition-all ${
                isActive(item.path) ? '' : 'opacity-60'
              }`}
            />
            {!isCollapsed && (
              <span style={{ fontFamily: 'Newsreader, serif' }}>
                {item.name}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t-2 border-[#D4AF37]/30">
        {!isCollapsed ? (
          <>
            <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#B8860B]/10 p-3 mb-3 border border-[#D4AF37]/20">
              <p className="text-sm font-bold text-black truncate" style={{ fontFamily: 'Newsreader, serif' }}>
                {user?.username}
              </p>
              <p className="text-xs text-gray-600 truncate">{user?.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex-1 text-xs px-2 py-1 bg-[#D4AF37] text-white font-semibold">
                  {user?.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 text-sm shadow-md hover:shadow-lg"
              style={{ fontFamily: 'Newsreader, serif' }}
            >
              Logout
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="bg-gradient-to-br from-[#D4AF37] to-[#B8860B] p-2 flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
            <button
              onClick={logout}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 transition-all text-xs"
              title="Logout"
            >
              🚪
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default Sidebar;


