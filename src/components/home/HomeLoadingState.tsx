export default function HomeLoadingState() {
  return (
    <div className="space-y-14" role="status" aria-label="Loading manga catalog" aria-busy="true">
      <span className="sr-only">Loading manga catalog</span>
      <div className="grid min-h-[34rem] animate-pulse border-y border-border lg:grid-cols-2">
        <div className="space-y-5 border-b border-border p-8 lg:border-b-0 lg:border-r lg:p-12">
          <div className="h-3 w-40 bg-secondary" />
          <div className="mt-20 h-16 w-5/6 bg-secondary" />
          <div className="h-16 w-2/3 bg-secondary" />
          <div className="h-4 w-4/5 bg-secondary" />
        </div>
        <div className="flex items-end bg-secondary/50 p-8"><div className="h-64 w-full bg-muted" /></div>
      </div>
      <div className="space-y-6">
        <div className="h-7 w-52 animate-pulse bg-secondary" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[2/3] animate-pulse bg-secondary" />)}
        </div>
      </div>
    </div>
  );
}
