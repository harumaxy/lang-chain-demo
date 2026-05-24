interface Source {
  source: string;
  content: string;
}

interface Props {
  sources: Source[];
}

export function Sources({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "8px 12px",
        borderLeft: "3px solid #d1d5db",
        fontSize: "13px",
        color: "#6b7280",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>参照元:</div>
      {sources.map((s, i) => (
        <div key={i} style={{ marginBottom: "4px" }}>
          {s.source}
        </div>
      ))}
    </div>
  );
}
