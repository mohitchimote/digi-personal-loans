import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowAdminService, WorkflowCatalog, WorkflowVersionRow } from '../../../core/services/workflow-admin.service';
import { AdminService, RoleRow } from '../../../core/services/admin.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

import { route, NODE_W, NODE_H, LANE_W, TOP } from './workflow-router';

type ParamKind = 'text' | 'select' | 'status' | 'statuses' | 'track' | 'json';
interface ParamSpec { name: string; kind: ParamKind; options?: string[] }

/** Nodes and edges are derived from the definition for drawing. */
interface NodeView { key: string; label: string; x: number; y: number; h: number; stage: string | null; badge: string; entry: boolean }
interface EdgeView {
  id: string; key: string; from: string; to: string; path: string; selected: boolean; dim: boolean; hot: boolean;
  actor: 'customer' | 'staff' | 'system';
  label?: { x: number; y: number; w: number; text: string; full: string; floating?: boolean };
}

/** The visual workflow builder: statuses are nodes in stage lanes, transitions are arrows. Everything
 * edits a DRAFT definition through the admin API; publishing makes it the version new cases use
 * (cases already open stay on the version they started with). */
@Component({
  selector: 'app-admin-workflow-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-workflow-builder.component.html',
  styleUrl: './admin-workflow-builder.component.scss'
})
export class AdminWorkflowBuilderComponent implements OnInit, OnDestroy {
  @ViewChild('svg') svgRef?: ElementRef<SVGSVGElement>;

  // ---- data
  versions = signal<WorkflowVersionRow[]>([]);
  current = signal<WorkflowVersionRow | null>(null);
  def = signal<any | null>(null);
  /** Bumped on every in-place edit so computed views over `def` re-run. */
  rev = signal(0);
  catalog = signal<WorkflowCatalog | null>(null);
  roles = signal<RoleRow[]>([]);

  // ---- ui state
  loading = signal(true);
  trackKey = signal('');
  selection = signal<{ kind: 'status' | 'transition'; key: string } | null>(null);
  tab = signal<'selection' | 'stages' | 'queues' | 'events' | 'simulate' | 'problems'>('selection');
  errors = signal<string[]>([]);
  dirty = signal(false);
  saving = signal(false);
  message = signal('');
  failure = signal('');
  confirming = signal<'publish' | 'discard' | null>(null);
  changeNote = '';

  editable = computed(() => this.current()?.status === 'DRAFT');
  hasDraft = computed(() => this.versions().some(v => v.status === 'DRAFT'));
  track = computed(() => { this.rev(); return this.def()?.tracks.find((t: any) => t.key === this.trackKey()) ?? null; });

