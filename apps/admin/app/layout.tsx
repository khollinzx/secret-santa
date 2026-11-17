import type {Metadata} from 'next';
import '../../web/app/globals.css';
export const metadata:Metadata={title:'Secret Santa — Admin portal',description:'Manage Secret Santa exchanges, people, and notifications.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
