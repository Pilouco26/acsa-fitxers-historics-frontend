import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  isForbiddenError,
  isUnauthorizedError,
  listAdminServices,
  restartAdminService,
} from "@/api/client";
import type { AdminService, ServiceHealth, ServiceStatus } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";

function statusBadgeClass(status: ServiceStatus): string {
  if (status === "running") return "badge-ok";
  if (status === "restarting") return "badge-revisio";
  if (status === "exited" || status === "dead") return "badge-error";
  return "badge-pending";
}

function healthBadgeClass(health: ServiceHealth): string {
  if (health === "healthy") return "badge-ok";
  if (health === "unhealthy") return "badge-error";
  if (health === "starting") return "badge-revisio";
  return "badge-pending";
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 48) return `${Math.floor(h / 24)} d`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function ServiceRow({
  service,
  onRestart,
  restartingId,
}: {
  service: AdminService;
  onRestart: (id: string) => void;
  restartingId: string | null;
}) {
  return (
    <tr>
      <td>
        <div className="table-list-primary">{service.name}</div>
        <div className="table-list-secondary">{service.container_name}</div>
      </td>
      <td>
        <span className={`badge ${statusBadgeClass(service.status)}`}>
          {service.status}
        </span>
      </td>
      <td>
        <span className={`badge ${healthBadgeClass(service.health)}`}>
          {service.health}
        </span>
      </td>
      <td className="table-list-secondary">{formatUptime(service.uptime_seconds)}</td>
      <td className="table-list-secondary">
        {service.restart_count ?? "—"}
      </td>
      <td>
        <div className="btn-row admin-service-actions">
          <Link
            className="btn btn-sm"
            to={`/admin/logs?source=${encodeURIComponent(service.id)}`}
          >
            Logs
          </Link>
          <button
            type="button"
            className="btn btn-sm"
            disabled={restartingId === service.id}
            onClick={() => {
              const ok = window.confirm(
                `Reiniciar el servei «${service.name}»?`,
              );
              if (ok) onRestart(service.id);
            }}
          >
            {restartingId === service.id ? "…" : "Reiniciar"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminServicesPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const isActive = location.pathname === "/admin/services";

  const servicesQuery = useQuery({
    queryKey: ["admin-services"],
    queryFn: listAdminServices,
    retry: (count, err) =>
      !isForbiddenError(err) && !isUnauthorizedError(err) && count < 1,
    refetchInterval: (query) => {
      if (!isActive) return false;
      if (
        isForbiddenError(query.state.error) ||
        isUnauthorizedError(query.state.error)
      ) {
        return false;
      }
      return 10_000;
    },
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => restartAdminService(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Error en reiniciar",
      );
    },
  });

  const errorMessage = (() => {
    const err = servicesQuery.error;
    if (!err) return null;
    if (isForbiddenError(err)) {
      return "No tens permís per veure els serveis.";
    }
    if (err instanceof ApiError && err.status === 404) {
      return "L'API de serveis encara no està disponible al backend.";
    }
    return err instanceof Error ? err.message : "Error en carregar els serveis";
  })();

  const data = servicesQuery.data;
  const services = data?.services ?? [];

  return (
    <>
      <PageHeader
        title="Serveis"
        description="Estat dels contenidors Docker allowlistats i accions segures."
      />

      {(errorMessage || actionError) && (
        <div className="alert alert-error">{actionError ?? errorMessage}</div>
      )}

      <div className="card admin-ops-toolbar">
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => servicesQuery.refetch()}
            disabled={servicesQuery.isFetching}
          >
            Actualitzar
          </button>
          {data?.stack ? (
            <span className="admin-ops-meta">Stack: {data.stack}</span>
          ) : null}
          {data?.generated_at ? (
            <span className="admin-ops-meta">
              {new Date(data.generated_at).toLocaleString("ca-ES")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="card table-list-body">
        {servicesQuery.isLoading && (
          <p className="empty-state">Carregant serveis…</p>
        )}
        {!servicesQuery.isLoading && !services.length && !errorMessage && (
          <p className="empty-state">No hi ha serveis configurats.</p>
        )}
        {services.length > 0 && (
          <table className="data-table data-table--list">
            <thead>
              <tr>
                <th>Servei</th>
                <th>Estat</th>
                <th>Salut</th>
                <th>Uptime</th>
                <th>Reinicis</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  restartingId={
                    restartMutation.isPending
                      ? (restartMutation.variables ?? null)
                      : null
                  }
                  onRestart={(id) => restartMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {services.some((s) => s.mounts?.length || s.ports?.length) && (
        <div className="card admin-service-details">
          <h3>Detall de muntatges i ports</h3>
          {services.map((service) => (
            <div key={`${service.id}-detail`} className="admin-service-detail">
              <strong>{service.name}</strong>
              <div className="table-list-secondary">{service.image}</div>
              {service.ports?.length ? (
                <p>Ports: {service.ports.join(", ")}</p>
              ) : null}
              {service.mounts?.length ? (
                <ul>
                  {service.mounts.map((m) => (
                    <li key={`${m.source}-${m.destination}`}>
                      <code>{m.source}</code> → <code>{m.destination}</code>
                      {m.mode ? ` (${m.mode})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