  // ---- canvas interaction
  private dragging: { key: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
  dragPos = signal<{ key: string; x: number; y: number } | null>(null);
  hoverKey = signal<string | null>(null);
  connecting = signal<{ from: string; x: number; y: number } | null>(null);
  private validateTimer: any;

  // ---- simulator
  simRole = signal('');
  simActor = signal<'STAFF' | 'CUSTOMER'>('STAFF');
  simStatus = signal('');

  constructor(private api: WorkflowAdminService, private adminSvc: AdminService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.api.catalog().subscribe(c => this.catalog.set(c));
    this.adminSvc.getRoles().subscribe(r => { this.roles.set(r.roles); if (r.roles.length && !this.simRole()) this.simRole.set(r.roles[0].code); });
    this.reloadVersions(true);
  }

  ngOnDestroy(): void { clearTimeout(this.validateTimer); }

  // ================================================================== versions
  private reloadVersions(open: boolean, openId?: number): void {
    this.api.versions().subscribe({
      next: rows => {
        this.versions.set(rows);
        this.loading.set(false);
        if (!open) return;
        const target = openId ? rows.find(r => r.id === openId) : (rows.find(r => r.status === 'DRAFT') ?? rows.find(r => r.status === 'PUBLISHED') ?? rows[0]);
        if (target) this.openVersion(target.id);
      },
      error: () => { this.loading.set(false); this.failure.set(this.i18n.t('admin.wf.errLoad')); }
    });
  }

  openVersion(id: number): void {
    this.api.version(id).subscribe({
      next: v => {
        this.current.set(v);
        this.def.set(v.definition);
        this.rev.update(n => n + 1);
        this.dirty.set(false);
        this.errors.set([]);
        this.selection.set(null);
        this.changeNote = v.changeNote ?? '';
        this.confirming.set(null);
        const first = v.definition.tracks[0]?.key ?? '';
        if (!v.definition.tracks.some((t: any) => t.key === this.trackKey())) this.trackKey.set(first);
        this.simStatus.set(v.definition.tracks[0]?.statuses[0]?.key ?? '');
        if (v.status === 'DRAFT') this.runValidate();
      },
      error: () => this.failure.set(this.i18n.t('admin.wf.errLoad'))
    });
  }

  onVersionPicked(id: string): void {
    if (this.dirty() && !window.confirm(this.i18n.t('admin.wf.discardChanges'))) return;
    this.openVersion(Number(id));
  }

  versionLabel(v: WorkflowVersionRow): string {
    return `v${v.version} · ${this.i18n.t('admin.wf.status.' + v.status)} · ${v.caseCount ?? 0} ${this.i18n.t('admin.wf.cases')}`;
  }

  createDraft(): void {
    const cur = this.current();
    if (!cur) return;
    this.api.createDraft(cur.key, cur.id).subscribe({
      next: d => { this.reloadVersions(true, d.id); this.flash(this.i18n.t('admin.wf.draftCreated')); },
      error: e => this.fail(e)
    });
  }

  save(done?: () => void): void {
    const cur = this.current();
    if (!cur || !this.editable()) return;
    this.saving.set(true); this.failure.set('');
    this.api.saveDraft(cur.id, this.def(), this.changeNote.trim() || null).subscribe({
      next: () => { this.saving.set(false); this.dirty.set(false); this.flash(this.i18n.t('admin.wf.saved')); this.reloadVersions(false); done?.(); },
      error: e => this.fail(e)
    });
  }

  publish(): void {
    const cur = this.current();
    if (!cur) return;
    // Publishing always saves first so what is on screen is exactly what goes live.
    this.save(() => {
      this.saving.set(true);
      this.api.publish(cur.id).subscribe({
        next: () => { this.saving.set(false); this.confirming.set(null); this.flash(this.i18n.t('admin.wf.published')); this.reloadVersions(true, cur.id); },
        error: e => { this.confirming.set(null); this.fail(e); }
      });
    });
  }

  discard(): void {
    const cur = this.current();
    if (!cur) return;
    this.api.discard(cur.id).subscribe({
      next: () => { this.confirming.set(null); this.reloadVersions(true); this.flash(this.i18n.t('admin.wf.discarded')); },
      error: e => this.fail(e)
    });
  }

  private fail(err: any): void {
    this.saving.set(false);
    const errs: string[] | undefined = err?.error?.errors;
    if (errs?.length) { this.errors.set(errs); this.tab.set('problems'); }
    this.failure.set(err?.error?.message || this.i18n.t('admin.wf.errSave'));
  }

  private flash(text: string): void { this.message.set(text); this.failure.set(''); setTimeout(() => this.message.set(''), 3500); }

  // ================================================================== editing core
  /** Call after any in-place change to the definition. */
  touch(): void {
    this.rev.update(n => n + 1);
    this.dirty.set(true);
    this.message.set('');
    clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => this.runValidate(), 500);
  }

  set(obj: any, prop: string, value: any): void { obj[prop] = value; this.touch(); }

  private runValidate(): void {
    const d = this.def();
    if (!d || !this.editable()) return;
    this.api.validate(d).subscribe({ next: r => this.errors.set(r.errors ?? []), error: () => {} });
  }

