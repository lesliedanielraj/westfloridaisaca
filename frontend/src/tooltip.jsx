import { createContext, useContext, useMemo, useRef } from 'react';

const TipContext = createContext(null);

// One tooltip for the whole page. It is moved by hand, not through state, so pointing at a
// chart never re-renders anything.
export function TipProvider({ children }) {
  const el = useRef(null);
  const api = useMemo(() => {
    const hide = () => { if (el.current) el.current.hidden = true; };
    const show = (event, text) => {
      const tip = el.current;
      if (!tip) return;
      tip.textContent = text;
      tip.hidden = false;
      const x = Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      const below = event.clientY + 16;
      const y = below + tip.offsetHeight > window.innerHeight - 8 ? event.clientY - tip.offsetHeight - 10 : below;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${Math.max(8, y)}px`;
    };
    // Spread onto any element: {...tip('text')}
    const props = (text) => ({ onPointerMove: (event) => show(event, text), onPointerLeave: hide });
    return { show, hide, props };
  }, []);
  return (
    <TipContext.Provider value={api}>
      {children}
      <div ref={el} className="wf-tip wf-tip-fixed" role="tooltip" hidden />
    </TipContext.Provider>
  );
}

export const useTip = () => useContext(TipContext);
