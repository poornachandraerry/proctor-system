import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import api from './utils/api';

import LoginPage          from './pages/LoginPage';
import RegisterPage       from './pages/RegisterPage';
import DashboardPage      from './pages/DashboardPage';
import ExamsPage          from './pages/ExamsPage';
import ExamCreatePage     from './pages/ExamCreatePage';
import ExamDetailPage     from './pages/ExamDetailPage';
import ExamTakePage       from './pages/ExamTakePage';
import ExamRegisterPage   from './pages/ExamRegisterPage';
import ProctorPage        from './pages/ProctorPage';
import ReportPage         from './pages/ReportPage';
import StudentResultPage  from './pages/StudentResultPage';
import UsersPage          from './pages/UsersPage';
import AlertsPage         from './pages/AlertsPage';
import LicensingPage      from './pages/LicensingPage';
import OrgAdminPage       from './pages/OrgAdminPage';
import Layout             from './components/shared/Layout';

function PrivateRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { accessToken } = useAuthStore();
  useEffect(() => {
    if (accessToken) api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }, [accessToken]);

  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: { background:'#1e293b', color:'#f1f5f9', border:'1px solid #334155', borderRadius:'12px', fontSize:'14px' },
        success: { iconTheme: { primary:'#10b981', secondary:'#1e293b' } },
        error:   { iconTheme: { primary:'#ef4444', secondary:'#1e293b' } },
      }}/>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<PublicRoute><LoginPage/></PublicRoute>}/>
        <Route path="/register" element={<PublicRoute><RegisterPage/></PublicRoute>}/>
        {/* Exam invite registration — public, no auth needed */}
        <Route path="/exam-register/:token" element={<ExamRegisterPage/>}/>

        {/* Exam taking — full screen, no sidebar */}
        <Route path="/exam/:sessionId/take" element={<PrivateRoute roles={['student']}><ExamTakePage/></PrivateRoute>}/>

        {/* Main app with sidebar */}
        <Route path="/" element={<PrivateRoute><Layout/></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace/>}/>
          <Route path="dashboard"   element={<DashboardPage/>}/>
          <Route path="exams"       element={<ExamsPage/>}/>
          <Route path="exams/create" element={<PrivateRoute roles={['admin','org_admin','examiner']}><ExamCreatePage/></PrivateRoute>}/>
          <Route path="exams/:id"   element={<ExamDetailPage/>}/>
          <Route path="proctor/:examId" element={<PrivateRoute roles={['admin','org_admin','examiner']}><ProctorPage/></PrivateRoute>}/>
          {/* Staff report */}
          <Route path="reports/:sessionId" element={<PrivateRoute roles={['admin','org_admin','examiner']}><ReportPage/></PrivateRoute>}/>
          {/* Student result */}
          <Route path="results/:sessionId" element={<PrivateRoute roles={['student']}><StudentResultPage/></PrivateRoute>}/>
          <Route path="users"       element={<PrivateRoute roles={['admin']}><UsersPage/></PrivateRoute>}/>
          <Route path="alerts"      element={<PrivateRoute roles={['admin','org_admin','examiner']}><AlertsPage/></PrivateRoute>}/>
          <Route path="licensing"   element={<PrivateRoute roles={['admin']}><LicensingPage/></PrivateRoute>}/>
          <Route path="org-admin"   element={<PrivateRoute roles={['org_admin','admin']}><OrgAdminPage/></PrivateRoute>}/>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
      </Routes>
    </>
  );
}
