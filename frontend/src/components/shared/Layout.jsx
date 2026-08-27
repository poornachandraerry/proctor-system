import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Users, AlertTriangle,
  Shield, LogOut, Menu, X, Key, Building2, Database
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const NAV = {
  admin: [
    { to:'/dashboard',      icon:LayoutDashboard, label:'Dashboard'      },
    { to:'/exams',          icon:FileText,        label:'Exams'          },
    { to:'/question-banks', icon:Database,        label:'Question Banks' },
    { to:'/alerts',         icon:AlertTriangle,   label:'Alerts'         },
    { to:'/users',          icon:Users,           label:'Users'          },
    { to:'/licensing',      icon:Key,             label:'Licensing', highlight:true },
  ],
  org_admin: [
    { to:'/dashboard',      icon:LayoutDashboard, label:'Dashboard'      },
    { to:'/exams',          icon:FileText,        label:'Exams'          },
    { to:'/question-banks', icon:Database,        label:'Question Banks' },
    { to:'/org-admin',      icon:Building2,       label:'Manage Users',  highlight:true },
    { to:'/alerts',         icon:AlertTriangle,   label:'Alerts'         },
  ],
  examiner: [
    { to:'/dashboard',      icon:LayoutDashboard, label:'Dashboard'      },
    { to:'/exams',          icon:FileText,        label:'My Exams'       },
    { to:'/question-banks', icon:Database,        label:'Question Banks' },
    { to:'/alerts',         icon:AlertTriangle,   label:'Alerts'         },
  ],
  student: [
    { to:'/dashboard',      icon:LayoutDashboard, label:'Dashboard'       },
    { to:'/exams',          icon:FileText,        label:'Available Exams' },
    { to:'/question-banks', icon:Database,        label:'Practice Tests'  },
  ],
};

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);           // desktop collapse/expand
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer open/closed
  const items = NAV[user?.role] || NAV.student;

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-800 min-h-[72px]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/30">
          <Shield size={18} className="text-white"/>
        </div>
        <AnimatePresence>
          {(open || mobileOpen) && (
            <motion.div
              initial={{ opacity:0, x:-10 }}
              animate={{ opacity:1, x:0 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.2 }}
            >
              <div className="font-display font-bold text-white text-lg leading-none">ProctorAI</div>
              <div className="text-xs text-surface-400 font-medium mt-0.5 capitalize">
                {user?.role === 'org_admin' ? 'Organisation Admin' : user?.role}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto hidden lg:block text-surface-400 hover:text-white transition-colors shrink-0 p-1 rounded-lg hover:bg-surface-700"
        >
          {open ? <X size={16}/> : <Menu size={16}/>}
        </button>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto lg:hidden text-surface-400 hover:text-white transition-colors shrink-0 p-1 rounded-lg hover:bg-surface-700"
        >
          <X size={18}/>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {items.map(({ to, icon: Icon, label, highlight }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-600/20 text-primary-300 border border-primary-500/20'
                  : highlight
                  ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/20'
                  : 'text-surface-300 hover:text-white hover:bg-surface-700/60'
              }`
            }
          >
            <Icon size={18} className="shrink-0"/>
            <AnimatePresence>
              {(open || mobileOpen) && (
                <motion.span
                  initial={{ opacity:0 }}
                  animate={{ opacity:1 }}
                  exit={{ opacity:0 }}
                  transition={{ duration:0.15 }}
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
            {highlight && (open || mobileOpen) && (
              <motion.span
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full"
              >
                {user?.role === 'admin' ? 'Pro' : 'Manage'}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-surface-800 p-3 space-y-1">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0 uppercase">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <AnimatePresence>
            {(open || mobileOpen) && (
              <motion.div
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                exit={{ opacity:0 }}
                className="flex-1 overflow-hidden"
              >
                <div className="text-sm font-medium text-white truncate">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-surface-400 capitalize">
                  {user?.role?.replace('_', ' ')}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={16} className="shrink-0"/>
          <AnimatePresence>
            {(open || mobileOpen) && (
              <motion.span initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Desktop sidebar — static, collapsible width, hidden below lg */}
      <motion.aside
        initial={false}
        animate={{ width: open ? 260 : 72 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col border-r border-surface-800 bg-surface-900 shrink-0 overflow-hidden z-20"
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile drawer — fixed overlay, off-canvas by default */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="fixed inset-y-0 left-0 w-72 max-w-[80vw] flex flex-col border-r border-surface-800 bg-surface-900 z-40 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-surface-800 bg-surface-900 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-surface-300 hover:text-white p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
          >
            <Menu size={20}/>
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shrink-0">
            <Shield size={14} className="text-white"/>
          </div>
          <span className="font-display font-bold text-white text-base">ProctorAI</span>
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-surface-950 bg-dot">
          <Outlet/>
        </main>
      </div>
    </div>
  );
}
