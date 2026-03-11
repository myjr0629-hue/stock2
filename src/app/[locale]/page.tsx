/**
 * AWS Review Landing Page — Static
 * 
 * RESTORE ORIGINAL: Copy page.ORIGINAL.tsx → page.tsx
 */

import Image from 'next/image';

export default function Page() {
    return (
        <div style={{
            minHeight: '100vh',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}>
            {/* Logo */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{
                    fontSize: '28px',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.02em',
                    margin: 0,
                }}>
                    SIGNUM<span style={{ color: '#0ea5e9' }}>HQ</span>
                </h1>
                <p style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginTop: '4px',
                }}>
                    Next-Generation Fintech Terminal
                </p>
            </div>

            {/* Guardian Dashboard Screenshot */}
            <div style={{
                maxWidth: '900px',
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0',
                marginBottom: '40px',
            }}>
                <img
                    src="/images/guardian-preview.png"
                    alt="SIGNUM HQ — Institutional-Grade Market Intelligence Terminal"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                />
            </div>

            {/* Three Lines */}
            <div style={{
                textAlign: 'center',
                maxWidth: '600px',
            }}>
                <p style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: '12px',
                    lineHeight: 1.5,
                }}>
                    SIGNUM HQ is a next-generation fintech analytics terminal
                    <br />
                    providing institutional-grade market intelligence and options analytics.
                </p>
                <p style={{
                    fontSize: '15px',
                    color: '#64748b',
                    marginBottom: '8px',
                }}>
                    Currently in private beta — accessible by invited VIP members only.
                </p>
                <p style={{
                    fontSize: '13px',
                    color: '#94a3b8',
                }}>
                    Contact: <a href="mailto:contact@signumhq.com" style={{ color: '#0ea5e9', textDecoration: 'none' }}>contact@signumhq.com</a>
                </p>
            </div>

            {/* Footer */}
            <div style={{
                marginTop: '60px',
                fontSize: '11px',
                color: '#cbd5e1',
            }}>
                © 2026 SIGNUMHQ, LLC. All rights reserved.
            </div>
        </div>
    );
}
