import { Link } from 'react-router-dom';
import { legalStyles as s } from '../components/LegalStyles';

const LAST_UPDATED = 'September 2026';

const SECTIONS = [
  {
    heading: 'Acceptance of Terms',
    paragraphs: [
      'These Terms of Service ("Terms") govern your access to and use of the AVG Exchange website, applications, and services (collectively, the "Platform"), operated by AVG Exchange ("we", "us", or "our").',
      'By creating an account, accessing, or using the Platform, you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must not use the Platform.',
    ],
  },
  {
    heading: 'Eligibility',
    paragraphs: [
      'To use the Platform you must be at least 18 years old (or the age of legal majority in your jurisdiction) and have the legal capacity to enter into a binding agreement.',
      'Access may be restricted in certain jurisdictions. You are responsible for ensuring that your use of the Platform is lawful where you reside. We may require you to complete identity verification (KYC) before enabling deposits, trading, or withdrawals.',
    ],
  },
  {
    heading: 'Account Registration & Security',
    paragraphs: [
      'You agree to provide accurate, current, and complete information during registration and to keep it up to date. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.',
      'Notify us immediately of any unauthorized access or security breach. We are not liable for losses arising from your failure to safeguard your account.',
    ],
  },
  {
    heading: 'Virtual Balances & Trading',
    paragraphs: [
      'The Platform provides spot trading of supported digital assets against USDT. Balances shown in your account represent your recorded entitlement on the Platform and may be reflected as virtual balances during the current phase of the service.',
      'Orders are matched on a price-time priority basis. We do not guarantee that any order will be filled, filled in full, or filled at a particular price. Zero trading fees, where advertised, apply only to eligible spot markets and may change with notice.',
    ],
  },
  {
    heading: 'Prohibited Activities',
    intro: 'You agree not to:',
    list: [
      'Use the Platform for money laundering, terrorist financing, fraud, or any unlawful purpose.',
      'Engage in market manipulation, wash trading, spoofing, or other abusive trading practices.',
      'Access the Platform using automated means not authorized by us, or attempt to disrupt or compromise its security or integrity.',
      'Provide false information or use another person’s identity to open or operate an account.',
    ],
  },
  {
    heading: 'Risk Disclosure',
    paragraphs: [
      'Trading digital assets involves significant risk. Prices are highly volatile and may result in the total loss of your funds. Digital assets are not legal tender, are not backed by any government, and balances held on the Platform are not insured by any deposit insurance scheme.',
      'You are solely responsible for your trading decisions. Nothing on the Platform constitutes financial, investment, legal, or tax advice.',
    ],
  },
  {
    heading: 'Fees',
    paragraphs: [
      'Applicable fees for trading, deposits, or withdrawals (if any) are displayed on the Platform and may be updated from time to time. You are responsible for any network or third-party fees associated with your transactions.',
    ],
  },
  {
    heading: 'Suspension & Termination',
    paragraphs: [
      'We may suspend, restrict, or terminate your access to the Platform at any time, with or without notice, if we reasonably believe you have violated these Terms, applicable law, or to protect the security of the Platform and its users.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    paragraphs: [
      'To the maximum extent permitted by law, the Platform is provided "as is" and "as available" without warranties of any kind. We are not liable for any indirect, incidental, special, or consequential damages, or for any loss of profits, data, or digital assets arising from your use of the Platform.',
    ],
  },
  {
    heading: 'Governing Law',
    paragraphs: [
      'These Terms are governed by the laws of the jurisdiction in which AVG Exchange is established, without regard to conflict-of-law principles. Any disputes shall be subject to the exclusive jurisdiction of the competent courts of that jurisdiction.',
    ],
  },
  {
    heading: 'Changes to These Terms',
    paragraphs: [
      'We may update these Terms from time to time. Material changes will be notified through the Platform. Your continued use after changes take effect constitutes acceptance of the revised Terms.',
    ],
  },
];

const Terms = () => {
  return (
    <div className={s.page}>
      <div className={s.container}>
        <header className={s.header}>
          <h1 className={s.title}>Terms of Service</h1>
          <p className={s.updated}>Last updated: {LAST_UPDATED}</p>
          <p className={s.intro}>
            Please read these Terms carefully before using AVG Exchange. They set out the rules for
            using our cryptocurrency trading platform.
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
            Questions about these Terms? Email us at{' '}
            <a href="mailto:support@avgexchange.io" className={s.link}>support@avgexchange.io</a>.
            See also our <Link to="/privacy" className={s.link}>Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Terms;
