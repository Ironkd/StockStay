import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AuthProvider } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProOnlyRoute } from "./components/ProOnlyRoute";
import { UmamiAnalytics } from "./components/UmamiAnalytics";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage }))
);
const PricingPage = lazy(() =>
  import("./pages/PricingPage").then((m) => ({ default: m.PricingPage }))
);
const TermsPage = lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage }))
);
const HomePage = lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage }))
);
const StockPage = lazy(() =>
  import("./pages/StockPage").then((m) => ({ default: m.StockPage }))
);
const PropertiesPage = lazy(() =>
  import("./pages/PropertiesPage").then((m) => ({ default: m.PropertiesPage }))
);
const PropertyDetailPage = lazy(() =>
  import("./pages/PropertyDetailPage").then((m) => ({ default: m.PropertyDetailPage }))
);
const ShoppingListPage = lazy(() =>
  import("./pages/ShoppingListPage").then((m) => ({ default: m.ShoppingListPage }))
);
const ClientsPage = lazy(() =>
  import("./pages/ClientsPage").then((m) => ({ default: m.ClientsPage }))
);
const InvoicesPage = lazy(() =>
  import("./pages/InvoicesPage").then((m) => ({ default: m.InvoicesPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const AcceptInvitePage = lazy(() =>
  import("./pages/AcceptInvitePage").then((m) => ({ default: m.AcceptInvitePage }))
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage }))
);

const isNativeApp = Capacitor.isNativePlatform();

const PageFallback: React.FC = () => (
  <div style={{ padding: "24px", color: "#64748b", fontSize: "14px" }}>Loading…</div>
);

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <UmamiAnalytics />
        <Routes>
          <Route
            path="/"
            element={withSuspense(isNativeApp ? <LoginPage /> : <LandingPage />)}
          />
          <Route path="/login" element={withSuspense(<LoginPage />)} />
          <Route path="/signup" element={<Navigate to="/login?mode=signup" replace />} />
          <Route path="/pricing" element={withSuspense(<PricingPage />)} />
          <Route path="/terms" element={withSuspense(<TermsPage />)} />
          <Route path="/privacy" element={withSuspense(<PrivacyPage />)} />
          <Route path="/reset-password" element={withSuspense(<ResetPasswordPage />)} />
          <Route path="/verify-email" element={withSuspense(<VerifyEmailPage />)} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute pageKey="home">
                <Layout>{withSuspense(<HomePage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute pageKey="inventory">
                <Layout>{withSuspense(<StockPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock/:locationId"
            element={
              <ProtectedRoute pageKey="inventory">
                <Layout>{withSuspense(<StockPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/inventory" element={<Navigate to="/stock" replace />} />
          <Route
            path="/properties"
            element={
              <ProtectedRoute pageKey="inventory">
                <Layout>{withSuspense(<PropertiesPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/properties/:id"
            element={
              <ProtectedRoute pageKey="inventory">
                <Layout>{withSuspense(<PropertyDetailPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/shopping-list"
            element={
              <ProtectedRoute pageKey="shopping-list">
                <ProOnlyRoute>
                  <Layout>{withSuspense(<ShoppingListPage />)}</Layout>
                </ProOnlyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute pageKey="clients">
                <Layout>{withSuspense(<ClientsPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute pageKey="invoices">
                <Layout>{withSuspense(<InvoicesPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/invoices" element={<Navigate to="/billing" replace />} />
          <Route path="/sales" element={<Navigate to="/stock" replace />} />
          <Route
            path="/settings"
            element={
              <ProtectedRoute pageKey="settings">
                <Layout>{withSuspense(<SettingsPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute pageKey="reports">
                <Layout>{withSuspense(<ReportsPage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/accept-invite"
            element={
              <ProtectedRoute>
                <Layout>{withSuspense(<AcceptInvitePage />)}</Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={isNativeApp ? "/login" : "/"} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
