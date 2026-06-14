export default function NotFound() {
    return (
        <html>
            <body style={{ backgroundColor: '#050a14', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', padding: '100px' }}>
                <h1>404 - Page Not Found</h1>
                <p>The page you are looking for does not exist.</p>
                <a href="/" style={{ color: '#38bdf8', textDecoration: 'underline' }}>Go back home</a>
            </body>
        </html>
    );
}
