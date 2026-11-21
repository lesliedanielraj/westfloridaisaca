// A page that is planned but not built yet.
export default function Placeholder({ name, icon }) {
  return (
    <div className="wf-soon">
      <div className="wf-soon-icon" aria-hidden="true">{icon}</div>
      <div className="wf-soon-tag">Under construction</div>
      <h2 className="wf-soon-title">{name}</h2>
      <p className="wf-soon-text">This page is not built yet. Reporting is ready to use in the meantime.</p>
      <a className="wf-soon-link" href="#reporting">Go to Reporting</a>
    </div>
  );
}
