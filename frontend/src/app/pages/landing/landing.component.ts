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
    { icon: 'bolt',          title: 'Instant Decision',    desc: 'Get a conditional approval in minutes with our automated assessment engine.' },
    { icon: 'lock',          title: 'Bank-Grade Security', desc: 'Your data is protected with 256-bit encryption and multi-factor authentication.' },
    { icon: 'phone_android', title: 'Fully Digital',       desc: 'Apply, upload documents, and track your application — all online, anytime.' },
    { icon: 'support_agent', title: 'Dedicated Advisor',   desc: 'A personal advisor is available throughout your journey for guidance and support.' },
  ];

  loanTypes = [
    { icon: 'home',         title: 'Home Improvement',  amount: '₪10K – ₪300K', rate: 'from 4.8% APR' },
    { icon: 'directions_car',title: 'Vehicle Purchase',  amount: '₪20K – ₪150K', rate: 'from 5.0% APR' },
    { icon: 'school',       title: 'Education',          amount: '₪5K – ₪80K',  rate: 'from 5.5% APR' },
    { icon: 'credit_card',  title: 'Debt Consolidation', amount: '₪10K – ₪250K', rate: 'from 4.8% APR' },
  ];
}
