"use client";
export default function NotificationsError({reset}:{error:Error&{digest?:string};reset:()=>void}){return <div className="card error-state"><h1>Notifications unavailable</h1><p>We could not load your notifications. Try again.</p><button className="btn primary" onClick={reset}>Retry</button></div>}
