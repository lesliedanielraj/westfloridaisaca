import { useApi } from '../api.js';
import { Bars, SplitBar } from '../charts/Bars.jsx';
import { useFilters } from '../filters.jsx';

export default function Credentials() {
  const filters = useFilters();
  const { values, toggle } = filters;
  const { data: certs } = useApi('/certifications', filters.without('credential'));
  const { data: held } = useApi('/breakdown/credentials_held', values);

  return (
    <section className="wf-pane" id="credentials">
      <h2 className="wf-h2">Credentials</h2>
      <div className="wf-two">
        <div className="wf-card"><h3 className="wf-h3">Members holding each credential</h3>
          <p className="wf-note wf-tight">Click a credential to see only the members who hold it.</p>
          <div className="wf-chart">
            <Bars rows={certs && certs.rows} label="cert" value="holders" noun="holders"
              pick={{ value: values.credential, toggle: (v) => toggle('credential', v) }} />
          </div>
          <p className="wf-note">A member with several credentials is counted under each.</p></div>
        <div className="wf-card"><h3 className="wf-h3">Number of credentials held</h3>
          <div className="wf-chart"><SplitBar rows={held && held.rows} /></div></div>
      </div>
    </section>
  );
}
