import assert from 'node:assert/strict';
import React from 'react';
const forms = require('react-hook-form') as typeof import('react-hook-form');
import * as users from '../hooks/use-users';
import * as language from '../components/i18n/language-provider';
import { UserFormDialog } from '../components/users/user-form-dialog';
import { setActiveLanguage, translate } from '../i18n';
import type { User } from '../types/user';

const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];

async function run() {
  const original = { form: forms.useForm, create: users.useCreateUser, update: users.useUpdateUser, language: language.useLanguage };
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previousDispatcher = internals.H;
  const values = { email: 'fixture@example.test', fullName: 'Fixture user', role: 'SA', isActive: true };
  const editUser: User = { ...values, role: 'SA', id: 'fixture-user', mustChangePassword: false, createdAt: '2026-10-16T00:00:00Z' };
  let failed = true, pending = false, editing = false, resets = 0, closed = 0, states: any[] = [], effects: any[] = [], index = 0;
  const mutation = { mutateAsync: async (data: unknown) => {
    assert.deepEqual(data, editing ? { id: editUser.id, data: { fullName: values.fullName, role: values.role, isActive: values.isActive } } : values);
    if (failed) throw Error('Private provider diagnostic must not appear');
    return {};
  } };
  (users as any).useCreateUser = () => mutation;
  (users as any).useUpdateUser = () => mutation;
  (language as any).useLanguage = () => ({ t: translate });
  (forms as any).useForm = () => ({ register: (name: string) => ({ name }),
    handleSubmit: (submit: (data: any) => Promise<void>) => () => submit(values),
    reset: resetForm, formState: { errors: {}, isSubmitting: pending } });
  function resetForm() { resets++; }
  function render(open = true) {
    index = 0;
    internals.H = {
      useState(initial: unknown) { const i = index++; if (!(i in states)) states[i] = initial;
        return [states[i], (value: unknown) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
      useEffect(effect: () => void, dependencies: unknown[]) { const i = index++;
        if (!effects[i] || dependencies.some((value, at) => !Object.is(value, effects[i][at]))) { effects[i] = dependencies; effect(); } },
    };
    try { return nodes(UserFormDialog({ open, userToEdit: editing ? editUser : null, onOpenChange: next => { if (!next) closed++; } })); }
    finally { internals.H = previousDispatcher; }
  }
  try {
    for (const locale of ['en', 'id'] as const) {
      setActiveLanguage(locale); states = []; effects = []; resets = 0; closed = 0; failed = true; pending = false;
      let view = render(); assert(!view.some(node => node.props?.role === 'alert'));
      const before = resets;
      await view.find(node => node.type === 'form').props.onSubmit();
      view = render(); const alert = view.find(node => node.props?.role === 'alert');
      assert.equal(alert.props.children, translate('userForm.saveFailed'));
      assert(!alert.props.children.includes('Private provider'));
      assert.equal(resets, before, 'Failure must retain entered form values'); assert.equal(closed, 0);
      pending = true; view = render();
      assert(view.find(node => node.type === 'input' && node.props.type === 'checkbox').props.disabled);
      assert(view.find(node => node.props.type === 'submit').props.disabled);
      pending = false; failed = false;
      await view.find(node => node.type === 'form').props.onSubmit();
      assert.equal(closed, 1); assert(!render().some(node => node.props?.role === 'alert'));
      failed = true; await render().find(node => node.type === 'form').props.onSubmit();
      render(false); render(true);
      assert(!render().some(node => node.props?.role === 'alert'), 'Reopening clears stale feedback');
      editing = true; view = render();
      const beforeEdit = resets;
      await view.find(node => node.type === 'form').props.onSubmit();
      assert.equal(render().find(node => node.props?.role === 'alert').props.children, translate('userForm.updateFailed'));
      assert.equal(resets, beforeEdit, 'Failed update must retain entered form values');
      editing = false;
    }
    console.log('User form feedback: EN/ID create/update error, retained input, safe diagnostics, pending controls, retry and reset passed.');
  } finally {
    (forms as any).useForm = original.form; (users as any).useCreateUser = original.create;
    (users as any).useUpdateUser = original.update; (language as any).useLanguage = original.language;
    internals.H = previousDispatcher; setActiveLanguage('en');
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
