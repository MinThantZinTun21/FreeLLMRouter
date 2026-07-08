import {
  USE_CASE_DEFINITIONS,
  SORT_DEFINITIONS,
  TIME_RANGE_DEFINITIONS,
  TOP_N_MIN,
  TOP_N_MAX,
  MAX_ERROR_RATE_MIN,
  MAX_ERROR_RATE_MAX,
  DEFAULT_TIME_RANGE,
} from '@/lib/api-definitions';

export function QueryParamsSection() {
  return (
    <section id="query-params" className="mt-20 scroll-mt-20">
      <h2 className="mb-4 text-5xl font-bold">Query Parameters</h2>
      <p className="mb-12 text-muted-foreground">
        Customize your requests by combining these parameters. All parameters are optional and can
        be mixed and matched.
      </p>

      <div className="space-y-8">
        {/* useCase parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-useCase">
          <h3 className="text-xl font-semibold">useCase</h3>
          <p className="text-sm text-muted-foreground">
            Select models by use case. Pass one or more as a comma-separated list:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">?useCase=vision,tools</code>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium">Value</th>
                  <th className="py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {USE_CASE_DEFINITIONS.filter((uc) => uc.key !== 'all').map(
                  (useCase, index, arr) => (
                    <tr key={useCase.key} className={index === arr.length - 1 ? '' : 'border-b'}>
                      <td className="py-2 pr-4 font-mono text-xs">{useCase.key}</td>
                      <td className="py-2">{useCase.docDescription || useCase.description}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* sort parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-sort">
          <h3 className="text-xl font-semibold">sort</h3>
          <p className="text-sm text-muted-foreground">
            Control the order models are returned. This determines fallback priority when iterating
            through the list. Example:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">?sort=contextLength</code>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium">Value</th>
                  <th className="py-2 pr-4 text-left font-medium">Label</th>
                  <th className="py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {SORT_DEFINITIONS.map((sort, index) => (
                  <tr
                    key={sort.key}
                    className={index === SORT_DEFINITIONS.length - 1 ? '' : 'border-b'}
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{sort.key}</td>
                    <td className="py-2 pr-4">{sort.label}</td>
                    <td className="py-2">{sort.docDescription || sort.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* topN parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-topN">
          <h3 className="text-xl font-semibold">topN</h3>
          <p className="text-sm text-muted-foreground">
            Return only the top N models based on sort order. Range: {TOP_N_MIN}-{TOP_N_MAX}.
            Default: unlimited. Example:{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">?topN=10</code>
          </p>
        </div>

        {/* maxErrorRate parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-maxErrorRate">
          <h3 className="text-xl font-semibold">maxErrorRate</h3>
          <p className="text-sm text-muted-foreground">
            Exclude models with error rate above this percentage ({MAX_ERROR_RATE_MIN}-
            {MAX_ERROR_RATE_MAX}). Error rate = errors / (errors + successes). Example:{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">?maxErrorRate=20</code> excludes
            models with more than 20% error rate.
          </p>
        </div>

        {/* timeRange parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-timeRange">
          <h3 className="text-xl font-semibold">timeRange</h3>
          <p className="text-sm text-muted-foreground">
            Time window for calculating error rates. Options:{' '}
            {TIME_RANGE_DEFINITIONS.map((tr, index) => (
              <span key={tr.value}>
                {index > 0 && ', '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{tr.value}</code>
              </span>
            ))}
            . Default:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{DEFAULT_TIME_RANGE}</code>.
          </p>
        </div>

        {/* myReports parameter */}
        <div className="scroll-mt-20 space-y-3" id="param-myReports">
          <h3 className="text-xl font-semibold">myReports</h3>
          <p className="text-sm text-muted-foreground">
            When set to true, calculate error rates from only your own reported issues instead of
            all community reports. Requires API key authentication. Default: false. Example:{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">?myReports=true</code>
          </p>
        </div>
      </div>
    </section>
  );
}
