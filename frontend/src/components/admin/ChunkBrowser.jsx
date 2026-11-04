import { useState } from "react";

import { fetchMaterialChunks } from "../../api/adminMaterials.api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { cardClass } from "../../utils/ui";
import ErrorState from "../common/ErrorState";
import Pagination from "../common/Pagination";
import Skeleton from "../common/Skeleton";

const PAGE_SIZE = 10;
const COLLAPSED_CHARS = 500;

function pageLabel(chunk) {
  return chunk.page_start === chunk.page_end
    ? `Page ${chunk.page_start}`
    : `Pages ${chunk.page_start}–${chunk.page_end}`;
}

function ChunkCard({ chunk }) {
  const [open, setOpen] = useState(false);
  const isLong = chunk.text.length > COLLAPSED_CHARS;
  const shown = open || !isLong ? chunk.text : `${chunk.text.slice(0, COLLAPSED_CHARS)}…`;

  return (
    <li className={`${cardClass} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Chunk {chunk.index + 1}</span>
        <span>
          {pageLabel(chunk)} · {chunk.word_count.toLocaleString()} words
        </span>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-800">
        {shown}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-sm font-medium text-blue-700 hover:underline"
        >
          {open ? "Show less" : "Show the full chunk"}
        </button>
      )}
    </li>
  );
}

export default function ChunkBrowser({ materialId }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsyncData(
    () => fetchMaterialChunks(materialId, { page, page_size: PAGE_SIZE }),
    `${materialId}:${page}`
  );

  return (
    <section aria-label="Extracted text chunks">
      <h3 className="mb-1 font-semibold text-slate-900">Extracted text chunks</h3>
      <p className="mb-3 text-sm text-slate-600">
        The text is stored in these pieces. Later phases generate questions from them.
      </p>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <p className={`${cardClass} p-4 text-sm text-slate-600`}>No text chunks are stored for this material.</p>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {data.items.map((chunk) => (
              <ChunkCard key={chunk.index} chunk={chunk} />
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}