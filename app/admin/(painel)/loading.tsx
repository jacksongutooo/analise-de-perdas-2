export default function PainelLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-44 animate-pulse rounded-lg bg-line" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-line/70" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-line/60" />
    </div>
  );
}
