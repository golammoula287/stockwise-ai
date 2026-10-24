import { createContext, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useOverlay from '../lib/useOverlay';
const ConfirmContext=createContext(null);
export const useConfirm=()=>useContext(ConfirmContext);
export function ConfirmProvider({children}) {
  const [dialog,setDialog]=useState(null);
  const resolver=useRef(null);
  const finish=answer=>{const resolve=resolver.current;resolver.current=null;setDialog(null);resolve?.(answer);};
  const root=useOverlay(Boolean(dialog),()=>finish(false));
  const confirm=options=>new Promise(resolve=>{if(resolver.current){resolve(false);return;}resolver.current=resolve;setDialog(options);});
  return <ConfirmContext.Provider value={confirm}>{children}{dialog&&createPortal(<div ref={root} className="action-confirm-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="action-confirm-title" aria-describedby="action-confirm-description"><section className="action-confirm-dialog"><span className="action-confirm-eyebrow">Confirm action</span><h2 id="action-confirm-title">{dialog.title}</h2><p id="action-confirm-description">{dialog.message}</p><div className="action-confirm-actions"><button type="button" onClick={()=>finish(false)}>Cancel</button><button type="button" className={dialog.destructive?'is-destructive':'is-primary'} onClick={()=>finish(true)}>{dialog.confirmLabel||'Confirm'}</button></div></section></div>,document.body)}</ConfirmContext.Provider>;
}
