import { Link } from '@/i18n/routing';

export default function NotFound() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#050a14', color: '#fff', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>404</h1>
            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Page Not Found</p>
            <Link href="/" style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#1e293b', color: '#fff', textDecoration: 'none', border: '1px solid #334155' }}>
                Go Home
            </Link>
        </div>
    );
}
