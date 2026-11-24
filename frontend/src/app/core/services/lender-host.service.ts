import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './api-base';

export interface LenderHostContext {
  /** The lender that owns this address, when it is a lender's own address. */
  lender: { code: string; name: string } | null;
  hostMapped: boolean;
  /** True only on a shared address (platform host, workers.dev) with several lenders: the visitor may need to say which. */
  choiceNeeded: boolean;
}

/** Whether this address identifies a lender. The login and registration pages ask for a lender code
 * only when it does not and there is more than one lender. */
@Injectable({ providedIn: 'root' })
export class LenderHostService {
  readonly context = signal<LenderHostContext | null>(null);
  /** Hidden until the server has answered, so the field never flashes up and disappears. */
  readonly askForLenderCode = computed(() => this.context()?.choiceNeeded ?? false);

  constructor(http: HttpClient) {
    http.get<LenderHostContext>(`${API_BASE}/api/auth/context`).subscribe({ next: c => this.context.set(c), error: () => {} });
  }
}
