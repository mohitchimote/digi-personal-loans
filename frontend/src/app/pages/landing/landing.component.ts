import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChatbotComponent } from '../../shared/chatbot/chatbot.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ChatbotComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  features = [
    { icon: '⚡', title: 'Instant Decision', desc: 'Get a conditional approval in minutes with our automated assessment engine.' },
    { icon: '🔒', title: 'Bank-Grade Security', desc: 'Your data is protected with 256-bit encryption and multi-factor authentication.' },
    { icon: '📱', title: 'Fully Digital', desc: 'Apply, upload documents, and track your application — all online, anytime.' },
    { icon: '💼', title: 'Dedicated Advisor', desc: 'A personal advisor is available throughout your journey for guidance and support.' },
  ];

  loanTypes = [
    { icon: '🏠', title: 'Home Improvement', amount: '₪10K – ₪300K', rate: 'from 4.8% APR' },
    { icon: '🚗', title: 'Vehicle Purchase',  amount: '₪20K – ₪150K', rate: 'from 5.0% APR' },
    { icon: '🎓', title: 'Education',         amount: '₪5K – ₪80K',  rate: 'from 5.5% APR' },
    { icon: '💳', title: 'Debt Consolidation',amount: '₪10K – ₪250K', rate: 'from 4.8% APR' },
  ];
}
