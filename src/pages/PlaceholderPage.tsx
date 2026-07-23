import { PageHeader } from "@/components/PageHeader";

interface PlaceholderPageProps {
  title: string;
  description: string;
  endpoint?: string;
}

export function PlaceholderPage({
  title,
  description,
  endpoint,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="card">
        <p className="m-0 text-secondary">
          Aquesta funcionalitat encara no està disponible al frontend.
          {endpoint && (
            <>
              {" "}
              L'endpoint del backend previst és{" "}
              <code>{endpoint}</code>.
            </>
          )}
        </p>
      </div>
    </>
  );
}
