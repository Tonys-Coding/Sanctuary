import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spinner } from './components/ui'
import { useApp } from './lib/app'
import Layout, { Logo } from './components/Layout'
import { OfferingFormProvider } from './components/OfferingForm'
import { PdfPreviewProvider } from './components/PdfPreview'
import { ForgotPage, LoginPage, RegisterPage, ResetPage } from './pages/Auth'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Offerings = lazy(() => import('./pages/Offerings'))
const Batches = lazy(() => import('./pages/Batches'))
const BatchDetail = lazy(() => import('./pages/BatchDetail'))
const Members = lazy(() => import('./pages/Members'))
const MemberDetail = lazy(() => import('./pages/MemberDetail'))
const Reports = lazy(() => import('./pages/Reports'))
const Taxes = lazy(() => import('./pages/Taxes'))
const Goals = lazy(() => import('./pages/Goals'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Activity = lazy(() => import('./pages/Activity'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))
const Messages = lazy(() => import('./pages/Messages'))
const Deposits = lazy(() => import('./pages/Deposits'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Privacy = lazy(() => import('./pages/Privacy'))
const MyGiving = lazy(() => import('./pages/MyGiving'))

export default function App() {
  const { session, loading } = useApp()
  const { pathname } = useLocation()
  // A member's personal link works without signing in, whoever is (or is not) signed in on this browser.
  if (pathname.startsWith('/mi-ofrenda/')) {
    return <Suspense fallback={<Spinner />}><Routes><Route path="/mi-ofrenda/:token" element={<MyGiving />} /></Routes></Suspense>
  }
  if (loading) {
    return <div className="min-h-dvh grid place-items-center"><Logo size={72} className="animate-[pulse-soft_1.4s_ease-in-out_infinite]" /></div>
  }
  if (!session) {
    return (
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/recuperar" element={<ForgotPage />} />
        <Route path="/restablecer" element={<ResetPage />} />
        <Route path="/privacidad" element={<Suspense fallback={<Spinner />}><Privacy standalone /></Suspense>} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    )
  }
  return (
    <OfferingFormProvider>
      <PdfPreviewProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ofrendas" element={<Offerings />} />
          <Route path="conteos" element={<Batches />} />
          <Route path="conteos/:id" element={<BatchDetail />} />
          <Route path="miembros" element={<Members />} />
          <Route path="miembros/:id" element={<MemberDetail />} />
          <Route path="informes" element={<Reports />} />
          <Route path="impuestos" element={<Taxes />} />
          <Route path="metas" element={<Goals />} />
          <Route path="asistente" element={<Assistant />} />
          <Route path="actividad" element={<Activity />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="ayuda" element={<Help />} />
          <Route path="mensajes" element={<Messages />} />
          <Route path="depositos" element={<Deposits />} />
          <Route path="gastos" element={<Expenses />} />
          <Route path="privacidad" element={<Privacy />} />
        </Route>
        <Route path="/restablecer" element={<ResetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PdfPreviewProvider>
    </OfferingFormProvider>
  )
}
