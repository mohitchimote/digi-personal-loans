/**
 * Single source of truth for the admin area's navigation: the left rail (AdminShellComponent) and
 * the landing page (AdminHomeComponent) are both rendered from this list, so adding a module is one
 * entry here plus its route. Labels and descriptions are i18n keys.
 */
export interface AdminNavItem {
  route: string;
  labelKey: string;
  descKey: string;
  /** Material Icons name. */
  icon: string;
}

export interface AdminNavGroup {
  id: string;
  labelKey: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: 'people',
    labelKey: 'admin.nav.people',
    items: [
      { route: '/admin/users',        labelKey: 'admin.users', descKey: 'admin.nav.usersDesc', icon: 'group' },
      { route: '/admin/roles',        labelKey: 'admin.roles', descKey: 'admin.nav.rolesDesc', icon: 'admin_panel_settings' },
      { route: '/admin/organisation', labelKey: 'admin.org',   descKey: 'admin.nav.orgDesc',   icon: 'account_tree' },
    ],
  },
  {
    id: 'products',
    labelKey: 'admin.nav.productsRules',
    items: [
      { route: '/admin/products', labelKey: 'admin.products', descKey: 'admin.nav.productsDesc', icon: 'inventory_2' },
      { route: '/admin/rules',    labelKey: 'admin.rules',    descKey: 'admin.nav.rulesDesc',    icon: 'calculate' },
      { route: '/admin/mandates', labelKey: 'admin.mandates', descKey: 'admin.nav.mandatesDesc', icon: 'gavel' },
    ],
  },
  {
    id: 'process',
    labelKey: 'admin.nav.process',
    items: [
      { route: '/admin/workflow',     labelKey: 'admin.wf',          descKey: 'admin.nav.wfDesc',   icon: 'alt_route' },
      { route: '/admin/form-builder', labelKey: 'admin.formBuilder', descKey: 'admin.nav.formDesc', icon: 'dynamic_form' },
    ],
  },
  {
    id: 'comms',
    labelKey: 'admin.nav.comms',
    items: [
      { route: '/admin/email-templates', labelKey: 'admin.emailTemplates', descKey: 'admin.nav.emailDesc',    icon: 'mail' },
      { route: '/admin/faqs',            labelKey: 'admin.faqs',           descKey: 'admin.nav.faqsDesc',     icon: 'help' },
      { route: '/admin/branding',        labelKey: 'admin.branding',       descKey: 'admin.nav.brandingDesc', icon: 'palette' },
    ],
  },
];
