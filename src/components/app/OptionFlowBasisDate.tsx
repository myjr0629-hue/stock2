/** Same small, muted date style as the existing options-session markers. */
export function OptionFlowBasisDate({ label }: { label: string | null }) {
  return label ? (
    <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: 'var(--app-lbl-anchor)', whiteSpace: 'nowrap', display: 'inline-block', textTransform: 'none', letterSpacing: 'normal' }}>
      {label}
    </span>
  ) : null;
}
