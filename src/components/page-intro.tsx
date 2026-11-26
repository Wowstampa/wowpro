import type {ReactNode} from 'react';

// The same opening for every client page: title, one line of context, main action on the right.
export function PageIntro({title, text, action, children}: {title: string; text: string; action?: ReactNode; children?: ReactNode}) {
  return <header className="page-intro">
    <div className="page-intro__copy"><h2>{title}</h2><p>{text}</p>{children}</div>
    {action ? <div className="page-intro__action">{action}</div> : null}
  </header>;
}
