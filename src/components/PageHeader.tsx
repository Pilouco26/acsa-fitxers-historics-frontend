import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  );
}
