interface ToolTraceProps {
  trace: Array<{ tool: string; outputSummary: string }>;
}

export function ToolTrace({ trace }: ToolTraceProps) {
  return (
    <section className="card">
      <h2>Structured Tool Calls</h2>
      <div className="trace-list">
        {trace.map((item) => (
          <div key={item.tool} className="trace-item">
            <strong>{item.tool}</strong>
            <p>{item.outputSummary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
