"use client";
export default function NotificationSettingsError({reset}:{error:Error&{digest?:string};reset:()=>void}){return <div className="card error-state"><h1>Notification settings unavailable</h1><p>The settings and cycle status could not be loaded.</p><button className="btn primary" onClick={reset}>Retry</button></div>}
