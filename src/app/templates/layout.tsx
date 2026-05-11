export default function TemplateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Reset body styles to prevent globals.css light gradient from bleeding */}
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #000 !important;
          background-image: none !important;
          min-height: auto !important;
          overflow: hidden !important;
        }
      `}</style>
      <div style={{ margin: 0, padding: 0, overflow: 'hidden', background: '#000', lineHeight: 1 }}>
        {children}
      </div>
    </>
  );
}
