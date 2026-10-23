/** Screens still being moved over from the prototype. */
export function Placeholder({ title, what }: { title: string; what: string }) {
  return (
    <>
      <div className="ph"><h1>{title}</h1></div>
      <div className="empty" style={{ textAlign: 'left', maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}><b>Being moved over from the prototype.</b> {what}</p>
        <p style={{ marginBottom: 0 }}>Until then, the full design is in the <a href={`${import.meta.env.BASE_URL}prototype/index.html`} target="_blank" rel="noreferrer">prototype</a> (sample data, stored in your browser only).</p>
      </div>
    </>
  );
}
