import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const FILTER_NAMES = ['seniority', 'county', 'job_function', 'credential'];
export const FILTER_LABELS = {
  seniority: 'Seniority', county: 'County', job_function: 'Job function', credential: 'Credential',
};

const FiltersContext = createContext(null);

function fromAddress() {
  const q = new URLSearchParams(window.location.search);
  return Object.fromEntries(FILTER_NAMES.map((name) => [name, q.get(name) || null]));
}

// The filters live in the page address, so a filtered view can be bookmarked or shared.
export function FiltersProvider({ children }) {
  const [values, setValues] = useState(fromAddress);

  useEffect(() => {
    const q = new URLSearchParams();
    FILTER_NAMES.forEach((name) => { if (values[name]) q.set(name, values[name]); });
    const text = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${text ? `?${text}` : ''}${window.location.hash}`);
  }, [values]);

  const set = useCallback((name, value) => setValues((v) => ({ ...v, [name]: value || null })), []);
  const toggle = useCallback((name, value) => setValues((v) => ({ ...v, [name]: v[name] === value ? null : value })), []);
  const clear = useCallback(() => setValues(Object.fromEntries(FILTER_NAMES.map((name) => [name, null]))), []);

  const api = useMemo(() => ({
    values, set, toggle, clear,
    any: FILTER_NAMES.some((name) => values[name]),
    // The same filters, minus one: for a chart that sets a filter and still shows the other choices.
    without: (name) => ({ ...values, exclude: values[name] ? name : null }),
    scope: FILTER_NAMES.some((name) => values[name]) ? 'the members selected' : 'all members',
  }), [values, set, toggle, clear]);

  return <FiltersContext.Provider value={api}>{children}</FiltersContext.Provider>;
}

export const useFilters = () => useContext(FiltersContext);
