import { useApi } from '../api.js';
import { BandColumns, Empty } from '../charts/Bars.jsx';
import { useFilters } from '../filters.jsx';
import { useTip } from '../tooltip.jsx';
import { fmt } from '../util.js';

// ISACA's names for its credentials, from isaca.org/credentials.
const NAMES = {
  CISA: 'Certified Information Systems Auditor',
  CISM: 'Certified Information Security Manager',
  CRISC: 'Certified in Risk and Information Systems Control',
  CDPSE: 'Certified Data Privacy Solutions Engineer',
  CGEIT: 'Certified in the Governance of Enterprise IT',
  AAIA: 'Advanced in AI Audit',
  AAISM: 'Advanced in AI Security Management',
  AAIR: 'Advanced in AI Risk',
  CCOA: 'Certified Cybersecurity Operations Analyst',
  CCP: 'CMMC Certified Professional',
  CCA: 'CMMC Certified Assessor',
  CSXF: 'Cybersecurity Fundamentals certificate',
  CSXA: 'Cybersecurity Audit certificate',
};
// Official logos, where the chapter has added them to src/assets/credentials (see the README there).
const LOGO_FILES = import.meta.glob('../assets/credentials/*.{png,svg,webp,jpg}', { eager: true, query: '?url', import: 'default' });
const LOGOS = Object.fromEntries(Object.entries(LOGO_FILES).map(([path, url]) => [path.split('/').pop().replace(/\.[a-z]+$/, '').toUpperCase(), url]));

const CORE = ['CISA', 'CISM', 'CRISC', 'CDPSE', 'CGEIT'];
const GROUPS = [
  { title: 'AI credentials', note: 'ISACA\'s newest credentials, for audit, security and risk work on AI.', codes: ['AAIA', 'AAISM', 'AAIR'] },
  { title: 'Cybersecurity and CMMC', note: 'Operations, CMMC assessment and the two cybersecurity certificates.', codes: ['CCOA', 'CCP', 'CCA', 'CSXF', 'CSXA'] },
];

const onKey = (run) => (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
};

// A ring filled to the share of members who hold one credential.
function Ring({ share }) {
  const r = 34;
  const round = 2 * Math.PI * r;
  return (
    <svg className="wf-ring" viewBox="0 0 84 84" aria-hidden="true">
      <circle className="wf-ring-track" cx="42" cy="42" r={r} />
      {share > 0 && (
        <circle className="wf-ring-fill" cx="42" cy="42" r={r} strokeDasharray={`${(round * Math.min(100, share)) / 100} ${round}`}
          transform="rotate(-90 42 42)" />
      )}
      <text x="42" y="42" dy="0.35em" textAnchor="middle">{fmt.pct(share)}</text>
    </svg>
  );
}

export default function Credentials() {
  const filters = useFilters();
  const tip = useTip();
  const { values, toggle } = filters;
  const { data: certs } = useApi('/certifications', filters.without('credential'));
  const { data: held } = useApi('/breakdown/credentials_held', values);

  const byCode = new Map((certs ? certs.rows : []).map((r) => [r.cert, r]));
  const row = (code) => byCode.get(code) || { cert: code, holders: 0, share: 0 };
  const picked = values.credential;
  const state = (code) => (picked === code ? ' wf-on' : picked ? ' wf-dim' : '');
  const pickProps = (code) => ({
    role: 'button', tabIndex: 0, 'aria-pressed': picked === code,
    onClick: () => toggle('credential', code), onKeyDown: onKey(() => toggle('credential', code)),
  });
  const hint = (code) => `${code}, ${NAMES[code]}: ${fmt.int(row(code).holders)} holders (${fmt.pct(row(code).share)} of those shown). `
    + `Click to ${picked === code ? 'clear this filter' : 'see only these members'}.`;
  const smallMost = Math.max(1, ...GROUPS.flatMap((g) => g.codes).map((code) => row(code).holders));
  const none = held && held.rows.find((r) => r.category === 'None');
  const some = held ? held.total - (none ? none.members : 0) : null;

  return (
    <section className="wf-pane" id="credentials">
      <h2 className="wf-h2">Credentials</h2>
      <p className="wf-sub">
        Who holds what. Click a credential to see only the members who hold it. A member with several is counted under each.
      </p>

      <div className="wf-card">
        <h3 className="wf-h3">Core certifications</h3>
        <p className="wf-note wf-tight">Each ring is the share of the members shown who hold that certification.</p>
        {!certs ? <Empty>—</Empty> : (
          <div className="wf-rings">
            {CORE.map((code) => (
              <div key={code} className={`wf-ringcard wf-pickable${state(code)}`} {...pickProps(code)} {...tip.props(hint(code))}>
                <Ring share={row(code).share} />
                {LOGOS[code] && <img className="wf-cred-logo" src={LOGOS[code]} alt="" />}
                <div className="wf-ring-code">{code}</div>
                <div className="wf-ring-name">{NAMES[code]}</div>
                <div className="wf-ring-count">{fmt.int(row(code).holders)} holders</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wf-grid wf-gap">
        {GROUPS.map((group) => (
          <div key={group.title} className="wf-card">
            <h3 className="wf-h3">{group.title}</h3>
            <p className="wf-note wf-tight">{group.note}</p>
            {!certs ? <Empty>—</Empty> : (
              <div className="wf-credlist">
                {group.codes.map((code) => (
                  <div key={code} className={`wf-cred wf-pickable${state(code)}`} {...pickProps(code)} {...tip.props(hint(code))}>
                    <div className="wf-cred-head">
                      <span className="wf-cred-name">
                        {LOGOS[code] && <img className="wf-cred-logo wf-cred-logo-small" src={LOGOS[code]} alt="" />}
                        <span><b>{code}</b> <span className="wf-quiet">{NAMES[code]}</span></span>
                      </span>
                      <span className="wf-cred-val">{fmt.int(row(code).holders)} · {fmt.pct(row(code).share)}</span>
                    </div>
                    <div className="wf-cred-bar"><i style={{ width: `${(100 * row(code).holders) / smallMost}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="wf-card">
          <h3 className="wf-h3">How many each member holds</h3>
          <p className="wf-note wf-tight">
            {some === null ? '—' : `${fmt.int(some)} of these ${fmt.int(held.total)} members hold at least one.`}
          </p>
          <div className="wf-chart"><BandColumns rows={held && held.rows} unit="credentials held" /></div>
        </div>
      </div>
    </section>
  );
}
