type Props = {
  value: number | string;
  minDigits?: number;
  showSeparators?: boolean;
  separatorChar?: string;
};

export default function PinballScore({
  value,
  minDigits = 7,
  showSeparators = true,
  separatorChar = ",",
}: Props) {
  const num = Math.max(0, Number(value) || 0);
  const raw = num.toString().padStart(minDigits, "0");

  const digits: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const posFromRight = raw.length - i;
    digits.push(raw[i]);

    if (showSeparators && posFromRight > 1 && posFromRight % 3 === 1) {
      digits.push(separatorChar);
    }
  }

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {digits.map((d, i) =>
        d === separatorChar ? (
          <span key={i} style={{ margin: "0 2px", fontWeight: 700 }}>
            {d}
          </span>
        ) : (
          <div
            key={i}
            style={{
              width: 16,
              height: 26,
              background: "#ffffff",
              color: "#050505",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              fontSize: 18,
              borderRadius: 4,
              boxShadow: "inset 0 0 6px #c3c3c3",
            }}
          >
            {d}
          </div>
        )
      )}
    </div>
  );
}
