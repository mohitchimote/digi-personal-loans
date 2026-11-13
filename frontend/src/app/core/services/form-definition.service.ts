import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import { FormVersionSchema } from './form-builder.service';
import { API_BASE } from './api-base';

/** The currently published definition of an application form, for screens that list applications and
 * so have no single application (with its own `formSchema`) to read it from. Fetched once per form. */
@Injectable({ providedIn: 'root' })
export class FormDefinitionService {
  private cache = new Map<string, Observable<FormVersionSchema>>();

  constructor(private http: HttpClient) {}

  published(formKey: 'personal-loan-wizard' | 'business-loan-wizard'): Observable<FormVersionSchema> {
    let o = this.cache.get(formKey);
    if (!o) {
      o = this.http.get<{ schema: FormVersionSchema }>(`${API_BASE}/api/forms/${formKey}/published-schema`).pipe(map((r) => r.schema), shareReplay(1));
      this.cache.set(formKey, o);
    }
    return o;
  }
}
