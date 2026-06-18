import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandingService } from './core/services/branding.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  constructor(private branding: BrandingService) {}

  ngOnInit(): void {
    this.branding.loadAndApply();
  }
}
