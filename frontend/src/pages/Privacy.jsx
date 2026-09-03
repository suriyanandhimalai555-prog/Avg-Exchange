import { Link } from 'react-router-dom';
import { legalStyles as s } from '../components/LegalStyles';

const LAST_UPDATED = 'September 2026';

const SECTIONS = [
  {
    heading: 'Introduction',
    paragraphs: [
      'This Privacy Policy explains how AVG Exchange ("we", "us", or "our") collects, uses, shares, and protects your personal information when you use our website, applications, and services (the "Platform").',
      'By using the Platform, you consent to the practices described in this Policy.',
    ],
  },
  {
    heading: 'Information We Collect',
    intro: 'We collect the following categories of information:',
    list: [
      'Identity & KYC data: name, date of birth, nationality, government-issued ID, and verification documents required to comply with regulatory obligations.',
      'Account data: email address, password (stored in hashed form), and referral code.',
      'Transaction data: orders, trades, balances, deposits, withdrawals, and associated wallet or blockchain addresses.',
      'Usage & technical data: IP address, device and browser information, and interactions with the Platform.',
    ],
  },
  {
    heading: 'How We Use Your Information',
    intro: 'We use your information to:',
    list: [
      'Provide, operate, and maintain the Platform and process your transactions.',
      'Verify your identity and comply with anti-money-laundering (AML), KYC, and other legal obligations.',
      'Detect and prevent fraud, abuse, and security incidents.',
      'Communicate with you about your account, security, and service updates.',
      'Improve and develop our services.',
    ],
  },
  {
    heading: 'Legal Basis for Processing',
    paragraphs: [
      'Where applicable, we process personal data on the basis of performance of our contract with you, compliance with legal obligations, our legitimate interests in operating a secure platform, and, where required, your consent.',
    ],
  },
  {
    heading: 'Sharing & Third Parties',
    paragraphs: [
      'We do not sell your personal information. We may share it with identity-verification and compliance providers, payment and infrastructure providers, and with regulators or law-enforcement authorities where legally required or to protect our rights and users.',
    ],
  },
  {
    heading: 'Cookies & Tracking',
    paragraphs: [
      'We use cookies and similar technologies to keep you signed in, remember preferences, and understand how the Platform is used. You can control cookies through your browser settings, though some features may not function correctly if disabled.',
    ],
  },
  {
    heading: 'Data Security',
    paragraphs: [
      'We implement technical and organizational measures to protect your information, including encryption of sensitive data in transit and hashing of credentials. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
    ],
  },
  {
    heading: 'Data Retention',
    paragraphs: [
      'We retain personal data for as long as your account is active and thereafter as required to meet legal, regulatory, tax, and accounting obligations, or to resolve disputes and enforce our agreements.',
    ],
  },
  {
    heading: 'Your Rights',
    paragraphs: [
      'Subject to applicable law, you may have the right to access, correct, delete, or restrict the processing of your personal data, and to object to certain processing or request portability. Note that some data must be retained to satisfy regulatory obligations. To exercise your rights, contact us using the details below.',
    ],
  },
  {
    heading: 'International Transfers',
    paragraphs: [
      'Your information may be processed and stored in countries other than your own. Where we transfer data internationally, we take steps to ensure an adequate level of protection consistent with applicable law.',
    ],
  },
  {
    heading: 'Children’s Privacy',
    paragraphs: [
      'The Platform is not intended for individuals under 18. We do not knowingly collect personal information from minors. If we learn that we have done so, we will delete it.',
    ],
  },
  {
    heading: 'Changes to This Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. Material changes will be notified through the Platform. Your continued use after changes take effect constitutes acceptance of the revised Policy.',
    ],
  },
];

const Privacy = () => {
  return (
    <div className={s.page}>
      <div className={s.container}>
        <header className={s.header}>
          <h1 className={s.title}>Privacy Policy</h1>
          <p className={s.updated}>Last updated: {LAST_UPDATED}</p>
          <p className={s.intro}>
            Your privacy matters to us. This Policy describes what data AVG Exchange collects and how
            we use and protect it.
          </p>
        </header>

        {SECTIONS.map((section, i) => (
          <section key={section.heading} id={`section-${i + 1}`} className={s.section}>
            <h2 className={s.heading}>
              <span className={s.index}>{String(i + 1).padStart(2, '0')}</span>
              {section.heading}
            </h2>
            <div className={s.body}>
              {section.intro && <p>{section.intro}</p>}
              {section.paragraphs?.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {section.list && (
                <ul className={s.list}>
                  {section.list.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}

        <div className={s.contactBox}>
          <h2 className={s.heading}>
            <span className={s.index}>{String(SECTIONS.length + 1).padStart(2, '0')}</span>
            Contact Us
          </h2>
          <p className={s.contactText}>
            Questions about your privacy? Email us at{' '}
            <a href="mailto:privacy@avgexchange.io" className={s.link}>privacy@avgexchange.io</a>.
            See also our <Link to="/terms" className={s.link}>Terms of Service</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
