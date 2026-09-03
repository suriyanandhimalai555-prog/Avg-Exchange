import { Link } from 'react-router-dom';
import { legalStyles as s } from '../components/LegalStyles';

const LAST_UPDATED = 'September 2026';

const SECTIONS = [
  {
    heading: 'Trading Fees',
    intro:
      'AVG Exchange applies a flat zero-fee schedule to all spot markets during the current launch phase. All trading pairs are quoted against USDT.',
    list: [
      'Maker fee: 0.00% on all spot markets',
      'Taker fee: 0.00% on all spot markets',
      'No minimum trading volume or tier requirements apply.',
    ],
  },
  {
    heading: 'Deposit Fees',
    paragraphs: [
      'AVG Exchange does not charge a fee to deposit cryptocurrency. Deposits are processed in crypto through our payment partner; fiat deposits are not supported.',
      'Standard blockchain network (gas) fees, where applicable, are set by the underlying network and paid to the network — not to AVG Exchange.',
    ],
  },
  {
    heading: 'Withdrawal Fees',
    paragraphs: [
      'AVG Exchange does not currently charge a platform fee for withdrawals. Withdrawals are processed in cryptocurrency and are subject to manual review before release.',
      'Where a withdrawal is broadcast on-chain, standard blockchain network fees may apply and are determined by the destination network.',
    ],
  },
  {
    heading: 'Notes',
    list: [
      'USDT is a stablecoin and is used as the quote currency; it is not classified as fiat.',
      'This schedule applies to spot trading only. AVG Exchange does not offer margin, futures, options, or lending.',
      'Fees may change from time to time. Any changes will be published on this page with prior notice on the Platform.',
      'There are no hidden fees beyond those stated here and any applicable third-party blockchain network fees.',
    ],
  },
];

const Fees = () => {
  return (
    <div className={s.page}>
      <div className={s.container}>
        <header className={s.header}>
          <h1 className={s.title}>Fee Schedule</h1>
          <p className={s.updated}>Last updated: {LAST_UPDATED}</p>
          <p className={s.intro}>
            This page sets out the trading, deposit, and withdrawal fees for AVG Exchange. All spot
            markets currently trade with zero platform fees.
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
            Questions
          </h2>
          <p className={s.contactText}>
            Questions about fees? Email us at{' '}
            <a href="mailto:support@avgexchange.io" className={s.link}>support@avgexchange.io</a>.
            See also our <Link to="/terms" className={s.link}>Terms of Service</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Fees;
