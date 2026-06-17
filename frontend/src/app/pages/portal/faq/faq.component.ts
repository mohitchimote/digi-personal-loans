import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FaqItem { q: string; a: string; videoId?: string; open: boolean; }
interface FaqCategory { title: string; icon: string; items: FaqItem[]; }

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss'
})
export class FaqComponent {
  categories: FaqCategory[] = [
    {
      title: 'Loan Eligibility', icon: '✓',
      items: [
        { q: 'Who is eligible to apply for a DigiBank personal loan?', a: 'To be eligible you must be an Israeli resident aged 18 or over, with a valid Teudat Zehut (National ID), a monthly gross income of at least ₪8,000, and a credit score of 580 or above. Additional criteria may apply based on the product selected.', open: false },
        { q: 'Can I apply if I am self-employed?', a: 'Yes. Self-employed applicants are welcome. You will need to provide your most recent two years of income tax assessments (Shuma) and bank statements showing regular income deposits.', videoId: 'placeholder', open: false },
        { q: 'What is the minimum and maximum loan amount?', a: 'Our personal loan range is ₪5,000 to ₪300,000, subject to affordability assessment and the specific product you qualify for.', open: false },
      ]
    },
    {
      title: 'Application Process', icon: '📋',
      items: [
        { q: 'How long does the application take to complete?', a: 'The online application typically takes 10–15 minutes to complete. Once submitted, an automated affordability assessment is performed instantly. A conditional decision is usually available within minutes.', videoId: 'placeholder', open: false },
        { q: 'What documents will I need?', a: 'You will need: a valid Teudat Zehut (National ID), proof of income (recent payslips or Shuma for self-employed), recent bank statements (last 3 months), and proof of address (utility bill or bank statement).', open: false },
        { q: 'Can I save my application and return to it later?', a: 'Yes. DigiBank\'s portal automatically saves your progress at every step. Simply log back in and your application will resume exactly where you left off.', open: false },
        { q: 'What happens after I submit my application?', a: 'Your application goes through an automated affordability assessment. If successful, you will be shown eligible loan products. Once you select a product, a conditional approval is issued and your loan agreement documents are generated automatically.', videoId: 'placeholder', open: false },
      ]
    },
    {
      title: 'Interest Rates & Repayments', icon: '₪',
      items: [
        { q: 'What interest rates does DigiBank offer?', a: 'Our personal loan rates start from 4.8% APR for qualifying customers. The rate offered to you will depend on your credit profile, loan amount, term, and the product selected. Your personalised rate will be shown before you accept any offer.', open: false },
        { q: 'How is my monthly repayment calculated?', a: 'Monthly repayments are calculated using the standard amortisation formula, dividing the loan principal equally over the term with interest. Your repayment schedule will be provided in your loan agreement documentation.', videoId: 'placeholder', open: false },
        { q: 'Can I make early repayments?', a: 'Yes. DigiBank allows early partial or full repayments. Early settlement fees may apply — please refer to your loan agreement or speak to your advisor for specific terms.', open: false },
        { q: 'On which date will my repayments be taken?', a: 'You can choose your preferred monthly repayment date during the application (1st–28th of the month). Repayments are collected via direct debit from your nominated bank account.', open: false },
      ]
    },
    {
      title: 'Credit & Affordability', icon: '📊',
      items: [
        { q: 'Will applying affect my credit score?', a: 'The initial application performs a soft credit search, which does not affect your credit score. A full credit search will only be performed when you accept a conditional offer, as disclosed in the credit consent declaration.', open: false },
        { q: 'What is the Debt-to-Income (DTI) ratio?', a: 'Your DTI ratio compares your total monthly debt obligations to your gross monthly income. DigiBank\'s lending policy requires a DTI ratio of 40% or below. A lower DTI demonstrates stronger repayment capacity.', open: false },
        { q: 'My affordability assessment did not pass — what can I do?', a: 'If your automated assessment does not pass, please contact your DigiBank advisor for a manual review. Changes in circumstances, additional income documentation, or a reduced loan amount may result in a different outcome.', open: false },
      ]
    },
    {
      title: 'Security & Privacy', icon: '🔒',
      items: [
        { q: 'How does DigiBank protect my personal data?', a: 'All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. DigiBank complies fully with Israeli Privacy Protection Law 5741-1981 and GDPR-equivalent standards.', open: false },
        { q: 'Who can see my application information?', a: 'Only authorised DigiBank personnel directly involved in the processing of your application can access your data. Data is never sold or shared with third parties for marketing purposes.', open: false },
      ]
    }
  ];

  toggle(cat: FaqCategory, item: FaqItem): void {
    item.open = !item.open;
  }

  openCount(cat: FaqCategory): number { return cat.items.filter(i => i.open).length; }
}
