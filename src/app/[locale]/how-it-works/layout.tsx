import { redirect } from 'next/navigation';

export default function HowItWorksRouteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // ── Guide pages temporarily hidden for compliance review ──
    // Content preserved — will be restored after neutral language rewrite
    redirect('/');
    return <div data-guide>{children}</div>;
}
