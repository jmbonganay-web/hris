import Link from "next/link";
export function NotificationRowActions({actionUrl}:{actionUrl:string|null}){return actionUrl?<Link className="btn primary" href={actionUrl}>Open</Link>:null}
