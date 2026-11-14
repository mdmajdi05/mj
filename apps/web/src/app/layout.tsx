import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Private Duo', description: 'A private space for two.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