  private uniqueKey(base: string, taken: Set<string>): string {
    const clean = base.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]+/, 'X') || 'X';
    let k = clean, n = 2;
    while (taken.has(k)) k = `${clean}_${n++}`;
    return k;
  }

  private allTransitionKeys(): Set<string> {
    return new Set<string>(this.def().tracks.flatMap((t: any) => t.transitions.map((x: any) => x.key)));
  }

  // ---- statuses
  addStatus(): void {
    const t = this.track(); if (!t) return;
    const key = this.uniqueKey('NEW_STATUS', new Set(t.statuses.map((s: any) => s.key)));
    t.statuses.push({ key, stage: this.def().stages[0]?.key ?? null, category: 'ACTIVE', badge: 'review', label: { en: 'New status', he: 'New status' } });
    this.touch();
    this.selection.set({ kind: 'status', key }); this.tab.set('selection');
  }

  renameStatus(s: any, raw: string): void {
    const t = this.track(); if (!t) return;
    const next = raw.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(next) || next === s.key || t.statuses.some((x: any) => x.key === next)) return;
    const old = s.key;
    const swap = (k: string) => (k === old ? next : k);
    for (const x of t.transitions) {
      x.from = x.from.map(swap);
      if (x.to === old) x.to = next;
      for (const g of x.guards) if (g.type === 'REFERRAL_LOCK' && g.status === old) g.status = next;
    }
    for (const g of this.def().tracks.flatMap((tr: any) => tr.transitions.flatMap((x: any) => x.guards)))
      if (g.type === 'TRACK_STATUS_IS' && g.track === t.key) g.statuses = g.statuses.map(swap);
    for (const e of t.entryPoints ?? []) if (e.status === old) e.status = next;
    if (t.initialStatus === old) t.initialStatus = next;
    for (const q of this.def().queues) if (q.track === t.key) q.statuses = q.statuses.map(swap);
    s.key = next;
    this.selection.set({ kind: 'status', key: next });
    this.touch();
  }

  removeStatus(key: string): void {
    const t = this.track(); if (!t) return;
    t.statuses = t.statuses.filter((s: any) => s.key !== key);
    for (const x of t.transitions) { x.from = x.from.filter((f: string) => f !== key); if (x.to === key) delete x.to; }
    t.transitions = t.transitions.filter((x: any) => x.from.length > 0);
    for (const q of this.def().queues) if (q.track === t.key) q.statuses = q.statuses.filter((s: string) => s !== key);
    this.selection.set(null);
    this.touch();
  }

  // ---- transitions
  addTransition(from: string, to: string): void {
    const t = this.track(); if (!t) return;
    const key = this.uniqueKey(`${from}_to_${to}`.toLowerCase(), this.allTransitionKeys());
    t.transitions.push({ key, label: { en: 'New action', he: 'New action' }, actors: ['STAFF'], from: [from], to, guards: [{ type: 'CASE_VISIBLE' }], effects: [] });
    this.touch();
    this.selection.set({ kind: 'transition', key }); this.tab.set('selection');
  }

  renameTransition(x: any, raw: string): void {
    const next = raw.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(next) || next === x.key || this.allTransitionKeys().has(next)) return;
    x.key = next;
    this.selection.set({ kind: 'transition', key: next });
    this.touch();
  }

  removeTransition(key: string): void {
    const t = this.track(); if (!t) return;
    t.transitions = t.transitions.filter((x: any) => x.key !== key);
    this.selection.set(null);
    this.touch();
  }

  toggleActor(x: any, actor: string): void {
    x.actors = x.actors.includes(actor) ? x.actors.filter((a: string) => a !== actor) : [...x.actors, actor];
    this.touch();
  }

  toggleFrom(x: any, status: string): void {
    x.from = x.from.includes(status) ? x.from.filter((s: string) => s !== status) : [...x.from, status];
    this.touch();
  }

  setEntitlement(x: any, v: string): void { if (v) x.entitlement = v; else delete x.entitlement; this.touch(); }
  setTarget(x: any, v: string): void { if (v) x.to = v; else delete x.to; this.touch(); }

  // ---- guards and effects: generic, driven by the parameter specs below
  // The specs MUST have stable identity: the template iterates them with *ngFor, and a fresh array of
  // fresh objects on every change-detection pass makes Angular recreate every parameter input each
  // pass, each recreation schedules another pass, and the tab freezes (this was the "hang" when
  // selecting an action that has effects).
  private static readonly GUARD_SPECS: Record<string, ParamSpec[]> = {
    REFERRAL_LOCK: [{ name: 'status', kind: 'status' }],
    AMOUNT_POSITIVE: [{ name: 'field', kind: 'text' }],
    MANDATE: [{ name: 'amountField', kind: 'text' }],
    TRACK_STATUS_IS: [{ name: 'track', kind: 'track' }, { name: 'statuses', kind: 'statuses' }],
  };
  private static readonly NO_SPEC: ParamSpec[] = [];

  guardSpec(type: string): ParamSpec[] { return AdminWorkflowBuilderComponent.GUARD_SPECS[type] ?? AdminWorkflowBuilderComponent.NO_SPEC; }

  private effectSpecs = computed<Record<string, ParamSpec[]>>(() => {
    const c = this.catalog();
    return {
      SET: [{ name: 'field', kind: 'select', options: c?.setFields ?? [] }, { name: 'value', kind: 'json' }],
      REFERRAL_OPEN: [{ name: 'toRole', kind: 'text' }],
      NOTE: [{ name: 'noteType', kind: 'text' }, { name: 'section', kind: 'text' }, { name: 'text', kind: 'text' }],
      NOTIFY: [{ name: 'template', kind: 'select', options: c?.notifyTemplates ?? [] }, { name: 'vars', kind: 'json' }],
      EMAIL: [{ name: 'event', kind: 'select', options: c?.emailEvents ?? [] }, { name: 'vars', kind: 'json' }],
      GENERATE_DOC: [{ name: 'doc', kind: 'select', options: ['APPROVAL_LETTER'] }],
      CARD_PAYMENT: [{ name: 'mode', kind: 'select', options: ['AUTHORISE'] }],
    };
  });

  effectSpec(type: string): ParamSpec[] { return this.effectSpecs()[type] ?? AdminWorkflowBuilderComponent.NO_SPEC; }

  paramTrack = (_: number, p: ParamSpec) => p.name;

  private defaultsFor(specs: ParamSpec[]): Record<string, any> {
    const out: Record<string, any> = {};
    const t = this.track();
    for (const p of specs) {
      if (p.kind === 'select') out[p.name] = p.options?.[0] ?? '';
      else if (p.kind === 'status') out[p.name] = t?.statuses[0]?.key ?? '';
      else if (p.kind === 'statuses') out[p.name] = [];
      else if (p.kind === 'track') out[p.name] = this.trackKey();
      else if (p.kind === 'json') out[p.name] = p.name === 'vars' ? undefined : '';
      else out[p.name] = '';
    }
    return out;
  }

  addGuard(x: any, type: string): void {
    if (!type) return;
    x.guards.push({ type, ...this.defaultsFor(this.guardSpec(type)) });
    this.touch();
  }

  addEffect(x: any, type: string): void {
    if (!type) return;
    const eff: any = { type, ...this.defaultsFor(this.effectSpec(type)) };
    for (const k of Object.keys(eff)) if (eff[k] === undefined) delete eff[k];
    x.effects.push(eff);
    this.touch();
  }

  removeAt(list: any[], i: number): void { list.splice(i, 1); this.touch(); }

  move(list: any[], i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.touch();
  }

  statusesOfTrack(trackKey: string): string[] {
    return (this.def()?.tracks.find((t: any) => t.key === trackKey)?.statuses ?? []).map((s: any) => s.key);
  }

  toggleIn(list: string[], v: string, owner: any, prop: string): void {
    owner[prop] = list.includes(v) ? list.filter(x => x !== v) : [...list, v];
    this.touch();
  }

  jsonText(v: unknown): string { return v === undefined ? '' : JSON.stringify(v); }

  /** Params typed as JSON accept values like true, 100, "text" or an object. Blank clears an optional value. */
  setJson(obj: any, prop: string, text: string): void {
    const t = text.trim();
    if (!t) { delete obj[prop]; this.touch(); return; }
    try { obj[prop] = JSON.parse(t); }
    catch { obj[prop] = t; } // bare text is a plain string value
    this.touch();
  }

  whenText(e: any): string { return e.when ? JSON.stringify(e.when) : ''; }

  setWhen(e: any, text: string): void {
    const t = text.trim();
    if (!t) { delete e.when; this.touch(); return; }
    try { e.when = JSON.parse(t); this.touch(); }
    catch { this.failure.set(this.i18n.t('admin.wf.badJson')); }
  }

  // ---- presentation: where an action's button appears and how it looks (the engine ignores it)
  readonly uiAreas = ['decision', 'disbursement', 'general'];
  readonly uiStyles = ['primary', 'secondary', 'danger'];

  setUi(x: any, prop: 'area' | 'style' | 'icon' | 'after', value: string): void {
    if (prop === 'icon' && value && !/^[a-z][a-z0-9_]*$/.test(value)) { this.failure.set(this.i18n.t('admin.wf.ui.iconBad')); return; }
    this.failure.set('');
    const ui = { ...(x.ui ?? {}) };
    if (value) ui[prop] = value; else delete ui[prop];
    if (Object.keys(ui).length) x.ui = ui; else delete x.ui;
    this.touch();
  }

  // ---- events: every action emits one; subscribers are what the action wires to it
  static readonly EVENT_RE = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9_]*)+$/;

  eventName(trackKey: string, x: any): string { return x.event ?? `${trackKey}.${x.key}`; }

  setEvent(x: any, raw: string): void {
    const v = raw.trim();
    if (!v) { delete x.event; this.touch(); return; }
    if (!AdminWorkflowBuilderComponent.EVENT_RE.test(v)) { this.failure.set(this.i18n.t('admin.wf.event.bad')); return; }
    const clash = this.def().tracks.some((t: any) => t.transitions.some((o: any) => o !== x && this.eventName(t.key, o) === v));
    if (clash) { this.failure.set(this.i18n.t('admin.wf.event.dupe')); return; }
    this.failure.set('');
    x.event = v;
    this.touch();
  }

  /** What listens to an action's event today. The audit trail always does; the rest are the action's
   * notification / email / document / note / payment effects. */
  subscribersOf(trackKey: string, x: any): { kind: string; name: string; detail: string; conditional: boolean }[] {
    const t = (k: string) => this.i18n.t(k);
    const out = [{ kind: 'AUDIT', name: t('admin.wf.event.sub.AUDIT'), detail: this.eventName(trackKey, x), conditional: false }];
    for (const e of x.effects as any[]) {
      const cond = !!e.when;
      switch (e.type) {
        case 'NOTIFY': out.push({ kind: 'NOTIFY', name: t('admin.wf.event.sub.NOTIFY'), detail: e.template, conditional: cond }); break;
        case 'EMAIL': out.push({ kind: 'EMAIL', name: t('admin.wf.event.sub.EMAIL'), detail: e.event, conditional: cond }); break;
        case 'GENERATE_DOC': out.push({ kind: 'DOC', name: t('admin.wf.event.sub.DOC'), detail: e.doc, conditional: cond }); break;
        case 'NOTE': out.push({ kind: 'NOTE', name: t('admin.wf.event.sub.NOTE'), detail: e.noteType || e.section || '', conditional: cond }); break;
        case 'CARD_PAYMENT': out.push({ kind: 'PAY', name: t('admin.wf.event.sub.PAY'), detail: e.mode, conditional: cond }); break;
      }
    }
    return out;
  }

  /** Every event in the workflow with its subscribers: the "who hears what" overview. */
  allEvents = computed(() => {
    this.rev();
    const d = this.def();
    if (!d) return [] as any[];
    return d.tracks.flatMap((tr: any) => tr.transitions.map((x: any) => ({
      event: this.eventName(tr.key, x), track: tr.key, trackLabel: this.lbl(tr), key: x.key, label: this.lbl(x),
      actors: (x.actors as string[]).join(' / '), from: (x.from as string[]).includes('*') ? '*' : (x.from as string[]).join(', '), to: x.to ?? '',
      subs: this.subscribersOf(tr.key, x),
    })));
  });

  eventTitle(key: string): string { return this.allEvents().find((e: any) => e.key === key)?.event ?? key; }

  openEvent(track: string, key: string): void { this.trackKey.set(track); this.selectTransition(key); }

  // ---- stages
  addStage(): void {
    const d = this.def(); if (!d) return;
    const key = this.uniqueKey('NEW_STAGE', new Set(d.stages.map((s: any) => s.key)));
    d.stages.push({ key, label: { en: 'New stage', he: 'New stage' } });
    this.touch();
  }

  renameStage(s: any, raw: string): void {
    const next = raw.trim();
    const d = this.def(); if (!d) return;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(next) || next === s.key || d.stages.some((x: any) => x.key === next)) return;
    for (const t of d.tracks) for (const st of t.statuses) if (st.stage === s.key) st.stage = next;
    s.key = next;
    this.touch();
  }

  removeStage(key: string): void {
    const d = this.def(); if (!d) return;
    for (const t of d.tracks) for (const st of t.statuses) if (st.stage === key) st.stage = null;
    d.stages = d.stages.filter((s: any) => s.key !== key);
    this.touch();
  }

  setSlaHours(s: any, hours: string): void {
    const h = Number(hours);
    if (!hours || !(h > 0)) delete s.sla;
    else s.sla = { ...(s.sla ?? {}), hours: h };
    this.touch();
  }

  setSlaAmber(s: any, amber: string): void {
    if (!s.sla) return;
    const a = Number(amber);
    if (amber && a >= 1 && a <= 100) s.sla.amberAtPercent = a; else delete s.sla.amberAtPercent;
    this.touch();
  }

  toggleOwnerRole(s: any, code: string): void {
    const current: string[] = s.owner?.roles ?? [];
    const roles = current.includes(code) ? current.filter(r => r !== code) : [...current, code];
    s.owner = { ...(s.owner ?? {}), roles };
    if (!roles.length) delete s.owner.roles;
    if (!Object.keys(s.owner).length) delete s.owner;
    this.touch();
  }

  setRouting(s: any, mode: string): void {
    if (mode === 'MANUAL') delete s.routing; else s.routing = { mode };
    this.touch();
  }

  setUnitRule(s: any, v: string): void {
    s.owner = { ...(s.owner ?? {}), unitRule: v || undefined };
    if (!s.owner.unitRule) delete s.owner.unitRule;
    if (!Object.keys(s.owner).length) delete s.owner;
    this.touch();
  }

  // ---- queues
  addQueue(): void {
    const d = this.def(); if (!d) return;
    const key = this.uniqueKey('new-queue', new Set(d.queues.map((q: any) => q.key)));
    const t = this.track() ?? d.tracks[0];
    d.queues.push({
      key, label: { en: 'New queue', he: 'New queue' }, track: t.key, statuses: t.statuses.slice(0, 1).map((s: any) => s.key),
      requiresEntitlement: this.catalog()?.entitlements[0]?.key ?? '', applyScope: true, hideReferredAbove: false,
    });
    this.touch();
  }

  /** Queues the host looks up by key (worker/src/routes/applications.ts). Renaming one would break a screen. */
  private static readonly BUILT_IN_QUEUES = new Set(['pipeline', 'banker-queue', 'home-stats-staff', 'home-stats-banker', 'activity-staff', 'activity-banker']);
  queueKeyLocked(q: any): boolean { return AdminWorkflowBuilderComponent.BUILT_IN_QUEUES.has(q.key); }

  setQueueKey(q: any, raw: string): void {
    if (this.queueKeyLocked(q)) return;
    const v = raw.trim();
    if (v === q.key) return;
    if (!/^[a-z][a-z0-9_-]*$/.test(v)) { this.failure.set(this.i18n.t('admin.wf.queueKey.bad')); return; }
    if (this.def().queues.some((o: any) => o !== q && o.key === v)) { this.failure.set(this.i18n.t('admin.wf.queueKey.dupe')); return; }
    if (AdminWorkflowBuilderComponent.BUILT_IN_QUEUES.has(v)) { this.failure.set(this.i18n.t('admin.wf.queueKey.reserved')); return; }
    this.failure.set('');
    q.key = v;
    this.touch();
  }

  removeQueue(key: string): void {
    const d = this.def(); if (!d) return;
    d.queues = d.queues.filter((q: any) => q.key !== key);
    this.touch();
  }

  setQueueOptional(q: any, prop: 'requiresAlso' | 'excludesEntitlement', v: string): void {
    if (v) q[prop] = v; else delete q[prop];
    this.touch();
  }

  setQueueTrack(q: any, trackKey: string): void { q.track = trackKey; q.statuses = []; this.touch(); }

  // ================================================================== canvas layout
  private lanes = computed(() => {
    this.rev();
    const d = this.def();
    if (!d) return [] as { key: string | null; label: string; sla?: any }[];
    const out: { key: string | null; label: string; sla?: any }[] = d.stages.map((s: any) => ({ key: s.key, label: this.lbl(s), sla: s.sla }));
    const t = this.track();
    if (t?.statuses.some((s: any) => s.stage == null)) out.push({ key: null, label: this.i18n.t('admin.wf.noStage') });
    return out;
  });

  laneViews = computed(() => this.lanes().map((l, i) => ({ ...l, x: i * LANE_W })));

  /** One routing pass produces the node positions AND the arrows, so they always agree. */
  private routed = computed(() => {
    this.rev();
    const t = this.track();
    if (!t) return null;
    const lanes = this.lanes();
    const rowByLane = new Map<string | null, number>();
    const statuses = (t.statuses as any[]).map(s => {
      const lane = Math.max(0, lanes.findIndex(l => l.key === (s.stage ?? null)));
      const row = rowByLane.get(s.stage ?? null) ?? 0;
      rowByLane.set(s.stage ?? null, row + 1);
      return { key: s.key as string, lane, row };
    });
    const transitions = (t.transitions as any[])
      .filter(x => x.to && !x.from.includes('*'))
      .map(x => ({ key: x.key as string, label: this.lbl(x), actors: x.actors as string[], from: x.from as string[], to: x.to as string }));
    return { r: route(statuses, transitions, lanes.length), transitions };
  });

  nodes = computed<NodeView[]>(() => {
    const t = this.track();
    const routed = this.routed();
    if (!t || !routed) return [];
    const entry = new Set<string>([...(t.entryPoints ?? []).map((e: any) => e.status), ...(t.initialStatus ? [t.initialStatus] : [])]);
    const at = new Map(routed.r.nodes.map(n => [n.key, n]));
    return (t.statuses as any[]).map(s => {
      const n = at.get(s.key)!;
      return { key: s.key, label: this.lbl(s), x: n.x, y: n.y, h: n.h, stage: s.stage ?? null, badge: s.badge, entry: entry.has(s.key) };
    });
  });

  /** Nodes as drawn: the one being dragged follows the pointer. */
  drawn = computed<NodeView[]>(() => {
    const dp = this.dragPos();
    return this.nodes().map(n => (dp && dp.key === n.key ? { ...n, x: dp.x, y: dp.y } : n));
  });

  canvasSize = computed(() => {
    const r = this.routed()?.r;
    return { w: Math.max(600, (r?.width ?? 0) + 8), h: Math.max(360, (r?.height ?? 0) + 8) };
  });

  edges = computed<EdgeView[]>(() => {
    const routed = this.routed();
    if (!routed) return [];
    const sel = this.selection();
    const byKey = new Map(routed.transitions.map(x => [x.key, x]));
    this.hoverKey();
    const out: EdgeView[] = routed.r.edges.map((e, i) => {
      const x = byKey.get(e.key)!;
      const actor: EdgeView['actor'] = x.actors.includes('SYSTEM') && !x.actors.includes('STAFF') && !x.actors.includes('CUSTOMER') ? 'system'
        : x.actors.includes('CUSTOMER') && !x.actors.includes('STAFF') ? 'customer' : 'staff';
      const hov = this.hoverKey();
      const touches = sel?.kind === 'transition' ? sel.key === e.key : sel?.kind === 'status' ? (e.from === sel.key || e.to === sel.key) : hov ? e.key === hov : true;
      return { id: `${e.key}:${e.from}:${i}`, key: e.key, from: e.from, to: e.to, path: e.path, label: e.label, actor,
        selected: sel?.kind === 'transition' && sel.key === e.key, dim: !touches, hot: this.hoverKey() === e.key };
    });
    // Selected arrows are drawn last so they sit on top.
    return out.sort((a, b) => Number(a.selected || a.hot) - Number(b.selected || b.hot));
  });

  /** Junction dots (several wires of one action meeting), styled like their wires. */
  dots = computed(() => {
    const routed = this.routed();
    if (!routed) return [];
    const sel = this.selection(), hov = this.hoverKey();
    const byKey = new Map(routed.transitions.map(x => [x.key, x]));
    return routed.r.dots.map((d, i) => {
      const x = byKey.get(d.key)!;
      const actor = x.actors.includes('SYSTEM') && !x.actors.includes('STAFF') && !x.actors.includes('CUSTOMER') ? 'system'
        : x.actors.includes('CUSTOMER') && !x.actors.includes('STAFF') ? 'customer' : 'staff';
      const touches = sel?.kind === 'transition' ? sel.key === d.key : sel?.kind === 'status' ? (x.from.includes(sel.key) || x.to === sel.key) : hov ? d.key === hov : true;
      return { id: `${d.key}:${i}`, x: d.x, y: d.y, actor, dim: !touches };
    });
  });

  /** Actions allowed from ANY status (cancel, add note...) are not drawn as arrows from every box;
   * they are listed under the canvas with the status they lead to. */
  anyStatusActions = computed(() => {
    this.rev();
    return (this.track()?.transitions ?? []).filter((x: any) => x.from.includes('*') && x.to);
  });

  /** A name from the definition in the language the page is showing, falling back to English when that
   * language has none. Display only: the editing boxes bind a specific language. */
  lbl(x: { label?: { en: string; he?: string } } | null | undefined): string {
    const l = x?.label;
    return (this.i18n.lang() === 'he' && l?.he?.trim()) || l?.en || '';
  }

  statusLabel(key: string): string { const s = this.track()?.statuses.find((s: any) => s.key === key); return s ? this.lbl(s) : key; }

  readonly nodeW = NODE_W;
  readonly nodeH = NODE_H;
  readonly laneW = LANE_W;

  connectLine = computed(() => {
    const c = this.connecting();
    if (!c) return null;
    const n = this.drawn().find(x => x.key === c.from);
    return n ? { x1: n.x + NODE_W, y1: n.y + n.h / 2, x2: c.x, y2: c.y } : null;
  });

  // ---- pointer handling
  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.svgRef!.nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private nodeAt(p: { x: number; y: number }): NodeView | undefined {
    return this.nodes().find(n => p.x >= n.x && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + n.h);
  }

  startDrag(e: PointerEvent, n: NodeView): void {
    e.stopPropagation();
    const p = this.point(e);
    this.dragging = { key: n.key, sx: p.x, sy: p.y, ox: n.x, oy: n.y, moved: false };
  }

  startConnect(e: PointerEvent, n: NodeView): void {
    e.stopPropagation(); e.preventDefault();
    if (!this.editable()) return;
    const p = this.point(e);
    this.connecting.set({ from: n.key, x: p.x, y: p.y });
  }

  onMove(e: PointerEvent): void {
    const p = this.point(e);
    if (this.connecting()) { this.connecting.update(c => c && { ...c, x: p.x, y: p.y }); return; }
    const d = this.dragging;
    if (!d || !this.editable()) return;
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    this.dragPos.set({ key: d.key, x: d.ox + dx, y: d.oy + dy });
  }

  onUp(e: PointerEvent): void {
    const p = this.point(e);
    const conn = this.connecting();
    if (conn) {
      this.connecting.set(null);
      const target = this.nodeAt(p);
      if (target && target.key !== conn.from) this.addTransition(conn.from, target.key);
      return;
    }
    const d = this.dragging;
    this.dragging = null;
    if (!d) return;
    if (d.moved && this.editable()) {
      // Dropping a status in another lane moves it to that stage.
      const lanes = this.lanes();
      const li = Math.floor(p.x / LANE_W);
      const lane = lanes[Math.min(Math.max(li, 0), lanes.length - 1)];
      const s = this.track()?.statuses.find((x: any) => x.key === d.key);
      if (s && lane && (s.stage ?? null) !== lane.key) { s.stage = lane.key; this.touch(); }
      this.dragPos.set(null);
      this.selection.set({ kind: 'status', key: d.key });
    } else {
      this.dragPos.set(null);
      this.selection.set({ kind: 'status', key: d.key });
    }
    this.tab.set('selection');
  }

  onCancel(): void { this.dragging = null; this.dragPos.set(null); this.connecting.set(null); }

  selectTransition(key: string): void { this.selection.set({ kind: 'transition', key }); this.tab.set('selection'); }
  clearSelection(): void { this.selection.set(null); }

  // ---- selection helpers for the panel
  selectedStatus = computed(() => {
    this.rev();
    const s = this.selection();
    return s?.kind === 'status' ? this.track()?.statuses.find((x: any) => x.key === s.key) ?? null : null;
  });

  selectedTransition = computed(() => {
    this.rev();
    const s = this.selection();
    return s?.kind === 'transition' ? this.track()?.transitions.find((x: any) => x.key === s.key) ?? null : null;
  });

  transitionsTouching = computed(() => {
    this.rev();
    const s = this.selectedStatus();
    return s ? (this.track()?.transitions ?? []).filter((x: any) => x.from.includes(s.key) || x.from.includes('*') || x.to === s.key) : [];
  });

  /** In-place actions (no target status) have no arrow, so they are listed under their statuses. */
  inPlaceActions = computed(() => { this.rev(); return (this.track()?.transitions ?? []).filter((x: any) => !x.to); });

  // ================================================================== simulator
  /** Static part of "who can do what": actor type, entitlement, and from-status. Runtime guards
   * (case visibility, mandate limit, reason required...) depend on the case and are only listed. */
  simulation = computed(() => {
    this.rev();
    const t = this.track();
    const role = this.roles().find(r => r.code === this.simRole());
    const status = this.simStatus();
    if (!t) return { actions: [] as any[], queues: [] as string[] };
    const ents = new Set(role?.locked ? (this.catalog()?.entitlements ?? []).map(e => e.key) : role?.entitlements ?? []);
    const actor = this.simActor();
    const actions = t.transitions.map((x: any) => {
      let blocked = '';
      if (!x.actors.includes(actor)) blocked = this.i18n.t('admin.wf.sim.wrongActor');
      else if (actor === 'STAFF' && x.entitlement && !ents.has(x.entitlement)) blocked = `${this.i18n.t('admin.wf.sim.needs')} ${x.entitlement}`;
      else if (!(x.from.includes('*') || x.from.includes(status))) blocked = this.i18n.t('admin.wf.sim.wrongStatus');
      return { key: x.key, label: this.lbl(x), to: x.to ?? null, blocked, guards: (x.guards as any[]).map(g => g.type).join(', ') };
    });
    const queues = actor === 'STAFF'
      ? (this.def()?.queues ?? []).filter((q: any) => ents.has(q.requiresEntitlement) && (!q.requiresAlso || ents.has(q.requiresAlso)) && !(q.excludesEntitlement && ents.has(q.excludesEntitlement))).map((q: any) => q.label.en)
      : [];
    return { actions, queues };
  });

  get catalogEntitlements() { return this.catalog()?.entitlements ?? []; }
  entLabel(e: { key: string; label: string }): string { return this.i18n.entitlementText('label', e.key, e.label); }
  badges = ['draft', 'in-progress', 'review', 'approved', 'declined'];
  categories = ['DRAFT', 'WAITING_CUSTOMER', 'ACTIVE', 'TERMINAL'];
  actorTypes = ['CUSTOMER', 'STAFF', 'SYSTEM'];
  unitRules = ['ANY', 'CASE_UNIT', 'CASE_UNIT_OR_ANCESTOR'];

  trackBy = (_: number, x: { key: string }) => x.key;
  idx = (i: number) => i;
}
