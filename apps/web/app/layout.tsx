import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Secret Santa — A little mystery. A lot of joy.',description:'Thoughtful gifts. Secret identities. Create your exchange, pick a number, and make someone’s season.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
