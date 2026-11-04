import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

// items: [{ label, to? }]  (the last item has no "to")
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
            {item.to ? (
              <Link to={item.to} className="truncate hover:text-slate-900 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-slate-700">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}