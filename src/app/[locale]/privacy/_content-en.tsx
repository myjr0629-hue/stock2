import { ReactNode } from 'react';
import {
    Shield, Database, Target, Clock, Lock, Mail,
    UserCheck, Globe, Cookie, Server, Eye, AlertTriangle, FileText, Trash2
} from 'lucide-react';

export interface PrivacySection {
    icon: any;
    color: string;
    title: string;
    content: ReactNode;
    highlight?: boolean;
}

export interface PrivacyMeta {
    pageTitle: string;
    lastUpdated: string;
    intro: string;
    effectiveDate: string;
    effectiveDateBold: string;
    backLink: string;
    importantBadge: string;
}

export const meta: PrivacyMeta = {
    pageTitle: 'Privacy Policy',
    lastUpdated: 'Last Updated: February 12, 2026',
    intro: 'SIGNUM HQ ("Service") is committed to protecting your personal information and respects your privacy. This Privacy Policy explains how we collect, use, store, and delete your personal data in compliance with applicable privacy laws.',
    effectiveDate: 'This Privacy Policy is effective as of ',
    effectiveDateBold: 'February 12, 2026',
    backLink: '← Back to Login',
    importantBadge: 'IMPORTANT',
};

export const sections: PrivacySection[] = [
    {
        icon: FileText,
        color: 'text-slate-400',
        title: 'Article 1. Purpose',
        content: (
            <p>This Privacy Policy describes how SIGNUM HQ (&quot;Service&quot;) collects, uses, stores, and deletes your personal information, and is intended to comply with applicable data protection laws including the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).</p>
        ),
    },
    {
        icon: Database,
        color: 'text-cyan-400',
        title: 'Article 2. Information We Collect',
        highlight: true,
        content: (
            <div className="space-y-4">
                <div>
                    <p className="font-semibold text-white mb-2">1. Email Registration</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Required:</strong> Email address, password (stored encrypted)</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">2. Google OAuth Registration</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Required:</strong> Email address, name, profile image URL</li>
                        <li>OAuth token provided by Google (for authentication purposes)</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">3. Automatically Collected Information</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>IP address, browser type and version, device information</li>
                        <li>Access timestamps, service usage logs, pages visited</li>
                        <li>Cookies and session data</li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Target,
        color: 'text-amber-400',
        title: 'Article 3. How We Use Your Information',
        content: (
            <div className="space-y-2">
                <p>We use collected personal information solely for the following purposes:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>Account Management:</strong> Identity verification, authentication, and account maintenance</li>
                    <li><strong>Service Delivery:</strong> Providing data analysis, AI reports, signal alerts, and other content</li>
                    <li><strong>Paid Services:</strong> Subscription management, payment processing, and billing</li>
                    <li><strong>Service Improvement:</strong> Usage statistics analysis, quality improvement, and new feature development</li>
                    <li><strong>Customer Support:</strong> Responding to inquiries, delivering notices, and resolving disputes</li>
                    <li><strong>Security:</strong> Fraud prevention, unauthorized access detection, and system security</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Eye,
        color: 'text-rose-400',
        title: 'Article 4. Sharing with Third Parties',
        highlight: true,
        content: (
            <div className="space-y-3">
                <p>We do <strong>not sell your personal information</strong> to third parties. We may share your information only in the following limited circumstances:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li>With your <strong>explicit prior consent</strong></li>
                    <li>When required by <strong>law enforcement or regulatory authorities</strong></li>
                    <li>In <strong>anonymized or aggregated form</strong> for statistical or research purposes</li>
                </ol>
                <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-xs text-slate-400"><strong className="text-amber-400">CCPA Notice (California Residents):</strong> Under the California Consumer Privacy Act, you have the right to know what personal information we collect, request its deletion, and opt out of any sale of personal data. We do not sell personal information.</p>
                </div>
            </div>
        ),
    },
    {
        icon: Server,
        color: 'text-violet-400',
        title: 'Article 5. Data Processors & International Transfers',
        highlight: true,
        content: (
            <div className="space-y-4">
                <p>We use the following service providers to operate the Service. Your data may be processed outside your country of residence:</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">Provider</th>
                                <th className="py-2 pr-4 text-white font-semibold">Purpose</th>
                                <th className="py-2 text-white font-semibold">Server Location</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Supabase Inc.</td>
                                <td className="py-2 pr-4">User authentication, database management</td>
                                <td className="py-2">USA (AWS)</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Vercel Inc.</td>
                                <td className="py-2 pr-4">Web hosting and deployment</td>
                                <td className="py-2">USA</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Google LLC</td>
                                <td className="py-2 pr-4">OAuth authentication, Analytics</td>
                                <td className="py-2">USA</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-3">These providers maintain industry-standard security certifications (<strong>SOC 2, ISO 27001</strong>) and we maintain data protection agreements with each.</p>
            </div>
        ),
    },
    {
        icon: Clock,
        color: 'text-emerald-400',
        title: 'Article 6. Data Retention & Deletion',
        content: (
            <div className="space-y-4">
                <p><strong>Principle:</strong> We delete personal data promptly when it is no longer needed. However, certain data may be retained as required by applicable law:</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">Data Category</th>
                                <th className="py-2 pr-4 text-white font-semibold">Retention Period</th>
                                <th className="py-2 text-white font-semibold">Legal Basis</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Contract / subscription records</td>
                                <td className="py-2 pr-4 text-white font-medium">5 years</td>
                                <td className="py-2">E-Commerce Act</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Payment / billing records</td>
                                <td className="py-2 pr-4 text-white font-medium">5 years</td>
                                <td className="py-2">E-Commerce Act</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Consumer complaint records</td>
                                <td className="py-2 pr-4 text-white font-medium">3 years</td>
                                <td className="py-2">E-Commerce Act</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Access / server logs</td>
                                <td className="py-2 pr-4 text-white font-medium">3 months</td>
                                <td className="py-2">Telecomm. Privacy Act</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-2"><strong>Deletion Method:</strong> Electronic files are permanently deleted using irreversible methods. Physical documents (if any) are shredded or incinerated.</p>
            </div>
        ),
    },
    {
        icon: UserCheck,
        color: 'text-indigo-400',
        title: 'Article 7. Your Rights',
        content: (
            <div className="space-y-3">
                <p>You have the following rights regarding your personal data:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>Right of Access:</strong> Request a copy of your personal data that we process.</li>
                    <li><strong>Right to Rectification:</strong> Request correction of inaccurate personal data.</li>
                    <li><strong>Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> Request deletion of your personal data.</li>
                    <li><strong>Right to Restriction:</strong> Request restriction of processing of your personal data.</li>
                    <li><strong>Right to Data Portability:</strong> Receive your personal data in a structured, commonly used format.</li>
                    <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for data collection and processing at any time.</li>
                </ol>
                <p className="mt-3">You may exercise these rights through your account settings or by contacting us at <a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>. We will respond without undue delay.</p>
            </div>
        ),
    },
    {
        icon: Cookie,
        color: 'text-orange-400',
        title: 'Article 8. Cookies & Tracking Technologies',
        content: (
            <div className="space-y-3">
                <ol className="list-decimal list-inside space-y-3">
                    <li>
                        <strong>Purpose of Cookies:</strong> We use cookies to maintain your login session, improve your service experience, and collect usage analytics.
                    </li>
                    <li>
                        <strong>Types of Cookies:</strong>
                        <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-slate-400">
                            <li><strong className="text-slate-200">Essential Cookies:</strong> Login authentication, session management (Supabase Auth)</li>
                            <li><strong className="text-slate-200">Analytics Cookies:</strong> Service usage pattern analysis (anonymized)</li>
                            <li><strong className="text-slate-200">Functional Cookies:</strong> Language preferences, dark mode, and user settings</li>
                        </ul>
                    </li>
                    <li><strong>Opting Out:</strong> You may opt out of cookies through your browser settings. However, this may <strong>limit certain features such as login functionality.</strong></li>
                </ol>
            </div>
        ),
    },
    {
        icon: Lock,
        color: 'text-rose-400',
        title: 'Article 9. Security Measures',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>Encryption:</strong> Passwords are stored using <strong>one-way encryption (bcrypt)</strong>, and all data in transit is encrypted with <strong>TLS 1.2 or higher.</strong></li>
                <li><strong>Access Control:</strong> Access to personal data is restricted to the minimum necessary, with authentication required for administrative access.</li>
                <li><strong>Security Monitoring:</strong> We operate security systems to prevent unauthorized access and data breaches, with immediate incident response protocols.</li>
                <li><strong>Regular Audits:</strong> We conduct periodic security vulnerability assessments to ensure data protection.</li>
            </ol>
        ),
    },
    {
        icon: Shield,
        color: 'text-teal-400',
        title: 'Article 10. Data Protection Officer',
        content: (
            <div className="space-y-3">
                <p>The Company has designated a Data Protection Officer to manage personal data processing and to address privacy-related inquiries and complaints:</p>
                <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <ul className="space-y-2 text-sm">
                        <li><strong>Title:</strong> CEO / Data Protection Officer</li>
                        <li><strong>Email:</strong> <a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a></li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Globe,
        color: 'text-sky-400',
        title: 'Article 11. Changes to This Policy',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>This Privacy Policy may be updated to reflect changes in laws, policies, or security technology.</li>
                <li>Changes will be announced at least <strong>7 days in advance</strong> via in-service notice or email.</li>
                <li>For significant changes (additions to data collected, changes in third-party sharing, etc.), notice will be given <strong>30 days in advance</strong>, and re-consent may be requested where required.</li>
            </ol>
        ),
    },
];
