import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { locationSupplyThresholdsApi, skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { useInvoices } from "../hooks/useInvoices";
import { Icon } from "../components/ui/Icon";
import { useProperties } from "../hooks/useProperties";
import { useAuth } from "../contexts/useAuth";
import type { Invoice, LocationLowStockRow, Sku, UnbilledLine } from "../types";
import { SectionHeader } from "../components/ui/SectionHeader";
import { EmptyState } from "../components/ui/EmptyState";

const LowStockCategoryChart = lazy(() =>
  import("../components/LowStockCategoryChart").then((m) => ({
    default: m.LowStockCategoryChart,
  }))
);

const MAX_OVERDUE_INVOICES = 10;

type OverdueInvoiceSummary = Invoice & {
  daysOverdue: number;
  dueDateLabel: string;
  dueDateMs: number;
};

const parseDateAtLocalMidnight = (value: string): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const {
    invoices,
    loading: invoicesLoading,
    error: invoicesError,
    refresh: refreshInvoices,
  } = useInvoices();
  const {
    properties,
    isLoaded: propertiesLoaded,
    error: propertiesError,
    refresh: refreshProperties,
  } = useProperties();
  const [lowStock, setLowStock] = useState<LocationLowStockRow[]>([]);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const dashboardRequestIdRef = useRef(0);

  useEffect(() => () => {
    isMountedRef.current = false;
    dashboardRequestIdRef.current += 1;
  }, []);

  const loadDashboardStats = useCallback(async () => {
    const requestId = ++dashboardRequestIdRef.current;
    setStatsLoaded(false);
    setStatsError(null);
    try {
      const [lows, unbilled, allSkus] = await Promise.all([
        locationSupplyThresholdsApi.listLowStock(),
        replenishmentApi.listUnbilled(),
        skusApi.getAll(),
      ]);
      if (!isMountedRef.current || requestId !== dashboardRequestIdRef.current) {
        return;
      }
      setLowStock(lows);
      setUnbilledLines(unbilled);
      setSkus(allSkus);
      setStatsLoaded(true);
    } catch (err) {
      if (!isMountedRef.current || requestId !== dashboardRequestIdRef.current) {
        return;
      }
      setStatsError(
        err instanceof Error ? err.message : "Couldn't load dashboard data."
      );
    }
  }, []);

  useEffect(() => {
    void loadDashboardStats();
  }, [loadDashboardStats]);

  const visibleProperties = useMemo(() => {
    if (!user) return properties;
    if (user.teamRole === "owner") return properties;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) {
      return properties;
    }
    return properties.filter((property) => user.allowedPropertyIds!.includes(property.id));
  }, [properties, user]);

  const hasPropertyRestrictions =
    Boolean(user) &&
    user?.teamRole !== "owner" &&
    Boolean(user?.allowedPropertyIds && user.allowedPropertyIds.length > 0);

  const allowedPropertyIds = useMemo(
    () => new Set(visibleProperties.map((property) => property.id)),
    [visibleProperties]
  );

  const visibleUnbilledLines = useMemo(() => {
    if (!hasPropertyRestrictions) return unbilledLines;
    return unbilledLines.filter((line) => {
      const propertyId = line.property?.id;
      return propertyId ? allowedPropertyIds.has(propertyId) : true;
    });
  }, [allowedPropertyIds, hasPropertyRestrictions, unbilledLines]);

  const visibleInvoices = useMemo(() => {
    if (!hasPropertyRestrictions) return invoices;
    return invoices.filter((invoice) => {
      const invoicePropertyIds = [
        ...(invoice.lines?.map((line) => line.propertyId).filter((propertyId): propertyId is string => Boolean(propertyId)) ?? []),
        ...(invoice.items?.map((item) => item.propertyId).filter((propertyId): propertyId is string => Boolean(propertyId)) ?? []),
      ];
      if (invoicePropertyIds.length === 0) {
        return true;
      }
      return invoicePropertyIds.some((propertyId) =>
        allowedPropertyIds.has(propertyId)
      );
    });
  }, [allowedPropertyIds, hasPropertyRestrictions, invoices]);

  const stats = useMemo(() => {
    const categoryData = lowStock.reduce((acc, row) => {
      const cat = row.supplyItem?.category?.trim() || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + Number(row.onHandBase);
      return acc;
    }, {} as Record<string, number>);
    const categoryChart = Object.entries(categoryData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const hasStockOnHand = skus.some((s) => {
      const hands = s.stockOnHands?.length
        ? s.stockOnHands
        : s.stockOnHand
          ? [s.stockOnHand]
          : [];
      return hands.some((h) => Number(h.quantity) > 0);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let invalidOverdueDateCount = 0;
    const allOverdueInvoices: OverdueInvoiceSummary[] = [];

    for (const invoice of visibleInvoices) {
      if (invoice.status === "paid") continue;
      const dueDate = parseDateAtLocalMidnight(invoice.dueDate);
      if (!dueDate) {
        invalidOverdueDateCount += 1;
        continue;
      }
      if (dueDate >= today) continue;
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      allOverdueInvoices.push({
        ...invoice,
        daysOverdue,
        dueDateLabel: dueDate.toLocaleDateString(),
        dueDateMs: dueDate.getTime(),
      });
    }

    allOverdueInvoices.sort((a, b) => a.dueDateMs - b.dueDateMs);

    const overdueTotal = allOverdueInvoices.reduce((sum, inv) => sum + inv.total, 0);

    return {
      lowStockCount: lowStock.length,
      unbilledCount: visibleUnbilledLines.length,
      hasStockOnHand,
      propertyCount: visibleProperties.length,
      categoryChart,
      overdueInvoices: allOverdueInvoices.slice(0, MAX_OVERDUE_INVOICES),
      overdueTotal,
      overdueCount: allOverdueInvoices.length,
      invalidOverdueDateCount,
    };
  }, [lowStock, visibleUnbilledLines, skus, visibleInvoices, visibleProperties]);

  const showOnboarding =
    statsLoaded &&
    propertiesLoaded &&
    !propertiesError &&
    !stats.hasStockOnHand &&
    stats.propertyCount === 0;

  if ((!statsLoaded && !statsError) || !propertiesLoaded || invoicesLoading) {
    return (
      <div className="home-page">
        <SectionHeader title="Dashboard" />
        <div className="stats-grid" aria-busy="true" aria-label="Loading dashboard">
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
        <div className="charts-row">
          <div className="chart-panel">
            <div className="skeleton skeleton-line medium" />
            <div className="skeleton skeleton-block" style={{ height: 180 }} />
          </div>
          <div className="chart-panel">
            <div className="skeleton skeleton-line medium" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <SectionHeader
        title="Dashboard"
      />

      {propertiesError && (
        <EmptyState
          title="Couldn't load properties"
          body={propertiesError}
          error
          primaryLabel="Retry properties"
          onPrimary={() => void refreshProperties()}
        />
      )}

      {showOnboarding && (
        <section className="onboarding-checklist" aria-label="Getting started">
          <h3>Get started</h3>
          <ol>
            <li>
              <Link to="/properties">Add property</Link>
            </li>
            <li>
              <Link to="/stock">Add stock location</Link>
            </li>
            <li>
              <Link to="/stock">Receive stock</Link>
            </li>
            <li>
              <Link to="/clients">Add client</Link>
            </li>
          </ol>
        </section>
      )}

      {statsError ? (
        <EmptyState
          title="Couldn't load dashboard data"
          body={statsError}
          error
          primaryLabel="Retry dashboard data"
          onPrimary={() => void loadDashboardStats()}
        />
      ) : (
        <div className="stats-grid">
          <button
            type="button"
            className="stat-card warning clickable-stat-card"
            onClick={() => navigate("/stock")}
            aria-label={`View ${stats.lowStockCount} low stock location items`}
          >
            <div className="stat-icon"><Icon name="warning" size={26} /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.lowStockCount}</div>
              <div className="stat-label">Location items low on stock</div>
            </div>
          </button>
          <button
            type="button"
            className="stat-card clickable-stat-card"
            onClick={() => navigate("/billing")}
            aria-label={`View ${stats.unbilledCount} unbilled lines`}
          >
            <div className="stat-icon"><Icon name="billing" size={26} /></div>
            <div className="stat-content">
              <div className="stat-value">{stats.unbilledCount}</div>
              <div className="stat-label">Unbilled Lines</div>
            </div>
          </button>
          {!stats.hasStockOnHand && (
            <button
              type="button"
              className="stat-card danger clickable-stat-card"
              onClick={() => navigate("/stock")}
              aria-label="Receive stock because there are no packs on hand"
            >
              <div className="stat-icon"><Icon name="stock" size={26} /></div>
              <div className="stat-content">
                <div className="stat-value">0</div>
                <div className="stat-label">No Packs On Hand — Receive Stock</div>
              </div>
            </button>
          )}
        </div>
      )}

      <div className="charts-row">
        <div className="chart-panel">
          <h3>Low stock by category</h3>
          {statsError ? (
            <EmptyState
              title="Couldn't load low stock data"
              error
              primaryLabel="Retry dashboard data"
              onPrimary={() => void loadDashboardStats()}
            />
          ) : (
            <Suspense fallback={<div className="empty-state">Loading chart…</div>}>
              <LowStockCategoryChart data={stats.categoryChart} />
            </Suspense>
          )}
        </div>

        <div className="chart-panel">
          <h3>Overdue Invoices</h3>
          {invoicesError ? (
            <EmptyState
              title="Couldn't load overdue invoices"
              body={invoicesError}
              error
              primaryLabel="Retry invoices"
              onPrimary={() => void refreshInvoices()}
            />
          ) : stats.overdueInvoices.length > 0 ? (
            <div className="overdue-invoices-section">
              <div className="overdue-summary">
                <div className="overdue-stat">
                  <span className="overdue-label">Total Overdue:</span>
                  <span className="overdue-amount">${stats.overdueTotal.toFixed(2)}</span>
                </div>
                <div className="overdue-stat">
                  <span className="overdue-label">Count:</span>
                  <span className="overdue-count">{stats.overdueCount}</span>
                </div>
              </div>
              <div className="overdue-invoices-list">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Client</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.overdueInvoices.map((invoice) => (
                      <tr key={invoice.id} className="overdue-row">
                        <td>#{invoice.invoiceNumber}</td>
                        <td>{invoice.clientName}</td>
                        <td>
                          {invoice.dueDateLabel}
                          <span className="days-overdue"> ({invoice.daysOverdue} days)</span>
                        </td>
                        <td className="amount-cell">${invoice.total.toFixed(2)}</td>
                        <td>
                          <span className="status-badge overdue-badge">
                            {invoice.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stats.invalidOverdueDateCount > 0 && (
                <p className="empty-state">
                  {stats.invalidOverdueDateCount} invoice
                  {stats.invalidOverdueDateCount === 1 ? "" : "s"} with invalid due date
                  {stats.invalidOverdueDateCount === 1 ? " was" : " were"} skipped.
                </p>
              )}
            </div>
          ) : (
            <div className="empty-state">
              No overdue invoices
              {stats.invalidOverdueDateCount > 0 && (
                <>
                  {" "}
                  {stats.invalidOverdueDateCount} invoice
                  {stats.invalidOverdueDateCount === 1 ? "" : "s"} with invalid due date
                  {stats.invalidOverdueDateCount === 1 ? " was" : " were"} skipped.
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
