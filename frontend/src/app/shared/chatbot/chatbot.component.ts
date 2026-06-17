import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message { role: 'bot' | 'user'; text: string; }

const RESPONSES: Record<string, string> = {
  'rate':        'Our rates start from 4.8% APR. The exact rate depends on your credit profile and loan term.',
  'amount':      'You can borrow between ₪5,000 and ₪300,000 depending on the product and your eligibility.',
  'eligib':      'Eligibility is based on your income, credit score, and existing commitments. Our affordability check will give you an instant result.',
  'document':    'You will need: payslips (last 3 months), bank statements (last 6 months), a valid ID, and proof of address.',
  'how long':    'Once submitted, our assessment typically completes within minutes for a conditional decision.',
  'term':        'Loan terms range from 6 months to 84 months (7 years) depending on the product.',
  'repay':       'Repayments are collected monthly by direct debit on your chosen date.',
  'credit':      'A minimum credit score of 580 is required. Higher scores may unlock better rates.',
  'hello':       'Hello! I\'m DigiBot, your DigiBank assistant. How can I help you today?',
  'hi':          'Hi there! How can I assist you with your personal loan application?',
};

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss'
})
export class ChatbotComponent {
  open = signal(false);
  messages = signal<Message[]>([
    { role: 'bot', text: 'Hello! I\'m DigiBot 🤖 Your personal loan assistant. Ask me anything about rates, eligibility, or how to apply.' }
  ]);
  input = '';

  toggle(): void { this.open.set(!this.open()); }

  send(): void {
    const text = this.input.trim();
    if (!text) return;
    this.messages.update(m => [...m, { role: 'user', text }]);
    this.input = '';

    const lower = text.toLowerCase();
    const key = Object.keys(RESPONSES).find(k => lower.includes(k));
    const reply = key ? RESPONSES[key] : 'I\'m not sure about that. Please call us on +972-3-123-4567 or visit a branch for personalised advice.';

    setTimeout(() => {
      this.messages.update(m => [...m, { role: 'bot', text: reply }]);
    }, 600);
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.send();
  }
}
