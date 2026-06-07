import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Users, AlertTriangle,
  Shield, LogOut, Menu, X, Key, Building2, Award
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const NAV = {
  admin: [
    { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard'   },
    { to:'/exams',     icon:FileText,        label:'Exams'       },
    { to:'/alerts',    icon:AlertTriangle,   label:'Alerts'      },
    { to:'/users',     icon:Users,           label:'Users'       },
    { to:'/licensing', icon:Key,             label:'Licensing',  highlight:true },
  ],
  org_admin: [
    { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard'     },
    { to:'/exams',     icon:FileText,        label:'Exams'         },
    { to:'/org-admin', icon:Building2,       label:'Manage Users', highlight:true },
    { to:'/alerts',    icon:AlertTriangle,   label:'Alerts'        },
  ],
  examiner: [
    { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard' },
    { to:'/exams',     icon:FileText,        label:'My Exams'  },
    { to:'/alerts',    icon:AlertTriangle,   label:'Alerts'    },
  ],
  student: [
    { to:'/dashboard', icon:LayoutDashboard, label:'Dashboard'       },
    { to:'/exams',     icon:FileText,        label:'Available Exams' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const items = NAV[user?.role] || NAV.student;

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: open ? 260 : 72 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="flex flex-col border-r border-surface-800 bg-surface-900 shrink-0 overflow-hidden z-20"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-800 min-h-[72px]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/30">
            <Shield size={18} className="text-white"/>
          </div>
          <AnimatePresence>
            {open && (
              <motion.div initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:0.2}}>
                <div className="font-display font-bold text-white text-lg leading-none">ProctorAI</div>
                <div className="text-xs text-surface-400 font-medium mt-0.5 capitalize">
                  {user?.role === 'org_admin' ? 'Organisation Admin' : user?.role}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={() => setOpen(!open)}
            className="ml-auto text-surface-400 hover:text-white transition-colors shrink-0 p-1 rounded-lg hover:bg-surface-700">
            {open ? <X size={16}/> : <Menu size={16}/>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {items.map(({ to, icon: Icon, label, highlight }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-300 border border-primary-500/20'
                    : highlight
                    ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/20'
                    : 'text-surface-300 hover:text-white hover:bg-surface-700/60'
                }`
              }>
              <Icon size={18} className="shrink-0"/>
              <AnimatePresence>
                {open && (
                  <motion.span initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}>
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {highlight && open && (
                <motion.span initial={{opacity:0}} animate={{opacity:1}}
                  className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
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
              {open && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</div>
                  <div className="text-xs text-surface-400 capitalize">{user?.role?.replace('_',' ')}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut size={16} className="shrink-0"/>
            <AnimatePresence>
              {open && <motion.span initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>Sign Out</motion.span>}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-surface-950 bg-dot">
        <Outlet/>
      </main>
    </div>
  );
}
